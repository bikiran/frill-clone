// Prepaid SMS credits: the pure parts (no database, no Stripe), shared by the
// server module (lib/sms-credits.ts), the API routes, the Billing card and the
// tests. Safe to import in the browser.
//
// Money is whole cents (AUD, GST inclusive — what the customer pays and what
// lib/sms-pricing quotes). Per-part prices have fractions of a cent (A$0.105),
// so a send's cost is worked out on the whole send and rounded once.

import { priceForParts, type SmsPricing } from '@/lib/sms-pricing'

/** Top-up packs on the Billing page, in cents. */
export const SMS_CREDIT_PACKS_CENTS = [5000, 10000, 25000, 50000] as const
/** A custom top-up: at least A$20, at most A$5,000 in one go. */
export const MIN_TOPUP_CENTS = 2000
export const MAX_TOPUP_CENTS = 500000
/** Auto top-up: top up when the balance drops below this… */
export const DEFAULT_AUTO_THRESHOLD_CENTS = 1000
export const MIN_AUTO_THRESHOLD_CENTS = 500
export const MAX_AUTO_THRESHOLD_CENTS = 50000
/** …by this much. */
export const DEFAULT_AUTO_AMOUNT_CENTS = 5000
/** Two failed off-session charges in a row switch auto top-up off. */
export const AUTO_TOPUP_MAX_FAILURES = 2
/** After a failed attempt, wait this long before trying the card again. */
export const AUTO_TOPUP_RETRY_MS = 60 * 60 * 1000
/** A claimed attempt older than this is treated as abandoned. */
export const AUTO_TOPUP_PENDING_MS = 10 * 60 * 1000

export type LedgerKind = 'topup' | 'auto_topup' | 'spend' | 'refund' | 'adjustment' | 'reserve' | 'release'

export const KIND_LABEL: Record<LedgerKind, string> = {
  topup: 'Top-up',
  auto_topup: 'Auto top-up',
  spend: 'Texts sent',
  refund: 'Refund',
  adjustment: 'Adjustment',
  reserve: 'Held for campaign',
  release: 'Hold returned',
}

/**
 * A ledger row's type in words. A platform admin's adjustment reads as
 * "Charge by Colvy" (taken off) or "Credit from Colvy" (added); its note is
 * the reason they gave.
 */
export function ledgerLabel(r: { kind: LedgerKind | string; amount_cents?: number | null }): string {
  if (r.kind === 'adjustment') return (Number(r.amount_cents) || 0) < 0 ? 'Charge by Colvy' : 'Credit from Colvy'
  return (KIND_LABEL as Record<string, string>)[r.kind] || String(r.kind)
}

export type LedgerRow = {
  id: string
  company_id?: string
  kind: LedgerKind
  amount_cents: number
  balance_after_cents: number
  campaign_id?: string | null
  stripe_payment_intent_id?: string | null
  checkout_session_id?: string | null
  note?: string | null
  parts?: number | null
  created_by?: string | null
  created_at: string
}

/** "A$4.20" from cents (the Billing page's A$ style). */
export const fmtCents = (cents: number) => {
  const n = Number(cents) || 0
  return `${n < 0 ? '−' : ''}A$${(Math.abs(n) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
/** A per-text rate: "A$0.15", "A$0.115". */
export const fmtRate = (aud: number) => `A$${(Number(aud) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
/** "+A$50.00" / "−A$4.20" for the ledger. */
export const fmtSignedCents = (cents: number) => (cents > 0 ? '+' : cents < 0 ? '−' : '') + fmtCents(Math.abs(cents))

/** A dollars amount typed by a person ("50", "A$50.50", "50.5") → cents, or NaN. */
export function parseAudToCents(raw: string | number): number {
  const s = String(raw ?? '').replace(/A\$|\$|,|\s/gi, '')
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return NaN
  return Math.round(Number(s) * 100)
}

/** Whether a top-up amount (cents) is allowed: a whole number of cents, A$20 to A$5,000. */
export function validateTopUpCents(cents: any): { ok: boolean; cents: number; error?: string } {
  const n = Number(cents)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, cents: 0, error: 'Enter an amount in dollars and cents.' }
  if (n < MIN_TOPUP_CENTS) return { ok: false, cents: 0, error: `The smallest top-up is ${fmtCents(MIN_TOPUP_CENTS)}.` }
  if (n > MAX_TOPUP_CENTS) return { ok: false, cents: 0, error: `The largest single top-up is ${fmtCents(MAX_TOPUP_CENTS)}.` }
  return { ok: true, cents: n }
}

/** Auto top-up settings, checked. */
export function validateAutoTopUp(thresholdCents: any, amountCents: any): { ok: boolean; thresholdCents: number; amountCents: number; error?: string } {
  const t = Number(thresholdCents), a = Number(amountCents)
  if (!Number.isInteger(t) || t < MIN_AUTO_THRESHOLD_CENTS || t > MAX_AUTO_THRESHOLD_CENTS) {
    return { ok: false, thresholdCents: 0, amountCents: 0, error: `Choose a low-balance point between ${fmtCents(MIN_AUTO_THRESHOLD_CENTS)} and ${fmtCents(MAX_AUTO_THRESHOLD_CENTS)}.` }
  }
  const v = validateTopUpCents(a)
  if (!v.ok) return { ok: false, thresholdCents: 0, amountCents: 0, error: v.error }
  return { ok: true, thresholdCents: t, amountCents: v.cents }
}

/** A plan limit as stored (number, Infinity, 'unlimited', or junk) → a number, Infinity for unlimited. */
export function normaliseLimit(v: any): number {
  if (v === Infinity || v === 'unlimited' || v === 'Infinity') return Infinity
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** Parts of a send that the monthly allowance still covers, and the rest. */
export function splitAllowance(parts: number, allowanceRemaining: number): { freeParts: number; billableParts: number } {
  const p = Math.max(0, Math.floor(Number(parts) || 0))
  const rem = allowanceRemaining === Infinity ? Infinity : Math.max(0, Math.floor(Number(allowanceRemaining) || 0))
  const freeParts = Math.min(p, rem)
  return { freeParts, billableParts: p - freeParts }
}

/** Price per part in 1/100 of a cent, so the maths stays in whole numbers. */
const priceUnits = (pricePerPart: number) => Math.round((Number(pricePerPart) || 0) * 10000)

/**
 * What `billableParts` cost, in cents, at the volume tier earned by `tierParts`
 * (the whole send's parts; defaults to the billable parts). Rounded once, half up.
 */
export function partsCostCents(pricing: SmsPricing, billableParts: number, tierParts?: number): { cents: number; pricePerPart: number; tier: { min: number; price: number } | null } {
  const parts = Math.max(0, Math.floor(Number(billableParts) || 0))
  const { pricePerPart, tier } = priceForParts(pricing, Math.max(parts, Math.floor(Number(tierParts) || 0)))
  return { cents: Math.round((parts * priceUnits(pricePerPart)) / 100), pricePerPart, tier }
}

export type SendQuote = {
  parts: number
  /** Plan has no monthly cap (Enterprise): the wallet is skipped entirely. */
  unlimited: boolean
  freeParts: number
  billableParts: number
  pricePerPart: number
  tier: { min: number; price: number } | null
  costCents: number
}

/**
 * Allowance first: parts the plan's remaining monthly allowance covers are
 * free, only the rest costs credit. The volume tier is earned on the whole
 * send (`tierParts`, default all its parts), as the campaign estimate does.
 */
export function quoteParts(pricing: SmsPricing, o: { parts: number; allowanceRemaining: number; tierParts?: number }): SendQuote {
  const parts = Math.max(0, Math.floor(Number(o.parts) || 0))
  if (o.allowanceRemaining === Infinity) {
    return { parts, unlimited: true, freeParts: parts, billableParts: 0, pricePerPart: 0, tier: null, costCents: 0 }
  }
  const { freeParts, billableParts } = splitAllowance(parts, o.allowanceRemaining)
  const c = partsCostCents(pricing, billableParts, o.tierParts ?? parts)
  return { parts, unlimited: false, freeParts, billableParts, pricePerPart: c.pricePerPart, tier: c.tier, costCents: c.cents }
}

/** About how many single-part texts a balance pays for at the standard rate. */
export function textsAffordable(balanceCents: number, pricing: SmsPricing): number {
  const u = priceUnits(pricing.price_per_part)
  if (u <= 0) return 0
  return Math.floor((Math.max(0, Number(balanceCents) || 0) * 100) / u)
}

/** Below this the Low balance banner shows: the auto top-up point if set, else A$10. */
export function lowBalanceInfo(balanceCents: number, pricing: SmsPricing, thresholdCents = DEFAULT_AUTO_THRESHOLD_CENTS): { low: boolean; texts: number; message: string } {
  const texts = textsAffordable(balanceCents, pricing)
  const low = (Number(balanceCents) || 0) < Math.max(thresholdCents, 1)
  const message = `SMS balance ${fmtCents(balanceCents)}, enough for about ${texts.toLocaleString('en-AU')} text${texts === 1 ? '' : 's'}.`
  return { low, texts, message }
}

/**
 * The allowance a quote may still treat as free: the plan's limit, less what's
 * been sent this month, less what campaigns already holding credit were quoted
 * as free and haven't used yet. A hold's claim shrinks as the month's usage
 * grows after it was made, so a campaign's own sends aren't counted twice.
 */
export function allowanceRemaining(o: {
  limit: number
  used: number
  period: string
  holds?: { free_parts?: number | null; used_at_reserve?: number | null; period?: string | null; campaign_id?: string | null }[]
  excludeCampaignId?: string | null
}): number {
  if (o.limit === Infinity) return Infinity
  const used = Math.max(0, Number(o.used) || 0)
  let claimed = 0
  for (const h of o.holds || []) {
    if (!h || (o.excludeCampaignId && h.campaign_id === o.excludeCampaignId)) continue
    if (h.period && h.period !== o.period) continue
    const free = Math.max(0, Number(h.free_parts) || 0)
    const since = Math.max(0, used - (Number(h.used_at_reserve) || 0))
    claimed += Math.max(0, free - since)
  }
  return Math.max(0, o.limit - used - claimed)
}

export type AutoTopUpAccount = {
  balance_cents: number
  auto_topup_enabled?: boolean | null
  auto_topup_threshold_cents?: number | null
  auto_topup_amount_cents?: number | null
  stripe_customer_id?: string | null
  stripe_payment_method_id?: string | null
  auto_topup_failures?: number | null
  auto_topup_last_attempt_at?: string | null
  auto_topup_last_error?: string | null
  auto_topup_pending_at?: string | null
}

/**
 * Whether to charge the saved card now. `needCents` (optional) asks for a top-up
 * because a send needs that much more, even above the threshold.
 */
export function autoTopUpDecision(a: AutoTopUpAccount | null | undefined, now: number = Date.now(), needCents = 0): { go: boolean; reason: string } {
  if (!a) return { go: false, reason: 'no_account' }
  if (!a.auto_topup_enabled) return { go: false, reason: 'off' }
  if (!a.stripe_customer_id || !a.stripe_payment_method_id) return { go: false, reason: 'no_card' }
  if ((a.auto_topup_failures || 0) >= AUTO_TOPUP_MAX_FAILURES) return { go: false, reason: 'failed_too_often' }
  const pending = a.auto_topup_pending_at ? Date.parse(a.auto_topup_pending_at) : NaN
  if (Number.isFinite(pending) && now - pending < AUTO_TOPUP_PENDING_MS) return { go: false, reason: 'in_progress' }
  const last = a.auto_topup_last_attempt_at ? Date.parse(a.auto_topup_last_attempt_at) : NaN
  if ((a.auto_topup_failures || 0) > 0 && Number.isFinite(last) && now - last < AUTO_TOPUP_RETRY_MS) return { go: false, reason: 'cooling_off' }
  const threshold = a.auto_topup_threshold_cents ?? DEFAULT_AUTO_THRESHOLD_CENTS
  const below = (Number(a.balance_cents) || 0) < threshold
  if (!below && !(needCents > 0)) return { go: false, reason: 'above_threshold' }
  return { go: true, reason: below ? 'below_threshold' : 'needed' }
}

/** The account change after a failed off-session charge. */
export function afterAutoTopUpFailure(failures: number | null | undefined, error: string, now: Date = new Date()): {
  auto_topup_failures: number; auto_topup_enabled?: boolean; auto_topup_last_error: string; auto_topup_last_attempt_at: string; auto_topup_pending_at: null; disabled: boolean
} {
  const n = (Number(failures) || 0) + 1
  const disabled = n >= AUTO_TOPUP_MAX_FAILURES
  return {
    auto_topup_failures: n,
    ...(disabled ? { auto_topup_enabled: false } : {}),
    auto_topup_last_error: String(error || 'The card was declined').slice(0, 300),
    auto_topup_last_attempt_at: now.toISOString(),
    auto_topup_pending_at: null,
    disabled,
  }
}

/** Plain words for a Stripe card error (never the raw code). */
export function cardErrorText(e: any): string {
  const code = String(e?.code || e?.decline_code || e?.raw?.code || '')
  if (code === 'authentication_required') return 'Your bank asked to confirm the payment, which can’t happen automatically. Top up by hand once to confirm the card.'
  if (code === 'expired_card') return 'The saved card has expired.'
  if (code === 'insufficient_funds') return 'The card was declined for insufficient funds.'
  if (code === 'card_declined' || e?.type === 'StripeCardError') return 'The card was declined.'
  return 'The payment didn’t go through.'
}

const csvCell = (v: any) => {
  const s = v == null ? '' : String(v)
  // Neutralise spreadsheet formulas, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** The ledger as CSV (dates in Sydney time; amounts in dollars). */
export function ledgerToCsv(rows: LedgerRow[], campaignNames: Record<string, string> = {}): string {
  const head = ['Date', 'Type', 'Campaign', 'Texts (parts)', 'Amount (AUD)', 'Balance (AUD)', 'Note', 'Reference']
  const lines = [head.join(',')]
  for (const r of rows) {
    const d = new Date(r.created_at)
    const date = Number.isFinite(d.getTime()) ? d.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : ''
    lines.push([
      date,
      ledgerLabel(r),
      r.campaign_id ? (campaignNames[r.campaign_id] || r.campaign_id) : '',
      r.parts ?? '',
      ((Number(r.amount_cents) || 0) / 100).toFixed(2),
      ((Number(r.balance_after_cents) || 0) / 100).toFixed(2),
      r.note || '',
      r.stripe_payment_intent_id || r.checkout_session_id || '',
    ].map(csvCell).join(','))
  }
  return lines.join('\n') + '\n'
}

/** The volume tiers in words: "500+ texts: A$0.130 each". */
export function tierLines(pricing: SmsPricing): { label: string; price: number }[] {
  const tiers = [...(pricing.volume_tiers || [])].sort((a, b) => a.min - b.min)
  const out = [{ label: tiers.length ? `Up to ${(tiers[0].min - 1).toLocaleString('en-AU')} texts in a send` : 'Every text', price: pricing.price_per_part }]
  for (const t of tiers) out.push({ label: `${t.min.toLocaleString('en-AU')}+ texts in a send`, price: t.price })
  return out
}
