// Automatic abandoned-cart message (server only). OFF by default.
//
// When a business turns it on (Settings → Order Automation), each shopper who
// leaves checkout gets ONE message a set time after their last cart activity:
// SMS first (or email), posted into their conversation so replies land in the
// inbox. Never sent when:
//   • the cart is recovered/dismissed, or they've since placed an order
//   • the customer is blocked or replied STOP
//   • it's outside 9am–8pm in the business's timezone (it waits, up to the
//     cart's 24-hour window)
//   • the cart was abandoned before the feature was switched on, or more than
//     24 hours ago (switching it on never messages old carts)

import { deliverAutomatedMessage } from '@/lib/channel-fallback'
import { isWithinSendingHours } from '@/lib/campaign-sender'
import { shortenUrl } from '@/lib/short-link'

import { resolveCartRecovery, cartItemsText, fillCartMessage } from '@/lib/cart-recovery-shared'
export { resolveCartRecovery, cartItemsText, fillCartMessage, CART_DELAYS, DEFAULT_CART_MESSAGE } from '@/lib/cart-recovery-shared'
export type { CartRecoverySettings } from '@/lib/cart-recovery-shared'

const MAX_AGE_MS = 24 * 3600 * 1000

const firstName = (n: any) => {
  const s = String(n || '').trim()
  if (!s || /@|^\+?[\d\s()-]+$/.test(s)) return 'there'
  const f = s.split(/\s+/)[0]
  return f.charAt(0).toUpperCase() + f.slice(1)
}

type Result = { companies: number; sent: number; skipped: number; failed: number; waiting: number; note?: string }

/** Send every due cart message. Called by /api/cron/cart-recovery. */
export async function runCartRecovery(db: any, opts: { origin: string; now?: Date }): Promise<Result> {
  const now = opts.now || new Date()
  const out: Result = { companies: 0, sent: 0, skipped: 0, failed: 0, waiting: 0 }

  const { data: cos, error: coErr } = await db.from('companies')
    .select('id, name, order_chat_automation')
    .eq('order_chat_automation->cart_recovery->>enabled', 'true')
    .limit(500)
  if (coErr) { out.note = coErr.message; return out }

  for (const co of cos || []) {
    const s = resolveCartRecovery(co.order_chat_automation?.cart_recovery)
    if (!s.enabled) continue
    out.companies++
    // Hold everything until the business's sending hours.
    if (!isWithinSendingHours(now, s.timezone)) { out.waiting++; continue }

    const dueBefore = new Date(now.getTime() - s.delay_minutes * 60000).toISOString()
    const floorMs = Math.max(now.getTime() - MAX_AGE_MS, s.enabled_at ? Date.parse(s.enabled_at) || 0 : 0)
    const { data: carts, error } = await db.from('abandoned_carts')
      .select('id, name, email, phone, items, total, currency, cart_url, conversation_id, created_at, updated_at')
      .eq('company_id', co.id).eq('status', 'abandoned').is('recovery_sent_at', null)
      .lte('updated_at', dueBefore).gte('updated_at', new Date(floorMs).toISOString())
      .order('updated_at', { ascending: true }).limit(100)
    if (error) { out.note = error.message.includes('recovery_sent_at') ? 'Run migrations/COLVY_V332_CART_RECOVERY.sql' : error.message; continue }

    for (const cart of carts || []) {
      // Claim it first, so overlapping runs can never message a cart twice.
      const { data: claimed } = await db.from('abandoned_carts')
        .update({ recovery_sent_at: now.toISOString(), recovery_channel: 'none' })
        .eq('id', cart.id).is('recovery_sent_at', null).eq('status', 'abandoned').select('id')
      if (!claimed?.length) continue
      const mark = (patch: any) => db.from('abandoned_carts').update(patch).eq('id', cart.id)

      try {
        if (!cart.conversation_id || (!cart.phone && !cart.email)) {
          await mark({ recovery_error: 'No conversation or contact details' }); out.skipped++; continue
        }

        // Already bought? (The order webhook usually marks the cart recovered,
        // but it can lag behind.)
        const mail = String(cart.email || '').trim().toLowerCase()
        const tail = String(cart.phone || '').replace(/\D/g, '').slice(-9)
        const since = cart.created_at
        let bought = false
        if (mail) {
          const { data } = await db.from('woocommerce_orders').select('woo_order_id').eq('company_id', co.id).eq('customer_email', mail).gte('order_date', since).limit(1)
          bought = !!data?.length
        }
        if (!bought && tail) {
          const { data } = await db.from('woocommerce_orders').select('woo_order_id').eq('company_id', co.id).eq('billing_phone_norm', tail).gte('order_date', since).limit(1)
          bought = !!data?.length
        }
        if (bought) { await mark({ recovery_error: 'Already ordered' }); out.skipped++; continue }

        // Blocked or replied STOP → never message them.
        const { data: conv } = await db.from('conversations').select('id, channel, contact_id').eq('id', cart.conversation_id).eq('company_id', co.id).maybeSingle()
        if (!conv) { await mark({ recovery_error: 'Conversation not found' }); out.skipped++; continue }
        let contact: any = null
        if (conv.contact_id) {
          const { data } = await db.from('contacts').select('name, phone, email, is_blocked, unsubscribed_at').eq('id', conv.contact_id).maybeSingle()
          contact = data
        }
        if (contact?.is_blocked || contact?.unsubscribed_at) { await mark({ recovery_error: 'Customer opted out' }); out.skipped++; continue }

        // Tracked link to their checkout, when the store sent one.
        let link = /^https?:\/\//i.test(String(cart.cart_url || '')) ? String(cart.cart_url) : ''
        if (link) {
          try {
            const short = await shortenUrl(link, { companyId: co.id, conversationId: conv.id, kind: 'cart' })
            if (short) link = short
          } catch {}
        }
        const business = co.name || 'us'
        const total = cart.total != null && !isNaN(Number(cart.total)) ? `$${Number(cart.total).toFixed(2)}` : ''
        const text = fillCartMessage(s.message, { name: firstName(cart.name || contact?.name), items: cartItemsText(cart.items), total, business, link })

        const { data: msg } = await db.from('messages').insert({
          conversation_id: conv.id, company_id: co.id, sender_type: 'agent', sender_name: business,
          content: text, message_type: 'text', is_read: true,
          metadata: { auto: true, cart_recovery: cart.id },
        }).select('id').maybeSingle()
        await db.from('conversations').update({ last_message: text, last_message_at: now.toISOString() }).eq('id', conv.id)

        const delivery = await deliverAutomatedMessage({
          companyId: co.id, conversationId: conv.id, text,
          phone: cart.phone || contact?.phone || null,
          email: cart.email || contact?.email || null,
          preferChannel: cart.phone || contact?.phone ? 'sms' : 'email',
          senderName: business, subject: `You left something in your cart at ${business}`,
          origin: opts.origin, db,
        })
        if (msg?.id && (delivery.channel === 'sms' || delivery.channel === 'email')) {
          try { await db.from('messages').update({ delivery_channel: delivery.channel }).eq('id', msg.id) } catch {}
        }
        await mark(delivery.sent ? { recovery_channel: delivery.channel, recovery_error: null } : { recovery_channel: 'none', recovery_error: delivery.error || 'Not delivered' })
        if (delivery.sent) out.sent++; else out.failed++
      } catch (e: any) {
        await mark({ recovery_error: String(e?.message || e).slice(0, 300) })
        out.failed++
      }
    }
  }
  return out
}
