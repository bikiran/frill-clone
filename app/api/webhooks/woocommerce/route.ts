import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { WebhookService } from '@/lib/webhook-service'

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
  const cfg = company?.order_chat_automation
  if (!cfg?.enabled) return

  const status = (order.status || '').toLowerCase()
  const messages = { ...DEFAULT_MESSAGES, ...(cfg.messages || {}) }
  const template = messages[status]
  if (!template) return // no message configured for this status

  const email = order.billing?.email
  const phone = order.billing?.phone
  if (!email && !phone) return

  // De-dup: only one message per (order, status).
  const dupeKey = { company_id: companyId, order_id: order.id, status }
  const { data: seen } = await db.from('order_chat_events').select('id').match(dupeKey).maybeSingle()
  if (seen) return

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

  // Find-or-create an open conversation for this contact.
  let conv: any = null
  if (contact?.id) {
    const { data } = await db.from('conversations').select('*').eq('company_id', companyId).eq('contact_id', contact.id).order('last_message_at', { ascending: false }).limit(1)
    conv = data?.[0] || null
  }
  const businessName = company?.name || 'us'
  const displayName = contact?.name || order.billing?.first_name || 'there'
  if (!conv) {
    const { data: newConv } = await db.from('conversations').insert({
      company_id: companyId, channel: 'chat', subject: `Order #${order.number || order.id}`,
      contact_id: contact?.id || null, status: 'open', is_unread: true, unread_count: 1,
      last_message: '', last_message_at: new Date().toISOString(),
    }).select().maybeSingle()
    conv = newConv
  }
  if (!conv) return

  // Fill the template.
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
  await db.from('order_chat_events').insert({ ...dupeKey, conversation_id: conv.id })
}

/**
 * POST /api/webhooks/woocommerce
 * Receive real-time events from WooCommerce
 * Automatically syncs customer and order data, and (optionally) starts a chat
 * with a status-appropriate message.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.text()
    const deliveryId = req.headers.get('x-wc-webhook-delivery-id') || ''

    const data = JSON.parse(payload)
    const resource = data.resource || (data.line_items ? 'order' : undefined)
    const resourceId = data.id

    // Company ID: prefer the header, fall back to a ?company= query param since
    // WooCommerce's webhook UI can't add custom headers but can add a URL param.
    const companyId = req.headers.get('x-company-id') || req.nextUrl.searchParams.get('company')
    if (!companyId) {
      return NextResponse.json({ error: 'Missing company ID (header x-company-id or ?company=)' }, { status: 400 })
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
      try { await runOrderChatAutomation(supabase, companyId, data) }
      catch (e) { console.error('[Webhook] order chat automation error', e) }
    }

    return NextResponse.json({ success: true, message: 'Webhook processed', deliveryId })
  } catch (error: any) {
    console.error('[Webhook] Error:', error)
    return NextResponse.json({ error: error.message || 'Webhook processing failed' }, { status: 500 })
  }
}
