// The audience rules that both the browser (the campaign editor) and the
// server need: what a filter looks like and when it's finished. No database
// access here, so the editor can import it.

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

export const AUDIENCE_TYPE_KEYS: AudienceType[] = [
  'all_subscribed', 'segment', 'manual', 'woocommerce', 'purchased_category',
  'lapsed', 'outlet', 'tags', 'clicked_campaign', 'abandoned_checkout',
]

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

/**
 * Why this filter can't be resolved yet, or null when it's complete.
 *
 * An unfinished filter must match NOBODY. The old resolver skipped a step when
 * its value was empty, so "bought a product" with no product (or "has these
 * tags" with none ticked, or "from an outlet" with none chosen) quietly became
 * the whole contact list — the Review step once showed all 13,772 contacts for
 * an audience the Audience step had shown as 584.
 */
export function audienceFilterProblem(f: any): string | null {
  if (!f || typeof f !== 'object' || !f.type) return 'Choose who this campaign goes to.'
  switch (f.type as AudienceType) {
    case 'purchased_category':
      return String(f.productQuery || '').trim() ? null : 'Pick a product to see who matches.'
    case 'tags':
      return Array.isArray(f.tags) && f.tags.some((t: any) => String(t || '').trim()) ? null : 'Pick a tag to see who matches.'
    case 'outlet':
      return f.locationId ? null : 'Pick an outlet to see who matches.'
    case 'manual':
      return Array.isArray(f.contactIds) && f.contactIds.some(Boolean) ? null : 'Pick at least one contact to see who matches.'
    case 'segment':
      return f.segment ? null : 'Pick a segment to see who matches.'
    case 'all_subscribed': case 'woocommerce': case 'lapsed':
    case 'clicked_campaign': case 'abandoned_checkout':
      return null
    default:
      return 'That audience type isn’t recognised.'
  }
}

/** Key order independent JSON, so the same filter always hashes the same. */
export function stableJson(v: any): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null)
  if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']'
  return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort()
    .map(k => JSON.stringify(k) + ':' + stableJson(v[k])).join(',') + '}'
}

