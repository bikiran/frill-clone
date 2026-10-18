import { createClient } from '@supabase/supabase-js'
import { audienceFilterProblem, stableJson, type AudienceFilter, type AudienceType } from './campaign-audience-rules'

export { audienceFilterProblem, stableJson, AUDIENCE_TYPE_KEYS } from './campaign-audience-rules'
export type { AudienceFilter, AudienceType } from './campaign-audience-rules'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export type SkipReason =
  | 'unsubscribed' | 'no_consent' | 'blocked' | 'invalid_number' | 'duplicate'
  // Email: no usable address; turned off marketing email (or texts, for SMS)
  // only; on the bounce / complaint suppression list.
  | 'no_email' | 'opted_out' | 'suppressed'

export interface ResolvedRecipient {
  contact_id: string
  name: string | null
  phone: string | null
  email: string | null
}

export interface AudienceResult {
  recipients: ResolvedRecipient[]
  matched: number                          // matched the filter before exclusions
  excluded: Record<SkipReason, number>
  excludedTotal: number
  excludedContacts: { contact_id: string; name: string | null; reason: SkipReason }[]
  /** Set when the filter is missing a required choice — the result is then empty. */
  incomplete?: string
}

/** Last 9 digits — the normalisation used across the codebase for phone matching. */
const digits = (s: string | null | undefined) => (s || '').replace(/\D/g, '').slice(-9)

export const emptyExcluded = (channel: 'sms' | 'email' = 'sms'): Record<SkipReason, number> =>
  (channel === 'email'
    ? { unsubscribed: 0, opted_out: 0, no_consent: 0, blocked: 0, no_email: 0, suppressed: 0, duplicate: 0 }
    : { unsubscribed: 0, opted_out: 0, no_consent: 0, blocked: 0, invalid_number: 0, duplicate: 0 }) as Record<SkipReason, number>

/** Lower-cased, trimmed address, or '' when it isn't a plausible email (as the email sender judges it). */
export function normEmail(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase()
  return /^[^@\s<>"',;]+@[^@\s<>"',;]+\.[a-z]{2,}$/i.test(s) ? s : ''
}

const missingColumn = (e: any) => /^(42703|PGRST204)$/.test(String(e?.code || '')) || /column .* does not exist|could not find the '.*' column/i.test(String(e?.message || ''))

/**
 * Fetch every row matching a query.
 *
 * Supabase caps a single response at 1000 rows regardless of .limit(), so a
 * plain .limit(20000) silently returns 1000. The first page also asks for the
 * exact total, then exactly the pages still needed are fetched in parallel (a
 * few at a time) — paging one after another made a 14,000-contact store wait
 * for 14 round trips, then as many again for each commerce table, on every
 * keystroke. `build` receives the select options to pass on (the count).
 */
type CountOpt = { count: 'exact' } | undefined
export async function fetchAll(build: (o?: CountOpt) => any, pageSize = 1000, hardCap = 100000, parallel = 12, onError?: (e: any) => void): Promise<any[]> {
  const first = await build({ count: 'exact' }).range(0, pageSize - 1)
  if (first?.error) { onError?.(first.error); return [] }
  const firstRows: any[] = first?.data || []
  if (firstRows.length < pageSize) return firstRows
  const out: any[] = [...firstRows]
  const total = typeof first?.count === 'number' ? Math.min(first.count, hardCap) : null
  const page = (s: number) => build().range(s, s + pageSize - 1).then((r: any) => (r?.error ? [] : r?.data || []), () => [])
  if (total != null) {
    const starts: number[] = []
    for (let s = pageSize; s < total; s += pageSize) starts.push(s)
    for (let i = 0; i < starts.length; i += parallel) {
      const pages = await Promise.all(starts.slice(i, i + parallel).map(page))
      for (const p of pages) out.push(...p)
    }
    return out
  }
  // No count came back: keep going a few pages at a time until one is short.
  for (let from = pageSize; from < hardCap; from += pageSize * parallel) {
    const starts: number[] = []
    for (let i = 0; i < parallel && from + i * pageSize < hardCap; i++) starts.push(from + i * pageSize)
    const pages = await Promise.all(starts.map(page))
    let short = false
    for (const p of pages) { out.push(...p); if (p.length < pageSize) { short = true; break } }
    if (short) break
  }
  return out
}

/** Split a list into chunks of `size`. */
function inChunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Is this a plausible Australian mobile number?
 *
 * Deliberately strict: a landline or malformed number in an SMS campaign is a
 * guaranteed delivery failure that still costs money, so it's better to exclude
 * it up front and show the count than to attempt the send.
 * AU mobiles are 04xx xxx xxx locally, +61 4xx xxx xxx internationally — so the
 * last 9 digits always begin with 4.
 */
export function isValidAuMobile(phone: string | null | undefined): boolean {
  const d = digits(phone)
  if (d.length !== 9) return false
  return d.startsWith('4')
}

// Only the columns the resolver reads. select('*') pulled every column of
// every contact — and of every store customer, items_purchased JSON included.
const CONTACT_COLS = 'id, name, email, phone, is_blocked, subscribed_to_marketing, consent_basis, unsubscribed_at'
const COMMERCE_COLS = 'email, phone_norm, total_spend, total_orders, last_order_date, first_order_date, address'

/** Strip characters that would break a PostgREST or() / ilike expression. */
const safeLike = (s: string) => s.replace(/[%,()*\\"]/g, ' ').trim()

/** Case variants for a tag, so a TEXT[] overlap still finds 'VIP' for 'vip'. */
function tagVariants(tags: string[]): string[] {
  const out = new Set<string>()
  for (const raw of tags) {
    const t = String(raw || '').trim()
    if (!t) continue
    out.add(t); out.add(t.toLowerCase()); out.add(t.toUpperCase())
    out.add(t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
  }
  return Array.from(out)
}

/**
 * The company's contacts this filter can match, as cheaply as the filter
 * allows: outlet, tags and hand-picked ids narrow in SQL.
 */
// V396's per-channel opt-outs. Before it runs the columns don't exist and the
// contacts are read without them.
const OPT_OUT_COLS = ', email_marketing_opt_out_at, sms_marketing_opt_out_at'

async function candidateContacts(db: any, companyId: string, filter: AudienceFilter): Promise<any[]> {
  let missing = false
  const rows = await candidateContactsWith(db, companyId, filter, CONTACT_COLS + OPT_OUT_COLS, e => { missing = missingColumn(e) })
  if (!missing) return rows
  return candidateContactsWith(db, companyId, filter, CONTACT_COLS)
}

async function candidateContactsWith(db: any, companyId: string, filter: AudienceFilter, COLS: string, onError?: (e: any) => void): Promise<any[]> {
  if (filter.type === 'manual') {
    const ids = Array.from(new Set((filter.contactIds || []).filter(Boolean)))
    // Chunked — .in() with thousands of ids exceeds URL limits — and parallel.
    const chunks = inChunks(ids, 200)
    const rows = await Promise.all(chunks.map(ch => db.from('contacts').select(COLS)
      .eq('company_id', companyId).in('id', ch).then((r: any) => { if (r?.error) onError?.(r.error); return r?.data || [] }, () => [])))
    return rows.flat()
  }
  const wantTags = filter.type === 'tags' ? tagVariants(filter.tags || []) : []
  const rows = await fetchAll(o => {
    let q = db.from('contacts').select(filter.type === 'tags' ? COLS + ', tags' : COLS, o).eq('company_id', companyId)
    if (filter.type === 'outlet') q = q.eq('location_id', filter.locationId)
    if (filter.type === 'tags') q = q.overlaps('tags', wantTags)
    return q.order('id', { ascending: true })
  }, 1000, 100000, 12, onError)
  if (filter.type === 'tags') {
    // The overlap is case-sensitive; this keeps the original any-case match exact.
    const want = new Set((filter.tags || []).map(t => String(t).toLowerCase()))
    return rows.filter(c => Array.isArray(c.tags) && c.tags.some((t: string) => want.has(String(t).toLowerCase())))
  }
  return rows
}

/** Store customers (WooCommerce, then Shopify) keyed by email and phone. */
async function commerceIndex(db: any, companyId: string, filter: AudienceFilter) {
  const withItems = filter.type === 'purchased_category'
  const [woo, shop] = await Promise.all([
    fetchAll(o => db.from('woocommerce_customers')
      .select(withItems ? COMMERCE_COLS + ', items_purchased' : COMMERCE_COLS, o)
      .eq('company_id', companyId).order('id', { ascending: true })),
    // Shopify customers too, for anyone not already known from WooCommerce —
    // same spend/orders/last-order fields; the address is reshaped to the
    // state/postcode the location filters read. (Not for the explicit
    // "WooCommerce customers" filter.) A missing table just means none.
    filter.type === 'woocommerce' ? Promise.resolve([]) : fetchAll(o => db.from('shopify_customers')
      .select(COMMERCE_COLS, o).eq('company_id', companyId).order('id', { ascending: true })).catch(() => []),
  ])
  const byEmail = new Map<string, any>()
  const byPhone = new Map<string, any>()
  for (const cu of woo) {
    if (cu.email) byEmail.set(String(cu.email).toLowerCase(), cu)
    if (cu.phone_norm) byPhone.set(cu.phone_norm, cu)
  }
  for (const sc of shop) {
    const a = sc.address || {}
    const cu = { ...sc, _src: 'shopify', items_purchased: null, address: { state: a.provinceCode || a.province_code || a.province || '', postcode: a.zip || '' } }
    const em = sc.email && !/@no-email\.colvy\.internal$/i.test(sc.email) ? String(sc.email).toLowerCase() : ''
    if (em && !byEmail.has(em)) byEmail.set(em, cu)
    if (sc.phone_norm && !byPhone.has(sc.phone_norm)) byPhone.set(sc.phone_norm, cu)
  }
  return (c: any) =>
    (c.email && byEmail.get(String(c.email).toLowerCase()))
    || (c.phone && byPhone.get(digits(c.phone)))
    || null
}

/**
 * Who bought a product, from the order lines in `orders` / `order_items`.
 *
 * Shopify customers have no items_purchased (only WooCommerce's sync fills
 * it), so a product filter never matched a Shopify buyer. Their orders and
 * line items ARE synced to orders / order_items (lib/shopify-orders.ts), so
 * read the buyers from there — matched by contact, then email, then phone.
 * A missing table or column just means no matches from this source.
 */
async function orderLineBuyers(db: any, companyId: string, query: string) {
  const ids = new Set<string>(), emails = new Set<string>(), phones = new Set<string>()
  const q = safeLike(query)
  if (!q) return { ids, emails, phones }
  try {
    const lines = await fetchAll(o => db.from('order_items').select('order_id', o)
      .eq('company_id', companyId).or(`product_name.ilike.%${q}%,sku.ilike.%${q}%`)
      .order('order_id', { ascending: true }))
    const orderIds = Array.from(new Set(lines.map((l: any) => l.order_id).filter(Boolean)))
    const chunks = inChunks(orderIds, 200)
    for (let i = 0; i < chunks.length; i += 6) {
      const res = await Promise.all(chunks.slice(i, i + 6).map(ch => db.from('orders')
        .select('id, contact_id, customer_email, customer_phone_norm').eq('company_id', companyId).in('id', ch)
        .then((r: any) => r?.data || [], () => [])))
      for (const o of res.flat()) {
        if (o.contact_id) ids.add(o.contact_id)
        if (o.customer_email) emails.add(String(o.customer_email).toLowerCase())
        if (o.customer_phone_norm) phones.add(String(o.customer_phone_norm).slice(-9))
      }
    }
  } catch { /* orders tables missing → no order-line matches */ }
  return { ids, emails, phones }
}

const itemMatches = (items: any, want: string) => {
  if (typeof items === 'string') { try { items = JSON.parse(items) } catch { items = [items] } }
  if (!Array.isArray(items)) return false
  return items.some((it: any) => typeof it === 'string'
    ? it.toLowerCase().includes(want)
    : String(it?.sku || '').toLowerCase().includes(want)
      || String(it?.name || it?.title || '').toLowerCase().includes(want))
}

export interface ResolveOptions {
  /** A supabase-like client; defaults to the service role. */
  db?: any
}

/**
 * Resolve a campaign audience.
 *
 * Exclusions are applied in a fixed order and every excluded contact is counted
 * with a reason, so the UI can explain exactly who was left out and why.
 * `channel` matters: an email campaign shouldn't exclude someone for lacking a
 * mobile number.
 *
 * The preview, the Review step and the sender all call this, so the numbers
 * the editor shows are the numbers that get sent.
 */
export async function resolveAudience(
  companyId: string,
  filter: AudienceFilter,
  channel: 'sms' | 'email' = 'sms',
  opts: ResolveOptions = {}
): Promise<AudienceResult> {
  const problem = audienceFilterProblem(filter)
  if (problem) {
    return { recipients: [], matched: 0, excluded: emptyExcluded(channel), excludedTotal: 0, excludedContacts: [], incomplete: problem }
  }
  const db = opts.db || admin()
  const minSpend = Number.isFinite(Number(filter.minSpend)) && filter.minSpend != null && String(filter.minSpend) !== '' ? Number(filter.minSpend) : null
  const minOrders = Number.isFinite(Number(filter.minOrders)) && filter.minOrders != null && String(filter.minOrders) !== '' ? Number(filter.minOrders) : null

  // ── 1. Candidate contacts for this filter ────────────────────────────────
  // Filters that need store (WooCommerce / Shopify) customer data.
  const needsCommerce = ['segment', 'woocommerce', 'purchased_category', 'lapsed'].includes(filter.type)
    || minSpend != null || minOrders != null || !!filter.state || !!filter.postcode
  const productWant = filter.type === 'purchased_category' ? String(filter.productQuery || '').trim().toLowerCase() : ''

  // Everything the filter needs, fetched side by side.
  const [contactRows, custFor, buyers, clicked, carts, suppressed] = await Promise.all([
    candidateContacts(db, companyId, filter),
    needsCommerce && filter.type !== 'manual' ? commerceIndex(db, companyId, filter) : Promise.resolve(null),
    productWant ? orderLineBuyers(db, companyId, productWant) : Promise.resolve(null),
    filter.type === 'clicked_campaign' ? clickedContactIds(db, companyId, filter.campaignId) : Promise.resolve(null),
    filter.type === 'abandoned_checkout' ? openCarts(db, companyId) : Promise.resolve(null),
    channel === 'email' ? emailSuppressions(db, companyId) : Promise.resolve(null),
  ])
  let candidates: any[] = contactRows

  if (custFor) {
    if (filter.type === 'woocommerce') {
      candidates = candidates.filter(c => { const cu = custFor(c); return !!cu && cu._src !== 'shopify' })
    }
    if (filter.type === 'segment') {
      const { SegmentationService } = await import('./segmentation-service')
      candidates = candidates.filter(c => {
        const cu = custFor(c)
        if (!cu) return false
        return SegmentationService.getRFMCategory(SegmentationService.getRFMScore(cu)) === filter.segment
      })
    }
    if (filter.type === 'lapsed') {
      const days = filter.lapsedDays || 90
      const cutoff = Date.now() - days * 86400000
      candidates = candidates.filter(c => {
        const cu = custFor(c)
        if (!cu) return false
        const last = cu.last_order_date ? new Date(cu.last_order_date).getTime() : 0
        return last > 0 && last < cutoff
      })
    }
    if (filter.type === 'purchased_category') {
      candidates = candidates.filter(c => {
        if (buyers && (buyers.ids.has(c.id)
          || (c.email && buyers.emails.has(String(c.email).toLowerCase()))
          || (c.phone && buyers.phones.has(digits(c.phone))))) return true
        const cu = custFor(c)
        return !!cu && itemMatches(cu.items_purchased, productWant)
      })
    }
    if (minSpend != null) candidates = candidates.filter(c => (parseFloat(custFor(c)?.total_spend) || 0) >= minSpend)
    if (minOrders != null) candidates = candidates.filter(c => (Number(custFor(c)?.total_orders) || 0) >= minOrders)
    if (filter.state) {
      const s = filter.state.toLowerCase()
      candidates = candidates.filter(c => String(custFor(c)?.address?.state || '').toLowerCase().includes(s))
    }
    if (filter.postcode) {
      candidates = candidates.filter(c => String(custFor(c)?.address?.postcode || '').includes(filter.postcode!))
    }
  }
  if (clicked) candidates = candidates.filter(c => clicked.has(c.id))
  if (carts) {
    candidates = candidates.filter(c =>
      (c.email && carts.emails.has(String(c.email).toLowerCase()))
      || (c.phone && carts.phones.has(digits(c.phone))))
  }

  const matched = candidates.length

  // ── 2. Exclusions ────────────────────────────────────────────────────────
  const excluded = emptyExcluded(channel)
  // Every excluded contact, so the sender can record each one with its reason
  // (the report used to see only the first 200).
  const excludedContacts: AudienceResult['excludedContacts'] = []
  const recipients: ResolvedRecipient[] = []
  const seen = new Set<string>()   // normalised destination, for dedupe

  const drop = (c: any, reason: SkipReason) => {
    excluded[reason]++
    excludedContacts.push({ contact_id: c.id, name: c.name || null, reason })
  }

  for (const c of candidates) {
    // Order matters: report the most meaningful reason first.
    if (c.is_blocked) { drop(c, 'blocked'); continue }
    // Non-customers (suppliers, wholesalers, business contacts) are excluded
    // from marketing at the data level: the migration sets
    // subscribed_to_marketing=false for them, so they fall out at the consent
    // check below unless they've since been explicitly opted in.
    if (c.unsubscribed_at) { drop(c, 'unsubscribed'); continue }
    // Turned off just this channel (V396): marketing email, or texts.
    if (channel === 'email' ? c.email_marketing_opt_out_at : c.sms_marketing_opt_out_at) { drop(c, 'opted_out'); continue }
    if (!c.subscribed_to_marketing || c.consent_basis === 'none') { drop(c, 'no_consent'); continue }

    if (channel === 'sms') {
      if (!isValidAuMobile(c.phone)) { drop(c, 'invalid_number'); continue }
      const key = digits(c.phone)
      if (seen.has(key)) { drop(c, 'duplicate'); continue }
      seen.add(key)
    } else {
      const email = normEmail(c.email)
      if (!email) { drop(c, 'no_email'); continue }
      // Bounced or complained (this business's list or the global one).
      if (suppressed === 'unknown' || suppressed?.has(email)) { drop(c, 'suppressed'); continue }
      if (seen.has(email)) { drop(c, 'duplicate'); continue }
      seen.add(email)
    }

    recipients.push({ contact_id: c.id, name: c.name || null, phone: c.phone || null, email: c.email || null })
  }

  const excludedTotal = Object.values(excluded).reduce((a, b) => a + b, 0)
  return { recipients, matched, excluded, excludedTotal, excludedContacts }
}

/** Contacts who clicked a link belonging to a previous campaign (or one in particular). */
async function clickedContactIds(db: any, companyId: string, campaignId?: string): Promise<Set<string>> {
  const ls = await fetchAll(o => {
    let lq = db.from('short_links').select('id', o).eq('company_id', companyId).not('campaign_id', 'is', null)
    if (campaignId) lq = lq.eq('campaign_id', campaignId)
    return lq.order('id', { ascending: true })
  })
  const clicked = new Set<string>()
  // Chunked: .in() with thousands of ids overruns the request URL.
  const chunks = inChunks(ls.map((l: any) => l.id), 200)
  for (let i = 0; i < chunks.length; i += 6) {
    const res = await Promise.all(chunks.slice(i, i + 6).map(ch => db.from('link_clicks')
      .select('contact_id').in('link_id', ch).not('contact_id', 'is', null)
      .then((r: any) => r?.data || [], () => [])))
    for (const c of res.flat()) if (c.contact_id) clicked.add(c.contact_id)
  }
  return clicked
}

/**
 * Addresses not to email: the business's suppression list plus the global one
 * (spam complaints), V396. Usually short, so read whole. Before V396 there is
 * no list (nothing suppressed); if it can't be read, 'unknown' — everyone
 * counts as suppressed rather than risk emailing someone who complained.
 */
async function emailSuppressions(db: any, companyId: string): Promise<Set<string> | 'unknown'> {
  let err: any = null
  const rows = await fetchAll(o => db.from('email_suppressions').select('email', o)
    .or(`company_id.eq.${companyId},company_id.is.null`).order('email', { ascending: true }), 1000, 100000, 12, e => { err = e })
  if (err) {
    const msg = String(err?.message || '')
    const missing = /^(42P01|PGRST205)$/.test(String(err?.code || '')) || (/does not exist|could not find the table|schema cache/i.test(msg) && !/column/i.test(msg))
    return missing ? new Set() : 'unknown'
  }
  return new Set(rows.map((r: any) => normEmail(r.email)).filter(Boolean))
}

/** Unrecovered abandoned carts, by email and phone (the table has no contact_id). */
async function openCarts(db: any, companyId: string) {
  const carts = await fetchAll(o => db.from('abandoned_carts')
    .select('email, phone, status', o).eq('company_id', companyId).order('id', { ascending: true }))
  const emails = new Set<string>()
  const phones = new Set<string>()
  for (const c of carts) {
    if (String(c.status || '').toLowerCase() === 'recovered') continue
    if (c.email) emails.add(String(c.email).toLowerCase())
    if (c.phone) phones.add(digits(c.phone))
  }
  return { emails, phones }
}

// ── Short server cache ──────────────────────────────────────────────────────
// The editor asks for a count on every (debounced) change, and flicking back
// and forth between two audience types asks the same question again. Answers
// are kept for a minute per company + channel + filter, and dropped for the
// whole company when its campaign audience is saved — so the saved count is
// always freshly worked out. The sender never reads this cache.
export const AUDIENCE_CACHE_MS = 60_000
const cache = new Map<string, { at: number; value: AudienceResult }>()

const cacheKey = (companyId: string, filter: AudienceFilter, channel: string) =>
  `${companyId}|${channel}|${stableJson(filter)}`

export async function resolveAudienceCached(
  companyId: string, filter: AudienceFilter, channel: 'sms' | 'email' = 'sms', opts: ResolveOptions & { now?: number } = {}
): Promise<AudienceResult & { cached?: boolean }> {
  const key = cacheKey(companyId, filter, channel)
  const now = opts.now ?? Date.now()
  const hit = cache.get(key)
  if (hit && now - hit.at < AUDIENCE_CACHE_MS) return { ...hit.value, cached: true }
  const value = await resolveAudience(companyId, filter, channel, opts)
  if (!value.incomplete) {
    cache.set(key, { at: now, value })
    // Keep it small: drop the oldest entries past a few hundred.
    if (cache.size > 300) {
      const oldest = Array.from(cache.entries()).sort((a, b) => a[1].at - b[1].at).slice(0, cache.size - 300)
      for (const [k] of oldest) cache.delete(k)
    }
  }
  return value
}

export function invalidateAudienceCache(companyId: string) {
  for (const k of Array.from(cache.keys())) if (k.startsWith(companyId + '|')) cache.delete(k)
}
