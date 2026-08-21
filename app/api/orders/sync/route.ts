import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { mapWooStatus, mapWooPayment } from '@/lib/orders'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function isMember(db: any, req: NextRequest, companyId: string): Promise<boolean> {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return false
  try {
    const { data } = await db.auth.getUser(token)
    const uid = data?.user?.id
    if (!uid) return false
    const { data: co } = await db.from('companies').select('owner_id').eq('id', companyId).maybeSingle()
    if (co?.owner_id === uid) return true
    const { data: tm } = await db.from('team_members').select('id').eq('company_id', companyId).eq('user_id', uid).maybeSingle()
    return !!tm?.id
  } catch { return false }
}

const digits = (p?: string | null) => (p || '').replace(/\D/g, '').slice(-9)

/**
 * POST /api/orders/sync  { companyId }
 *
 * Brings the operational `orders` table up to date from the storefront orders we
 * already hold in woocommerce_orders. Channel-agnostic by design — WooCommerce is
 * just the first source. Idempotent: an order that already exists is refreshed
 * from its source WITHOUT clobbering the operational fields staff own (status,
 * assignee, tags, flagged) — those only get their defaults on first insert.
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId } = await req.json().catch(() => ({}))
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

    const db = admin()
    if (!(await isMember(db, req, companyId))) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

    // Pull the storefront orders (most recent first, bounded).
    const { data: woo } = await db.from('woocommerce_orders')
      .select('*').eq('company_id', companyId).order('order_date', { ascending: false }).limit(1000)
    const wooRows: any[] = woo || []
    if (wooRows.length === 0) return NextResponse.json({ ok: true, synced: 0 })

    // Existing operational orders for this channel, keyed by external id.
    const extIds = wooRows.map(o => String(o.woo_order_id)).filter(Boolean)
    const existing = new Map<string, any>()
    for (let i = 0; i < extIds.length; i += 300) {
      const { data } = await db.from('orders').select('id, external_order_id')
        .eq('company_id', companyId).eq('sales_channel', 'woocommerce').in('external_order_id', extIds.slice(i, i + 300))
      for (const r of data || []) existing.set(String(r.external_order_id), r)
    }

    // Resolve contacts by email in one pass.
    const emails = Array.from(new Set(wooRows.map(o => (o.customer_email || o.billing?.email || '').toLowerCase()).filter(Boolean)))
    const contactByEmail = new Map<string, string>()
    for (let i = 0; i < emails.length; i += 200) {
      const { data } = await db.from('contacts').select('id, email').eq('company_id', companyId).in('email', emails.slice(i, i + 200))
      for (const c of data || []) if (c.email) contactByEmail.set(String(c.email).toLowerCase(), c.id)
    }

    let synced = 0
    for (const o of wooRows) {
      const b = o.billing || {}
      const email = (o.customer_email || b.email || '').toLowerCase()
      const name = `${b.first_name || ''} ${b.last_name || ''}`.trim() || o.customer_name || email || 'Customer'
      const items: any[] = Array.isArray(o.line_items) ? o.line_items : []
      const itemCount = items.reduce((s, li) => s + (Number(li.quantity) || 1), 0)
      const subtotal = items.reduce((s, li) => s + (parseFloat(li.total ?? li.subtotal ?? 0) || 0), 0)
      const ext = String(o.woo_order_id)
      const contactId = contactByEmail.get(email) || null

      const sourceFields: any = {
        company_id: companyId,
        contact_id: contactId,
        conversation_id: o.conversation_id || null,
        source_order_id: o.id,
        external_order_id: ext,
        order_number: o.order_number ? String(o.order_number) : ext,
        sales_channel: 'woocommerce',
        payment_status: mapWooPayment(o.status),
        shipping_method: o.shipping_method || (parseFloat(o.shipping_total || 0) > 0 ? 'Flat Rate' : null),
        primary_sku: items[0]?.sku || null,
        subtotal: subtotal || null,
        shipping_total: parseFloat(o.shipping_total || 0) || null,
        total: parseFloat(o.total || 0) || null,
        currency: o.currency || 'AUD',
        item_count: itemCount,
        customer_name: name,
        customer_email: email || null,
        customer_phone: b.phone || null,
        shipping_address: (o.shipping && Object.keys(o.shipping).length ? o.shipping : b) || null,
        order_date: o.order_date || o.created_at || null,
        updated_at: new Date().toISOString(),
      }

      let orderId: string
      const prev = existing.get(ext)
      if (prev) {
        // Refresh source fields only — leave status/assignee/tags/flagged alone.
        await db.from('orders').update(sourceFields).eq('id', prev.id)
        orderId = prev.id
      } else {
        const { data: ins } = await db.from('orders').insert({
          ...sourceFields,
          status: mapWooStatus(o.status),
          fulfilment_status: ['completed'].includes(String(o.status)) ? 'fulfilled' : 'unfulfilled',
          flagged: ['failed', 'on-hold'].includes(String(o.status)),
        }).select('id').maybeSingle()
        if (!ins?.id) continue
        orderId = ins.id
        // First-time timeline seed.
        await db.from('order_events').insert({ order_id: orderId, company_id: companyId, type: 'created', detail: `Order ${sourceFields.order_number} imported from WooCommerce`, actor_name: 'Sync' })
      }

      // Replace line items (cheap + keeps them in step with the source).
      await db.from('order_items').delete().eq('order_id', orderId)
      if (items.length) {
        await db.from('order_items').insert(items.map((li: any) => {
          const qty = Number(li.quantity) || 1
          const img = li.image?.src || li.image || li.images?.[0]?.src || null
          return {
            order_id: orderId, company_id: companyId,
            product_id: li.product_id ? String(li.product_id) : null,
            product_name: li.name || li.product_name || li.title || 'Item',
            sku: li.sku || null,
            quantity: qty,
            unit_price: parseFloat(li.price ?? (li.total ? li.total / qty : 0)) || null,
            total_price: parseFloat(li.total ?? li.subtotal ?? 0) || null,
            image_url: typeof img === 'string' ? img : null,
            metadata: {},
          }
        }))
      }
      synced++
    }

    return NextResponse.json({ ok: true, synced })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
