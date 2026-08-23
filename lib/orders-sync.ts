import { mapWooStatus, mapWooPayment, wooDateToISO } from '@/lib/orders'

// The shipping method name from a woocommerce_orders row or a raw Woo order.
function shippingMethodOf(o: any): string | null {
  const m = o.shipping_method || o.shipping_lines?.[0]?.method_title || null
  return m ? String(m).replace(/&amp;/g, '&').trim() : null
}
// Operational status: a pickup/collect method makes an otherwise-awaiting order
// Click & Collect (so it lands in that tab and is highlighted).
function statusOf(o: any): string {
  const mapped = mapWooStatus(o.status)
  return mapped === 'awaiting_shipment' && /pickup|collect/i.test(String(shippingMethodOf(o) || '')) ? 'click_and_collect' : mapped
}

// Match a Click & Collect order to the outlet it's collected from, by looking
// for the outlet's distinctive name/suburb inside the pickup shipping method
// (e.g. "Click & Collect - Somerton Store" → the Somerton location). Generic
// words are ignored so "Roxy Aquarium" alone never matches.
const OUTLET_STOPWORDS = new Set(['roxy', 'aquarium', 'store', 'shop', 'pickup', 'click', 'collect', 'local', 'the', 'and', 'shipping'])
export function matchOutletId(locations: { id: string; label?: string | null; suburb?: string | null }[], text: string | null | undefined): string | null {
  const h = String(text || '').toLowerCase()
  if (!h || !locations?.length) return null
  for (const l of locations) {
    const words = `${l.label || ''} ${l.suburb || ''}`.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !OUTLET_STOPWORDS.has(w))
    if (words.some(w => h.includes(w))) return l.id
  }
  return null
}
async function loadLocations(db: any, companyId: string): Promise<{ id: string; label?: string | null; suburb?: string | null }[]> {
  try { const { data } = await db.from('company_locations').select('id, label, suburb').eq('company_id', companyId); return data || [] } catch { return [] }
}

// PostgREST reports an unknown column as "Could not find the 'X' column ... in
// the schema cache". A schema that predates a newer optional column (e.g.
// primary_sku) would otherwise fail the whole insert — so strip the offending
// column and retry, a few times, instead of forcing another migration.
const missingCol = (err: any): string | null => {
  const m = String(err?.message || '').match(/Could not find the '([\w]+)' column/)
  return m ? m[1] : null
}
async function insertResilient(db: any, table: string, rows: any[], select?: string): Promise<any[]> {
  let cur = rows
  for (let attempt = 0; attempt < 5; attempt++) {
    const q = db.from(table).insert(cur)
    const { data, error } = select ? await q.select(select) : await q
    if (!error) return data || []
    const col = missingCol(error)
    if (!col) throw new Error(`${table} insert failed: ${error.message}`)
    cur = cur.map((r: any) => { const c = { ...r }; delete c[col]; return c })
  }
  throw new Error(`${table} insert failed: unresolved unknown columns`)
}
async function updateResilient(db: any, table: string, patch: any, id: string): Promise<void> {
  let cur = patch
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await db.from(table).update(cur).eq('id', id)
    if (!error) return
    const col = missingCol(error)
    if (!col) throw new Error(`${table} update failed: ${error.message}`)
    const c = { ...cur }; delete c[col]; cur = c
  }
}

// Maps a woocommerce_orders row into an operational `orders` row's source fields
// (everything except the staff-owned operational fields: status, assignee, tags,
// flagged). Channel-agnostic shape — WooCommerce is just the first source.
function sourceFields(companyId: string, o: any, contactId: string | null) {
  const b = o.billing || {}
  const email = (o.customer_email || b.email || '').toLowerCase()
  const name = `${b.first_name || ''} ${b.last_name || ''}`.trim() || o.customer_name || email || 'Customer'
  const items: any[] = Array.isArray(o.line_items) ? o.line_items : []
  const itemCount = items.reduce((s, li) => s + (Number(li.quantity) || 1), 0)
  const subtotal = items.reduce((s, li) => s + (parseFloat(li.total ?? li.subtotal ?? 0) || 0), 0)
  return {
    company_id: companyId,
    contact_id: contactId,
    conversation_id: o.conversation_id || null,
    source_order_id: o.id,
    external_order_id: String(o.woo_order_id),
    order_number: o.order_number ? String(o.order_number) : String(o.woo_order_id),
    sales_channel: 'woocommerce',
    payment_status: mapWooPayment(o.status),
    shipping_method: shippingMethodOf(o) || (parseFloat(o.shipping_total || 0) > 0 ? 'Flat Rate' : null),
    primary_sku: items[0]?.sku || null,
    subtotal: subtotal || null,
    shipping_total: parseFloat(o.shipping_total || 0) || null,
    total: parseFloat(o.total || 0) || null,
    currency: o.currency || 'AUD',
    item_count: itemCount,
    customer_name: name,
    customer_email: email || null,
    customer_phone: b.phone || null,
    customer_note: o.customer_note || o.note || null,
    shipping_address: (o.shipping && Object.keys(o.shipping).length ? o.shipping : b) || null,
    // The woocommerce_orders row's order_date is already a proper timestamptz.
    // Do NOT fall back to created_at (the sync insert time) — that fabricated a
    // "now" date and made every order look 1 minute old.
    order_date: wooDateToISO(o) || o.order_date || null,
    updated_at: new Date().toISOString(),
  }
}

// A row is only "new" for notification purposes if it was CREATED recently.
// An INSERT into orders means "first time Colvy has seen this order" — which is
// NOT the same as "just placed": an old order can be inserted for the first time
// when it's finally marked completed (its completion is the first webhook we
// receive, or the first sync that catches it). Pushing "New order" then is wrong
// — the customer placed it weeks ago. Gate on the order's own creation date.
const NEW_ORDER_MAX_AGE_MS = 24 * 60 * 60 * 1000
function isRecentOrder(src: any): boolean {
  const t = src?.order_date ? new Date(src.order_date).getTime() : 0
  return !!t && (Date.now() - t) <= NEW_ORDER_MAX_AGE_MS
}

// Ping the team's phones about a genuinely-new order (Orders tab badge + push).
// Fire-and-forget; never blocks or throws the sync. Shared by the webhook
// (upsertWooOrder) and the periodic bulk sync so both paths notify.
function notifyNewOrder(companyId: string, src: any): void {
  try {
    // Only a genuinely-new order — never an old order first seen on completion.
    if (!isRecentOrder(src)) return
    const base = String(process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
    if (!base) return
    const num = src.order_number ? `#${src.order_number}` : ''
    const money = src.total != null ? ` · ${new Intl.NumberFormat('en-AU', { style: 'currency', currency: src.currency || 'AUD' }).format(Number(src.total))}` : ''
    void fetch(`${base}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId,
        title: 'New order',
        body: `${num ? num + ' · ' : ''}${src.customer_name || 'A customer'}${money}`,
        channelId: 'orders',
        route: '/orders',
      }),
    }).catch(() => {})
  } catch {}
}

function itemRows(companyId: string, orderId: string, o: any) {
  const items: any[] = Array.isArray(o.line_items) ? o.line_items : []
  return items.map((li: any) => {
    const qty = Number(li.quantity) || 1
    const img = li.image?.src || li.image || li.images?.[0]?.src || null
    return {
      order_id: orderId, company_id: companyId,
      product_id: li.product_id ? String(li.product_id) : null,
      product_name: li.name || li.product_name || li.title || 'Item',
      sku: li.sku || null,
      quantity: qty,
      unit_price: parseFloat(li.price ?? (li.total ? li.total / qty : 0)) || null,
      total_price: parseFloat(li.total ?? li.subtotal ?? 0) || null,
      image_url: typeof img === 'string' ? img : null,
      // Stash the WooCommerce line id so per-line fulfilment (order_fulfillments)
      // has a stable key that survives this order's items being deleted and
      // re-inserted on the next webhook update.
      metadata: { woo_line_id: li.id != null ? String(li.id) : null },
    }
  })
}

async function resolveContacts(db: any, companyId: string, wooRows: any[]): Promise<Map<string, string>> {
  const emails = Array.from(new Set(wooRows.map(o => (o.customer_email || o.billing?.email || '').toLowerCase()).filter(Boolean)))
  const map = new Map<string, string>()
  for (let i = 0; i < emails.length; i += 200) {
    const { data } = await db.from('contacts').select('id, email').eq('company_id', companyId).in('email', emails.slice(i, i + 200))
    for (const c of data || []) if (c.email) map.set(String(c.email).toLowerCase(), c.id)
  }
  return map
}

/**
 * Fast, batched backfill of the operational `orders` table from a set of
 * woocommerce_orders rows. Only orders NOT already present are inserted — a few
 * bulk queries instead of a per-order round trip, so hundreds of orders sync in
 * one shot. Existing orders are left alone (their ongoing updates come through
 * the webhook via upsertWooOrder), so a re-sync is near-instant and never touches
 * the operational fields staff own.
 */
export async function syncWooOrders(db: any, companyId: string, wooRows: any[]): Promise<number> {
  if (!wooRows.length) return 0

  const extIds = wooRows.map(o => String(o.woo_order_id)).filter(Boolean)
  const existing = new Map<string, { id: string; order_date: string | null; status: string | null; store_location_id: string | null; shipping_method: string | null }>()
  for (let i = 0; i < extIds.length; i += 300) {
    const { data } = await db.from('orders').select('id, external_order_id, order_date, status, store_location_id, shipping_method')
      .eq('company_id', companyId).eq('sales_channel', 'woocommerce').in('external_order_id', extIds.slice(i, i + 300))
    for (const r of data || []) existing.set(String(r.external_order_id), { id: r.id, order_date: r.order_date, status: r.status, store_location_id: r.store_location_id, shipping_method: r.shipping_method })
  }
  const locations = await loadLocations(db, companyId)

  // Reconcile existing orders' dates: earlier syncs stored a wrong order_date
  // (WooCommerce local time parsed as UTC). Now that the source is corrected,
  // fix any stored date that no longer matches — bounded so a big catalogue
  // converges over a couple of runs rather than doing thousands of writes at once.
  let fixed = 0
  for (const o of wooRows) {
    if (fixed >= 800) break
    const prev = existing.get(String(o.woo_order_id))
    if (!prev) continue
    const want = wooDateToISO(o) || o.order_date || null
    if (!want) continue
    const cur = prev.order_date ? new Date(prev.order_date).getTime() : 0
    if (Math.abs(new Date(want).getTime() - cur) > 1000) {
      try { await db.from('orders').update({ order_date: want }).eq('id', prev.id); fixed++ } catch {}
    }
  }

  // Backfill the pickup outlet on already-synced Click & Collect orders that were
  // imported before outlet mapping existed (store_location_id null). Match on the
  // order's stored shipping_method — the only place the pickup location name is
  // kept (woocommerce_orders doesn't retain it). Never clobbers a manual
  // assignment, and bounded so a big catalogue converges over a couple of runs.
  let mapped = 0
  if (locations.length) {
    for (const [, prev] of existing) {
      if (mapped >= 400) break
      if (prev.status !== 'click_and_collect' || prev.store_location_id) continue
      const outletId = matchOutletId(locations, prev.shipping_method)
      if (!outletId) continue
      try { await db.from('orders').update({ store_location_id: outletId }).eq('id', prev.id); mapped++ } catch {}
    }
  }

  const fresh = wooRows.filter(o => !existing.has(String(o.woo_order_id)))
  if (!fresh.length) return 0

  const contacts = await resolveContacts(db, companyId, fresh)

  // Bulk-insert the new orders, then map each back to its new id.
  const rows = fresh.map(o => {
    const src = sourceFields(companyId, o, contacts.get((o.customer_email || o.billing?.email || '').toLowerCase()) || null)
    const status = statusOf(o)
    const outletId = status === 'click_and_collect' ? matchOutletId(locations, shippingMethodOf(o) || src.shipping_method) : null
    return {
      ...src,
      status,
      ...(outletId ? { store_location_id: outletId } : {}),
      fulfilment_status: ['completed'].includes(String(o.status)) ? 'fulfilled' : 'unfulfilled',
      flagged: ['failed', 'on-hold'].includes(String(o.status)),
    }
  })
  const inserted = await insertResilient(db, 'orders', rows, 'id, external_order_id')
  const idByExt = new Map<string, string>((inserted || []).map((r: any) => [String(r.external_order_id), r.id]))

  // Bulk items + created events.
  const allItems: any[] = []
  const events: any[] = []
  for (const o of fresh) {
    const id = idByExt.get(String(o.woo_order_id))
    if (!id) continue
    allItems.push(...itemRows(companyId, id, o))
    events.push({ order_id: id, company_id: companyId, type: 'created', detail: `Order imported from WooCommerce`, actor_name: 'Sync' })
  }
  for (let i = 0; i < allItems.length; i += 500) { try { await insertResilient(db, 'order_items', allItems.slice(i, i + 500)) } catch {} }
  for (let i = 0; i < events.length; i += 500) { try { await insertResilient(db, 'order_events', events.slice(i, i + 500)) } catch {} }

  // Notify the team about genuinely-new orders picked up by the poll (the Woo
  // webhook may be down — this path is why a "New order" push still fires).
  // Guards so a first-time connect or a long-offline catch-up can't spam:
  //  • skip entirely when there were no prior orders (initial history import),
  //  • only recent orders (last 24h) — a backfill of old orders stays silent,
  //  • cap the burst.
  if (existing.size > 0) {
    const RECENT_MS = 24 * 60 * 60 * 1000
    const now = Date.now()
    let sent = 0
    for (let i = 0; i < fresh.length && sent < 10; i++) {
      if (!idByExt.get(String(fresh[i].woo_order_id))) continue
      const src = rows[i]
      const t = src.order_date ? new Date(src.order_date).getTime() : 0
      if (!t || now - t > RECENT_MS) continue
      notifyNewOrder(companyId, src)
      sent++
    }
  }

  return fresh.length
}

/**
 * Upsert ONE storefront order into the operational table — called from the
 * WooCommerce webhook so a new/updated order appears in the Orders board
 * immediately (and, via realtime, live in the UI), the way a new chat does.
 * New order → inserted with mapped status; existing → source fields refreshed
 * WITHOUT touching status/assignee/tags/flagged.
 */
export async function upsertWooOrder(db: any, companyId: string, o: any, contactId?: string | null): Promise<void> {
  if (!o?.woo_order_id) return
  const ext = String(o.woo_order_id)
  const cid = contactId ?? (await resolveContacts(db, companyId, [o])).get((o.customer_email || o.billing?.email || '').toLowerCase()) ?? null
  const src = sourceFields(companyId, o, cid)

  const { data: prev } = await db.from('orders').select('id')
    .eq('company_id', companyId).eq('sales_channel', 'woocommerce').eq('external_order_id', ext).maybeSingle()

  let orderId: string
  if (prev?.id) {
    await updateResilient(db, 'orders', src, prev.id)
    orderId = prev.id
  } else {
    const st = statusOf(o)
    // Auto-assign a Click & Collect order to its pickup outlet (staff can still
    // change it). Only on INSERT, so a manual reassignment is never clobbered.
    let outletId: string | null = null
    if (st === 'click_and_collect') { outletId = matchOutletId(await loadLocations(db, companyId), shippingMethodOf(o)) }
    const ins = await insertResilient(db, 'orders', [{
      ...src,
      status: st,
      ...(outletId ? { store_location_id: outletId } : {}),
      fulfilment_status: ['completed'].includes(String(o.status)) ? 'fulfilled' : 'unfulfilled',
      flagged: ['failed', 'on-hold'].includes(String(o.status)),
    }], 'id')
    if (!ins[0]?.id) return
    orderId = ins[0].id
    try { await insertResilient(db, 'order_events', [{ order_id: orderId, company_id: companyId, type: 'created', detail: 'Order imported from WooCommerce', actor_name: 'Sync' }]) } catch {}

    // A brand-new order just landed — ping the team's phones the way a new chat
    // does, so the Orders tab badge and a push both fire. Best-effort; never
    // block the sync on it. (Only on INSERT, so a status refresh doesn't re-alert.)
    notifyNewOrder(companyId, src)
  }
  try {
    await db.from('order_items').delete().eq('order_id', orderId)
    const its = itemRows(companyId, orderId, o)
    if (its.length) await insertResilient(db, 'order_items', its)
  } catch {}
}
