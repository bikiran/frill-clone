// Abandoned-cart message settings and template helpers, shared by the
// sender (lib/cart-recovery.ts) and the Order Automation settings page.

export const CART_DELAYS = [30, 60, 120, 240, 720] as const
export const DEFAULT_CART_MESSAGE = 'Hi {name}, you left {items} in your cart at {business}. Any questions? Just reply here. {link}\nReply STOP to opt out.'

export type CartRecoverySettings = {
  enabled: boolean
  delay_minutes: number
  message: string
  timezone: string
  enabled_at: string | null
}

export function resolveCartRecovery(raw: any): CartRecoverySettings {
  const r = raw && typeof raw === 'object' ? raw : {}
  const delay = Number(r.delay_minutes)
  return {
    enabled: r.enabled === true,
    delay_minutes: (CART_DELAYS as readonly number[]).includes(delay) ? delay : 60,
    message: typeof r.message === 'string' && r.message.trim() ? r.message : DEFAULT_CART_MESSAGE,
    timezone: typeof r.timezone === 'string' && r.timezone ? r.timezone : 'Australia/Melbourne',
    enabled_at: typeof r.enabled_at === 'string' ? r.enabled_at : null,
  }
}

/** "Lemon Oscar - Medium" / "Lemon Oscar and 2 more items". */
export function cartItemsText(items: any): string {
  const list = (Array.isArray(items) ? items : []).map((i: any) => String(i?.name || i?.product_name || '').trim()).filter(Boolean)
  if (!list.length) return 'a few items'
  if (list.length === 1) return list[0]
  return `${list[0]} and ${list.length - 1} more item${list.length - 1 === 1 ? '' : 's'}`
}

export function fillCartMessage(t: string, v: { name: string; items: string; total: string; business: string; link: string }) {
  return t
    .replace(/\{name\}/g, v.name)
    .replace(/\{items\}/g, v.items)
    .replace(/\{total\}/g, v.total)
    .replace(/\{business\}/g, v.business)
    .replace(/\{link\}/g, v.link)
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +\n/g, '\n')
    .trim()
}
