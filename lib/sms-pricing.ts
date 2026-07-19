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
