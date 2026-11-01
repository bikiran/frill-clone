// What the team's phones say about a WooCommerce order, so the two kinds read
// differently at a glance:
//   • an in-store sale (Prexty pushes each one into WooCommerce, tagged
//     _prexty_source = pos): "In-store sale R50270 at Roxy Aquarium Somerton",
//     and only that one alert;
//   • a website order: "Online order", with the WooCommerce logo as the
//     notification's picture on Android.

import { posSaleInfo } from '@/lib/prexty-pos'

/** Colvy's own site (https), for pictures a phone downloads. */
function siteBase(): string {
  const s = String(process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '')
  return /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(s) ? s : 'https://colvy.com'
}

/** The WooCommerce logo for an online order's notification (public/push/woocommerce.png, 192px). */
export const wooPushIcon = () => `${siteBase()}/push/woocommerce.png`

/**
 * Was this WooCommerce order an in-store sale? Reads a webhook order (its
 * meta_data) or a woocommerce_orders row (pos_source, V407).
 */
export function wooPos(o: any): { isPos: boolean; saleId: string; outlet: string } {
  if (o?.pos_source === 'prexty') return { isPos: true, saleId: String(o.pos_sale_id || '').trim(), outlet: String(o.pos_outlet || '').trim() }
  return posSaleInfo(o)
}

/** "In-store sale R50270 at Roxy Aquarium Somerton" (the shop when known, else Prexty's outlet name). */
export function inStoreLabel(pos: { saleId?: string; outlet?: string }, shop?: string | null): string {
  const at = String(shop || pos.outlet || '').trim()
  return `In-store sale${pos.saleId ? ` ${pos.saleId}` : ''}${at ? ` at ${at}` : ''}`
}

/**
 * Claim the one alert for a new WooCommerce order. Three paths can see a new
 * order first and each used to alert: the store's webhook (WooCommerce often
 * delivers it a minute late), the scheduled sync that polls the store every
 * few minutes, and the Orders board's sync when someone opens it (web or app).
 * The first to record (company, order, 'announced') in order_chat_events,
 * whose unique index (V134) settles a race, sends the alert; the rest stay
 * quiet. True means "you announce it". On an unexpected error it says true:
 * an order announced twice is better than one never announced.
 */
export async function claimOrderAnnouncement(db: any, companyId: string, wooOrderId: unknown): Promise<boolean> {
  const id = Number(wooOrderId)
  if (!companyId || !Number.isSafeInteger(id) || id <= 0) return true
  try {
    const { data: had } = await db.from('order_chat_events').select('id')
      .eq('company_id', companyId).eq('order_id', id).eq('status', 'announced').limit(1)
    if (had?.length) return false
    const { error } = await db.from('order_chat_events').insert({ company_id: companyId, order_id: id, status: 'announced' })
    return !(error && (error.code === '23505' || /duplicate key/i.test(String(error.message || ''))))
  } catch {
    return true
  }
}
