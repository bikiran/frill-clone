import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { deliverAutomatedMessage } from '@/lib/channel-fallback'

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

    // Keep our copy of the order in step — using WooCommerce's authoritative
    // status (a PARTIAL refund stays "completed" in Woo; only a FULL refund flips
    // to "refunded") and the running refunded total, so the panel shows the right
    // "Partially refunded / Refunded" state instead of a hardcoded guess.
    let refreshedStatus: string | null = null
    try {
      const freshRes = await fetch(`${integ.store_url}/wp-json/wc/v3/orders/${orderId}`, {
        headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      })
      const fresh = await freshRes.json().catch(() => null)
      if (fresh) {
        refreshedStatus = fresh.status || null
        const refundedTotal = (fresh.refunds || []).reduce((s: number, r: any) => s + Math.abs(parseFloat(r.total || 0)), 0)
        const up = await db.from('woocommerce_orders')
          .update({ status: fresh.status, total_refunded: refundedTotal })
          .eq('company_id', companyId).eq('woo_order_id', orderId)
        if (up.error) await db.from('woocommerce_orders').update({ status: fresh.status }).eq('company_id', companyId).eq('woo_order_id', orderId)
      }
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

    // Tell the customer, using the business's "Refunded" template, over whatever
    // channel reaches them (live chat → SMS → email). This mirrors the
    // WooCommerce order-automation but fires on the explicit staff refund, so the
    // customer is notified immediately instead of relying on (or missing) the
    // store's order.updated webhook. The team-only internal note is posted
    // separately by the inbox and remains the audit record. Best-effort — a
    // delivery failure never affects the refund itself.
    if (conversationId) {
      try {
        const [{ data: company }, { data: conv }] = await Promise.all([
          db.from('companies').select('name, order_chat_automation').eq('id', companyId).maybeSingle(),
          db.from('conversations').select('id, contact_id, sms_number').eq('id', conversationId).maybeSingle(),
        ])
        let contact: any = null
        if (conv?.contact_id) {
          const { data: c } = await db.from('contacts').select('name, phone, email').eq('id', conv.contact_id).maybeSingle()
          contact = c
        }

        const cfg: any = company?.order_chat_automation || {}
        const businessName = company?.name || 'us'
        const template: string = (cfg.messages && cfg.messages.refunded)
          || 'Your order has been refunded. The refund of {amount} has been processed and should appear shortly.'
        const amountStr = `$${Number(refundAmount).toFixed(2)}`
        const body = template
          .replace(/\{business\}/g, businessName)
          .replace(/\{name\}/g, contact?.name || 'there')
          .replace(/\{order\}/g, String(orderId))
          .replace(/\{amount\}/g, amountStr)
          .replace(/\{total\}/g, amountStr)

        // Post the customer-facing line into the thread (NOT internal).
        await db.from('messages').insert({
          conversation_id: conversationId, company_id: companyId,
          sender_type: 'agent', sender_name: businessName, content: body,
          message_type: 'text', is_read: true,
          metadata: { auto: true, order_automation: 'refunded', order_id: orderId, agent_refund: true },
        })
        await db.from('conversations')
          .update({ last_message: body, last_message_at: new Date().toISOString() })
          .eq('id', conversationId)

        // Reach them off live chat too (SMS → email); the thread message is
        // already written, so those routes skip re-posting it.
        const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
        await deliverAutomatedMessage({
          companyId, conversationId, text: body,
          phone: contact?.phone || conv?.sms_number || null,
          email: contact?.email || null,
          senderName: businessName,
          subject: `Update on your order #${orderId}`,
          origin, db,
        })

        // A FULL refund flips WooCommerce to "refunded"; if the store's
        // order.updated webhook is wired up, it would send the same template
        // again. Claim the (order, refunded) dedup marker the webhook checks so
        // the customer isn't messaged twice, and keep the thread's status badge
        // in step. Partial refunds leave Woo "completed", so there's nothing to
        // suppress.
        if (String(refreshedStatus).toLowerCase() === 'refunded') {
          try {
            await db.from('order_chat_events')
              .insert({ company_id: companyId, order_id: orderId, status: 'refunded', conversation_id: conversationId })
          } catch {}
          try {
            await db.from('conversations').update({ order_status: 'refunded' }).eq('id', conversationId)
          } catch {}
        }
      } catch (e) {
        console.error('[Refund] customer notify failed', e)
      }
    }

    return NextResponse.json({ ok: true, refund: data, amount: refundAmount })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
