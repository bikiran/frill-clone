// Order → chat automation for any store, taking a normalised order.
//
// A step-for-step port of the WooCommerce webhook's runOrderChatAutomation
// (app/api/webhooks/woocommerce/route.ts), which stays as it is for now: this
// module serves Shopify first, and WooCommerce can move onto it once it has
// proven itself. What a store must supply is behind three hooks — finding the
// conversation an earlier event for this order used, deciding whether a
// negative status is spurious, and recording the conversation + attribution
// on the order. Everything else (contact + conversation, the order badge, link
// attribution, the once-per-status system line and team alert, the customer
// message with its throttle and suppressions, the Google review line, delivery,
// and the review request on completion) is shared.

import { deliverAutomatedMessage } from '@/lib/channel-fallback'
import { linkContactIdentity, linkedContacts } from '@/lib/identity'
import { attributeOrderToLinks } from '@/lib/link-attribution'
import { notifyCompany, pushInboundMessage } from '@/lib/notify'
import { DEFAULT_ORDER_MESSAGES, isStaleOrderMessage } from '@/lib/order-messages'
import { findCustomerGoogleReview } from '@/lib/review-match'
import { logEnquiryReopened } from '@/lib/conversation-timeline'

// WooCommerce's status words — the vocabulary the inbox badge, the message
// templates and the settings page all use. Each store maps into it.
export type OrderStatusWord = 'pending' | 'processing' | 'on-hold' | 'completed' | 'cancelled' | 'refunded' | 'failed'

export type NormalOrder = {
  channel: 'woocommerce' | 'shopify'
  externalId: string            // the store's numeric order id, as text
  number: string                // what the customer sees, e.g. 1042
  status: OrderStatusWord
  total: number
  currency: string
  refundedTotal?: number | null
  email: string | null
  phone: string | null
  firstName: string
  lastName: string
  address: { address_1?: string; address_2?: string; city?: string; state?: string; postcode?: string; country?: string } | null
  isPos: boolean                // an in-store sale: never message the customer
  createdAt: string | null
  chatConversationId?: string | null   // set when the order was created from a Colvy chat
}

export type OrderAutomationHooks = {
  // The conversation a previous event for this same order was filed under.
  priorConversationId: (db: any, companyId: string, o: NormalOrder) => Promise<string | null>
  // Is this cancelled/failed status really an order that's alive? Returns the
  // live status word if so (the badge shows that instead, and no "cancelled"
  // message goes out).
  spuriousNegative?: (db: any, companyId: string, o: NormalOrder) => Promise<OrderStatusWord | null>
  // Record which conversation the order belongs to and how Colvy contributed.
  persist: (db: any, companyId: string, o: NormalOrder, r: { conversationId: string | null; contactId: string | null; attribution: string | null; badgeStatus: string }) => Promise<void>
}

const NEGATIVE_RACE_STATUSES = ['cancelled', 'failed']
const THANKYOU = ['processing', 'on-hold', 'completed']
const money = (n: any) => `$${(Number(n) || 0).toFixed(2)}`

// A key for tables that store one row per order (review_requests): plain for
// WooCommerce as it always was, channel-prefixed otherwise so two stores in one
// workspace can never collide.
export const orderKey = (o: NormalOrder) => o.channel === 'woocommerce' ? o.externalId : `${o.channel}:${o.externalId}`

export async function runOrderAutomation(db: any, companyId: string, o: NormalOrder, hooks: OrderAutomationHooks) {
  const { data: company } = await db.from('companies').select('name, order_chat_automation').eq('id', companyId).maybeSingle()
  const cfg = company?.order_chat_automation || {}
  const status = o.status

  // Saved overrides: blank = "don't send for this status"; an old default
  // falls back to the current default.
  const savedMsgs: Record<string, string> = {}
  for (const [k, v] of Object.entries(cfg.messages || {})) {
    const val = String(v ?? '').trim()
    if (!val) savedMsgs[k] = ''
    else if (!isStaleOrderMessage(val, company?.name)) savedMsgs[k] = val as string
  }
  const messages: Record<string, string> = { ...DEFAULT_ORDER_MESSAGES, ...savedMsgs }
  const template = messages[status]

  const email = o.email
  const phone = o.phone
  if (!email && !phone) return

  let negativeButActuallyLive = false
  let resolvedLiveStatus: string | null = null
  if (NEGATIVE_RACE_STATUSES.includes(status) && hooks.spuriousNegative) {
    const live = await hooks.spuriousNegative(db, companyId, o).catch(() => null)
    if (live) { negativeButActuallyLive = true; resolvedLiveStatus = live }
  }
  const badgeStatus = negativeButActuallyLive ? (resolvedLiveStatus || 'processing') : status
  const dupeKey = { company_id: companyId, order_id: Number(o.externalId), status }

  // ── Contact: email, then normalised phone; create or backfill blanks ──────
  let contact: any = null
  if (email) {
    const { data } = await db.from('contacts').select('*').eq('company_id', companyId).ilike('email', email).limit(1)
    contact = data?.[0] || null
  }
  if (!contact && phone) {
    const norm = (p: string) => (p || '').replace(/\D/g, '').slice(-9)
    const target = norm(phone)
    const { data: candidates } = await db.from('contacts').select('*')
      .eq('company_id', companyId).ilike('phone', `%${target}`).limit(50)
    contact = (candidates || []).find((c: any) => norm(c.phone) === target) || null
  }
  const b = o.address || {}
  const billingName = `${o.firstName || ''} ${o.lastName || ''}`.trim()
  const addressLine = [b.address_1, b.address_2].filter(Boolean).join(', ') || null
  if (!contact) {
    const { data: created } = await db.from('contacts').insert({
      company_id: companyId, name: billingName || email, email: email || null, phone: phone || null,
      address: addressLine, city: b.city || null, state: b.state || null, postcode: b.postcode || null, country: b.country || null,
    }).select().maybeSingle()
    contact = created
  } else {
    const patch: any = {}
    if (billingName && (!contact.name || contact.name === contact.email)) patch.name = billingName
    if (phone && !contact.phone) patch.phone = phone
    if (addressLine && !contact.address) {
      patch.address = addressLine
      patch.city = b.city || contact.city || null
      patch.state = b.state || contact.state || null
      patch.postcode = b.postcode || contact.postcode || null
      patch.country = b.country || contact.country || null
    }
    if (Object.keys(patch).length) {
      await db.from('contacts').update(patch).eq('id', contact.id)
      Object.assign(contact, patch)
    }
  }
  if (contact?.id) {
    await linkContactIdentity(db, companyId, contact.id, { email, phone, channel: o.channel })
  }

  // ── Conversation: this order's thread, else the customer's latest ─────────
  let conv: any = null
  const orderSubject = `Order #${o.number}`
  const priorConvId = await hooks.priorConversationId(db, companyId, o).catch(() => null)
  if (priorConvId) {
    const { data: pc } = await db.from('conversations').select('*').eq('id', priorConvId).maybeSingle()
    conv = pc || null
  }
  if (!conv && o.chatConversationId) {
    const { data: cc } = await db.from('conversations').select('*').eq('id', o.chatConversationId).eq('company_id', companyId).maybeSingle()
    conv = cc || null
  }
  if (!conv && contact?.id) {
    const { data: byOrder } = await db.from('conversations').select('*')
      .eq('company_id', companyId).eq('subject', orderSubject).limit(1)
    conv = byOrder?.[0] || null
    if (!conv) {
      let groupIds: string[] = [contact.id]
      try {
        const linked = await linkedContacts(db, contact.id)
        if (linked.length) groupIds = Array.from(new Set([contact.id, ...linked.map((c: any) => c.id)]))
      } catch {}
      const { data } = await db.from('conversations').select('*').eq('company_id', companyId).in('contact_id', groupIds).order('last_message_at', { ascending: false }).limit(1)
      conv = data?.[0] || null
    }
  }
  const businessName = company?.name || 'us'
  const displayName = contact?.name || o.firstName || 'there'
  const firstName = (() => {
    const pick = String(o.firstName || contact?.name || '').trim()
    if (!pick || /@|^\+?[\d\s()-]+$/.test(pick)) return 'there'
    const first = pick.split(/\s+/)[0]
    return first.charAt(0).toUpperCase() + first.slice(1)
  })()
  const convSubject = contact?.name || billingName || orderSubject
  const isNewConv = !conv
  const convPhone = phone || contact?.phone || null
  if (!conv) {
    const { data: newConv } = await db.from('conversations').insert({
      company_id: companyId, channel: 'chat', subject: convSubject,
      contact_id: contact?.id || null, status: 'open', is_unread: true, unread_count: 1,
      last_message: '', last_message_at: new Date().toISOString(),
      order_status: badgeStatus || null,
      sms_number: convPhone,
      sms_enabled: !!convPhone,
    }).select().maybeSingle()
    conv = newConv
  } else if (contact?.id && !conv.contact_id) {
    await db.from('conversations').update({ contact_id: contact.id, subject: conv.subject?.startsWith('Order #') ? convSubject : conv.subject }).eq('id', conv.id)
    conv.contact_id = contact.id
  }
  if (conv && convPhone && !conv.sms_number) {
    try {
      await db.from('conversations').update({ sms_number: convPhone, sms_enabled: true }).eq('id', conv.id)
      conv.sms_number = convPhone
    } catch {}
  }
  if (!conv) return

  // A new order reopens a closed enquiry — only on the first event we see for it.
  if (!isNewConv && !priorConvId && ['closed', 'resolved'].includes(String(conv.status || ''))) {
    try {
      await logEnquiryReopened(db, { conversationId: conv.id, companyId, prevStatus: conv.status, actorName: contact?.name || billingName || null, via: 'order' })
      await db.from('conversations').update({ status: 'open' }).eq('id', conv.id)
      conv.status = 'open'
    } catch {}
  }

  // The inbox badge reads conversations.order_status.
  try { await db.from('conversations').update({ order_status: badgeStatus || null }).eq('id', conv.id) } catch {}
  // Credit the order to a link the customer clicked shortly before.
  try {
    const paid = ['processing', 'completed'].includes(String(badgeStatus || ''))
    await attributeOrderToLinks({
      companyId, contactId: contact?.id || null, orderId: o.externalId, orderNumber: o.number,
      total: o.total, currency: o.currency, stage: paid ? 'paid' : 'created', orderDate: o.createdAt,
    } as any)
  } catch {}

  // ── Once per (order, status): the thread line + team alert ────────────────
  const { data: seenEvent } = await db.from('order_chat_events').select('id').match(dupeKey).maybeSingle()
  if (!seenEvent) {
    const line = `Order #${o.number} — ${badgeStatus || 'received'} · ${money(o.total)}`
    const { data: priorOrderMsgs } = await db.from('messages').select('id, metadata').eq('conversation_id', conv.id)
    const priorOrderMsg = (priorOrderMsgs || []).find((m: any) => m.metadata?.order_event && String(m.metadata?.order_id) === String(o.externalId))
    if (priorOrderMsg) {
      await db.from('messages').update({ content: line, metadata: { ...(priorOrderMsg.metadata || {}), status: badgeStatus } }).eq('id', priorOrderMsg.id)
    } else {
      await db.from('messages').insert({
        conversation_id: conv.id, company_id: companyId, sender_type: 'system',
        content: line, metadata: { order_event: true, order_id: o.externalId, status: badgeStatus, channel: o.channel },
      })
    }
    const orderVerb = status === 'completed' ? 'Order completed' : 'New order'
    try { await notifyCompany({ db, companyId, type: 'order', message: `${orderVerb} #${o.number} from ${displayName} — ${money(o.total)}`, actorName: displayName, conversationId: conv.id }) } catch {}
    try {
      await pushInboundMessage({ companyId, conversationId: conv.id, title: `${orderVerb} #${o.number}`, body: `${displayName} — ${money(o.total)}`, route: `/conversation/${conv.id}` })
    } catch {}
    await db.from('order_chat_events').insert({ ...dupeKey, conversation_id: conv.id })
  }

  // ── The customer message ──────────────────────────────────────────────────
  const isNewOrderStatus = THANKYOU.includes(status)
  let shouldSend = !seenEvent && !!template && (cfg.enabled || isNewOrderStatus)
  if (shouldSend && o.isPos) shouldSend = false   // bought in person — no SMS
  // At most one message per bucket per contact per hour (paid SMS).
  if (shouldSend) {
    try {
      const bucket = THANKYOU.includes(status) ? THANKYOU : [status]
      const since = new Date(Date.now() - 60 * 60000).toISOString()
      let convIds: string[] = [conv.id]
      if (contact?.id) {
        const { data: cvs } = await db.from('conversations').select('id').eq('company_id', companyId).eq('contact_id', contact.id).limit(50)
        const ids = (cvs || []).map((c: any) => c.id)
        if (ids.length) convIds = Array.from(new Set([...ids, conv.id]))
      }
      const { data: recentAuto } = await db.from('messages').select('id')
        .in('conversation_id', convIds)
        .filter('metadata->>order_automation', 'in', `(${bucket.join(',')})`)
        .gte('created_at', since).limit(1)
      if (recentAuto && recentAuto.length) shouldSend = false
    } catch {}
  }
  if (shouldSend && negativeButActuallyLive) shouldSend = false
  // Never "your order was cancelled" while the customer holds another live order
  // (from any store — the operational orders table has them all).
  if (shouldSend && NEGATIVE_RACE_STATUSES.includes(status)) {
    try {
      const tail = String(phone || contact?.phone || '').replace(/\D/g, '').slice(-9)
      const mail = String(email || contact?.email || '').trim().toLowerCase()
      const since = new Date(Date.now() - 24 * 60 * 60000).toISOString()
      const or = [mail ? `customer_email.eq.${mail}` : '', tail.length >= 8 ? `customer_phone_norm.eq.${tail}` : ''].filter(Boolean).join(',')
      if (or) {
        const { data } = await db.from('orders').select('id, external_order_id')
          .eq('company_id', companyId).or(or).eq('payment_status', 'paid').neq('status', 'cancelled')
          .gte('order_date', since).neq('external_order_id', o.externalId).limit(1)
        if (data?.length) shouldSend = false
      }
    } catch {}
  }

  if (shouldSend) {
    const refundedAmount = o.refundedTotal ? money(Math.abs(o.refundedTotal)) : money(o.total)
    const body = template
      .replace(/\{business\}/g, businessName)
      .replace(/\{name\}/g, firstName)
      .replace(/\{full_name\}/g, billingName || displayName)
      .replace(/\{order\}/g, String(o.number))
      .replace(/\{amount\}/g, refundedAmount)
      .replace(/\{total\}/g, money(o.total))
    const { data: autoMsg } = await db.from('messages').insert({
      conversation_id: conv.id, company_id: companyId,
      sender_type: 'agent', sender_name: businessName, content: body,
      message_type: 'text', is_read: true,
      metadata: { auto: true, order_automation: status, order_id: o.externalId },
    }).select('id').maybeSingle()
    if (status === 'completed' && cfg.review_url && !(await findCustomerGoogleReview(db, companyId, contact?.id)).reviewed) {
      await db.from('messages').insert({
        conversation_id: conv.id, company_id: companyId, sender_type: 'agent', sender_name: businessName,
        content: `We'd love your feedback — leave us a Google review here: ${cfg.review_url}`,
        message_type: 'text', is_read: true, metadata: { auto: true, order_automation: 'review' },
      })
    }
    await db.from('conversations').update({ last_message: body, last_message_at: new Date().toISOString() }).eq('id', conv.id)
    try {
      const delivery = await deliverAutomatedMessage({
        companyId, conversationId: conv.id, text: body,
        phone: phone || contact?.phone || null, email,
        preferChannel: (!email || conv?.channel === 'sms') ? 'sms' : 'email',
        senderName: businessName, subject: `Update on your order #${o.number}`,
        origin: process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com',
        force: !!(cfg.also_sms || cfg.also_email), db,
      })
      if (autoMsg?.id && (delivery.channel === 'sms' || delivery.channel === 'email')) {
        try { await db.from('messages').update({ delivery_channel: delivery.channel }).eq('id', autoMsg.id) } catch {}
      }
    } catch (e) { console.error('[order automation] delivery failed', e) }
  }

  // ── Attribution: what Colvy can defend ────────────────────────────────────
  try {
    let attribution: string | null = null
    if (contact?.id) {
      const { data: cart } = await db.from('abandoned_carts')
        .select('id').eq('company_id', companyId).eq('status', 'recovered')
        .or(`email.ilike.${email || 'x@x'},phone.eq.${phone || 'x'}`).limit(1)
      if (cart?.length) attribution = 'cart_recovered'
    }
    if (!attribution && o.chatConversationId) attribution = 'chat_order'
    if (!attribution && conv?.id) {
      const { data: realMsgs } = await db.from('messages').select('id').eq('conversation_id', conv.id).in('sender_type', ['visitor', 'agent']).limit(1)
      if (realMsgs?.length) attribution = 'chat_assisted'
    }
    await hooks.persist(db, companyId, o, { conversationId: conv?.id || null, contactId: contact?.id || null, attribution, badgeStatus })
  } catch (e) { console.error('[order automation] attribution failed', e) }

  // ── Review request on completion (its own toggle; never for POS) ──────────
  if (status === 'completed' && !o.isPos) {
    try {
      const { data: co } = await db.from('companies').select('review_request_settings').eq('id', companyId).maybeSingle()
      const rr = co?.review_request_settings || {}
      if (rr.enabled) {
        const delayHours = Number(rr.delay_hours ?? 24)
        const key = orderKey(o)
        const { data: seen } = await db.from('review_requests').select('id').eq('company_id', companyId).eq('order_id', key).maybeSingle()
        if (!seen) {
          const { error: rrErr } = await db.from('review_requests').insert({
            company_id: companyId, conversation_id: conv.id, contact_id: contact?.id || null,
            order_id: key, send_after: new Date(Date.now() + delayHours * 3600 * 1000).toISOString(), status: 'pending',
          })
          if (rrErr && rrErr.code !== '23505') throw rrErr
        }
      }
    } catch (e) { console.error('[order automation] review request failed', e) }
  }
}
