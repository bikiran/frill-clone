// Order status messages sent to WooCommerce customers (shared by the webhook
// and the Order automation settings page, so both agree on what's sent).
//
// Placeholders: {name} first name, {full_name}, #{order}, {business},
// {amount} (refund), {total}.

export const DEFAULT_ORDER_MESSAGES: Record<string, string> = {
  processing: 'Hi {name},\n\nThank you for your recent order #{order}. We\'ve got it and will begin processing. You can reply to this message with any questions.\n\n- {business}',
  failed: 'Hi {name}, we noticed there was an issue with the payment on your order #{order}. Do you need any help?',
  cancelled: 'Hi {name}, your order #{order} was cancelled. Can we help you with anything?',
  refunded: 'Your order #{order} has been refunded. The refund of {amount} has been processed and should appear shortly.',
  completed: 'Hi {name}, your order #{order} is complete. Thank you for choosing {business}!',
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
