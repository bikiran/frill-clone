import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * POST — refund a WooCommerce order.
 *
 * Creates a real refund against the order via the WooCommerce REST API. With
 * api_refund:true WooCommerce asks the payment gateway to return the money, so
 * this MOVES REAL FUNDS — it's only ever called from an explicit staff action
 * with a confirmation.
 *
 * Body: {
 *   companyId, integrationId?, orderId, conversationId?, reason?,
 *   amount?,        // full refund when nothing itemised is given
 *   lineItems?,     // [{ id, qty, total, tax }]  per-item refund
 *   shipping?,      // shipping amount to refund
 *   restock?,       // put refunded quantities back into stock
 * }
 * Omitting everything but the order refunds the full total.
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, integrationId, orderId, amount, reason, conversationId,
            lineItems, shipping, restock } = await req.json()
    if (!companyId || !orderId) {
      return NextResponse.json({ error: 'Missing companyId or orderId' }, { status: 400 })
    }

    const db = admin()
    let integ: any = null
    if (integrationId) {
      const r = await db.from('woocommerce_integrations').select('*').eq('id', integrationId).maybeSingle()
      integ = r.data
    }
    if (!integ) {
      const r = await db.from('woocommerce_integrations').select('*')
        .eq('company_id', companyId).eq('is_active', true)
        .order('created_at', { ascending: true }).limit(1)
      integ = r.data?.[0] || null
    }
    if (!integ?.store_url) {
      return NextResponse.json({ error: 'No WooCommerce store connected' }, { status: 404 })
    }

    const auth = `Basic ${Buffer.from(`${integ.consumer_key}:${integ.consumer_secret}`).toString('base64')}`

    // Build the WooCommerce refund payload. Three shapes:
    //   itemised  — specific line items (and optionally shipping), with restock
    //   amount    — a flat partial refund
    //   neither   — full order total
    const hasItems = Array.isArray(lineItems) && lineItems.length > 0
    const shippingNum = Number(shipping) || 0

    // Compute the total so it's recorded and shown consistently.
    let refundAmount = amount
    if (hasItems || shippingNum > 0) {
      const itemsTotal = (lineItems || []).reduce(
        (s: number, li: any) => s + (Number(li.total) || 0) + (Number(li.tax) || 0), 0)
      refundAmount = (itemsTotal + shippingNum).toFixed(2)
    }
    if (!refundAmount) {
      const oRes = await fetch(`${integ.store_url}/wp-json/wc/v3/orders/${orderId}`, {
        headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      })
      const order = await oRes.json().catch(() => null)
      if (!oRes.ok || !order?.total) {
        return NextResponse.json({ error: 'Could not read the order total' }, { status: 400 })
      }
      refundAmount = order.total
    }

    if (Number(refundAmount) <= 0) {
      return NextResponse.json({ error: 'Nothing selected to refund' }, { status: 400 })
    }

    const payload: any = {
      amount: String(refundAmount),
      reason: reason || 'Refunded from Colvy',
      api_refund: true,
    }

    if (hasItems) {
      // WooCommerce expects per-line refund_total and refund_tax keyed by tax id.
      payload.line_items = (lineItems || []).map((li: any) => ({
        id: li.id,
        quantity: restock ? (Number(li.qty) || 0) : undefined,
        refund_total: Number(li.total) || 0,
        refund_tax: li.taxId != null
          ? [{ id: li.taxId, refund_total: Number(li.tax) || 0 }]
          : undefined,
      }))
    }
    // restock is driven by including quantity above; WooCommerce restocks any
    // line item that carries a quantity on the refund.

    if (shippingNum > 0) {
      payload.shipping_lines = [{ id: 0, refund_total: shippingNum }]
    }

    const res = await fetch(`${integ.store_url}/wp-json/wc/v3/orders/${orderId}/refunds`, {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.message || 'WooCommerce rejected the refund' },
        { status: 400 }
      )
    }

    // Keep our copy of the order in step.
    try {
      await db.from('woocommerce_orders')
        .update({ status: 'refunded' })
        .eq('company_id', companyId).eq('order_id', orderId)
    } catch {}

    // Leave a trace in the conversation.
    if (conversationId) {
      try {
        await db.from('conversation_events').insert({
          conversation_id: conversationId, company_id: companyId,
          event_type: 'order_refunded',
          detail: `Refunded $${Number(refundAmount).toFixed(2)} on order #${orderId}`,
        })
      } catch {}
    }

    return NextResponse.json({ ok: true, refund: data, amount: refundAmount })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
