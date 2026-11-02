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
 * whose unique index (V134, made sure of in V424) settles a race, sends the
 * alert; the rest stay quiet. True means "you announce it". On an unexpected
 * error it says true: an order announced twice is better than one never
 * announced.
 *
 * An in-store sale also claims its Prexty receipt: Prexty sometimes pushes one
 * sale into WooCommerce twice (two orders, same receipt and total), and that's
 * still one sale to the team.
 */
export async function claimOrderAnnouncement(db: any, companyId: string, wooOrderId: unknown, posSaleId?: string | null): Promise<boolean> {
  const id = Number(wooOrderId)
  if (!companyId || !Number.isSafeInteger(id) || id <= 0) return true
  if (!(await claimEvent(db, companyId, id, 'announced'))) return false
  const sale = String(posSaleId || '').trim().slice(0, 80)
  return sale ? claimEvent(db, companyId, 0, `announced_pos:${sale}`) : true
}

/**
 * Record (company, order, status) in order_chat_events once. True for the one
 * caller that recorded it; false when it was there already or another caller
 * won the race (unique index). Order 0 holds per-receipt keys.
 */
export async function claimEvent(db: any, companyId: string, orderId: number, status: string, extra?: Record<string, unknown>): Promise<boolean> {
  try {
    const { data: had } = await db.from('order_chat_events').select('id')
      .eq('company_id', companyId).eq('order_id', orderId).eq('status', status).limit(1)
    if (had?.length) return false
    const { error } = await db.from('order_chat_events').insert({ company_id: companyId, order_id: orderId, status, ...(extra || {}) })
    return !(error && (error.code === '23505' || /duplicate key/i.test(String(error.message || ''))))
  } catch {
    return true
  }
}

/**
 * What, if anything, the team is told about a WooCommerce order event (the
 * bell row and the phones' alert together). The first sighting of an order
 * says what it is ("In-store sale R50270 at … ·", "Online order", "Order
 * completed"); after that only a real change does ("Order completed",
 * "Order refunded"…), never "Online order" again for pending → processing.
 * `status` should be the badge status (never a spurious negative).
 */
export function orderAlertVerb(o: { firstAlert: boolean; hadOrderLine: boolean; status: string; isPos: boolean; inStore?: string }): string | null {
  if (o.firstAlert) return o.isPos ? `${o.inStore || 'In-store sale'} ·` : o.status === 'completed' ? 'Order completed' : 'Online order'
  if (!o.hadOrderLine) return null
  const later: Record<string, string> = o.isPos
    ? { refunded: 'In-store sale refunded', cancelled: 'In-store sale cancelled', failed: 'In-store sale failed' }
    : { completed: 'Order completed', refunded: 'Order refunded', cancelled: 'Order cancelled', failed: 'Payment failed' }
  return later[o.status] || null
}
