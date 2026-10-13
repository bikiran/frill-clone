// An order's refunds, one shape for WooCommerce and Shopify, so the order
// drawer can show what was refunded: which items (and how many of each),
// shipping, and any amount that wasn't tied to items (a goodwill / partial
// refund). Also used by the refund modal to stop an item being refunded twice.

export type RefundLine = { lineId: string; name: string; qty: number; amount: number }
export type OrderRefund = {
  id: string
  at: string | null
  amount: number        // the whole refund, incl. tax
  reason: string
  items: RefundLine[]
  shipping: number
  other: number         // part of the amount not tied to an item or shipping
}

const num = (v: any) => Math.abs(parseFloat(v) || 0)
const round2 = (n: number) => Math.round(n * 100) / 100
// Whatever's left of the amount after items and shipping (a flat partial refund,
// or a refund made in the store with no items picked).
const otherOf = (amount: number, items: RefundLine[], shipping: number) => {
  const rest = round2(amount - items.reduce((s, i) => s + i.amount, 0) - shipping)
  return rest > 0.009 ? rest : 0
}

/** WooCommerce GET /orders/{id}/refunds → OrderRefund[] (newest first). */
export function wooRefunds(list: any[]): OrderRefund[] {
  return (Array.isArray(list) ? list : []).map((r: any) => {
    const items: RefundLine[] = (r.line_items || []).map((li: any) => {
      const meta = (li.meta_data || []).find((m: any) => m?.key === '_refunded_item_id')
      return {
        lineId: String(meta?.value ?? ''),
        name: li.name || 'Item',
        qty: Math.abs(Number(li.quantity) || 0),
        amount: round2(num(li.total) + num(li.total_tax)),
      }
    }).filter((l: RefundLine) => l.qty > 0 || l.amount > 0)
    const shipping = round2((r.shipping_lines || []).reduce((s: number, l: any) => s + num(l.total) + num(l.total_tax), 0))
    const amount = round2(num(r.amount ?? r.total))
    return { id: String(r.id), at: r.date_created_gmt ? `${r.date_created_gmt}Z` : r.date_created || null, amount, reason: r.reason || '', items, shipping, other: otherOf(amount, items, shipping) }
  }).sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
}

const money = (set: any): number => num(set?.shopMoney?.amount)
const legacy = (gid: any): string => String(gid ?? '').match(/(\d+)$/)?.[1] || ''

/** Shopify Order.refunds (GraphQL) → OrderRefund[] (newest first). */
export function shopifyRefunds(list: any[]): OrderRefund[] {
  return (Array.isArray(list) ? list : []).map((r: any) => {
    const items: RefundLine[] = (r.refundLineItems?.nodes || []).map((li: any) => ({
      lineId: legacy(li.lineItem?.id),
      name: li.lineItem?.name || 'Item',
      qty: Math.abs(Number(li.quantity) || 0),
      amount: round2(money(li.subtotalSet) + money(li.totalTaxSet)),
    })).filter((l: RefundLine) => l.qty > 0 || l.amount > 0)
    const shipping = round2((r.refundShippingLines?.nodes || []).reduce((s: number, l: any) => s + money(l.subtotalAmountSet) + money(l.taxAmountSet), 0))
    const amount = round2(money(r.totalRefundedSet))
    return { id: legacy(r.id), at: r.createdAt || null, amount, reason: r.note || '', items, shipping, other: otherOf(amount, items, shipping) }
  }).filter(r => r.amount > 0 || r.items.length)
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
}

const SHOPIFY_REFUNDS = (withShipping: boolean) => `query Refunds($id: ID!) { order(id: $id) { id refunds(first: 50) {
  id createdAt note totalRefundedSet { shopMoney { amount } }
  refundLineItems(first: 100) { nodes { quantity lineItem { id name } subtotalSet { shopMoney { amount } } totalTaxSet { shopMoney { amount } } } }
  ${withShipping ? 'refundShippingLines(first: 10) { nodes { subtotalAmountSet { shopMoney { amount } } taxAmountSet { shopMoney { amount } } } }' : ''}
} } }`

/** Read a Shopify order's refunds. Older API versions lack refund shipping lines — retried without. */
export async function loadShopifyRefunds(svc: { gql: <T = any>(q: string, v?: any) => Promise<{ data?: T; errors?: any[] }> }, externalId: string): Promise<OrderRefund[]> {
  const id = `gid://shopify/Order/${externalId}`
  let { data, errors } = await svc.gql<any>(SHOPIFY_REFUNDS(true), { id })
  if (errors?.length && !data?.order) ({ data, errors } = await svc.gql<any>(SHOPIFY_REFUNDS(false), { id }))
  if (errors?.length && !data?.order) throw new Error(errors.map((e: any) => e?.message || String(e)).join('; '))
  return shopifyRefunds(data?.order?.refunds || [])
}

/** Refunded quantity and amount per store line id, across every refund. */
export function refundedByLine(refunds: OrderRefund[] | null | undefined): Map<string, { qty: number; amount: number }> {
  const m = new Map<string, { qty: number; amount: number }>()
  for (const r of refunds || []) for (const l of r.items) {
    if (!l.lineId) continue
    const cur = m.get(l.lineId) || { qty: 0, amount: 0 }
    m.set(l.lineId, { qty: cur.qty + l.qty, amount: round2(cur.amount + l.amount) })
  }
  return m
}

/** The store line id an `order_items` row came from (WooCommerce or Shopify). */
export const storeLineId = (it: any): string => String(it?.metadata?.woo_line_id ?? it?.metadata?.shopify_line_id ?? '')
