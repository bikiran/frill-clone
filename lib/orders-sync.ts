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
      metadata: {},
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
  const existing = new Map<string, { id: string; order_date: string | null }>()
  for (let i = 0; i < extIds.length; i += 300) {
    const { data } = await db.from('orders').select('id, external_order_id, order_date')
      .eq('company_id', companyId).eq('sales_channel', 'woocommerce').in('external_order_id', extIds.slice(i, i + 300))
    for (const r of data || []) existing.set(String(r.external_order_id), { id: r.id, order_date: r.order_date })
  }

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

  const fresh = wooRows.filter(o => !existing.has(String(o.woo_order_id)))
  if (!fresh.length) return 0

  const contacts = await resolveContacts(db, companyId, fresh)

  // Bulk-insert the new orders, then map each back to its new id.
  const rows = fresh.map(o => ({
    ...sourceFields(companyId, o, contacts.get((o.customer_email || o.billing?.email || '').toLowerCase()) || null),
    status: statusOf(o),
    fulfilment_status: ['completed'].includes(String(o.status)) ? 'fulfilled' : 'unfulfilled',
    flagged: ['failed', 'on-hold'].includes(String(o.status)),
  }))
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
    const ins = await insertResilient(db, 'orders', [{
      ...src,
      status: statusOf(o),
      fulfilment_status: ['completed'].includes(String(o.status)) ? 'fulfilled' : 'unfulfilled',
      flagged: ['failed', 'on-hold'].includes(String(o.status)),
    }], 'id')
    if (!ins[0]?.id) return
    orderId = ins[0].id
    try { await insertResilient(db, 'order_events', [{ order_id: orderId, company_id: companyId, type: 'created', detail: 'Order imported from WooCommerce', actor_name: 'Sync' }]) } catch {}
  }
  try {
    await db.from('order_items').delete().eq('order_id', orderId)
    const its = itemRows(companyId, orderId, o)
    if (its.length) await insertResilient(db, 'order_items', its)
  } catch {}
}
