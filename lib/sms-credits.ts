// Prepaid SMS credits: the wallet. Server only (service-role client).
//
// A business pays for texts beyond its plan's monthly allowance with prepaid
// credit (migrations/COLVY_V395_SMS_CREDITS.sql). Every balance change goes
// through the database functions, which lock the company's account row, so two
// sends can't spend the same money and the balance never goes below zero.
//
//   Allowance first. Parts the remaining monthly allowance covers are free;
//   only the rest costs credit, at lib/sms-pricing's rate (volume tier earned
//   on the whole send). How a company pays is its SMS billing policy
//   (lib/sms-policy: company override, else plan default, else the code
//   default): 'unlimited' skips the wallet, 'credit_only' has no free
//   allowance, 'allowance_only' stops at the allowance and never charges
//   (reason 'limit'), 'disabled' sends nothing (reason 'sms_disabled', or
//   'plan' when the plan simply doesn't include SMS).
//
//   Campaigns: reserveForCampaign holds the estimated cost when the campaign is
//   scheduled (and again, re-quoted, when it starts), settleCampaign charges
//   what was really sent and returns the rest, releaseCampaign returns the
//   hold of a cancelled campaign.
//   One-off texts: chargeSingleSend before the send, refundSingleSend if the
//   carrier then refuses it.
//
//   Before the migration runs, nothing here throws: getWallet answers
//   ready:false, and a send the allowance doesn't cover answers
//   reason:'not_set_up', which callers treat exactly like today's "monthly
//   allowance reached".
//
// Wired into sending by lib/campaign-credits.ts (campaign holds, settled at
// the end) and lib/sms-provider.ts (one-off texts: payForText).

import { resolveSmsPricing, type SmsPricing } from '@/lib/sms-pricing'
import { smsPeriod, smsUsageThisMonth } from '@/lib/sms-quota'
import { getSmsPolicy, type SmsPolicy } from '@/lib/sms-policy'
import { secretKeyOk } from '@/lib/billing-config'
import {
  afterAutoTopUpFailure, allowanceRemaining as remainingAfterHolds, autoTopUpDecision, cardErrorText,
  partsCostCents, quoteParts, DEFAULT_AUTO_AMOUNT_CENTS, DEFAULT_AUTO_THRESHOLD_CENTS,
  type SendQuote,
} from '@/lib/sms-credits-core'

export const isMissingTable = (e: any) => /does not exist|schema cache|Could not find|PGRST20[45]|42P01|42883/i.test(String(e?.message || e?.code || e || ''))

export type Wallet = {
  /** False until V395 has run: the wallet is hidden and nothing is charged. */
  ready: boolean
  companyId: string
  balanceCents: number
  heldCents: number
  currency: string
  autoTopUp: { enabled: boolean; thresholdCents: number; amountCents: number; failures: number; lastError: string | null; lastAttemptAt: string | null }
  card: { brand: string | null; last4: string | null } | null
  stripeCustomerId: string | null
  updatedAt: string | null
}

const emptyWallet = (companyId: string, ready: boolean): Wallet => ({
  ready, companyId, balanceCents: 0, heldCents: 0, currency: 'aud',
  autoTopUp: { enabled: false, thresholdCents: DEFAULT_AUTO_THRESHOLD_CENTS, amountCents: DEFAULT_AUTO_AMOUNT_CENTS, failures: 0, lastError: null, lastAttemptAt: null },
  card: null, stripeCustomerId: null, updatedAt: null,
})

export function walletFromRow(companyId: string, a: any, heldCents = 0): Wallet {
  if (!a) return { ...emptyWallet(companyId, true), heldCents }
  return {
    ready: true, companyId,
    balanceCents: Number(a.balance_cents) || 0,
    heldCents,
    currency: a.currency || 'aud',
    autoTopUp: {
      enabled: !!a.auto_topup_enabled,
      thresholdCents: a.auto_topup_threshold_cents ?? DEFAULT_AUTO_THRESHOLD_CENTS,
      amountCents: a.auto_topup_amount_cents ?? DEFAULT_AUTO_AMOUNT_CENTS,
      failures: Number(a.auto_topup_failures) || 0,
      lastError: a.auto_topup_last_error || null,
      lastAttemptAt: a.auto_topup_last_attempt_at || null,
    },
    card: a.stripe_payment_method_id ? { brand: a.card_brand || null, last4: a.card_last4 || null } : null,
    stripeCustomerId: a.stripe_customer_id || null,
    updatedAt: a.updated_at || null,
  }
}

async function readAccount(db: any, companyId: string): Promise<{ ready: boolean; row: any }> {
  try {
    const { data, error } = await db.from('sms_credit_accounts').select('*').eq('company_id', companyId).maybeSingle()
    if (error) return { ready: !isMissingTable(error), row: null }
    return { ready: true, row: data || null }
  } catch (e) { return { ready: !isMissingTable(e), row: null } }
}

async function readHolds(db: any, companyId: string): Promise<any[]> {
  try {
    const { data, error } = await db.from('sms_credit_holds').select('campaign_id, held_cents, free_parts, used_at_reserve, period, status').eq('company_id', companyId).eq('status', 'held')
    return error ? [] : (data || [])
  } catch { return [] }
}

/** The company's balance, holds and auto top-up settings. Never throws. */
export async function getWallet(db: any, companyId: string): Promise<Wallet> {
  const [{ ready, row }, holds] = await Promise.all([readAccount(db, companyId), readHolds(db, companyId)])
  if (!ready) return emptyWallet(companyId, false)
  const held = holds.reduce((s, h) => s + (Number(h.held_cents) || 0), 0)
  return walletFromRow(companyId, row, held)
}

export type AllowanceStatus = {
  /** SMS is on at all (Free / Feedback, or a 'disabled' policy, send nothing). */
  entitled: boolean
  unlimited: boolean
  limit: number
  used: number
  /** What a quote may still treat as free (after campaigns' quoted free parts). */
  remaining: number
  period: string
  /** The policy's mode (lib/sms-policy). */
  mode: SmsPolicy['mode']
  /** Texts beyond the allowance are paid from credit. */
  chargesCredit: boolean
  /** Why nothing can be sent, when not entitled. */
  reason: SmsPolicy['blockReason']
}

/** This month's allowance from the SMS billing policy: limit, usage and what's left. */
export async function allowanceStatus(db: any, companyId: string, opts: { excludeCampaignId?: string | null; holds?: any[]; policy?: SmsPolicy } = {}): Promise<AllowanceStatus> {
  const period = smsPeriod()
  const [policy, used, holds] = await Promise.all([
    opts.policy ? Promise.resolve(opts.policy) : getSmsPolicy(db, companyId),
    smsUsageThisMonth(db, companyId),
    opts.holds ? Promise.resolve(opts.holds) : readHolds(db, companyId),
  ])
  const base = { used, period, mode: policy.mode, chargesCredit: policy.chargesCredit, reason: policy.blockReason }
  if (!policy.entitled) return { ...base, entitled: false, unlimited: false, limit: 0, remaining: 0 }
  const limit = policy.allowance
  if (limit === Infinity) return { ...base, entitled: true, unlimited: true, limit, remaining: Infinity }
  const remaining = remainingAfterHolds({ limit, used, period, holds, excludeCampaignId: opts.excludeCampaignId })
  return { ...base, entitled: true, unlimited: false, limit, remaining }
}

/** What `parts` cost in credit at this company's rate (no allowance applied). */
export async function costForParts(db: any, companyId: string, parts: number, opts: { tierParts?: number; pricing?: SmsPricing } = {}) {
  const pricing = opts.pricing || await resolveSmsPricing(db, companyId)
  return partsCostCents(pricing, parts, opts.tierParts)
}

export type Quote = SendQuote & {
  entitled: boolean
  ready: boolean
  balanceCents: number
  /** Enough credit for the billable parts (always true when nothing is billable). */
  affordable: boolean
  shortfallCents: number
  allowance: AllowanceStatus
  wallet: Wallet
  pricing: SmsPricing
  policy: SmsPolicy
}

/** Allowance first, then credit: what a send of `parts` would cost and whether it's covered. */
export async function quoteSend(db: any, companyId: string, parts: number, opts: { tierParts?: number; excludeCampaignId?: string | null } = {}): Promise<Quote> {
  const [{ ready, row }, holds, pricing, policy] = await Promise.all([readAccount(db, companyId), readHolds(db, companyId), resolveSmsPricing(db, companyId), getSmsPolicy(db, companyId)])
  const allowance = await allowanceStatus(db, companyId, { excludeCampaignId: opts.excludeCampaignId, holds, policy })
  const wallet = ready ? walletFromRow(companyId, row, holds.reduce((s, h) => s + (Number(h.held_cents) || 0), 0)) : emptyWallet(companyId, false)
  const q = quoteParts(pricing, { parts, allowanceRemaining: allowance.remaining, tierParts: opts.tierParts })
  const balance = wallet.balanceCents
  // Allowance only: nothing is ever charged, so only what the allowance covers can go.
  const affordable = q.unlimited || q.billableParts === 0 || q.costCents === 0 || (policy.chargesCredit && ready && balance >= q.costCents)
  return {
    ...q, entitled: allowance.entitled, ready, balanceCents: balance,
    affordable: allowance.entitled && affordable,
    shortfallCents: affordable || !policy.chargesCredit ? 0 : Math.max(0, q.costCents - balance),
    allowance, wallet, pricing, policy,
  }
}

/**
 * Why a send can't go: 'plan' (no SMS on the plan), 'sms_disabled' (switched
 * off by Colvy), 'limit' (allowance-only policy, allowance used), or a wallet
 * reason.
 */
export type Refusal = 'plan' | 'sms_disabled' | 'limit' | 'insufficient' | 'not_set_up' | 'settled' | 'error'

/** The block for a quote that isn't entitled or can't use credit, else null. */
function policyRefusal(quote: Quote): Refusal | null {
  if (!quote.entitled) return quote.policy.blockReason || 'plan'
  if (quote.unlimited || quote.billableParts === 0) return null
  if (!quote.policy.chargesCredit) return 'limit'
  return null
}

/** Could a send of `parts` go now? Allowance first; checks only, charges nothing. */
export async function canAfford(db: any, companyId: string, parts: number, opts: { tierParts?: number; excludeCampaignId?: string | null } = {}): Promise<{ ok: boolean; reason?: Refusal; quote: Quote }> {
  const quote = await quoteSend(db, companyId, parts, opts)
  const blocked = policyRefusal(quote)
  if (blocked) return { ok: false, reason: blocked, quote }
  if (quote.unlimited || quote.billableParts === 0) return { ok: true, quote }
  if (!quote.ready) return { ok: false, reason: 'not_set_up', quote }
  return quote.affordable ? { ok: true, quote } : { ok: false, reason: 'insufficient', quote }
}

/**
 * A campaign's credit hold, if it still has one. On an unlimited policy it's
 * given back (the company was switched to unlimited after it was scheduled),
 * so nothing stays held for a send that will never be charged.
 */
export async function releaseHoldIfUnlimited(db: any, companyId: string, campaignId: string): Promise<null> {
  await releaseIfHeld(db, companyId, campaignId, 'Unlimited texts: hold returned')
  return null
}

/** Give back a campaign's hold only if it has one (no database function call otherwise). */
async function releaseIfHeld(db: any, companyId: string, campaignId: string, note: string) {
  let hold: any = null
  try { const { data, error } = await db.from('sms_credit_holds').select('status, held_cents').eq('campaign_id', campaignId).maybeSingle(); hold = error ? null : data } catch {}
  if (hold?.status === 'held') await releaseCampaign(db, { companyId, campaignId, note }).catch(() => null)
}

async function rpc(db: any, fn: string, args: Record<string, any>): Promise<any> {
  try {
    const { data, error } = await db.rpc(fn, args)
    if (error) return { ok: false, reason: isMissingTable(error) ? 'not_set_up' : 'error', error: error.message || String(error) }
    return data || { ok: false, reason: 'error' }
  } catch (e: any) {
    return { ok: false, reason: isMissingTable(e) ? 'not_set_up' : 'error', error: e?.message || String(e) }
  }
}

export type AutoTopUpDeps = {
  /** A Stripe client (tests pass a fake). Defaults to one on STRIPE_SECRET_KEY. */
  stripe?: any
  /** Whether (and how) the company is billed through Shopify (tests pass a fake). Defaults to lib/shopify-usage. */
  shopify?: () => Promise<import('@/lib/shopify-usage').ShopifySmsBilling | null>
  /** Sends the Shopify billing event (tests pass a fake). Defaults to lib/shopify-usage. */
  sendShopifyEvent?: (o: { shopGid: string; value: number | string; key: string; at?: Date }) => Promise<{ ok: boolean; status: number; error?: string }>
  now?: () => Date
  /** Tells the owner auto top-up was switched off (defaults to email + bell). */
  notifyDisabled?: (db: any, companyId: string, error: string, o?: { viaShopify?: boolean }) => Promise<void>
}

/** Hold the estimated cost of a campaign. Re-calling re-quotes and adjusts the hold. */
export async function reserveForCampaign(db: any, o: {
  companyId: string; campaignId: string; parts: number; tierParts?: number; createdBy?: string | null
  autoTopUp?: boolean; deps?: AutoTopUpDeps
}): Promise<{ ok: boolean; reason?: Refusal; heldCents: number; balanceCents: number; shortfallCents?: number; skipped?: 'unlimited' | 'not_set_up'; quote: Quote }> {
  const quote = await quoteSend(db, o.companyId, o.parts, { tierParts: o.tierParts, excludeCampaignId: o.campaignId })
  if (quote.unlimited) {
    // Switched to unlimited since it was scheduled: give back what it held.
    if (quote.ready) await releaseHoldIfUnlimited(db, o.companyId, o.campaignId)
    return { ok: true, skipped: 'unlimited', heldCents: 0, balanceCents: quote.balanceCents, quote }
  }
  const blocked = policyRefusal(quote)
  if (blocked) {
    // Refused: anything it held under an earlier policy goes back.
    if (quote.ready) await releaseIfHeld(db, o.companyId, o.campaignId, blocked === 'limit' ? 'Beyond the monthly allowance: hold returned' : 'Texting not available: hold returned')
    return { ok: false, reason: blocked, heldCents: 0, balanceCents: quote.balanceCents, quote }
  }
  if (!quote.ready) {
    return quote.billableParts === 0
      ? { ok: true, skipped: 'not_set_up', heldCents: 0, balanceCents: 0, quote }
      : { ok: false, reason: 'not_set_up', heldCents: 0, balanceCents: 0, shortfallCents: quote.costCents, quote }
  }
  const call = () => rpc(db, 'sms_credit_reserve', {
    p_company: o.companyId, p_campaign: o.campaignId, p_amount: quote.costCents,
    p_free_parts: quote.freeParts, p_parts: quote.parts, p_price_per_part: quote.pricePerPart || null,
    p_period: quote.allowance.period, p_used_at_reserve: quote.allowance.used, p_created_by: o.createdBy || null,
  })
  let r = await call()
  if (!r.ok && r.reason === 'insufficient' && o.autoTopUp !== false) {
    const t = await maybeAutoTopUp(db, o.companyId, { needCents: Number(r.needed_cents) || quote.costCents, ...o.deps })
    if (t.ok) r = await call()
  }
  if (!r.ok) {
    // needed_cents is what the hold had to grow by; the shortfall is what the balance lacks.
    const shortfall = r.needed_cents != null ? Math.max(0, Number(r.needed_cents) - (Number(r.balance_cents) || 0)) : 0
    return { ok: false, reason: (r.reason as Refusal) || 'error', heldCents: Number(r.held_cents) || 0, balanceCents: Number(r.balance_cents) || quote.balanceCents, shortfallCents: shortfall || undefined, quote }
  }
  return { ok: true, heldCents: Number(r.held_cents) || 0, balanceCents: Number(r.balance_cents) || 0, quote }
}

/**
 * Charge a finished campaign for what it really sent and return the rest of
 * its hold. `partsSent` = parts actually sent (recipients sent × segments).
 * The parts quoted as free when it was reserved stay free; without a hold
 * (scheduled before the wallet existed) only this month's overage is charged.
 */
export async function settleCampaign(db: any, o: { companyId: string; campaignId: string; partsSent: number; createdBy?: string | null; deps?: AutoTopUpDeps }): Promise<{
  ok: boolean; reason?: Refusal; skipped?: 'unlimited' | 'not_set_up'; already?: boolean
  spentCents: number; shortfallCents: number; billableParts: number; freeParts: number; balanceCents: number
}> {
  const parts = Math.max(0, Math.floor(Number(o.partsSent) || 0))
  const { ready } = await readAccount(db, o.companyId)
  if (!ready) return { ok: true, skipped: 'not_set_up', spentCents: 0, shortfallCents: 0, billableParts: 0, freeParts: parts, balanceCents: 0 }
  let hold: any = null
  try { const { data } = await db.from('sms_credit_holds').select('*').eq('campaign_id', o.campaignId).maybeSingle(); hold = data || null } catch {}
  if (hold?.status === 'settled') {
    const w = await getWallet(db, o.companyId)
    return { ok: true, already: true, spentCents: Number(hold.settled_cents) || 0, shortfallCents: Number(hold.shortfall_cents) || 0, billableParts: 0, freeParts: 0, balanceCents: w.balanceCents }
  }
  const allowance = await allowanceStatus(db, o.companyId, { excludeCampaignId: o.campaignId })
  // Unlimited, allowance-only or switched off since it started: never charged.
  if (allowance.unlimited || !allowance.chargesCredit) {
    if (hold?.status === 'held') await releaseCampaign(db, { companyId: o.companyId, campaignId: o.campaignId, note: allowance.unlimited ? 'Unlimited texts: hold returned' : 'Not charged on this plan: hold returned' })
    return { ok: true, skipped: 'unlimited', spentCents: 0, shortfallCents: 0, billableParts: 0, freeParts: parts, balanceCents: (await getWallet(db, o.companyId)).balanceCents }
  }
  let freeParts: number
  if (hold?.status === 'held') freeParts = Math.min(parts, Math.max(0, Number(hold.free_parts) || 0))
  else {
    // No hold: usage already includes this campaign's parts, so what's over the
    // limit (up to this campaign's parts) is what it owes.
    const over = Math.max(0, allowance.used - allowance.limit)
    freeParts = parts - Math.min(parts, over)
  }
  const billableParts = parts - freeParts
  const pricing = await resolveSmsPricing(db, o.companyId)
  const { cents } = partsCostCents(pricing, billableParts, parts)
  const r = await rpc(db, 'sms_credit_settle', { p_company: o.companyId, p_campaign: o.campaignId, p_actual: cents, p_parts: billableParts, p_created_by: o.createdBy || null })
  if (!r.ok) return { ok: false, reason: (r.reason as Refusal) || 'error', spentCents: 0, shortfallCents: cents, billableParts, freeParts, balanceCents: 0 }
  if (!r.already) await maybeAutoTopUp(db, o.companyId, o.deps).catch(() => null)
  return { ok: true, already: !!r.already, spentCents: Number(r.spent_cents) || 0, shortfallCents: Number(r.shortfall_cents) || 0, billableParts, freeParts, balanceCents: Number(r.balance_cents) || 0 }
}

/** Return the whole hold of a campaign that was cancelled or couldn't start. */
export async function releaseCampaign(db: any, o: { companyId: string; campaignId: string; note?: string }): Promise<{ ok: boolean; releasedCents: number; balanceCents: number; reason?: Refusal }> {
  const r = await rpc(db, 'sms_credit_release', { p_company: o.companyId, p_campaign: o.campaignId, p_note: o.note || null })
  if (!r.ok) return { ok: r.reason === 'not_set_up', releasedCents: 0, balanceCents: 0, reason: r.reason }
  return { ok: true, releasedCents: Number(r.released_cents) || 0, balanceCents: Number(r.balance_cents) || 0 }
}

/**
 * Charge one text (or `parts` parts) BEFORE it goes out: free inside the
 * allowance, otherwise from credit. ok:false means don't send.
 */
export async function chargeSingleSend(db: any, o: { companyId: string; parts?: number; note?: string; createdBy?: string | null; autoTopUp?: boolean; deps?: AutoTopUpDeps }): Promise<{
  ok: boolean; reason?: Refusal; chargedCents: number; billableParts: number; balanceCents: number; ledgerId?: string
}> {
  const parts = Math.max(1, Math.floor(Number(o.parts) || 1))
  const quote = await quoteSend(db, o.companyId, parts)
  const blocked = policyRefusal(quote)
  if (blocked) return { ok: false, reason: blocked, chargedCents: 0, billableParts: blocked === 'limit' ? quote.billableParts : 0, balanceCents: quote.balanceCents }
  if (quote.unlimited || quote.billableParts === 0) return { ok: true, chargedCents: 0, billableParts: 0, balanceCents: quote.balanceCents }
  if (!quote.ready) return { ok: false, reason: 'not_set_up', chargedCents: 0, billableParts: quote.billableParts, balanceCents: 0 }
  const call = () => rpc(db, 'sms_credit_apply', {
    p_company: o.companyId, p_delta: -quote.costCents, p_kind: 'spend', p_campaign: null, p_payment_intent: null,
    p_session: null, p_note: o.note || 'Text sent', p_created_by: o.createdBy || null, p_parts: quote.billableParts,
  })
  let r = await call()
  if (!r.ok && r.reason === 'insufficient' && o.autoTopUp !== false) {
    const t = await maybeAutoTopUp(db, o.companyId, { needCents: quote.costCents, ...o.deps })
    if (t.ok) r = await call()
  }
  if (!r.ok) return { ok: false, reason: (r.reason as Refusal) || 'error', chargedCents: 0, billableParts: quote.billableParts, balanceCents: Number(r.balance_cents) || quote.balanceCents }
  if (o.autoTopUp !== false) await maybeAutoTopUp(db, o.companyId, o.deps).catch(() => null)
  return { ok: true, chargedCents: quote.costCents, billableParts: quote.billableParts, balanceCents: Number(r.balance_cents) || 0, ledgerId: r.ledger_id }
}

/** Give back what chargeSingleSend took when the carrier then refused the text. */
export async function refundSingleSend(db: any, o: { companyId: string; cents: number; parts?: number; note?: string }) {
  if (!(o.cents > 0)) return { ok: true, balanceCents: 0 }
  const r = await rpc(db, 'sms_credit_apply', { p_company: o.companyId, p_delta: Math.round(o.cents), p_kind: 'refund', p_campaign: null, p_payment_intent: null, p_session: null, p_note: o.note || 'Text not sent: credit returned', p_created_by: null, p_parts: o.parts ?? null })
  return { ok: !!r.ok, balanceCents: Number(r.balance_cents) || 0, reason: r.reason }
}

/** Credit a paid top-up. Idempotent on the payment intent and checkout session. */
export async function topUp(db: any, o: { companyId: string; amountCents: number; kind?: 'topup' | 'auto_topup'; paymentIntentId?: string | null; sessionId?: string | null; note?: string; createdBy?: string | null }): Promise<{ ok: boolean; already?: boolean; balanceCents: number; reason?: string }> {
  const r = await rpc(db, 'sms_credit_apply', {
    p_company: o.companyId, p_delta: Math.round(o.amountCents), p_kind: o.kind || 'topup', p_campaign: null,
    p_payment_intent: o.paymentIntentId || null, p_session: o.sessionId || null,
    p_note: o.note || (o.kind === 'auto_topup' ? 'Auto top-up' : 'Top-up by card'), p_created_by: o.createdBy || null, p_parts: null,
  })
  return { ok: !!r.ok, already: !!r.already, balanceCents: Number(r.balance_cents) || 0, reason: r.reason }
}

/**
 * Credit bought through the merchant's Shopify plan (lib/shopify-usage): one
 * billable event to Shopify, then the credit. The event goes first so nothing
 * is credited that Shopify refused; its key is the ledger's payment reference,
 * so the credit is recorded once however often it's retried. charged with
 * ok:false means Shopify has the charge but the credit couldn't be recorded
 * (logged for the Colvy team to add by hand).
 */
export async function shopifyTopUp(db: any, o: {
  companyId: string; amountCents: number; kind: 'topup' | 'auto_topup'; shopGid: string; createdBy?: string | null; at?: Date
  send?: AutoTopUpDeps['sendShopifyEvent']
}): Promise<{ ok: boolean; charged: boolean; balanceCents: number; key: string; error?: string }> {
  const usage = await import('@/lib/shopify-usage')
  const at = o.at || new Date()
  const key = usage.usageKey(o.kind === 'auto_topup' ? 'auto' : 'buy', o.companyId, at)
  const send = o.send || usage.sendBillingEvent
  const ev = await send({ shopGid: o.shopGid, value: usage.creditUnits(o.amountCents), key, at })
  if (!ev.ok) return { ok: false, charged: false, balanceCents: 0, key, error: ev.status === 0 ? 'Couldn’t reach Shopify. Try again in a minute.' : 'Shopify didn’t accept the charge. Try again in a minute.' }
  const note = o.kind === 'auto_topup' ? 'Auto top-up (billed through Shopify)' : 'Top-up (billed through Shopify)'
  let t: { ok: boolean; balanceCents: number; reason?: string } = { ok: false, balanceCents: 0 }
  for (let i = 0; i < 3 && !t.ok; i++) {
    t = await topUp(db, { companyId: o.companyId, amountCents: o.amountCents, kind: o.kind, paymentIntentId: `shopify:${key}`, note, createdBy: o.createdBy || null })
    if (!t.ok) await new Promise(r => setTimeout(r, 400 * (i + 1)))
  }
  if (!t.ok) console.error('[sms-credits] Shopify charged but credit not recorded', JSON.stringify({ companyId: o.companyId, amountCents: o.amountCents, key, reason: t.reason }))
  return { ok: t.ok, charged: true, balanceCents: t.balanceCents, key }
}

/** A platform admin's manual change (positive or negative), with the reason. */
export async function adjustBalance(db: any, o: { companyId: string; amountCents: number; reason: string; adminId?: string | null }) {
  const r = await rpc(db, 'sms_credit_apply', {
    p_company: o.companyId, p_delta: Math.round(o.amountCents), p_kind: 'adjustment', p_campaign: null,
    p_payment_intent: null, p_session: null, p_note: String(o.reason || '').slice(0, 300), p_created_by: o.adminId || null, p_parts: null,
  })
  return { ok: !!r.ok, balanceCents: Number(r.balance_cents) || 0, reason: r.reason as string | undefined }
}

/** Colvy's own Stripe client, or null when STRIPE_SECRET_KEY isn't set up. */
export async function platformStripe(): Promise<any | null> {
  if (!secretKeyOk(process.env)) return null
  const Stripe = (await import('stripe')).default
  return new Stripe(String(process.env.STRIPE_SECRET_KEY).trim(), { apiVersion: '2024-06-20' as any })
}

/**
 * Charge the saved card off-session when the balance is below the auto top-up
 * point (or a send needs more, `needCents`). One attempt at a time per company
 * (claimed on the account row) and idempotent at Stripe. Two failures in a row
 * switch auto top-up off and tell the owner.
 */
export async function maybeAutoTopUp(db: any, companyId: string, opts: AutoTopUpDeps & { needCents?: number } = {}): Promise<{ ran: boolean; ok: boolean; reason: string; balanceCents?: number; disabled?: boolean }> {
  const now = opts.now ? opts.now() : new Date()
  const { ready, row } = await readAccount(db, companyId)
  if (!ready) return { ran: false, ok: false, reason: 'not_set_up' }
  // The policy must allow it (top-ups and auto top-up on, a mode that uses credit).
  if (row?.auto_topup_enabled && !(await getSmsPolicy(db, companyId)).canAutoTopUp) return { ran: false, ok: false, reason: 'not_allowed' }
  // A workspace that uses Colvy through the Shopify app is billed through its
  // Shopify plan, never the card (App Store rule 1.2.1), even one saved before
  // it moved to Shopify. Only asked when auto top-up is on.
  const shop = row?.auto_topup_enabled
    ? await (opts.shopify || (async () => (await import('@/lib/shopify-usage')).shopifySmsBilling(db, companyId, { maxAgeMs: 24 * 60 * 60 * 1000 })))().catch(() => null)
    : null
  const d = autoTopUpDecision(row, now.getTime(), opts.needCents || 0, { viaShopify: !!shop?.ready })
  if (!d.go) return { ran: false, ok: false, reason: d.reason }
  if (shop && !shop.ready) return { ran: false, ok: false, reason: 'shopify_not_ready' }

  // Claim the attempt: only one request charges the card.
  const claimAt = now.toISOString()
  const cutoff = new Date(now.getTime() - 10 * 60 * 1000).toISOString()
  let claimed = false
  try {
    const { data } = await db.from('sms_credit_accounts').update({ auto_topup_pending_at: claimAt })
      .eq('company_id', companyId).or(`auto_topup_pending_at.is.null,auto_topup_pending_at.lt.${cutoff}`).select('company_id')
    claimed = Array.isArray(data) ? data.length > 0 : !!data
  } catch {}
  if (!claimed) return { ran: false, ok: false, reason: 'in_progress' }

  const amount = Number(row.auto_topup_amount_cents) || DEFAULT_AUTO_AMOUNT_CENTS
  const done = async () => {
    try {
      await db.from('sms_credit_accounts').update({
        auto_topup_failures: 0, auto_topup_last_error: null, auto_topup_last_attempt_at: now.toISOString(),
        auto_topup_pending_at: null, updated_at: now.toISOString(),
      }).eq('company_id', companyId)
    } catch {}
  }
  const fail = async (error: string) => {
    const patch = afterAutoTopUpFailure(row.auto_topup_failures, error, now)
    const { disabled, ...cols } = patch
    try { await db.from('sms_credit_accounts').update({ ...cols, updated_at: now.toISOString() }).eq('company_id', companyId) } catch {}
    if (disabled) {
      const notify = opts.notifyDisabled || notifyAutoTopUpDisabled
      await notify(db, companyId, error, { viaShopify: !!shop?.ready }).catch((e: any) => console.error('[sms-credits] notify failed', e?.message))
    }
    return { ran: true, ok: false, reason: 'failed', disabled }
  }
  if (shop?.ready) {
    const t = await shopifyTopUp(db, { companyId, amountCents: amount, kind: 'auto_topup', shopGid: shop.shopGid, at: now, send: opts.sendShopifyEvent })
    if (!t.ok && !t.charged) return fail(t.error || 'Shopify didn’t accept the charge.')
    await done()
    return { ran: true, ok: t.ok, reason: t.ok ? 'topped_up' : 'charged_not_recorded', balanceCents: t.balanceCents }
  }

  const stripe = opts.stripe || await platformStripe()
  if (!stripe) {
    await db.from('sms_credit_accounts').update({ auto_topup_pending_at: null }).eq('company_id', companyId)
    return { ran: false, ok: false, reason: 'billing_unavailable' }
  }
  let pi: any
  try {
    pi = await stripe.paymentIntents.create({
      amount, currency: 'aud',
      customer: row.stripe_customer_id, payment_method: row.stripe_payment_method_id,
      off_session: true, confirm: true,
      description: 'Colvy SMS credit (auto top-up)',
      metadata: { companyId, kind: 'sms_credit_auto' },
    }, { idempotencyKey: `sms-auto-topup:${companyId}:${claimAt}` })
  } catch (e: any) {
    return fail(cardErrorText(e))
  }
  if (pi?.status !== 'succeeded') return fail(pi?.status === 'requires_action' ? cardErrorText({ code: 'authentication_required' }) : 'The payment didn’t go through.')
  const t = await topUp(db, { companyId, amountCents: Number(pi.amount_received || pi.amount || amount), kind: 'auto_topup', paymentIntentId: pi.id })
  await done()
  // Charged but not recorded (database blip): the payment_intent.succeeded
  // webhook credits it, keyed on the same payment intent.
  return { ran: true, ok: t.ok, reason: t.ok ? 'topped_up' : 'charged_not_recorded', balanceCents: t.balanceCents }
}

/** The Billing page link for a company (its own subdomain when it has one). */
export async function billingUrl(db: any, companyId: string): Promise<{ url: string; name: string; ownerId: string | null }> {
  try {
    const { data } = await db.from('companies').select('name, slug, owner_id').eq('id', companyId).maybeSingle()
    return { url: data?.slug ? `https://${data.slug}.colvy.com/admin/billing#sms-credits` : 'https://colvy.com/admin/billing#sms-credits', name: data?.name || 'your business', ownerId: data?.owner_id || null }
  } catch { return { url: 'https://colvy.com/admin/billing#sms-credits', name: 'your business', ownerId: null } }
}

/** Email + bell to the owner: auto top-up failed twice and is now off. */
export async function notifyAutoTopUpDisabled(db: any, companyId: string, error: string, o: { viaShopify?: boolean } = {}): Promise<void> {
  const { url, name, ownerId } = await billingUrl(db, companyId)
  const w = await getWallet(db, companyId)
  const { smsAutoTopUpOffEmail } = await import('@/lib/colvy-account-emails')
  const mail = smsAutoTopUpOffEmail({ business: name, error, balanceCents: w.balanceCents, billingUrl: url, viaShopify: o.viaShopify })
  if (ownerId) {
    try {
      await db.from('notifications').insert({
        user_id: ownerId, company_id: companyId, type: 'sms', is_read: false,
        message: `Auto top-up for SMS credits is off: ${o.viaShopify ? 'Shopify didn’t accept two top-ups in a row' : 'the card payment failed twice'}. ${error} Top up from Billing to keep texts going.`,
      })
    } catch {}
  }
  const key = process.env.RESEND_API_KEY
  if (!key || !ownerId) return
  let email = ''
  try { const { data } = await db.auth.admin.getUserById(ownerId); email = data?.user?.email || '' } catch {}
  if (!email) return
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Colvy <noreply@updates.colvy.com>', to: [email], subject: mail.subject, html: mail.html, text: mail.text }),
  })
  if (!res.ok) console.error('[sms-credits] auto top-up email failed', res.status)
}

const sid = (v: any) => (typeof v === 'string' ? v : v?.id) || null

/**
 * checkout.session.completed with metadata.kind 'sms_credit': credit the paid
 * amount once (keyed on the session and its payment intent) and, when the
 * customer chose auto top-up, save the card and switch it on.
 * `retry` asks the webhook to answer 5xx so Stripe sends the event again.
 */
export async function handleSmsCreditCheckout(db: any, session: any, deps: { stripe?: any } = {}): Promise<{ ok: boolean; credited: boolean; retry?: boolean; reason?: string; balanceCents?: number }> {
  const meta = session?.metadata || {}
  const companyId = String(meta.companyId || '')
  if (meta.kind !== 'sms_credit' || !companyId) return { ok: false, credited: false, reason: 'not_sms_credit' }
  if (session.mode && session.mode !== 'payment') return { ok: false, credited: false, reason: 'not_payment' }
  if (session.payment_status !== 'paid') return { ok: true, credited: false, reason: 'unpaid' }
  if (String(session.currency || '').toLowerCase() !== 'aud') return { ok: false, credited: false, reason: 'currency' }
  const amount = Number(session.amount_total) || 0
  if (amount <= 0) return { ok: false, credited: false, reason: 'amount' }
  const piId = sid(session.payment_intent)
  const t = await topUp(db, { companyId, amountCents: amount, kind: 'topup', paymentIntentId: piId, sessionId: session.id, note: 'Top-up by card', createdBy: meta.userId || null })
  if (!t.ok) return { ok: false, credited: false, retry: true, reason: t.reason || 'error' }

  // Keep the Stripe customer for the next top-up; save the card when asked.
  const patch: Record<string, any> = {}
  const customer = sid(session.customer)
  if (customer) patch.stripe_customer_id = customer
  if (meta.saveCard === '1' && piId) {
    try {
      const stripe = deps.stripe || await platformStripe()
      const pi = stripe ? await stripe.paymentIntents.retrieve(piId, { expand: ['payment_method'] }) : null
      const pm = pi?.payment_method
      const pmId = sid(pm)
      if (pmId) {
        patch.stripe_payment_method_id = pmId
        patch.card_brand = pm?.card?.brand || null
        patch.card_last4 = pm?.card?.last4 || null
        patch.auto_topup_failures = 0
        patch.auto_topup_last_error = null
        const th = Number(meta.autoThreshold), am = Number(meta.autoAmount)
        const allowed = (await getSmsPolicy(db, companyId)).canAutoTopUp
        if (allowed && Number.isInteger(th) && th > 0 && Number.isInteger(am) && am > 0) {
          patch.auto_topup_enabled = true
          patch.auto_topup_threshold_cents = th
          patch.auto_topup_amount_cents = am
        }
      }
    } catch (e: any) { console.error('[sms-credits] could not save the card', e?.message) }
  }
  if (Object.keys(patch).length) {
    try { await db.from('sms_credit_accounts').update({ ...patch, updated_at: new Date().toISOString() }).eq('company_id', companyId) } catch {}
  }
  return { ok: true, credited: !t.already, balanceCents: t.balanceCents }
}

/** payment_intent.succeeded for an auto top-up: the backup that credits it if the charging request didn't. */
export async function handleSmsCreditPaymentIntent(db: any, pi: any): Promise<{ ok: boolean; credited: boolean; retry?: boolean; reason?: string }> {
  const meta = pi?.metadata || {}
  if (meta.kind !== 'sms_credit_auto' || !meta.companyId) return { ok: false, credited: false, reason: 'not_sms_credit' }
  if (pi.status !== 'succeeded' || String(pi.currency || '').toLowerCase() !== 'aud') return { ok: false, credited: false, reason: 'not_paid' }
  const t = await topUp(db, { companyId: String(meta.companyId), amountCents: Number(pi.amount_received || pi.amount) || 0, kind: 'auto_topup', paymentIntentId: pi.id })
  if (!t.ok) return { ok: false, credited: false, retry: true, reason: t.reason }
  return { ok: true, credited: !t.already }
}
