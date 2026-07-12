import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { WebhookService } from '@/lib/webhook-service'
import { notifyCompany } from '@/lib/notify'

const DEFAULT_MESSAGES: Record<string, string> = {
  processing: 'Thank you for placing an order with {business}. We have received it. If you have any questions, feel free to reply here.',
  failed: 'We noticed there was an issue with your recent order payment. Do you need any help?',
  cancelled: 'Your recent order was cancelled. Can we help you with anything?',
  refunded: 'Your order has been refunded. The refund of {amount} has been processed and should appear shortly.',
  completed: 'Your order has been completed. Thank you for choosing {business}!',
  'on-hold': 'Your order is on hold while we confirm a few details. We\'ll be in touch shortly — feel free to reply here.',
}

// Find-or-create a contact + conversation for an order's customer, then post a
// status-appropriate message. De-duplicated per (order, status).
async function runOrderChatAutomation(db: any, companyId: string, order: any) {
  const { data: company } = await db.from('companies').select('name, order_chat_automation').eq('id', companyId).maybeSingle()
  const cfg = company?.order_chat_automation || {}

  const status = (order.status || '').toLowerCase()
  const messages = { ...DEFAULT_MESSAGES, ...(cfg.messages || {}) }
  const template = messages[status]

  const email = order.billing?.email
  const phone = order.billing?.phone
  if (!email && !phone) return

  // De-dup: only one automation message per (order, status). A separate key
  // tracks whether we've already created the conversation for this order.
  const dupeKey = { company_id: companyId, order_id: order.id, status }

  // Find-or-create contact by email (fallback phone).
  let contact: any = null
  if (email) {
    const { data } = await db.from('contacts').select('*').eq('company_id', companyId).ilike('email', email).limit(1)
    contact = data?.[0] || null
  }
  if (!contact && phone) {
    const { data } = await db.from('contacts').select('*').eq('company_id', companyId).eq('phone', phone).limit(1)
    contact = data?.[0] || null
  }
  if (!contact) {
    const name = `${order.billing?.first_name || ''} ${order.billing?.last_name || ''}`.trim() || email
    const { data: created } = await db.from('contacts').insert({
      company_id: companyId, name, email: email || null, phone: phone || null,
    }).select().maybeSingle()
    contact = created
  }

  // Find-or-create an open conversation for this contact. This ALWAYS happens
  // for a new order (so it shows in the inbox), independent of whether the
  // order-chat automation message is enabled/configured.
  let conv: any = null
  if (contact?.id) {
    const { data } = await db.from('conversations').select('*').eq('company_id', companyId).eq('contact_id', contact.id).order('last_message_at', { ascending: false }).limit(1)
    conv = data?.[0] || null
  }
  const businessName = company?.name || 'us'
  const displayName = contact?.name || order.billing?.first_name || 'there'
  const isNewConv = !conv
  if (!conv) {
    const { data: newConv } = await db.from('conversations').insert({
      company_id: companyId, channel: 'chat', subject: `Order #${order.number || order.id}`,
      contact_id: contact?.id || null, status: 'open', is_unread: true, unread_count: 1,
      last_message: '', last_message_at: new Date().toISOString(),
    }).select().maybeSingle()
    conv = newConv
  }
  if (!conv) return

  // Post a system event for the order once per (order, status) so a brand-new
  // order is visible in the thread even with automation off.
  const { data: seenEvent } = await db.from('order_chat_events').select('id').match(dupeKey).maybeSingle()
  if (!seenEvent) {
    await db.from('messages').insert({
      conversation_id: conv.id, company_id: companyId, sender_type: 'system',
      content: `Order #${order.number || order.id} — ${status || 'received'} · $${order.total}`,
      metadata: { order_event: true, order_id: order.id, status },
    })
    try { await notifyCompany({ db, companyId, type: 'order', message: `New order #${order.number || order.id} from ${displayName} — $${order.total}`, actorName: displayName, conversationId: conv.id }) } catch {}
    // Record the dedup marker now so repeated webhook deliveries for the same
    // order+status don't re-post (whether or not automation is enabled).
    await db.from('order_chat_events').insert({ ...dupeKey, conversation_id: conv.id })
  }

  // The automation message sends when enabled. For a brand-new order we ALWAYS
  // greet the customer (a thank-you), because an order with no acknowledgement
  // in the chat is worse than none at all — the customer is looking at a widget
  // that says nothing about the order they just placed.
  const isNewOrderStatus = ['processing', 'on-hold', 'completed'].includes(status)
  const shouldSend = !seenEvent && template && (cfg.enabled || isNewOrderStatus)
  if (shouldSend) {
  const refundedAmount = order.refunds?.length ? `$${Math.abs(order.refunds.reduce((s: number, r: any) => s + (parseFloat(r.total) || 0), 0)).toFixed(2)}` : `$${order.total}`
  const body = template
    .replace(/\{business\}/g, businessName)
    .replace(/\{name\}/g, displayName)
    .replace(/\{order\}/g, String(order.number || order.id))
    .replace(/\{amount\}/g, refundedAmount)
    .replace(/\{total\}/g, `$${order.total}`)

  await db.from('messages').insert({
    conversation_id: conv.id, company_id: companyId,
    sender_type: 'agent', sender_name: businessName, content: body,
    message_type: 'text', metadata: { auto: true, order_automation: status, order_id: order.id },
  })

  // Completed orders can include a Google review reminder as a follow-up line.
  if (status === 'completed' && cfg.review_url) {
    await db.from('messages').insert({
      conversation_id: conv.id, company_id: companyId,
      sender_type: 'agent', sender_name: businessName,
      content: `We'd love your feedback — leave us a Google review here: ${cfg.review_url}`,
      message_type: 'text', metadata: { auto: true, order_automation: 'review' },
    })
  }

  await db.from('conversations').update({ last_message: body, last_message_at: new Date().toISOString(), is_unread: true }).eq('id', conv.id)

  // Optional direct notification: SMS and/or email (only with the automation msg).
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
  if (cfg.also_sms && phone) {
    try {
      await fetch(`${origin}/api/telnyx/sms/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, conversationId: conv.id, to: phone, text: body, senderName: businessName }),
      })
    } catch (e) { console.error('[Order automation] SMS failed', e) }
  }
  if (cfg.also_email && email) {
    try {
      if (process.env.RESEND_API_KEY) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `${businessName} <notifications@updates.colvy.com>`,
            to: email,
            subject: `Update on your order #${order.number || order.id}`,
            text: body,
            html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a"><p>${body.replace(/\n/g, '<br>')}</p></div>`,
          }),
        })
      }
    } catch (e) { console.error('[Order automation] email failed', e) }
  }
  } // end automation-message block
}

/**
 * POST /api/webhooks/woocommerce
 * Receive real-time events from WooCommerce
 * Automatically syncs customer and order data, and (optionally) starts a chat
 * with a status-appropriate message.
 */
// WooCommerce sends a GET/ping-style request when you first save a webhook and
// for health checks. Respond 200 so setup succeeds instead of showing an error.
export async function GET(req: NextRequest) {
  return NextResponse.json({ ok: true, service: 'colvy-woocommerce-webhook' })
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.text()
    const deliveryId = req.headers.get('x-wc-webhook-delivery-id') || ''

    // WooCommerce's initial webhook save sends a ping with an empty or minimal
    // body (e.g. {"webhook_id":123}). Parsing that as an order used to throw and
    // return 500 — which WooCommerce reports as "Delivery URL returned 500".
    // Treat a ping / empty body as a successful handshake.
    const topic = req.headers.get('x-wc-webhook-topic') || ''
    if (!payload || !payload.trim()) {
      return NextResponse.json({ ok: true, ping: true })
    }
    let data: any
    try {
      data = JSON.parse(payload)
    } catch {
      // Non-JSON body (e.g. a raw ping) — acknowledge and move on.
      return NextResponse.json({ ok: true, ping: true })
    }
    if (data.webhook_id && !data.id && !data.line_items) {
      // This is the setup ping, not a real resource event.
      return NextResponse.json({ ok: true, ping: true, webhook_id: data.webhook_id })
    }

    const resource = data.resource || (data.line_items ? 'order' : undefined)
    const resourceId = data.id

    // Company ID: prefer the header, fall back to a ?company= query param since
    // WooCommerce's webhook UI can't add custom headers but can add a URL param.
    const companyId = req.headers.get('x-company-id') || req.nextUrl.searchParams.get('company')
    if (!companyId) {
      return NextResponse.json({ error: 'Missing company ID (header x-company-id or ?company=)' }, { status: 400 })
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      // Never 500 the webhook for a config issue — acknowledge and log.
      console.error('[Webhook] SUPABASE_SERVICE_ROLE_KEY missing')
      return NextResponse.json({ ok: true, warning: 'not fully configured' })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    // Keep the existing customer/order data sync.
    try {
      const webhookService = new WebhookService(supabase)
      await webhookService.processWebhook(companyId, { resource, id: resourceId, action: 'updated', ...data })
    } catch (e) { console.error('[Webhook] sync error', e) }

    // Order-triggered chat automation — the payload for order topics IS the order.
    if ((resource === 'order' || data.line_items) && data.status) {
      // Diagnostic breadcrumb so ?diag=1 can confirm order webhooks are arriving.
      try {
        await supabase.from('abandoned_cart_hits').insert({
          company_id: companyId, had_email: !!data.billing?.email, had_phone: !!data.billing?.phone,
          item_count: Array.isArray(data.line_items) ? data.line_items.length : 0,
          raw_keys: `ORDER_WEBHOOK status=${data.status} id=${data.id}`,
        })
      } catch {}
      try { await runOrderChatAutomation(supabase, companyId, data) }
      catch (e) { console.error('[Webhook] order chat automation error', e) }
    }

    return NextResponse.json({ success: true, message: 'Webhook processed', deliveryId })
  } catch (error: any) {
    console.error('[Webhook] Error:', error)
    // Return 200 so WooCommerce doesn't disable the webhook after repeated 500s.
    // The error is logged for debugging; the event is effectively dropped.
    return NextResponse.json({ ok: false, error: error.message || 'Webhook processing failed' })
  }
}
