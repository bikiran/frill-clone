import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyWaitlist, resolveWaitlistSettings, isMissingTable } from '@/lib/waitlist'
import { toE164, phoneKey, emailKey } from '@/lib/phone'

export const dynamic = 'force-dynamic'

// Back-in-stock sign-ups from the Colvy WordPress plugin.
//
// The plugin calls this from the WordPress SERVER (never the shopper's
// browser), so the company API key stays private. Auth: company_id + the
// X-Colvy-Key header, same as /api/plugin/settings.
//
// GET  ?company_id=          → settings the storefront form needs + a summary
// POST { action: 'join', product_id, variation_id?, product_name, product_url?,
//        product_image?, name?, phone?, email? }   → add to the waitlist
// POST { action: 'stock', product_ids: [..] }      → these came back in stock
//        (the plugin's own stock hook — works even without Woo webhooks)

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function authCompany(db: any, companyId: string | null, key: string | null) {
  if (!companyId || !key || !/^[0-9a-f-]{36}$/i.test(companyId)) return null
  const { data } = await db.from('companies').select('id, name, api_key, accent_color, waitlist_settings').eq('id', companyId).maybeSingle()
  if (!data || !data.api_key || data.api_key !== key) return null
  return data
}

const unauthorized = () => NextResponse.json({ error: 'Invalid company id or API key' }, { status: 401 })
const clip = (v: any, n: number) => (v == null ? '' : String(v)).trim().slice(0, n)

export async function GET(req: NextRequest) {
  try {
    const db = admin()
    const co = await authCompany(db, req.nextUrl.searchParams.get('company_id'), req.headers.get('x-colvy-key'))
    if (!co) return unauthorized()
    const { data: rows, error } = await db.from('stock_waitlist').select('item_name, woo_product_id, status, created_at, notified_at')
      .eq('company_id', co.id).order('created_at', { ascending: false }).limit(2000)
    if (error && isMissingTable(error)) return NextResponse.json({ ok: true, needsMigration: true })
    const all = rows || []
    const waiting = all.filter((r: any) => r.status === 'waiting' || r.status === 'queued')
    const since = Date.now() - 30 * 86400000
    const byItem = new Map<string, { item: string; product_id: number | null; waiting: number }>()
    for (const r of waiting) {
      const k = r.woo_product_id ? `p${r.woo_product_id}` : `n${String(r.item_name).toLowerCase()}`
      const cur = byItem.get(k) || { item: r.item_name, product_id: r.woo_product_id, waiting: 0 }
      cur.waiting++; byItem.set(k, cur)
    }
    return NextResponse.json({
      ok: true,
      business: co.name,
      accent_color: co.accent_color || '#ff7a6b',
      auto_notify: resolveWaitlistSettings(co.waitlist_settings).auto_notify,
      waiting: waiting.length,
      notified_30d: all.filter((r: any) => r.status === 'notified' && r.notified_at && Date.parse(r.notified_at) > since).length,
      top: [...byItem.values()].sort((a, b) => b.waiting - a.waiting).slice(0, 8),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const b = await req.json().catch(() => ({}))
    const co = await authCompany(db, String(b.company_id || ''), req.headers.get('x-colvy-key'))
    if (!co) return unauthorized()

    if (b.action === 'stock') {
      const ids = (Array.isArray(b.product_ids) ? b.product_ids : []).map(Number).filter((n: number) => n > 0).slice(0, 50)
      if (!ids.length) return NextResponse.json({ ok: true, sent: 0 })
      if (!resolveWaitlistSettings(co.waitlist_settings).auto_notify) return NextResponse.json({ ok: true, skipped: 'auto_notify off' })
      const r = await notifyWaitlist(db, { companyId: co.id, wooProductIds: ids, respectHours: true })
      return NextResponse.json({ ok: true, ...r })
    }

    // ── join ──
    const productId = Number(b.variation_id) || Number(b.product_id) || null
    let itemName = clip(b.product_name, 200)
    let itemUrl = clip(b.product_url, 600) || null
    let itemImage = clip(b.product_image, 600) || null
    if (itemUrl && !/^https?:\/\//i.test(itemUrl)) itemUrl = null
    if (itemImage && !/^https?:\/\//i.test(itemImage)) itemImage = null
    if (productId && (!itemName || !itemUrl)) {
      const { data: p } = await db.from('woocommerce_products').select('name, image, permalink')
        .eq('company_id', co.id).eq('woo_product_id', productId).maybeSingle()
      if (p) { itemName = itemName || p.name; itemUrl = itemUrl || p.permalink || null; itemImage = itemImage || p.image || null }
    }
    if (!itemName) return NextResponse.json({ error: 'Missing product' }, { status: 400 })

    const rawPhone = clip(b.phone, 40)
    const phone = rawPhone && phoneKey(rawPhone).length >= 8 ? toE164(rawPhone) : null
    const email = emailKey(b.email) || null
    if (rawPhone && !phone) return NextResponse.json({ error: 'That phone number doesn’t look right.' }, { status: 400 })
    if (b.email && !email) return NextResponse.json({ error: 'That email address doesn’t look right.' }, { status: 400 })
    if (!phone && !email) return NextResponse.json({ error: 'Enter a mobile number or email.' }, { status: 400 })
    let customerName = clip(b.name, 80) || null

    // Someone we already know → attach to their contact so the text lands in
    // their existing thread and their STOP / block status is respected.
    let contactId: string | null = null
    try {
      let q = db.from('contacts').select('id, name').eq('company_id', co.id).limit(1)
      q = phone ? q.eq('phone_norm', phoneKey(phone)) : q.ilike('email', email!)
      const { data: c } = await q
      if (c?.[0]) { contactId = c[0].id; customerName = customerName || c[0].name || null }
    } catch {}

    const { data, error } = await db.from('stock_waitlist').insert({
      company_id: co.id, contact_id: contactId, woo_product_id: productId,
      item_name: itemName, item_image: itemImage, item_url: itemUrl,
      customer_name: customerName, phone, email, source: 'website',
    }).select('id').maybeSingle()
    if (error) {
      if ((error as any).code === '23505') return NextResponse.json({ ok: true, duplicate: true, via: phone ? 'sms' : 'email' })
      if (isMissingTable(error)) return NextResponse.json({ error: 'Waitlists aren’t set up yet.' }, { status: 503 })
      throw error
    }
    return NextResponse.json({ ok: true, id: data?.id, via: phone ? 'sms' : 'email' })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
