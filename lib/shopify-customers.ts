// Shopify customers → shopify_customers rows + Colvy contacts.
//
// Used by the full sync (GraphQL nodes) and the customers/* webhooks (REST-
// shaped JSON), so the mapper accepts both shapes.
//
// Every Shopify customer who can be reached (email or phone) gets a contact,
// matched to an existing one by email, then by phone (last 9 digits) so known
// people aren't duplicated — the same rule V197 used for WooCommerce. A contact
// is what campaign audiences resolve from and where an unsubscribe is recorded.
//
// Consent for NEW contacts follows what Shopify knows, most specific first:
//   subscribed to email or SMS marketing in Shopify → express
//   unsubscribed in Shopify                         → none (not marketable)
//   has placed an order                              → inferred (as V197)
//   otherwise                                        → not subscribed
// An existing contact's consent is never changed here: Colvy's own record
// (a STOP reply, a form opt-in) wins over a store sync.

const NO_EMAIL = (id: string | number) => `shopify-customer-${id}@no-email.colvy.internal`
const isPlaceholder = (e?: string | null) => !e || /@no-email\.colvy\.internal$/i.test(e)
export const phoneNorm = (p?: string | null) => {
  const d = String(p || '').replace(/\D/g, '')
  return d.length >= 8 ? d.slice(-9) : null
}

const numericId = (c: any): string | null => {
  if (c?.legacyResourceId) return String(c.legacyResourceId)
  if (typeof c?.id === 'number' || /^\d+$/.test(String(c?.id || ''))) return String(c.id)
  const m = String(c?.id || c?.admin_graphql_api_id || '').match(/(\d+)$/)
  return m ? m[1] : null
}
const upper = (s: any) => (s ? String(s).toUpperCase() : null)

export function mapShopifyCustomer(c: any, companyId: string, integrationId: string) {
  const id = numericId(c)
  if (!id) return null
  const addr = c.defaultAddress || c.default_address || null
  const email = (c.defaultEmailAddress?.emailAddress || c.email || '').trim().toLowerCase() || null
  const phone = (c.defaultPhoneNumber?.phoneNumber || c.phone || addr?.phone || '').trim() || null
  const tags = Array.isArray(c.tags) ? c.tags : typeof c.tags === 'string' ? c.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : []
  return {
    company_id: companyId,
    integration_id: integrationId,
    shopify_customer_id: Number(id),
    email: email || NO_EMAIL(id),
    first_name: c.firstName ?? c.first_name ?? addr?.firstName ?? addr?.first_name ?? '',
    last_name: c.lastName ?? c.last_name ?? addr?.lastName ?? addr?.last_name ?? '',
    phone: phone || '',
    phone_norm: phoneNorm(phone),
    address: addr,
    total_spend: parseFloat(c.amountSpent?.amount ?? c.total_spent ?? '0') || 0,
    total_orders: Number(c.numberOfOrders ?? c.orders_count ?? 0) || 0,
    currency: c.amountSpent?.currencyCode || c.currency || null,
    email_marketing: upper(c.defaultEmailAddress?.marketingState || c.email_marketing_consent?.state),
    sms_marketing: upper(c.defaultPhoneNumber?.marketingState || c.sms_marketing_consent?.state),
    tags,
    shopify_created_at: c.createdAt || c.created_at || null,
    shopify_updated_at: c.updatedAt || c.updated_at || null,
    synced_at: new Date().toISOString(),
    contact_id: null as string | null,
  }
}
export type ShopifyCustomerRow = NonNullable<ReturnType<typeof mapShopifyCustomer>>

export function consentFor(row: Pick<ShopifyCustomerRow, 'email_marketing' | 'sms_marketing' | 'total_orders'>) {
  const states = [row.email_marketing, row.sms_marketing]
  if (states.includes('SUBSCRIBED')) return { subscribed_to_marketing: true, consent_basis: 'express', consent_source: 'subscribed to marketing in Shopify' }
  if (states.includes('UNSUBSCRIBED')) return { subscribed_to_marketing: false, consent_basis: 'none', consent_source: 'unsubscribed from marketing in Shopify' }
  if ((row.total_orders || 0) > 0) return { subscribed_to_marketing: true, consent_basis: 'inferred', consent_source: 'existing customer (has placed an order)' }
  return { subscribed_to_marketing: false, consent_basis: null as string | null, consent_source: null as string | null }
}

/**
 * Sets row.contact_id on every reachable row — linking to an existing contact
 * or creating one. Returns how many contacts were created. Batched: a couple of
 * lookups per page, not a query per customer.
 */
export async function linkShopifyContacts(db: any, companyId: string, rows: ShopifyCustomerRow[]): Promise<{ created: number; linked: number }> {
  const reachable = rows.filter(r => !isPlaceholder(r.email) || r.phone_norm)
  if (!reachable.length) return { created: 0, linked: 0 }

  const emails = Array.from(new Set(reachable.map(r => (isPlaceholder(r.email) ? '' : r.email)).filter(Boolean)))
  const phones = Array.from(new Set(reachable.map(r => r.phone_norm).filter(Boolean))) as string[]
  const byEmail = new Map<string, any>()
  const byPhone = new Map<string, any>()
  for (let i = 0; i < emails.length; i += 200) {
    const { data } = await db.from('contacts').select('id, email, phone, phone_norm, name').eq('company_id', companyId).in('email', emails.slice(i, i + 200))
    for (const c of data || []) if (c.email) byEmail.set(String(c.email).toLowerCase(), c)
  }
  for (let i = 0; i < phones.length; i += 200) {
    const { data } = await db.from('contacts').select('id, email, phone, phone_norm, name').eq('company_id', companyId).in('phone_norm', phones.slice(i, i + 200))
    for (const c of data || []) if (c.phone_norm && !byPhone.has(c.phone_norm)) byPhone.set(c.phone_norm, c)
  }

  let linked = 0
  const toCreate: { row: ShopifyCustomerRow; key: string }[] = []
  const pendingKeys = new Map<string, ShopifyCustomerRow[]>()   // same person twice in one page
  const fills: { id: string; patch: any }[] = []
  for (const r of reachable) {
    const email = isPlaceholder(r.email) ? null : r.email
    const hit = (email && byEmail.get(email)) || (r.phone_norm && byPhone.get(r.phone_norm)) || null
    if (hit) {
      r.contact_id = hit.id
      linked++
      // Fill blanks only — never overwrite what the business has typed.
      const patch: any = {}
      if (!hit.email && email) patch.email = email
      if (!hit.phone && r.phone) { patch.phone = r.phone; patch.phone_norm = r.phone_norm }
      const name = `${r.first_name || ''} ${r.last_name || ''}`.trim()
      if (!hit.name && name) patch.name = name
      if (Object.keys(patch).length) { fills.push({ id: hit.id, patch }); Object.assign(hit, patch) }
      continue
    }
    const key = email || `p:${r.phone_norm}`
    if (pendingKeys.has(key)) { pendingKeys.get(key)!.push(r); continue }
    pendingKeys.set(key, [r])
    toCreate.push({ row: r, key })
  }

  for (const f of fills) { try { await db.from('contacts').update(f.patch).eq('id', f.id).eq('company_id', companyId) } catch {} }

  let created = 0
  if (toCreate.length) {
    const now = new Date().toISOString()
    const inserts = toCreate.map(({ row: r }) => {
      const consent = consentFor(r)
      return {
        company_id: companyId,
        name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || null,
        email: isPlaceholder(r.email) ? null : r.email,
        phone: r.phone || null,
        phone_norm: r.phone_norm,
        source: 'shopify',
        ...consent,
        consent_recorded_at: consent.consent_basis ? now : null,
      }
    })
    const { data: made, error } = await db.from('contacts').insert(inserts).select('id, email, phone_norm')
    if (error) throw new Error(`contacts: ${error.message}`)
    const madeByKey = new Map<string, string>()
    for (const c of made || []) {
      if (c.email) madeByKey.set(String(c.email).toLowerCase(), c.id)
      else if (c.phone_norm) madeByKey.set(`p:${c.phone_norm}`, c.id)
    }
    const events: any[] = []
    for (const { row, key } of toCreate) {
      const id = madeByKey.get(key)
      if (!id) continue
      created++
      for (const r of pendingKeys.get(key) || [row]) r.contact_id = id
      const consent = consentFor(row)
      if (consent.consent_basis) {
        events.push({
          company_id: companyId, contact_id: id,
          action: consent.subscribed_to_marketing ? 'subscribed' : 'unsubscribed',
          basis: consent.consent_basis, source: consent.consent_source, actor: 'system',
          note: 'contact created from Shopify customer',
        })
      }
    }
    if (events.length) { try { await db.from('consent_events').insert(events) } catch {} }
  }
  // Duplicates of an existing contact within the same page.
  for (const [, group] of pendingKeys) {
    const first = group.find(r => r.contact_id)
    if (first) for (const r of group) r.contact_id = r.contact_id || first.contact_id
  }
  return { created, linked }
}

/** Map → link contacts → upsert. Returns counts. */
export async function saveShopifyCustomers(db: any, companyId: string, integrationId: string, nodes: any[]) {
  const rows = nodes.map(n => mapShopifyCustomer(n, companyId, integrationId)).filter(Boolean) as ShopifyCustomerRow[]
  if (!rows.length) return { saved: 0, created: 0, linked: 0 }
  const { created, linked } = await linkShopifyContacts(db, companyId, rows)
  const { error } = await db.from('shopify_customers').upsert(rows, { onConflict: 'company_id,shopify_customer_id' })
  if (error) throw new Error(`shopify_customers: ${error.message}`)
  return { saved: rows.length, created, linked }
}
