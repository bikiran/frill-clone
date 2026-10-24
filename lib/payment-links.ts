// Payment links sent in a conversation, server only.
//
//   linkPaymentMessages()  An SMS / email / Messenger payment link is put into
//     the team member's reply to check and send (app/api/stripe/chat-payment,
//     draft), so the message that goes out is ordinary text. Once it's sent,
//     this finds that message (it contains the link: /l/<code> or /pay/<id>)
//     and makes it the payment's card again: amount, what it's for, and a
//     status that turns to PAID when the money arrives.
//   reconcilePayments()    Asks Stripe about pending payments and confirms the
//     paid ones (lib/chat-payment-confirm: card → PAID, "Payment received" in
//     the thread, the customer told on their channel, the team notified). The
//     webhook normally does this; this catches the ones it missed — the
//     thank-you page, the open conversation and a 10-minute job all call it.

import Stripe from 'stripe'
import { confirmChatPayment } from '@/lib/chat-payment-confirm'
import { captureFromPayLink } from '@/lib/paylink-capture'
import { stripeSecretFor } from '@/lib/company-secrets'

const DAY = 86_400_000

/** The parts of a payment's links that survive in a sent message, whatever the host. */
export function linkKeys(pay: { id: string; checkout_url?: string | null }): string[] {
  const keys = [`/pay/${pay.id}`]
  const code = (String(pay.checkout_url || '').match(/\/l\/([A-Za-z0-9_-]+)/) || [])[1]
  if (code) keys.push(`/l/${code}`)
  return keys
}

/** Does this text carry that link? (/l/abc must not match /l/abcd.) */
export function textHasLink(text: string, keys: string[]): boolean {
  const t = String(text || '')
  return keys.some(k => {
    const i = t.indexOf(k)
    return i >= 0 && !/[A-Za-z0-9_-]/.test(t.charAt(i + k.length))
  })
}

export function paymentPayload(pay: any, extra: Record<string, any> = {}) {
  return {
    amount_cents: pay.amount_cents, currency: pay.currency || 'aud', description: pay.description || null,
    checkout_url: pay.checkout_url || null, status: pay.status === 'paid' ? 'paid' : pay.status === 'refunded' ? 'refunded' : 'pending',
    payment_id: pay.id,
    ...(pay.paid_at ? { paid_at: pay.paid_at } : {}),
    ...(pay.card_brand ? { card_brand: pay.card_brand } : {}),
    ...(pay.card_last4 ? { card_last4: pay.card_last4 } : {}),
    ...(pay.receipt_url ? { receipt_url: pay.receipt_url } : {}),
    ...extra,
  }
}

/**
 * Attach sent messages to the payments whose links they carry. Only payments
 * with no message yet; only the team's own messages, sent after the payment
 * was made, in the same conversation. Returns how many were linked. Never throws.
 */
export async function linkPaymentMessages(db: any, f: { conversationId?: string; paymentIds?: string[]; sinceDays?: number }): Promise<number> {
  try {
    let q = db.from('chat_payments').select('*').is('message_id', null).not('conversation_id', 'is', null)
    if (f.paymentIds?.length) q = q.in('id', f.paymentIds)
    else if (f.conversationId) q = q.eq('conversation_id', f.conversationId)
    else q = q.gte('created_at', new Date(Date.now() - (f.sinceDays || 14) * DAY).toISOString())
    const { data: pays } = await q.order('created_at', { ascending: false }).limit(100)
    let linked = 0
    for (const pay of pays || []) {
      const keys = linkKeys(pay)
      const { data: msgs } = await db.from('messages').select('id, content, message_type, metadata')
        .eq('conversation_id', pay.conversation_id).eq('sender_type', 'agent')
        .gte('created_at', pay.created_at).order('created_at', { ascending: true }).limit(60)
      const msg = (msgs || []).find((m: any) => (!m.message_type || m.message_type === 'text') && textHasLink(m.content, keys))
      if (!msg) continue
      const { error } = await db.from('messages').update({ message_type: 'payment', message_payload: paymentPayload(pay) }).eq('id', msg.id)
      if (error) continue
      await db.from('chat_payments').update({ message_id: msg.id }).eq('id', pay.id).is('message_id', null)
      linked++
    }
    return linked
  } catch (e: any) {
    console.warn('[payment-links] link', e?.message || e)
    return 0
  }
}

/**
 * Check pending payments with Stripe and confirm the paid ones. A payment
 * that went through more than two days ago is still confirmed in Colvy, but
 * the customer isn't sent a "received" message that late.
 */
export async function reconcilePayments(db: any, pending: any[]): Promise<{ checked: number; updated: number; results: any[] }> {
  let updated = 0
  const results: any[] = []
  for (const pay of pending) {
    try {
      const { data: company } = await db.from('companies').select('*').eq('id', pay.company_id).maybeSingle()
      const ownKey = await stripeSecretFor(company)
      const key = ownKey || process.env.STRIPE_SECRET_KEY
      if (!key) { results.push({ id: pay.id, error: 'No Stripe key' }); continue }
      const s = new Stripe(String(key).trim(), { apiVersion: '2024-06-20' as any })
      const opts: any = ownKey ? undefined : (company?.stripe_account_id ? { stripeAccount: company.stripe_account_id } : undefined)
      const sessionId = pay.stripe_session_id || pay.session_id
      if (!sessionId) { results.push({ id: pay.id, error: 'No Stripe session id stored' }); continue }

      const session: any = await s.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.latest_charge'] } as any, opts)
      const isPaid = session?.payment_status === 'paid' || session?.status === 'complete'
      if (!isPaid) { results.push({ id: pay.id, status: session?.payment_status || 'unpaid' }); continue }

      const charge = session?.payment_intent?.latest_charge || null
      const card = charge?.payment_method_details?.card || null
      const paidAt = Number(charge?.created || session?.payment_intent?.created || session?.created || 0) * 1000
      const res = await confirmChatPayment(db, {
        id: pay.id, company_id: pay.company_id, conversation_id: pay.conversation_id,
        message_id: pay.message_id, amount_cents: pay.amount_cents,
      }, {
        receiptUrl: charge?.receipt_url || session?.receipt_url || null,
        paymentIntent: (typeof session?.payment_intent === 'string' ? session.payment_intent : session?.payment_intent?.id) || null,
        cardBrand: card?.brand || null, cardLast4: card?.last4 || null,
        notifyCustomer: !paidAt || Date.now() - paidAt < 2 * DAY,
      })
      if (res.confirmed) {
        updated++
        if (session?.metadata?.kind === 'chat_payment') {
          try { await captureFromPayLink(db, { companyId: pay.company_id, sessionId, paymentId: pay.id }) } catch {}
        }
      }
      results.push({ id: pay.id, status: res.confirmed ? 'paid' : 'already-confirmed' })
    } catch (e: any) {
      results.push({ id: pay.id, error: e?.message || 'failed' })
    }
  }
  return { checked: pending.length, updated, results }
}
