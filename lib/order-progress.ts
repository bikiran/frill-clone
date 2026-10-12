// Where each item of an order is, line by line (server only): packed, sent,
// which shipment it's in when the order was split, and whether the outlet
// handling the order has marked it out of stock. Used by the agents so a
// customer asking "where's my order?" hears "the tank went out Tuesday, the
// Lemon Oscar is waiting on stock at Somerton" instead of a bare status.
//
// Reads the same tables the order drawer writes (OrderItemsPanel):
//   order_items         the lines (keyed with buildOrderLineKeys, like the drawer)
//   order_fulfillments  picked / sent / ship_group per line key
//   order_stock_alerts  pending out-of-stock flags per line key, with the outlet

import { buildOrderLineKeys } from '@/lib/orders'

export type ItemState = 'waiting_on_stock' | 'sent' | 'packed' | 'not_packed_yet'
export type ProgressItem = { name: string; sku: string | null; qty: number; state: ItemState; shipment: number; sentOn: string | null; outOfStockSince: string | null }
export type OrderProgress = {
  outlet: string | null                 // the outlet handling the order, e.g. "Somerton"
  items: ProgressItem[]
  split: boolean                        // sent in more than one shipment
  shipments: { number: number; items: string[]; state: 'sent' | 'partly_sent' | 'packed' | 'not_packed_yet' | 'waiting_on_stock'; sentOn: string | null }[]
  waitingOnStock: { name: string; qty: number; outlet: string | null; since: string | null }[]
  summary: string                       // one plain sentence for a prompt
}

const day = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10) : null)
const outletName = (l: any) => (l ? [l.label, l.suburb].filter(Boolean).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i).join(', ') || null : null)

export async function orderProgress(db: any, companyId: string, order: { id: string; store_location_id?: string | null }): Promise<OrderProgress | null> {
  if (!order?.id) return null
  const [itemsRes, fulRes, oosRes] = await Promise.all([
    db.from('order_items').select('*').eq('order_id', order.id).limit(100),
    db.from('order_fulfillments').select('line_key, sent, sent_at, ship_group, picked, picked_at').eq('order_id', order.id),
    db.from('order_stock_alerts').select('line_key, product_name, sku, quantity, store_location_id, created_at, updated_at').eq('company_id', companyId).eq('order_id', order.id).eq('status', 'pending'),
  ].map((p: any) => Promise.resolve(p).catch(() => ({ data: null }))))
  const items: any[] = itemsRes?.data || []
  const alerts: any[] = oosRes?.data || []
  if (!items.length && !alerts.length) return null

  // Outlet names: the order's own outlet, plus any a flag was raised at.
  const locIds = Array.from(new Set([order.store_location_id, ...alerts.map(a => a.store_location_id)].filter(Boolean))) as string[]
  const locs = new Map<string, any>()
  if (locIds.length) {
    try {
      const { data } = await db.from('company_locations').select('id, label, suburb').eq('company_id', companyId).in('id', locIds)
      for (const l of data || []) locs.set(l.id, l)
    } catch {}
  }
  const outlet = order.store_location_id ? outletName(locs.get(order.store_location_id)) : null

  const ful = new Map<string, any>((fulRes?.data || []).map((r: any) => [r.line_key, r]))
  const oos = new Map<string, any>(alerts.map(a => [a.line_key, a]))
  const keys = buildOrderLineKeys(items)

  // The outlet a flag belongs to: the order's current outlet (it may have been
  // reassigned since), else the one saved on the flag — as the out-of-stock list does.
  const flagOutlet = (a: any) => outletName(locs.get(order.store_location_id || '')) || outletName(locs.get(a?.store_location_id || ''))
  const waitingOnStock: OrderProgress['waitingOnStock'] = []
  const out: ProgressItem[] = items.map(it => {
    const k = keys.get(it.id) || `id:${it.id}`
    const f = ful.get(k), a = oos.get(k)
    const state: ItemState = a ? 'waiting_on_stock' : f?.sent ? 'sent' : f?.picked ? 'packed' : 'not_packed_yet'
    const name = it.product_name || it.name || 'Item'
    const qty = Number(it.quantity) || 1
    if (a) waitingOnStock.push({ name, qty, outlet: flagOutlet(a), since: day(a.created_at || a.updated_at) })
    return { name, sku: it.sku || null, qty, state, shipment: Number(f?.ship_group) || 1, sentOn: f?.sent ? day(f.sent_at) : null, outOfStockSince: a ? day(a.created_at || a.updated_at) : null }
  })
  // A flag on a line we can't match any more (items re-synced) still counts.
  const matched = new Set(items.map(it => keys.get(it.id) || `id:${it.id}`))
  for (const a of alerts) if (!matched.has(a.line_key)) waitingOnStock.push({ name: a.product_name || 'An item', qty: Number(a.quantity) || 1, outlet: flagOutlet(a), since: day(a.created_at || a.updated_at) })

  const groups = Array.from(new Set(out.map(i => i.shipment))).sort((a, b) => a - b)
  const shipments = groups.map(g => {
    const its = out.filter(i => i.shipment === g)
    const sent = its.filter(i => i.state === 'sent')
    const state: OrderProgress['shipments'][number]['state'] = sent.length === its.length ? 'sent'
      : sent.length ? 'partly_sent'
      : its.some(i => i.state === 'waiting_on_stock') ? 'waiting_on_stock'
      : its.every(i => i.state === 'packed') ? 'packed' : 'not_packed_yet'
    const sentOn = sent.map(i => i.sentOn).filter(Boolean).sort().pop() || null
    return { number: g, items: its.map(i => `${i.qty > 1 ? `${i.qty} × ` : ''}${i.name}`), state, sentOn }
  })

  return { outlet, items: out, split: groups.length > 1, shipments, waitingOnStock, summary: summarise(out, waitingOnStock, groups.length > 1, outlet) }
}

function summarise(items: ProgressItem[], waiting: OrderProgress['waitingOnStock'], split: boolean, outlet: string | null): string {
  const n = items.length
  const sent = items.filter(i => i.state === 'sent').length
  const packed = items.filter(i => i.state === 'packed').length
  const parts: string[] = []
  if (n) {
    if (sent === n) parts.push(n === 1 ? 'The item has been sent' : `All ${n} items have been sent`)
    else if (sent) parts.push(`${sent} of ${n} items sent${split ? ' (the order was split into separate shipments)' : ''}`)
    else if (packed === n) parts.push('Everything is packed and ready to go')
    else if (packed) parts.push(`${packed} of ${n} items packed`)
    else parts.push('Not packed yet')
  }
  for (const w of waiting) parts.push(`${w.qty > 1 ? `${w.qty} × ` : ''}${w.name} is out of stock${w.outlet ? ` at ${w.outlet}` : ''} and waiting on stock`)
  if (outlet && !waiting.length && sent < n) parts.push(`handled by ${outlet}`)
  return parts.join('; ') + (parts.length ? '.' : '')
}
