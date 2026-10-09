import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ingestAbandonedCart, normalizeCart } from '@/lib/abandoned-carts'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Fill each cart item's `image` from the WooCommerce product catalog when the
// bridge payload didn't include one — the abandonment bridge sends product_id
// but no image, so the app would otherwise show a placeholder for every item.
// Mirrors the image backfill in app/api/orders/detail. Mutates items in place
// and never throws: a missing/broken integration must not block cart capture.
async function enrichItemImages(db: any, companyId: string, items: any[]) {
  try {
    const need = (items || []).filter((it: any) => !it.image && (it.product_id || it.variation_id))
    if (!need.length) return

    const { data: integ } = await db.from('woocommerce_integrations')
      .select('store_url, consumer_key, consumer_secret')
      .eq('company_id', companyId).eq('is_active', true)
      .order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (!integ?.store_url) return

    const auth = `Basic ${Buffer.from(`${integ.consumer_key}:${integ.consumer_secret}`).toString('base64')}`

    // Parent-product images by id (one fetch per distinct product — carts are small).
    const ids = Array.from(new Set(need.map((it: any) => it.product_id).filter(Boolean)))
    const imgById: Record<string, string> = {}
    await Promise.all(ids.map(async (pid: any) => {
      try {
        const pr = await fetch(`${integ.store_url}/wp-json/wc/v3/products/${pid}`, { headers: { Authorization: auth } })
        if (!pr.ok) return
        const p = await pr.json()
        const src = p?.images?.[0]?.src || p?.image?.src || null
        if (src) imgById[String(pid)] = src
      } catch { /* skip this product */ }
    }))

    // A variation with its own image takes precedence over the parent product.
    await Promise.all(need.filter((it: any) => it.variation_id && it.product_id).map(async (it: any) => {
      try {
        const vr = await fetch(`${integ.store_url}/wp-json/wc/v3/products/${it.product_id}/variations/${it.variation_id}`, { headers: { Authorization: auth } })
        if (!vr.ok) return
        const v = await vr.json()
        const src = v?.image?.src || null
        if (src) it.image = { src }
      } catch { /* skip this variation */ }
    }))

    for (const it of items) {
      if (!it.image && it.product_id && imgById[String(it.product_id)]) it.image = { src: imgById[String(it.product_id)] }
    }
  } catch (e) {
    console.error('[abandoned-cart] image enrich failed', e)
  }
}

// POST: receive an abandoned cart from the store. Company id via header or ?company=.
export async function POST(req: NextRequest) {
  try {
    const companyId = req.headers.get('x-company-id') || req.nextUrl.searchParams.get('company')
    if (!companyId) return NextResponse.json({ error: 'Missing company id (x-company-id header or ?company=)' }, { status: 400 })
    const body = await req.json()
    const db = admin()

    // The store's plugin key (companies.api_key, sent as X-Colvy-Key by plugin
    // 3.0.3+). A wrong key is always refused; a missing one is logged and let
    // through until CART_KEY_VERIFY=enforce, so stores on older plugins keep
    // working until they update.
    {
      const key = req.headers.get('x-colvy-key') || ''
      const { data: co } = await db.from('companies').select('api_key').eq('id', companyId).maybeSingle()
      if (!co) return NextResponse.json({ error: 'Unknown company' }, { status: 404 })
      if (key ? key !== co.api_key : (process.env.CART_KEY_VERIFY || '').toLowerCase() === 'enforce') {
        return NextResponse.json({ error: 'Invalid or missing plugin key' }, { status: 401 })
      }
      if (!key) console.warn('[abandoned-carts] cart without a plugin key for company', companyId)
    }

    // Diagnostic breadcrumb: record that a POST arrived (even if later rejected),
    // so ?diag=1 can confirm the WooCommerce bridge is actually reaching Colvy.
    try {
      await db.from('abandoned_cart_hits').insert({
        company_id: companyId,
        had_email: !!(body.email || body.billing?.email),
        had_phone: !!(body.phone || body.billing?.phone),
        item_count: Array.isArray(body.items || body.line_items || body.cart) ? (body.items || body.line_items || body.cart).length : 0,
        raw_keys: Object.keys(body || {}).join(','),
      })
    } catch {}

    // Recovery ping: the store tells us a previously-abandoned cart converted.
    if (req.nextUrl.searchParams.get('recovered') || body.status === 'recovered') {
      if (body.external_id) {
        await db.from('abandoned_carts')
          .update({ status: 'recovered', recovered_order_id: body.recovered_order_id || null, updated_at: new Date().toISOString() })
          .eq('company_id', companyId).eq('external_id', body.external_id)
      }
      return NextResponse.json({ ok: true, recovered: true })
    }

    const norm = normalizeCart(body)
    if (!norm.email && !norm.phone) return NextResponse.json({ error: 'Cart needs at least an email or phone to be useful' }, { status: 400 })

    // Backfill product images before saving, so the stored items JSON carries
    // them (the app reads abandoned_carts straight from the DB).
    await enrichItemImages(db, companyId, norm.items)

    const r = await ingestAbandonedCart(db, companyId, norm, body.page_history)
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error, norm }, { status: 500 })
    return NextResponse.json({ ok: true, id: r.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
// GET: list abandoned carts for a company, or fetch by email/phone (for the chat).
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    const email = req.nextUrl.searchParams.get('email')
    const phone = req.nextUrl.searchParams.get('phone')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()
    // Workspace members only (customer names, emails, phones and addresses).
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    // Diagnostic: ?diag=1 returns recent carts + counts so you can verify the
    // bridge is delivering, without needing a matching contact.
    if (req.nextUrl.searchParams.get('diag')) {
      const { data: recent } = await db.from('abandoned_carts').select('id, email, phone, total, status, created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(10)
      let hits: any[] = []
      try {
        const { data: h } = await db.from('abandoned_cart_hits').select('had_email, had_phone, item_count, raw_keys, save_error, created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(10)
        hits = h || []
      } catch {}
      const lastError = hits.find(h => h.save_error)?.save_error || null
      let hint: string
      if (hits.length === 0) hint = 'No POST has reached Colvy at all — the WordPress bridge is not firing (wrong hook, plugin not active, or blocked outbound request).'
      else if ((recent?.length || 0) > 0) hint = 'Carts are being saved successfully.'
      else if (lastError) hint = `Posts ARE arriving but the database rejected the save: "${lastError}". This usually means the abandoned_carts table/columns are missing — run the COLVY_V136_ABANDONED_CARTS.sql migration.`
      else hint = 'Posts are arriving but nothing saved, and no error was captured. Likely the abandoned_carts table is missing — run COLVY_V136_ABANDONED_CARTS.sql.'
      return NextResponse.json({
        diag: true,
        saved_carts: recent?.length || 0,
        recent: recent || [],
        inbound_posts_received: hits.length,
        last_save_error: lastError,
        last_posts: hits,
        hint,
      })
    }

    let q = db.from('abandoned_carts').select('*').eq('company_id', companyId).eq('status', 'abandoned').order('created_at', { ascending: false })
    if (email) {
      q = q.ilike('email', email)
      const { data } = await q.limit(5)
      return NextResponse.json({ carts: data || [] })
    } else if (phone) {
      // Match on the last 8-9 digits so +61 435 844 469 == 0435 844 469.
      const tail = phone.replace(/\D/g, '').slice(-8)
      const { data: all } = await q.limit(100)
      const carts = (all || []).filter((c: any) => (c.phone || '').replace(/\D/g, '').slice(-8) === tail)
      return NextResponse.json({ carts })
    }
    const { data } = await q.limit(100)
    return NextResponse.json({ carts: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, carts: [] }, { status: 500 })
  }
}
