import { NextRequest, NextResponse } from 'next/server'
import { deliverAutomatedMessage } from '@/lib/channel-fallback'
import { linkContactIdentity } from '@/lib/identity'
import { createClient } from '@supabase/supabase-js'
import { attributeOrderToLinks } from '@/lib/link-attribution'
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

// ── Recover abandoned carts by email/phone ──────────────────────────────────
// The WordPress bridge only marks a cart recovered when the SAME browser
// session converts. Customers routinely abandon on mobile and buy on desktop,
// so we also match on contact details. This runs at the TOP LEVEL of the
// webhook (not buried inside the chat automation, whose early returns —
// missing conversation, etc. — used to silently skip it). It also counts
// 'pending' as a conversion: WooCommerce's order.created webhook fires with
// status=pending for most gateways, and if that's the only webhook configured,
// a successful order would otherwise never be matched.
async function recoverAbandonedCarts(db: any, companyId: string, order: any) {
  try {
    const status = (order.status || '').toLowerCase()
    // A failed / cancelled / refunded order did NOT recover the cart.
    const converting = ['pending', 'processing', 'completed', 'on-hold'].includes(status)
    if (!converting) return

    const email = (order.billing?.email || '').trim()
    const phone = (order.billing?.phone || '').trim()
    if (!email && !phone) return

    const { data: openCarts } = await db.from('abandoned_carts')
      .select('id, email, phone, conversation_id')
      .eq('company_id', companyId)
      .eq('status', 'abandoned')

    const norm = (p: string) => (p || '').replace(/\D/g, '').slice(-8) // last 8 digits
    const wantEmail = email.toLowerCase()
    const wantPhone = norm(phone)

    const matches = (openCarts || []).filter((c: any) => {
      const cEmail = (c.email || '').trim().toLowerCase()
      const cPhone = norm(c.phone || '')
      if (wantEmail && cEmail && cEmail === wantEmail) return true
      if (wantPhone && cPhone && cPhone === wantPhone) return true
      return false
    })

    // Fallback: also recover any OPEN conversation for the same contact that is
    // still flagged as an abandoned cart. The cart-record match above can miss
    // (e.g. the cart stored a different/blank email than the billing email), yet
    // the customer clearly converted — so flip their conversation too.
    try {
      const digits = (s: string) => (s || '').replace(/\D/g, '').slice(-9)
      const { data: contacts } = await db.from('contacts')
        .select('id').eq('company_id', companyId)
        .or([
          wantEmail ? `email.ilike.${wantEmail}` : '',
          phone ? `phone.ilike.%${digits(phone)}%` : '',
        ].filter(Boolean).join(','))
      const contactIds = (contacts || []).map((c: any) => c.id)
      if (contactIds.length) {
        const { data: cartConvs } = await db.from('conversations')
          .select('id, subject, order_status, cart_status')
          .in('contact_id', contactIds)
          .ilike('subject', 'abandoned cart%')
        for (const cc of cartConvs || []) {
          if (cc.cart_status === 'recovered') continue
          if (!matches.find((m: any) => m.conversation_id === cc.id)) {
            matches.push({ id: null, conversation_id: cc.id, _viaContact: true })
          }
        }
      }
    } catch {}

    for (const m of matches) {
      if (m.id) {
        await db.from('abandoned_carts').update({
          status: 'recovered',
          recovered_order_id: String(order.id),
          updated_at: new Date().toISOString(),
        }).eq('id', m.id)
      }
      // Note the win in the cart's conversation thread, so the agent sees it.
      if (m.conversation_id) {
        try {
          await db.from('messages').insert({
            conversation_id: m.conversation_id, company_id: companyId, sender_type: 'system',
            content: `🛒→✅ Abandoned cart recovered — order #${order.number || order.id} placed ($${order.total})`,
            metadata: { cart_recovered: true, order_id: order.id },
          })
          // Stamp the CONVERSATION too — the abandoned-cart badge reads the
          // conversation's order_status / cart_status, not the cart record.
          // Without this the thread stayed "Abandoned Cart" forever even after
          // the sale (which is exactly what happened for this customer).
          await db.from('conversations').update({
            order_status: (order.status || 'processing'),
            cart_status: 'recovered',
            woo_order_id: String(order.id),
            last_message: `Order #${order.number || order.id} — ${order.status || 'processing'} · $${order.total}`,
            last_message_at: new Date().toISOString(),
          }).eq('id', m.conversation_id)
        } catch {}
      }
    }

    // Diagnostic breadcrumb: how many carts this order recovered (visible via ?diag=1).
    try {
      await db.from('abandoned_cart_hits').insert({
        company_id: companyId, had_email: !!email, had_phone: !!phone,
        item_count: matches.length,
        raw_keys: `CART_RECOVERY order=${order.id} status=${status} matched=${matches.length}`,
      })
    } catch {}
  } catch (e) { console.error('[cart recovery] match failed', e) }
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
    // Match by NORMALISED phone (last 9 digits) — SMS contacts may store the
    // number as 0468…, +61468…, or 61468… while the order billing uses another
    // format. An exact match missed these, so the order spawned a NEW contact
    // and the existing SMS thread never got the "Order Placed" badge.
    const norm = (p: string) => (p || '').replace(/\D/g, '').slice(-9)
    const target = norm(phone)
    // Narrow server-side first (suffix match), then confirm in JS. This avoids
    // pulling the whole contacts table.
    const { data: candidates } = await db.from('contacts').select('*')
      .eq('company_id', companyId).ilike('phone', `%${target}`).limit(50)
    contact = (candidates || []).find((c: any) => norm(c.phone) === target) || null
  }
  if (!contact) {
    const name = `${order.billing?.first_name || ''} ${order.billing?.last_name || ''}`.trim() || email
    const b = order.billing || {}
    const address = [b.address_1, b.address_2].filter(Boolean).join(', ') || null
    const { data: created } = await db.from('contacts').insert({
      company_id: companyId, name, email: email || null, phone: phone || null,
      address, city: b.city || null, state: b.state || null, postcode: b.postcode || null, country: b.country || null,
    }).select().maybeSingle()
    contact = created
  } else {
    // Existing contact (e.g. created via chat/SMS before ordering) — backfill
    // the address from this order's billing if it's currently missing, so the
    // "New order" message doesn't leave the contact card blank.
    const b = order.billing || {}
    const address = [b.address_1, b.address_2].filter(Boolean).join(', ') || null
    if (address && !contact.address) {
      await db.from('contacts').update({
        address, city: b.city || contact.city || null, state: b.state || contact.state || null,
        postcode: b.postcode || contact.postcode || null, country: b.country || contact.country || null,
      }).eq('id', contact.id)
      contact.address = address
    }
  }

  // Link this order's customer to any existing contact from other channels
  // (live chat, SMS, Messenger, IG) by shared email/phone.
  if (contact?.id) {
    await linkContactIdentity(db, companyId, contact.id, { email, phone, channel: 'woocommerce' })
  }

  // Find-or-create an open conversation for THIS ORDER. Match on the order's
  // subject first (so an order.updated refreshes the right thread), then fall
  // back to the contact's most recent conversation.
  let conv: any = null
  const orderSubject = `Order #${order.number || order.id}`
  if (contact?.id) {
    const { data: byOrder } = await db.from('conversations').select('*')
      .eq('company_id', companyId).eq('subject', orderSubject).limit(1)
    conv = byOrder?.[0] || null
    if (!conv) {
      const { data } = await db.from('conversations').select('*').eq('company_id', companyId).eq('contact_id', contact.id).order('last_message_at', { ascending: false }).limit(1)
      conv = data?.[0] || null
    }
  }
  const businessName = company?.name || 'us'
  const billingName = `${order.billing?.first_name || ''} ${order.billing?.last_name || ''}`.trim()
  const displayName = contact?.name || order.billing?.first_name || 'there'
  const convSubject = contact?.name || billingName || `Order #${order.number || order.id}`
  const isNewConv = !conv
  if (!conv) {
    const { data: newConv } = await db.from('conversations').insert({
      company_id: companyId, channel: 'chat', subject: convSubject,
      contact_id: contact?.id || null, status: 'open', is_unread: true, unread_count: 1,
      last_message: '', last_message_at: new Date().toISOString(),
      order_status: status || null,
    }).select().maybeSingle()
    conv = newConv
  } else if (contact?.id && !conv.contact_id) {
    // Link the contact to an existing conversation that was created without one
    // (e.g. an order thread that showed "Visitor" / "No contact linked").
    await db.from('conversations').update({ contact_id: contact.id, subject: conv.subject?.startsWith('Order #') ? convSubject : conv.subject }).eq('id', conv.id)
    conv.contact_id = contact.id
  }
  if (!conv) return

  // Keep the conversation's order status current. The inbox badge was reading
  // only the subject ("Order #…") and so labelled EVERY order conversation
  // "ORDER PLACED" — including failed payments, which is the opposite of what
  // happened. The badge now reads this column.
  try {
    await db.from('conversations').update({ order_status: status || null }).eq('id', conv.id)

  // Credit this order to any link the customer clicked shortly before ordering,
  // so Link Reports can show revenue influenced. Best-effort — never blocks the
  // order being processed.
  try {
    const paid = ['processing', 'completed'].includes(String(status || '').toLowerCase())
    await attributeOrderToLinks({
      companyId,
      contactId: contact?.id || null,
      orderId: order.id,
      orderNumber: order.number,
      total: order.total,
      currency: order.currency,
      stage: paid ? 'paid' : 'created',
      orderDate: order.date_created || null,
    })
  } catch {}
  } catch {}

  // Post a system event for the order once per (order, status) so a brand-new
  // order is visible in the thread even with automation off.
  const { data: seenEvent } = await db.from('order_chat_events').select('id').match(dupeKey).maybeSingle()
  if (!seenEvent) {
    // If an order message already exists for this order (from an earlier
    // status), UPDATE it in place so the thread shows the current status
    // instead of leaving a stale "pending" line behind. Then also post the
    // transition, so the history is visible.
    const { data: priorOrderMsgs } = await db.from('messages')
      .select('id, metadata').eq('conversation_id', conv.id)
    const priorOrderMsg = (priorOrderMsgs || []).find((m: any) => m.metadata?.order_event && String(m.metadata?.order_id) === String(order.id))
    if (priorOrderMsg) {
      await db.from('messages').update({
        content: `Order #${order.number || order.id} — ${status || 'received'} · $${order.total}`,
        metadata: { ...(priorOrderMsg.metadata || {}), status },
      }).eq('id', priorOrderMsg.id)
    } else {
      await db.from('messages').insert({
        conversation_id: conv.id, company_id: companyId, sender_type: 'system',
        content: `Order #${order.number || order.id} — ${status || 'received'} · $${order.total}`,
        metadata: { order_event: true, order_id: order.id, status },
      })
    }
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

  const { data: autoMsg } = await db.from('messages').insert({
    conversation_id: conv.id, company_id: companyId,
    sender_type: 'agent', sender_name: businessName, content: body,
    message_type: 'text', metadata: { auto: true, order_automation: status, order_id: order.id },
  }).select('id').maybeSingle()

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
  // Deliver where the customer will actually see it.
  //
  // A thread message is only "delivered" if they're sitting on the site with
  // the widget open. If they've closed the tab, it goes to SMS (then email) so
  // the confirmation actually reaches them. When the business has explicitly
  // ticked "also send by SMS/email", it's sent regardless — they want the
  // customer to have a copy either way.
  // Delivery rule:
  //   - On live chat right now → the thread message is enough.
  //   - Not on live chat → SMS (then email) so it actually reaches them,
  //     whether or not "also send" was ticked. An order confirmation the
  //     customer never sees is the failure we're avoiding.
  //   - "Also send" ticked → send the copy even if they ARE on live chat.
  const forceCopy = !!(cfg.also_sms || cfg.also_email)
  try {
    const delivery = await deliverAutomatedMessage({
      companyId,
      conversationId: conv.id,
      text: body,
      // Always give it the phone — the helper only uses it when the customer
      // isn't watching live chat (or when forced). Previously this was nulled
      // unless "also send SMS" was on, so anyone off live chat got nothing.
      // Fall back to the linked contact's stored mobile if the order's billing
      // phone is blank, so an SMS-only customer still gets reached.
      phone: phone || contact?.phone || null,
      email,
      senderName: businessName,
      subject: `Update on your order #${order.number || order.id}`,
      origin,
      force: forceCopy,
      db,
    })
    console.log('[Order automation] delivery', {
      order: order.number || order.id,
      status,
      onLiveChat: delivery.onLiveChat,
      via: delivery.channel,
      sent: delivery.sent,
    })

    // Tag the thread message with the channel it actually went out on. The row
    // defaults to 'chat', so without this an order update sent by SMS still
    // showed "Live Chat" in the timeline — confusing when the whole
    // conversation has been over SMS.
    if (autoMsg?.id && (delivery.channel === 'sms' || delivery.channel === 'email')) {
      try {
        await db.from('messages')
          .update({ delivery_channel: delivery.channel })
          .eq('id', autoMsg.id)
      } catch {}
    }
  } catch (e) {
    console.error('[Order automation] delivery failed', e)
  }
  } // end automation-message block

  // ── Record the order with its chat attribution ────────────────────────────
  // This makes "sales converted through chat" a real revenue figure. We only
  // attribute what we can defend:
  //   cart_recovered → this customer had a cart Colvy captured, now converted
  //   chat_order     → the order was created by an agent from the chat
  //   chat_assisted  → the customer had a real conversation before ordering
  try {
    let attribution: string | null = null

    // Recovered cart? (the bridge marks carts recovered on checkout)
    if (contact?.id) {
      const { data: cart } = await db.from('abandoned_carts')
        .select('id').eq('company_id', companyId).eq('status', 'recovered')
        .or(`email.ilike.${email || 'x@x'},phone.eq.${phone || 'x'}`)
        .limit(1)
      if (cart?.length) attribution = 'cart_recovered'
    }
    // Created from chat by an agent?
    if (!attribution && order.meta_data?.some?.((m: any) => m.key === '_colvy_conversation_id')) {
      attribution = 'chat_order'
    }
    // Otherwise, did the customer actually converse (not just system events)?
    if (!attribution && conv?.id) {
      const { data: realMsgs } = await db.from('messages')
        .select('id').eq('conversation_id', conv.id)
        .in('sender_type', ['visitor', 'agent']).limit(1)
      if (realMsgs?.length) attribution = 'chat_assisted'
    }

    const orderRow: any = {
      company_id: companyId,
      woo_order_id: order.id,
      customer_email: email || null,
      status,
      total: parseFloat(order.total) || 0,
      shipping_total: parseFloat(order.shipping_total || '0') || 0,
      currency: order.currency || 'AUD',
      order_date: order.date_created ? new Date(order.date_created).toISOString() : new Date().toISOString(),
      line_items: order.line_items || [],
      billing: order.billing || {},
      conversation_id: conv?.id || null,
      attribution,
      attributed_at: attribution ? new Date().toISOString() : null,
    }
    const { data: existingOrder } = await db.from('woocommerce_orders')
      .select('id').eq('company_id', companyId).eq('woo_order_id', order.id).maybeSingle()
    if (existingOrder?.id) {
      await db.from('woocommerce_orders').update(orderRow).eq('id', existingOrder.id)
    } else {
      await db.from('woocommerce_orders').insert(orderRow)
    }
  } catch (e) { console.error('[order attribution] failed', e) }

  // ── Auto review request on completion ─────────────────────────────────────
  // Independent of the order-chat automation toggle: if the business turned on
  // review requests, schedule one (optionally delayed) for a completed order.
  if (status === 'completed') {
    try {
      const { data: co } = await db.from('companies').select('review_request_settings').eq('id', companyId).maybeSingle()
      const rr = co?.review_request_settings || {}
      if (rr.enabled) {
        const delayHours = Number(rr.delay_hours ?? 24)
        const sendAfter = new Date(Date.now() + delayHours * 3600 * 1000).toISOString()
        // One request per order (unique index on company_id, order_id).
        const { data: seen } = await db.from('review_requests')
          .select('id').eq('company_id', companyId).eq('order_id', String(order.id)).maybeSingle()
        if (!seen) {
          await db.from('review_requests').insert({
            company_id: companyId,
            conversation_id: conv.id,
            contact_id: contact?.id || null,
            order_id: String(order.id),
            send_after: sendAfter,
            status: 'pending',
          })
        }
      }
    } catch (e) { console.error('[review request] schedule failed', e) }
  }

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
      // Cart recovery FIRST and independently — it must not be skippable by
      // anything the chat automation does (or fails to do).
      try { await recoverAbandonedCarts(supabase, companyId, data) }
      catch (e) { console.error('[Webhook] cart recovery error', e) }
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
