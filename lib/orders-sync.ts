import { mapWooStatus, mapWooPayment } from '@/lib/orders'

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
    shipping_method: o.shipping_method || (parseFloat(o.shipping_total || 0) > 0 ? 'Flat Rate' : null),
    primary_sku: items[0]?.sku || null,
    subtotal: subtotal || null,
    shipping_total: parseFloat(o.shipping_total || 0) || null,
    total: parseFloat(o.total || 0) || null,
    currency: o.currency || 'AUD',
    item_count: itemCount,
    customer_name: name,
    customer_email: email || null,
    customer_phone: b.phone || null,
    shipping_address: (o.shipping && Object.keys(o.shipping).length ? o.shipping : b) || null,
    order_date: o.order_date || o.created_at || null,
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
  const existing = new Set<string>()
  for (let i = 0; i < extIds.length; i += 300) {
    const { data } = await db.from('orders').select('external_order_id')
      .eq('company_id', companyId).eq('sales_channel', 'woocommerce').in('external_order_id', extIds.slice(i, i + 300))
    for (const r of data || []) existing.add(String(r.external_order_id))
  }
  const fresh = wooRows.filter(o => !existing.has(String(o.woo_order_id)))
  if (!fresh.length) return 0

  const contacts = await resolveContacts(db, companyId, fresh)

  // Bulk-insert the new orders, then map each back to its new id.
  const rows = fresh.map(o => ({
    ...sourceFields(companyId, o, contacts.get((o.customer_email || o.billing?.email || '').toLowerCase()) || null),
    status: mapWooStatus(o.status),
    fulfilment_status: ['completed'].includes(String(o.status)) ? 'fulfilled' : 'unfulfilled',
    flagged: ['failed', 'on-hold'].includes(String(o.status)),
  }))
  const { data: inserted, error: insErr } = await db.from('orders').insert(rows).select('id, external_order_id')
  if (insErr) throw new Error(`orders insert failed: ${insErr.message || insErr.code || insErr}`)
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
  for (let i = 0; i < allItems.length; i += 500) { try { await db.from('order_items').insert(allItems.slice(i, i + 500)) } catch {} }
  for (let i = 0; i < events.length; i += 500) { try { await db.from('order_events').insert(events.slice(i, i + 500)) } catch {} }

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
    await db.from('orders').update(src).eq('id', prev.id)
    orderId = prev.id
  } else {
    const { data: ins } = await db.from('orders').insert({
      ...src,
      status: mapWooStatus(o.status),
      fulfilment_status: ['completed'].includes(String(o.status)) ? 'fulfilled' : 'unfulfilled',
      flagged: ['failed', 'on-hold'].includes(String(o.status)),
    }).select('id').maybeSingle()
    if (!ins?.id) return
    orderId = ins.id
    try { await db.from('order_events').insert({ order_id: orderId, company_id: companyId, type: 'created', detail: 'Order imported from WooCommerce', actor_name: 'Sync' }) } catch {}
  }
  try {
    await db.from('order_items').delete().eq('order_id', orderId)
    const its = itemRows(companyId, orderId, o)
    if (its.length) await db.from('order_items').insert(its)
  } catch {}
}
