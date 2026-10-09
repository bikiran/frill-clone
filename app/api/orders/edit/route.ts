import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveShopifyOrderRef, shopifyEditItems, shopifyChangeStatus, shopifyAppendNote, ShopifyActionError } from '@/lib/shopify-order-actions'
import { statusWord } from '@/lib/shopify-automation'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// POST: edit an existing WooCommerce order — update line item quantities (or
// remove an item with quantity 0), change status, add a customer note.
// Shopify orders: quantities change through a Shopify order edit, the status
// as in /api/orders/status, and the note is added to the order's notes
// (Shopify has no separate customer-note email).
export async function POST(req: NextRequest) {
  try {
    const { companyId, integrationId, orderId, status, items, customerNote, conversationId, channel, orderRowId } = await req.json()
    if (!companyId || !orderId) return NextResponse.json({ error: 'Missing companyId or orderId' }, { status: 400 })

    const db = admin()
    // Workspace members only (customer details, orders and refunds).
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    if (conversationId) {
      const { data: owner } = await db.from('conversations').select('company_id').eq('id', conversationId).maybeSingle()
      if (!owner || owner.company_id !== companyId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
    try {
      const shop = await resolveShopifyOrderRef(db, companyId, { orderId, channel, orderRowId })
      if (shop) {
        const list = Array.isArray(items) ? items : []
        if (list.some((it: any) => !it?.id)) return NextResponse.json({ error: 'Adding products to a Shopify order isn’t available from Colvy yet — add them in Shopify.' }, { status: 400 })
        let o: any = (await shopifyEditItems(db, shop, list.map((it: any) => ({ id: it.id, quantity: it.remove ? 0 : Number(it.quantity) || 0 })))).order
        if (status && o && statusWord(o) !== String(status).toLowerCase()) o = (await shopifyChangeStatus(db, shop, status)).order || o
        if (customerNote && String(customerNote).trim()) o = (await shopifyAppendNote(db, shop, String(customerNote))) || o
        const number = String(o?.name || shop.row?.order_number || shop.externalId).replace(/^#/, '')
        const total = parseFloat(o?.currentTotalPriceSet?.shopMoney?.amount ?? o?.totalPriceSet?.shopMoney?.amount) || 0
        const st = o ? statusWord(o) : status
        if (conversationId) {
          try {
            await db.from('messages').insert({
              conversation_id: conversationId, company_id: companyId, sender_type: 'system',
              content: `✏️ Order #${number} updated — new total ${o?.currencyCode || 'AUD'} $${total.toFixed(2)} (${st}).`,
            })
          } catch {}
        }
        return NextResponse.json({ ok: true, order: { id: shop.externalId, number, total: total.toFixed(2), status: st, channel: 'shopify' } })
      }
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: e instanceof ShopifyActionError ? e.status : 502 })
    }

    let integ: any = null
    if (integrationId) {
      const r = await db.from('woocommerce_integrations').select('*').eq('id', integrationId).eq('company_id', companyId).maybeSingle()
      integ = r.data
    }
    if (!integ) {
      const r = await db.from('woocommerce_integrations').select('*').eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true }).limit(1)
      integ = r.data?.[0] || null
    }
    if (!integ?.store_url) return NextResponse.json({ error: 'No WooCommerce store connected' }, { status: 404 })

    const auth = `Basic ${Buffer.from(`${integ.consumer_key}:${integ.consumer_secret}`).toString('base64')}`

    // Build the line_items update. WooCommerce updates a line by its id; setting
    // quantity 0 removes it. A line WITHOUT an id but WITH a product_id is added
    // as a new line. subtotal/total override the price. New/changed quantities
    // recalculate totals server-side.
    const payload: any = {}
    if (Array.isArray(items) && items.length) {
      payload.line_items = items.map((it: any) => {
        if (it.id && (it.quantity === 0 || it.remove)) return { id: it.id, quantity: 0 }
        const li: any = { quantity: it.quantity }
        if (it.id) li.id = it.id
        else if (it.product_id) { li.product_id = Number(it.product_id); if (it.variation_id) li.variation_id = Number(it.variation_id) }
        if (it.custom_price != null && it.custom_price !== '') {
          const t = (parseFloat(it.custom_price) * it.quantity).toFixed(2)
          li.subtotal = t; li.total = t
        }
        return li
      })
    }
    if (status) payload.status = status
    if (customerNote) payload.customer_note = customerNote

    const res = await fetch(`${integ.store_url}/wp-json/wc/v3/orders/${orderId}`, {
      method: 'PUT', headers: { 'Authorization': auth, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data?.message || `Update failed (${res.status})` }, { status: 502 })

    if (conversationId) {
      try {
        await db.from('messages').insert({
          conversation_id: conversationId, company_id: companyId, sender_type: 'system',
          content: `✏️ Order #${data.number || orderId} updated — new total ${data.currency || 'AUD'} $${data.total} (${data.status}).`,
        })
      } catch {}
    }

    return NextResponse.json({ ok: true, order: { id: data.id, number: data.number, total: data.total, status: data.status } })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
