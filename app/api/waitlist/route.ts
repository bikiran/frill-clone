import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess, resolveWaitlistSettings, isMissingTable, openWaitlistConversation } from '@/lib/waitlist'
import { toE164, emailKey } from '@/lib/phone'
import { variationStock, pricing, type ItemStock } from '@/lib/waitlist-stock'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const NEEDS_MIGRATION = 'Run migrations/COLVY_V321_STOCK_WAITLIST.sql in Supabase, then reload.'

// GET ?companyId= — every waitlist entry (newest first) + the company's settings.
// Linked products carry their live stock from the synced catalogue.
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    const companyId = req.nextUrl.searchParams.get('companyId')
    const op = req.nextUrl.searchParams.get('op')
    if (op && !(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    // Side-menu badge: people who joined a waitlist since this browser last opened Waitlists.
    if (req.nextUrl.searchParams.get('op') === 'newcount') {
      const since = req.nextUrl.searchParams.get('since')
      if (!since || isNaN(Date.parse(since))) return NextResponse.json({ count: 0 })
      const { count, error } = await db.from('stock_waitlist').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).in('status', ['waiting', 'queued']).gt('created_at', new Date(since).toISOString())
      return NextResponse.json({ count: error ? 0 : (count || 0) }, { headers: { 'Cache-Control': 'no-store' } })
    }

    // Live size/variation prices straight from the store. The page asks for
    // these in a second request so the list never waits on WooCommerce.
    if (req.nextUrl.searchParams.get('op') === 'variation-stock') {
      const ids = String(req.nextUrl.searchParams.get('ids') || '').split(',').map(Number).filter(n => Number.isFinite(n) && n > 0).slice(0, 200)
      const stock = ids.length ? await variationStock(db, companyId!, ids) : {}
      return NextResponse.json({ stock }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const live = req.nextUrl.searchParams.get('live') !== '0'

    // The access check runs alongside the reads (nothing is returned until it
    // passes), so the list costs one round trip instead of three.
    const [access, { data: co }, { data: entries, error }] = await Promise.all([
      requireCompanyAccess(req, db, companyId),
      db.from('companies').select('waitlist_settings, name').eq('id', companyId).maybeSingle(),
      db.from('stock_waitlist').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(2000),
    ])
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const settings = resolveWaitlistSettings((co as any)?.waitlist_settings)
    const businessName = (co as any)?.name || ''
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ needsMigration: true, error: NEEDS_MIGRATION, entries: [], settings, stock: {}, businessName })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const productIds = Array.from(new Set((entries || []).map((e: any) => e.woo_product_id).filter(Boolean)))
    // Live stock + current price from the synced catalogue (price drives the
    // "potential revenue" figures — what the waitlist is worth once it's back).
    const stock: Record<string, ItemStock> = {}
    if (productIds.length) {
      const productsReq = db.from('woocommerce_products')
        .select('woo_product_id, stock_status, stock_quantity, permalink, price, regular_price, sale_price, on_sale').eq('company_id', companyId).in('woo_product_id', productIds)
      // Website sign-ups store the size/variation id, which isn't in the synced
      // catalogue — look those up through their parent product. For a normal
      // list that lookup runs alongside the catalogue read (a product id never
      // matches a parent's variation list, so asking for all ids is harmless).
      const together = productIds.length <= 100
      const [{ data: prods }, early] = await Promise.all([
        productsReq,
        together ? variationStock(db, companyId!, productIds.map(Number), { live }) : Promise.resolve(null),
      ])
      ;(prods || []).forEach((p: any) => {
        stock[String(p.woo_product_id)] = { ...pricing(p), stock_status: p.stock_status, stock_quantity: p.stock_quantity, permalink: p.permalink || null }
      })
      const variations = productIds.map(Number).filter(id => !stock[String(id)])
      const vs = early ?? (variations.length ? await variationStock(db, companyId!, variations, { live }) : {})
      for (const id of variations) if (vs[String(id)]) stock[String(id)] = vs[String(id)]
    }
    return NextResponse.json({ entries: entries || [], settings, stock, businessName })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

// POST — add a customer to a waitlist.
// { companyId, itemName, wooProductId?, itemImage?, itemUrl?, contactId?,
//   conversationId?, customerName?, phone?, email?, note?, source? }
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const b = await req.json().catch(() => ({}))
    const companyId = String(b.companyId || '')
    const access = await requireCompanyAccess(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    let itemName = String(b.itemName || '').trim()
    const wooProductId = b.wooProductId ? Number(b.wooProductId) : null
    let itemImage = b.itemImage || null
    let itemUrl = b.itemUrl || null
    // Linked product → fill the name/image/link from the synced catalogue.
    if (wooProductId) {
      const { data: p } = await db.from('woocommerce_products').select('name, image, permalink')
        .eq('company_id', companyId).eq('woo_product_id', wooProductId).maybeSingle()
      if (p) { itemName = itemName || p.name; itemImage = itemImage || p.image || null; itemUrl = itemUrl || p.permalink || null }
    }
    if (!itemName) return NextResponse.json({ error: 'What are they waiting for? Pick a product or type the item.' }, { status: 400 })

    let { contactId = null, conversationId = null, customerName = null, phone = null, email = null } = b
    // Only accept a contact / conversation that belongs to THIS company, so a
    // crafted request can't point a waitlist text at another workspace's customer.
    if (contactId) {
      const { data: c } = await db.from('contacts').select('name, phone, email').eq('id', contactId).eq('company_id', companyId).maybeSingle()
      if (c) { customerName = customerName || c.name; phone = phone || c.phone; email = email || c.email }
      else contactId = null
    }
    if (conversationId) {
      const { data: cv } = await db.from('conversations').select('id').eq('id', conversationId).eq('company_id', companyId).maybeSingle()
      if (!cv) conversationId = null
    }
    phone = phone ? String(phone).trim() : null
    email = email ? String(email).trim() : null
    if (!phone && !email) return NextResponse.json({ error: 'This customer has no phone or email to notify.' }, { status: 400 })

    const { data, error } = await db.from('stock_waitlist').insert({
      company_id: companyId, contact_id: contactId, conversation_id: conversationId,
      woo_product_id: wooProductId, item_name: itemName, item_image: itemImage, item_url: itemUrl,
      customer_name: customerName, phone, email,
      note: b.note ? String(b.note).slice(0, 500) : null,
      source: ['inbox', 'widget', 'manual'].includes(b.source) ? b.source : 'manual',
      created_by: access.userId || null,
    }).select('*').maybeSingle()
    if (error) {
      if ((error as any).code === '23505') return NextResponse.json({ ok: true, duplicate: true })
      if (isMissingTable(error)) return NextResponse.json({ error: NEEDS_MIGRATION }, { status: 400 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Leave a staff-only note in their conversation so the team can see it.
    if (conversationId) {
      try {
        await db.from('messages').insert({
          conversation_id: conversationId, company_id: companyId, sender_type: 'system', is_internal: true,
          content: `📋 Added to the waitlist for ${itemName} — they'll get an SMS when it's back in stock.`,
          metadata: { internal: true, waitlist: true, waitlist_id: data?.id },
        })
      } catch {}
    }
    return NextResponse.json({ ok: true, entry: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

// PATCH — { companyId, id, action: 'cancel' } removes someone from a waitlist;
// { companyId, id, action: 'chat' } finds or starts their conversation;
// { companyId, id, action: 'edit', customerName?, phone?, email?, note? } fixes
// a waiting customer's details (the alert goes to the entry's own phone/email);
// { companyId, settings: { auto_notify?, template?, timezone? } } saves settings.
export async function PATCH(req: NextRequest) {
  try {
    const db = admin()
    const b = await req.json().catch(() => ({}))
    const companyId = String(b.companyId || '')
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    if (b.settings) {
      const { data: co } = await db.from('companies').select('waitlist_settings').eq('id', companyId).maybeSingle()
      const cur = (co as any)?.waitlist_settings || {}
      const next: any = { ...cur }
      if (b.settings.auto_notify !== undefined) next.auto_notify = !!b.settings.auto_notify
      if (b.settings.template !== undefined) next.template = String(b.settings.template || '').slice(0, 480)
      if (b.settings.timezone !== undefined) next.timezone = String(b.settings.timezone || '')
      const { error } = await db.from('companies').update({ waitlist_settings: next }).eq('id', companyId)
      if (error) return NextResponse.json({ error: isMissingTable(error) ? NEEDS_MIGRATION : error.message }, { status: 400 })
      return NextResponse.json({ ok: true, settings: resolveWaitlistSettings(next) })
    }

    // Open (or start) the customer's conversation, e.g. for a website sign-up.
    if (b.id && b.action === 'chat') {
      const r = await openWaitlistConversation(db, companyId, String(b.id))
      if (!r.conversationId) return NextResponse.json({ error: r.error || 'Could not open a chat.' }, { status: 400 })
      return NextResponse.json({ ok: true, conversationId: r.conversationId })
    }

    if (b.id && b.action === 'edit') {
      const { data: cur } = await db.from('stock_waitlist').select('id, status, phone, email, error')
        .eq('id', b.id).eq('company_id', companyId).maybeSingle()
      if (!cur) return NextResponse.json({ error: 'That waitlist entry no longer exists.' }, { status: 404 })
      if (!['waiting', 'queued', 'failed'].includes(cur.status)) return NextResponse.json({ error: 'They’ve already been notified, so their details can’t be changed here.' }, { status: 400 })
      const patch: any = {}
      if (b.customerName !== undefined) patch.customer_name = String(b.customerName || '').trim().slice(0, 120) || null
      if (b.note !== undefined) patch.note = String(b.note || '').trim().slice(0, 500) || null
      if (b.phone !== undefined) {
        const raw = String(b.phone || '').trim()
        const phone = raw ? toE164(raw) : ''
        if (raw && phone.replace(/\D/g, '').length < 8) return NextResponse.json({ error: 'That phone number doesn’t look right.' }, { status: 400 })
        patch.phone = phone || null
      }
      if (b.email !== undefined) {
        const raw = String(b.email || '').trim()
        if (raw && !emailKey(raw)) return NextResponse.json({ error: 'That email address doesn’t look right.' }, { status: 400 })
        patch.email = raw ? raw.toLowerCase() : null
      }
      const phone = patch.phone !== undefined ? patch.phone : cur.phone
      const email = patch.email !== undefined ? patch.email : cur.email
      if (!phone && !email) return NextResponse.json({ error: 'Keep a phone number or an email so they can be told it’s back.' }, { status: 400 })
      // A failed send with fixed contact details goes back on the list.
      if (cur.status === 'failed' && (patch.phone !== undefined || patch.email !== undefined)) { patch.status = 'waiting'; patch.error = null }
      const { data, error } = await db.from('stock_waitlist').update(patch).eq('id', b.id).eq('company_id', companyId).select('*').maybeSingle()
      if (error) {
        if ((error as any).code === '23505') return NextResponse.json({ error: 'Someone with those details is already waiting for this item.' }, { status: 409 })
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ ok: true, entry: data })
    }

    if (b.id && b.action === 'cancel') {
      const { error } = await db.from('stock_waitlist').update({ status: 'cancelled' })
        .eq('id', b.id).eq('company_id', companyId).in('status', ['waiting', 'queued', 'failed'])
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Nothing to do' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
