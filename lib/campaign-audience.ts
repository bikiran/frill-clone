import { createClient } from '@supabase/supabase-js'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export type AudienceType =
  | 'all_subscribed'        // every marketable contact
  | 'segment'               // RFM / loyalty segment
  | 'manual'                // hand-picked contact ids
  | 'woocommerce'           // contacts matched to a WooCommerce customer
  | 'purchased_category'    // bought a given product/category
  | 'lapsed'                // no order in N days
  | 'outlet'                // belongs to an outlet
  | 'tags'                  // has any of these tags
  | 'clicked_campaign'      // clicked a link in a previous campaign
  | 'abandoned_checkout'    // has an unrecovered abandoned cart

export interface AudienceFilter {
  type: AudienceType
  segment?: string          // Champions / Loyal Customers / At Risk / Lost …
  contactIds?: string[]
  productQuery?: string     // SKU or product/category name
  lapsedDays?: number
  locationId?: string
  tags?: string[]
  campaignId?: string
  minSpend?: number
  minOrders?: number
  state?: string
  postcode?: string
}

export type SkipReason =
  | 'unsubscribed' | 'no_consent' | 'blocked' | 'invalid_number' | 'duplicate'

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
}

/** Last 9 digits — the normalisation used across the codebase for phone matching. */
const digits = (s: string | null | undefined) => (s || '').replace(/\D/g, '').slice(-9)

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

/**
 * Resolve a campaign audience.
 *
 * Exclusions are applied in a fixed order and every excluded contact is counted
 * with a reason, so the UI can explain exactly who was left out and why.
 * `channel` matters: an email campaign shouldn't exclude someone for lacking a
 * mobile number.
 */
export async function resolveAudience(
  companyId: string,
  filter: AudienceFilter,
  channel: 'sms' | 'email' = 'sms'
): Promise<AudienceResult> {
  const db = admin()

  // ── 1. Candidate contacts for this filter ────────────────────────────────
  let candidates: any[] = []

  const baseSelect = 'id, name, email, phone, tags, is_blocked, subscribed_to_marketing, consent_basis, unsubscribed_at, location_id'

  if (filter.type === 'manual') {
    const ids = (filter.contactIds || []).filter(Boolean)
    if (ids.length) {
      const { data } = await db.from('contacts').select(baseSelect)
        .eq('company_id', companyId).in('id', ids.slice(0, 5000))
      candidates = data || []
    }
  } else {
    // Everything else starts from the company's contacts and narrows down.
    let q = db.from('contacts').select(baseSelect).eq('company_id', companyId)
    if (filter.type === 'outlet' && filter.locationId) q = q.eq('location_id', filter.locationId)
    const { data } = await q.limit(20000)
    candidates = data || []

    if (filter.type === 'tags' && filter.tags?.length) {
      const want = filter.tags.map(t => t.toLowerCase())
      candidates = candidates.filter(c =>
        Array.isArray(c.tags) && c.tags.some((t: string) => want.includes(String(t).toLowerCase())))
    }

    // Filters that need WooCommerce data.
    const needsCommerce = ['segment', 'woocommerce', 'purchased_category', 'lapsed'].includes(filter.type)
      || filter.minSpend != null || filter.minOrders != null || filter.state || filter.postcode
    if (needsCommerce) {
      const { data: custs } = await db.from('woocommerce_customers')
        .select('*').eq('company_id', companyId).limit(20000)
      const byEmail = new Map<string, any>()
      const byPhone = new Map<string, any>()
      for (const cu of (custs || [])) {
        if (cu.email) byEmail.set(String(cu.email).toLowerCase(), cu)
        if (cu.phone_norm) byPhone.set(cu.phone_norm, cu)
      }
      const custFor = (c: any) =>
        (c.email && byEmail.get(String(c.email).toLowerCase()))
        || (c.phone && byPhone.get(digits(c.phone)))
        || null

      if (filter.type === 'woocommerce') {
        candidates = candidates.filter(c => !!custFor(c))
      }

      if (filter.type === 'segment' && filter.segment) {
        const { SegmentationService } = await import('./segmentation-service')
        candidates = candidates.filter(c => {
          const cu = custFor(c)
          if (!cu) return false
          const score = SegmentationService.getRFMScore(cu)
          return SegmentationService.getRFMCategory(score) === filter.segment
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

      if (filter.type === 'purchased_category' && filter.productQuery) {
        const want = filter.productQuery.toLowerCase()
        candidates = candidates.filter(c => {
          const cu = custFor(c)
          if (!cu) return false
          let items = cu.items_purchased
          if (typeof items === 'string') { try { items = JSON.parse(items) } catch { items = [items] } }
          if (!Array.isArray(items)) return false
          return items.some((it: any) => typeof it === 'string'
            ? it.toLowerCase().includes(want)
            : String(it.sku || '').toLowerCase().includes(want)
              || String(it.name || it.title || '').toLowerCase().includes(want))
        })
      }

      if (filter.minSpend != null) {
        candidates = candidates.filter(c => (parseFloat(custFor(c)?.total_spend) || 0) >= filter.minSpend!)
      }
      if (filter.minOrders != null) {
        candidates = candidates.filter(c => (custFor(c)?.total_orders || 0) >= filter.minOrders!)
      }
      if (filter.state) {
        const s = filter.state.toLowerCase()
        candidates = candidates.filter(c => String(custFor(c)?.address?.state || '').toLowerCase().includes(s))
      }
      if (filter.postcode) {
        candidates = candidates.filter(c => String(custFor(c)?.address?.postcode || '').includes(filter.postcode!))
      }
    }

    if (filter.type === 'clicked_campaign') {
      // Contacts who clicked a link belonging to a previous campaign.
      let lq = db.from('short_links').select('id').eq('company_id', companyId).not('campaign_id', 'is', null)
      if (filter.campaignId) lq = lq.eq('campaign_id', filter.campaignId)
      const { data: ls } = await lq.limit(5000)
      const linkIds = (ls || []).map((l: any) => l.id)
      let clicked = new Set<string>()
      if (linkIds.length) {
        const { data: cl } = await db.from('link_clicks')
          .select('contact_id').in('link_id', linkIds.slice(0, 500)).not('contact_id', 'is', null)
        clicked = new Set((cl || []).map((c: any) => c.contact_id))
      }
      candidates = candidates.filter(c => clicked.has(c.id))
    }

    if (filter.type === 'abandoned_checkout') {
      const { data: carts } = await db.from('abandoned_carts')
        .select('contact_id, email, phone, status').eq('company_id', companyId).limit(10000)
      const ids = new Set<string>()
      const emails = new Set<string>()
      const phones = new Set<string>()
      for (const c of (carts || [])) {
        if (String(c.status || '').toLowerCase() === 'recovered') continue
        if (c.contact_id) ids.add(c.contact_id)
        if (c.email) emails.add(String(c.email).toLowerCase())
        if (c.phone) phones.add(digits(c.phone))
      }
      candidates = candidates.filter(c =>
        ids.has(c.id)
        || (c.email && emails.has(String(c.email).toLowerCase()))
        || (c.phone && phones.has(digits(c.phone))))
    }
  }

  const matched = candidates.length

  // ── 2. Exclusions ────────────────────────────────────────────────────────
  const excluded: Record<SkipReason, number> = {
    unsubscribed: 0, no_consent: 0, blocked: 0, invalid_number: 0, duplicate: 0,
  }
  const excludedContacts: AudienceResult['excludedContacts'] = []
  const recipients: ResolvedRecipient[] = []
  const seen = new Set<string>()   // normalised destination, for dedupe

  const drop = (c: any, reason: SkipReason) => {
    excluded[reason]++
    if (excludedContacts.length < 200) {
      excludedContacts.push({ contact_id: c.id, name: c.name || null, reason })
    }
  }

  for (const c of candidates) {
    // Order matters: report the most meaningful reason first.
    if (c.is_blocked) { drop(c, 'blocked'); continue }
    if (c.unsubscribed_at) { drop(c, 'unsubscribed'); continue }
    if (!c.subscribed_to_marketing || c.consent_basis === 'none') { drop(c, 'no_consent'); continue }

    if (channel === 'sms') {
      if (!isValidAuMobile(c.phone)) { drop(c, 'invalid_number'); continue }
      const key = digits(c.phone)
      if (seen.has(key)) { drop(c, 'duplicate'); continue }
      seen.add(key)
    } else {
      const email = String(c.email || '').trim().toLowerCase()
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { drop(c, 'invalid_number'); continue }
      if (seen.has(email)) { drop(c, 'duplicate'); continue }
      seen.add(email)
    }

    recipients.push({ contact_id: c.id, name: c.name || null, phone: c.phone || null, email: c.email || null })
  }

  const excludedTotal = Object.values(excluded).reduce((a, b) => a + b, 0)
  return { recipients, matched, excluded, excludedTotal, excludedContacts }
}
