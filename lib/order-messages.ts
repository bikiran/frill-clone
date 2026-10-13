// Order status messages sent to store customers (shared by the WooCommerce and
// Shopify automations and the Order automation settings page, so they all
// agree on what's sent).
//
// Placeholders: {name} first name, {full_name}, #{order}, {business},
// {amount} (refund), {total}.
//
// "Completed" means different things depending on how the order was fulfilled,
// so it has three messages: shipped (tracking already sent), shipped with no
// tracking sent yet, and picked up (click & collect). In-store POS sales never
// get a message.

export const DEFAULT_ORDER_MESSAGES: Record<string, string> = {
  processing: 'Hi {name},\n\nThank you for your recent order #{order}. We\'ve got it and will begin processing. You can reply to this message with any questions.\n\n- {business}',
  failed: 'Hi {name}, we noticed there was an issue with the payment on your order #{order}. Do you need any help?',
  cancelled: 'Hi {name}, your order #{order} was cancelled. Can we help you with anything?',
  refunded: 'Your order #{order} has been refunded. The refund of {amount} has been processed and should appear shortly.',
  completed: 'Hi {name}, your order #{order} has been dispatched. Thanks for choosing {business}!',
  completed_no_tracking: "Hi {name}, your order #{order} has been dispatched. We'll send tracking details soon. Thanks for choosing {business}!",
  completed_pickup: 'Hi {name}, thanks for collecting your order #{order}. We hope you love it!\n\n- {business}',
  'on-hold': 'Hi {name}, your order #{order} is on hold while we confirm a few details. We\'ll be in touch shortly — reply here anytime.',
}

// The earlier default templates (no {name} / #{order}). A saved config that
// still holds one of these was never really customised — it just captured the
// old default — so we treat it as unset and use the current default instead,
// so existing workspaces get the order number + name without re-saving.
const LEGACY_DEFAULTS = new Set<string>([
  'Thank you for placing an order with {business}. We have received it. If you have any questions, feel free to reply here.',
  'We noticed there was an issue with your recent order payment. Do you need any help?',
  'Your recent order was cancelled. Can we help you with anything?',
  'Your order has been refunded. The refund of {amount} has been processed and should appear shortly.',
  'Your order has been completed. Thank you for choosing {business}!',
  "Your order is on hold while we confirm a few details. We'll be in touch shortly — feel free to reply here.",
  // The previous one-line "thanks for your order" default.
  "Hi {name}, thanks for your order #{order} with {business} — we've received it and will begin processing. Reply here anytime with any questions.",
  // The single "is complete" message, from before Completed was split by how
  // the order was fulfilled (customers read "complete" as "delivered").
  'Hi {name}, your order #{order} is complete. Thank you for choosing {business}!',
].map(s => normaliseTemplate(s)))

// Compare templates loosely: the business name typed out counts as {business},
// a sign-off line that's just the business name ("Roxy Aquarium" or
// "- Roxy Aquarium") is ignored, and spacing doesn't matter. A saved message
// that is an old default plus a sign-off was never really customised, so it
// still gets the current, personalised default.
export function normaliseTemplate(t: string, businessName?: string): string {
  let s = String(t || '')
  if (businessName && businessName.trim().length > 1) s = s.split(businessName.trim()).join('{business}')
  s = s.replace(/\n\s*[-–—]?\s*\{business\}\.?\s*$/i, '')
  return s.replace(/\s+/g, ' ').trim()
}

/** A saved message that is really just an old default (maybe with a sign-off). */
export function isStaleOrderMessage(saved: string, businessName?: string | null): boolean {
  return LEGACY_DEFAULTS.has(normaliseTemplate(saved, businessName || undefined))
}

export type CompletedKey = 'completed' | 'completed_no_tracking' | 'completed_pickup'

/** A shipping method that means the customer collects the order themselves. */
export function isPickupMethod(method: string | null | undefined, methodId?: string | null): boolean {
  return /pickup|collect/i.test(String(method || '')) || /pickup/i.test(String(methodId || ''))
}

/** Which Completed message fits how the order was fulfilled. */
export function completedKey(o: { pickup: boolean; trackingSent: boolean }): CompletedKey {
  if (o.pickup) return 'completed_pickup'
  return o.trackingSent ? 'completed' : 'completed_no_tracking'
}

/**
 * Saved messages, with the newer Completed variants following an older saved
 * "Completed" where that's what the business meant: their own wording keeps
 * going to shipped orders without tracking (as it did before the split), and a
 * Completed message switched off (blank) keeps every Completed message off.
 * Pass the saved map with stale defaults already dropped.
 */
export function withCompletedFallbacks(saved: Record<string, string>): Record<string, string> {
  const out = { ...saved }
  if (typeof saved.completed === 'string') {
    if (out.completed_no_tracking === undefined) out.completed_no_tracking = saved.completed
    if (out.completed_pickup === undefined && !saved.completed.trim()) out.completed_pickup = ''
  }
  return out
}

/**
 * Has the customer already been sent tracking for this order? True when staff
 * sent it from the order (a "tracking sent" event), or a tracking message went
 * into one of the customer's conversations since the order was placed.
 */
export async function trackingAlreadySent(db: any, companyId: string, o: { channel: string; externalId: string; createdAt?: string | null; conversationIds: string[] }): Promise<boolean> {
  const since = o.createdAt && !Number.isNaN(Date.parse(o.createdAt))
    ? new Date(o.createdAt).toISOString()
    : new Date(Date.now() - 60 * 86400000).toISOString()
  const fromOrder = (async () => {
    const { data: row } = await db.from('orders').select('id')
      .eq('company_id', companyId).eq('sales_channel', o.channel).eq('external_order_id', String(o.externalId)).maybeSingle()
    if (!row?.id) return false
    const { data } = await db.from('order_events').select('id').eq('order_id', row.id).eq('type', 'tracking_sent').limit(1)
    return !!data?.length
  })().catch(() => false)
  const fromChat = (async () => {
    const ids = o.conversationIds.filter(Boolean)
    if (!ids.length) return false
    const { data } = await db.from('messages').select('id')
      .in('conversation_id', ids).eq('metadata->>tracking', 'true').gte('created_at', since).limit(1)
    return !!data?.length
  })().catch(() => false)
  const [a, b] = await Promise.all([fromOrder, fromChat])
  return a || b
}
