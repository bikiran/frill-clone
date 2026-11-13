// "Notify customer", unticked.
//
// When a team member changes an order (complete, mark paid, cancel, refund)
// with "Notify customer" unticked, Colvy must not message the customer about
// it. Colvy's own customer message doesn't go out from the button: it goes out
// from the store's webhook that follows the change (lib/order-automation for
// Shopify, the WooCommerce webhook for Woo). So the change leaves a short-lived
// "quiet" marker that those webhooks check before messaging:
//
//   1. A row in order_chat_events with status "quiet:<status>", the same table
//      and unique index the per-(order, status) de-dupe uses, so no migration
//      is needed (V424 started the convention of extra keys in it).
//   2. For WooCommerce, order meta `_colvy_quiet` = "<status,status>@<unix>",
//      written in the same update. The webhook reads it from the order payload
//      (a second guard if the row can't be written), and the Colvy WordPress
//      plugin reads it to keep WooCommerce's own customer emails (Completed
//      order, Refunded order…) unsent for that change.
//
// Both expire: the row after a day, the meta after an hour. A later change made
// with the tick on releases the row straight away.

export const QUIET_META_KEY = '_colvy_quiet'
const QUIET_PREFIX = 'quiet:'
export const QUIET_ROW_MS = 24 * 60 * 60 * 1000
export const QUIET_META_MS = 60 * 60 * 1000

/** Ticked unless the request says otherwise: only an explicit false is quiet. */
export function wantsNotify(v: unknown): boolean {
  return !(v === false || v === 'false' || v === 0 || v === '0')
}

/**
 * The statuses a quiet change can produce. Completing an unpaid order can pass
 * through "processing" (Shopify sends orders/paid before orders/fulfilled), and
 * that would send the thank-you, so a quiet "completed" covers both.
 */
export function quietStatuses(status: string): string[] {
  const s = String(status || '').toLowerCase().trim()
  if (!s) return []
  return s === 'completed' ? ['completed', 'processing'] : [s]
}

/** The `_colvy_quiet` meta value: "completed,processing@1731456000". */
export function quietMetaValue(statuses: string[], now = Date.now()): string {
  return `${statuses.join(',')}@${Math.floor(now / 1000)}`
}

/** Does this order's meta (a WooCommerce meta_data array) say this status is quiet? */
export function quietByMeta(meta: unknown, status: string, now = Date.now()): boolean {
  if (!Array.isArray(meta)) return false
  const m = meta.find((x: any) => x && x.key === QUIET_META_KEY)
  const v = String(m?.value ?? '')
  const at = v.lastIndexOf('@')
  if (at < 1) return false
  const statuses = v.slice(0, at).split(',').map(s => s.trim().toLowerCase())
  const when = Number(v.slice(at + 1)) * 1000
  if (!Number.isFinite(when) || when <= 0) return false
  const age = now - when
  return age >= -5 * 60 * 1000 && age < QUIET_META_MS && statuses.includes(String(status || '').toLowerCase())
}

/** Hold the customer message for these statuses on this order (best-effort). */
export async function holdCustomerNotice(db: any, companyId: string, orderId: number, statuses: string[]): Promise<boolean> {
  if (!companyId || !Number.isFinite(orderId) || !statuses.length) return false
  let ok = true
  for (const s of statuses) {
    const key = QUIET_PREFIX + s
    try {
      // A hold left from an earlier quiet change is refreshed, not duplicated
      // (the unique index on company, order, status would refuse a second row).
      await db.from('order_chat_events').delete().eq('company_id', companyId).eq('order_id', orderId).eq('status', key)
      const { error } = await db.from('order_chat_events').insert({ company_id: companyId, order_id: orderId, status: key })
      if (error) ok = false
    } catch { ok = false }
  }
  return ok
}

/** Lift a hold: the change failed, or it was made again with the tick on. */
export async function releaseCustomerNotice(db: any, companyId: string, orderId: number, statuses: string[]): Promise<void> {
  if (!companyId || !Number.isFinite(orderId) || !statuses.length) return
  try {
    await db.from('order_chat_events').delete()
      .eq('company_id', companyId).eq('order_id', orderId)
      .in('status', statuses.map(s => QUIET_PREFIX + s))
  } catch {}
}

/**
 * Is the customer message for this order + status held? Checked by the store
 * webhooks before they message the customer or schedule a review request.
 * A failed lookup doesn't hold anything (the meta check still applies).
 */
export async function customerNoticeHeld(db: any, companyId: string, orderId: number, status: string, meta?: unknown): Promise<boolean> {
  if (quietByMeta(meta, status)) return true
  if (!companyId || !Number.isFinite(orderId) || !status) return false
  try {
    const { data } = await db.from('order_chat_events').select('id, created_at')
      .eq('company_id', companyId).eq('order_id', orderId).eq('status', QUIET_PREFIX + String(status).toLowerCase()).limit(1)
    const row = (data || [])[0]
    if (!row) return false
    const at = Date.parse(row.created_at || '')
    return !Number.isFinite(at) || Date.now() - at < QUIET_ROW_MS
  } catch { return false }
}

/** "· customer not notified" for the team's own notes and timeline lines. */
export const QUIET_NOTE = 'Customer not notified.'
