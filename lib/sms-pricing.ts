/**
 * SMS pricing.
 *
 * Prices are quoted in AUD, GST inclusive — that's what a customer sees on an
 * invoice, so it's what the builder shows. The carrier bills in USD, so cost
 * and therefore margin move with the exchange rate; that's surfaced rather
 * than hidden, because the bulk tiers are thin enough for FX to matter.
 */

export interface SmsPricing {
  price_per_part: number      // AUD, GST inclusive
  gst_rate: number            // e.g. 0.10
  gst_inclusive: boolean
  carrier_cost: number        // per part, in carrier currency
  carrier_currency: string    // 'USD'
  fx_rate: number             // AUD/USD — cost_aud = carrier_cost / fx_rate
  volume_tiers: { min: number; price: number }[]
}

export const DEFAULT_PRICING: SmsPricing = {
  price_per_part: 0.15,
  gst_rate: 0.10,
  gst_inclusive: true,
  carrier_cost: 0.05,
  carrier_currency: 'USD',
  fx_rate: 0.65,
  volume_tiers: [
    { min: 500, price: 0.130 },
    { min: 2000, price: 0.115 },
    { min: 5000, price: 0.105 },
  ],
}

/**
 * Price per part for a given number of parts, applying the best volume tier.
 * Tiers are matched on TOTAL PARTS, not recipients — a 3-segment message to
 * 200 people is 600 parts and earns the 500+ rate.
 */
export function priceForParts(pricing: SmsPricing, totalParts: number): {
  pricePerPart: number
  tier: { min: number; price: number } | null
} {
  const tiers = [...(pricing.volume_tiers || [])].sort((a, b) => b.min - a.min)
  for (const t of tiers) {
    if (totalParts >= t.min) return { pricePerPart: t.price, tier: t }
  }
  return { pricePerPart: pricing.price_per_part, tier: null }
}

export interface CostBreakdown {
  parts: number
  pricePerPart: number
  tier: { min: number; price: number } | null
  /** What the customer pays. */
  totalIncGst: number
  totalExGst: number
  gst: number
  /** What it costs us, converted to AUD. */
  carrierCostAud: number
  margin: number
  marginPct: number
  /** Parts needed to reach the next discount, if any. */
  nextTier: { min: number; price: number; partsAway: number } | null
}

export function calculateCost(
  pricing: SmsPricing,
  segments: number,
  recipients: number
): CostBreakdown {
  const parts = Math.max(0, segments) * Math.max(0, recipients)
  const { pricePerPart, tier } = priceForParts(pricing, parts)

  const gstRate = pricing.gst_rate ?? 0.10
  const totalIncGst = parts * pricePerPart
  // Stored prices are GST inclusive, so strip GST out rather than adding it on.
  const totalExGst = pricing.gst_inclusive ? totalIncGst / (1 + gstRate) : totalIncGst
  const gst = totalIncGst - totalExGst

  // Carrier bills in USD; fx_rate is AUD/USD.
  const fx = pricing.fx_rate || 1
  const carrierCostAud = parts * ((pricing.carrier_cost || 0) / fx)
  const margin = totalExGst - carrierCostAud
  const marginPct = totalExGst > 0 ? (margin / totalExGst) * 100 : 0

  // What's the next discount, and how far away?
  const above = (pricing.volume_tiers || [])
    .filter(t => t.min > parts)
    .sort((a, b) => a.min - b.min)[0]
  const nextTier = above ? { ...above, partsAway: above.min - parts } : null

  return {
    parts, pricePerPart, tier,
    totalIncGst, totalExGst, gst,
    carrierCostAud, margin, marginPct,
    nextTier,
  }
}

export const aud = (n: number) =>
  new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD', currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n || 0)

/** Per-part prices need more precision than cents. */
export const audRate = (n: number) =>
  new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD', currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 3, maximumFractionDigits: 4,
  }).format(n || 0)

/**
 * Coerce a raw sms_pricing / platform_settings row into a complete SmsPricing,
 * filling any missing field from the default. Used by both the per-company and
 * the global (platform) readers so parsing lives in one place.
 */
export function parsePricingRow(row: any): SmsPricing {
  if (!row) return DEFAULT_PRICING
  return {
    price_per_part: Number(row.price_per_part) || DEFAULT_PRICING.price_per_part,
    gst_rate: row.gst_rate != null ? Number(row.gst_rate) : DEFAULT_PRICING.gst_rate,
    gst_inclusive: row.gst_inclusive !== false,
    carrier_cost: Number(row.carrier_cost) || DEFAULT_PRICING.carrier_cost,
    carrier_currency: row.carrier_currency || DEFAULT_PRICING.carrier_currency,
    fx_rate: Number(row.fx_rate) || DEFAULT_PRICING.fx_rate,
    volume_tiers: Array.isArray(row.volume_tiers) ? row.volume_tiers : DEFAULT_PRICING.volume_tiers,
  }
}

/**
 * The effective SMS pricing for a company. SMS pricing is a PLATFORM decision
 * (set by the super admin), so the global default in platform_settings is the
 * source of truth. A per-company sms_pricing row, if one exists, still wins as
 * an explicit override; otherwise we fall back to the global default and then
 * the built-in default. Accepts any supabase-like client (browser or service).
 */
export async function resolveSmsPricing(db: any, companyId?: string | null): Promise<SmsPricing> {
  // Explicit per-company override, if present.
  if (companyId) {
    try {
      const { data } = await db.from('sms_pricing').select('*').eq('company_id', companyId).maybeSingle()
      if (data) return parsePricingRow(data)
    } catch { /* table may not exist yet */ }
  }
  // Global platform default.
  try {
    const { data } = await db.from('platform_settings').select('value').eq('key', 'sms_pricing').maybeSingle()
    if (data?.value) return parsePricingRow(data.value)
  } catch { /* table may not exist yet */ }
  return DEFAULT_PRICING
}
