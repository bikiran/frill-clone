// Multi-address per customer, with provenance. Addresses are gathered lazily
// from WooCommerce order billing/shipping and by manual entry; a new address is
// always saved ADDITIVELY (never overwriting a previous one).

export type AddressInput = {
  line1?: string | null
  line2?: string | null
  suburb?: string | null
  city?: string | null
  state?: string | null
  postcode?: string | null
  country?: string | null
  label?: string | null
}

const s = (v: any) => (v == null ? '' : String(v).trim())

export function addressKey(a: AddressInput): string {
  return `${s(a.line1).toLowerCase()}|${s(a.postcode).toLowerCase()}`
}

export function formatAddress(a: AddressInput): string {
  return [a.line1, a.line2, a.suburb, a.city, a.state, a.postcode, a.country]
    .map(s).filter(Boolean).join(', ')
}

export function isMeaningful(a: AddressInput): boolean {
  return !!(s(a.line1) || s(a.city) || s(a.suburb) || s(a.postcode))
}

// Upsert one address for a contact. Existing (same dedupe key) → refresh
// last_used_at (never backwards) and fill missing fields, keeping the original
// source. New → insert; the contact's first address becomes the default.
export async function recordAddress(
  db: any, companyId: string, contactId: string,
  a: AddressInput, source: string, sourceRef?: string | null, usedAt?: string | null,
): Promise<void> {
  if (!isMeaningful(a)) return
  const key = addressKey(a)
  const when = usedAt || new Date().toISOString()
  try {
    const { data: existing } = await db.from('contact_addresses').select('*')
      .eq('contact_id', contactId).eq('dedupe_key', key).maybeSingle()
    if (existing) {
      const patch: any = {}
      if (!existing.last_used_at || new Date(when) > new Date(existing.last_used_at)) patch.last_used_at = when
      for (const f of ['line2', 'suburb', 'city', 'state', 'postcode', 'country', 'label'] as const) {
        if (!existing[f] && (a as any)[f]) patch[f] = (a as any)[f]
      }
      if (Object.keys(patch).length) { patch.updated_at = new Date().toISOString(); await db.from('contact_addresses').update(patch).eq('id', existing.id) }
      return
    }
    const { count } = await db.from('contact_addresses').select('id', { count: 'exact', head: true }).eq('contact_id', contactId)
    await db.from('contact_addresses').insert({
      company_id: companyId, contact_id: contactId,
      line1: s(a.line1) || null, line2: s(a.line2) || null, suburb: s(a.suburb) || null,
      city: s(a.city) || null, state: s(a.state) || null, postcode: s(a.postcode) || null,
      country: s(a.country) || null, label: s(a.label) || null,
      formatted: formatAddress(a), dedupe_key: key,
      source, source_ref: sourceRef || null, last_used_at: when,
      is_default: (count || 0) === 0,
    })
  } catch { /* best-effort */ }
}

// Pull distinct billing/shipping addresses from a customer's WooCommerce orders
// and record them (source = the order). Best-effort; skips silently on error.
export async function backfillFromOrders(
  db: any, companyId: string, primaryContactId: string, emails: string[], phones: string[],
): Promise<void> {
  try {
    const orders: any[] = []
    if (emails.length) {
      const orExpr = emails.map(e => `customer_email.ilike.${e.replace(/,/g, '')}`).join(',')
      const { data } = await db.from('woocommerce_orders').select('woo_order_id, order_date, billing, shipping')
        .eq('company_id', companyId).or(orExpr).order('order_date', { ascending: false }).limit(50)
      orders.push(...(data || []))
    }
    if (phones.length) {
      const { data } = await db.from('woocommerce_orders').select('woo_order_id, order_date, billing, shipping')
        .eq('company_id', companyId).in('billing_phone_norm', phones).order('order_date', { ascending: false }).limit(50)
      orders.push(...(data || []))
    }
    for (const o of orders) {
      for (const which of ['shipping', 'billing'] as const) {
        const b = o[which]
        if (!b || typeof b !== 'object') continue
        const a: AddressInput = {
          line1: b.address_1, line2: b.address_2, city: b.city, state: b.state,
          postcode: b.postcode, country: b.country, suburb: b.suburb,
        }
        if (isMeaningful(a)) await recordAddress(db, companyId, primaryContactId, a, `WooCommerce order #${o.woo_order_id}`, String(o.woo_order_id), o.order_date)
      }
    }
  } catch { /* best-effort */ }
}
