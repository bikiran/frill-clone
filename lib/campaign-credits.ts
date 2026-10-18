// Campaigns and the prepaid SMS credits wallet (lib/sms-credits.ts, V395).
//
//   Schedule / send: the campaign's estimated cost is HELD (reserveForCampaign)
//   — allowance first, then credit. Not enough credit → refused with the
//   shortfall. Re-calling re-quotes the same hold; it never holds twice.
//   Sending: each text counts against the month's usage (atomically, per part)
//   but is never charged on its own; a campaign covered by a hold isn't paused
//   for the allowance.
//   Finished: settleCampaign charges what was really sent and returns the rest.
//   Cancelled / couldn't start: releaseCampaign returns the hold.
//
// Before V395 runs the wallet answers ready:false / reason 'not_set_up', and
// campaigns keep the allowance-only rules (lib/sms-allowance).

import { renderVariables, analyseSms } from './sms-segments'
import { reserveForCampaign, quoteSend, allowanceStatus, costForParts, isMissingTable, maybeAutoTopUp, type Refusal } from './sms-credits'
import { fmtCents } from './sms-credits-core'

export const TOP_UP_PATH = '/admin/billing#sms-credits'

const URL_RE = /https?:\/\/[^\s<>"')]+/g

/** Where the campaign's tracked links live (the same rule as the sender). */
export function campaignBaseUrl(company: any): string {
  return process.env.NEXT_PUBLIC_APP_URL
    || (company?.slug ? `https://${company.slug}.colvy.com` : 'https://colvy.com')
}

/** The origin lib/short-link uses for a typed URL it shortens. */
function shortenOrigin(company: any): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
  try {
    const u = new URL(base)
    if (company?.slug && u.hostname.endsWith('colvy.com')) return `${u.protocol}//${company.slug}.colvy.com`
  } catch {}
  return base
}

/** The variables a recipient's text is rendered with. */
export function campaignVars(campaign: any, company: any, name: string | null, shortLink: string) {
  const atts = Array.isArray(campaign?.attachments) ? campaign.attachments : []
  const cp = atts.find((a: any) => a.kind === 'coupon')
  return {
    first_name: String(name || '').trim().split(/\s+/)[0] || 'there',
    store_name: company?.name || 'our store',
    outlet: campaign?.sender_name || company?.name || 'our store',
    order_number: '',
    coupon_code: cp?.code ? String(cp.code).toUpperCase() : '',
    short_link: shortLink,
  }
}

/**
 * Parts one recipient's text will be, without minting anything: the tracked
 * link and any typed URL (which the sender shortens) are stood in for by
 * placeholders of the same length, so the count matches what's sent.
 */
export function textPartsFor(campaign: any, company: any, name: string | null): number {
  const atts = Array.isArray(campaign?.attachments) ? campaign.attachments : []
  const primary = atts.find((a: any) => a.kind !== 'coupon')
  const link = primary?.url ? `${campaignBaseUrl(company)}/l/XXXXXXX` : ''
  let body = renderVariables(campaign?.message || '', campaignVars(campaign, company, name, link))
  const origin = shortenOrigin(company)
  body = body.replace(URL_RE, u => /\/(l|m)\/[A-Za-z0-9]+/.test(u) ? u : `${origin}/l/xxxxxxx`)
  return Math.max(1, analyseSms(body).segments || 1)
}

/** Total parts for a list of recipients (their names decide the first-name length). */
export function partsForRecipients(campaign: any, company: any, names: (string | null)[]): number {
  // Same name → same parts; most lists repeat first names a lot.
  const memo = new Map<string, number>()
  let total = 0
  for (const n of names) {
    const k = String(n || '').trim().split(/\s+/)[0] || ''
    let p = memo.get(k)
    if (p == null) { p = textPartsFor(campaign, company, k); memo.set(k, p) }
    total += p
  }
  return total
}

/** Parts the campaign has sent so far: rows the carrier accepted (they have a provider id). */
export async function campaignPartsSent(db: any, campaign: any, company: any): Promise<number> {
  const names: (string | null)[] = []
  const page = 1000
  for (let from = 0; from < 200000; from += page) {
    const { data, error } = await db.from('campaign_recipients').select('name')
      .eq('campaign_id', campaign.id).not('provider_id', 'is', null)
      .order('id', { ascending: true }).range(from, from + page - 1)
    if (error) break
    for (const r of data || []) names.push(r.name ?? null)
    if (!data || data.length < page) break
  }
  return partsForRecipients(campaign, company, names)
}

/** The campaign's hold, or null (no hold, or the wallet tables don't exist yet). */
export async function campaignHold(db: any, campaignId: string): Promise<any | null> {
  try {
    const { data, error } = await db.from('sms_credit_holds').select('*').eq('campaign_id', campaignId).maybeSingle()
    if (error) return null
    return data || null
  } catch { return null }
}

/** Is the wallet set up (V395 run)? */
export async function walletReady(db: any, companyId: string): Promise<boolean> {
  try {
    const { error } = await db.from('sms_credit_accounts').select('company_id').eq('company_id', companyId).maybeSingle()
    return !error || !isMissingTable(error)
  } catch (e) { return !isMissingTable(e) }
}

/** The words for a credit refusal, as the editor and the server show them. */
export function creditRefusalText(reason: Refusal | undefined, shortfallCents = 0, allowanceText?: string | null): string {
  if (reason === 'plan') return 'SMS isn’t on your plan. Upgrade to the Inbox or Everything plan to send text messages.'
  if (reason === 'insufficient') return `This campaign needs ${fmtCents(shortfallCents)} more SMS credit. Top up from Billing to send it.`
  if (reason === 'not_set_up') return allowanceText || 'Your monthly SMS allowance is used up. It resets at the start of next month, or upgrade for a higher allowance.'
  if (reason === 'settled') return 'This campaign has already been charged.'
  return 'Couldn’t check your SMS credit just now. Try again in a minute.'
}

export interface CampaignCreditQuote {
  ready: boolean
  entitled: boolean
  unlimited: boolean
  parts: number
  freeParts: number
  billableParts: number
  costCents: number
  balanceCents: number
  /** Credit already held for this campaign (counts towards what it can use). */
  heldCents: number
  affordable: boolean
  shortfallCents: number
  pricePerPart: number
}

/**
 * What a campaign of `parts` would cost from credit — for the Review step.
 * Credit already held for this campaign counts as available.
 */
export async function quoteCampaign(db: any, companyId: string, campaignId: string | null, parts: number): Promise<CampaignCreditQuote> {
  const [q, hold] = await Promise.all([
    quoteSend(db, companyId, parts, { excludeCampaignId: campaignId }),
    campaignId ? campaignHold(db, campaignId) : Promise.resolve(null),
  ])
  const heldCents = hold?.status === 'held' ? Number(hold.held_cents) || 0 : 0
  const available = q.balanceCents + heldCents
  const affordable = q.entitled && (q.unlimited || q.costCents === 0 || (q.ready && available >= q.costCents))
  return {
    ready: q.ready, entitled: q.entitled, unlimited: q.unlimited,
    parts: q.parts, freeParts: q.freeParts, billableParts: q.billableParts,
    costCents: q.costCents, balanceCents: q.balanceCents, heldCents,
    affordable, shortfallCents: affordable ? 0 : Math.max(0, q.costCents - available),
    pricePerPart: q.pricePerPart,
  }
}

/**
 * Hold credit for a campaign of `parts`. ok:false carries the reason, the
 * shortfall and the words to show. Unlimited plans, and sends the allowance
 * covers before the wallet exists, pass without a hold.
 */
export async function holdForCampaign(db: any, o: { companyId: string; campaignId: string; parts: number; createdBy?: string | null }) {
  const r = await reserveForCampaign(db, {
    companyId: o.companyId, campaignId: o.campaignId, parts: o.parts,
    createdBy: uuidOrNull(o.createdBy),
  })
  return { ...r, message: r.ok ? null : creditRefusalText(r.reason, r.shortfallCents || 0) }
}

/**
 * Make a campaign's hold cover `totalParts` in all, `sentParts` of which have
 * gone already — for resuming a campaign that ran past its hold, or one that
 * started before the wallet was wired in (no hold: what it sent so far went
 * out inside the allowance, so it stays free).
 *
 * The parts the original hold quoted as free stay free; extra parts are free
 * only while the allowance still has room.
 */
export async function extendCampaignHold(db: any, o: { companyId: string; campaignId: string; totalParts: number; sentParts: number; createdBy?: string | null }): Promise<{ ok: boolean; reason?: Refusal; shortfallCents?: number; heldCents?: number; message: string | null }> {
  const hold = await campaignHold(db, o.campaignId)
  if (hold?.status === 'settled') return { ok: false, reason: 'settled', message: creditRefusalText('settled') }
  const allowance = await allowanceStatus(db, o.companyId, { excludeCampaignId: o.campaignId })
  if (!allowance.entitled) return { ok: false, reason: 'plan', message: creditRefusalText('plan') }
  if (allowance.unlimited) return { ok: true, message: null }
  const total = Math.max(0, Math.floor(o.totalParts))
  const sent = Math.max(0, Math.min(total, Math.floor(o.sentParts)))
  const held = hold?.status === 'held'
  let free: number
  let usedAtReserve: number
  if (held) {
    free = Math.max(0, Number(hold.free_parts) || 0)
    usedAtReserve = Number(hold.used_at_reserve) || allowance.used
    // Parts beyond what the hold covered: free while the allowance has room
    // (less what this hold still claims from it).
    const ownClaim = Math.max(0, free - Math.max(0, allowance.used - usedAtReserve))
    const room = Math.max(0, allowance.remaining - ownClaim)
    const extra = Math.max(0, total - (Number(hold.parts) || 0))
    free += Math.min(extra, room)
  } else {
    free = sent + Math.min(total - sent, allowance.remaining)
    // The parts already sent are in this month's usage; counting them as used
    // at reserve time stops them being claimed from the allowance twice.
    usedAtReserve = Math.max(0, allowance.used - sent)
  }
  free = Math.min(free, total)
  const billable = total - free
  const { cents, pricePerPart } = await costForParts(db, o.companyId, billable, { tierParts: total })
  let r: any
  try {
    const { data, error } = await db.rpc('sms_credit_reserve', {
      p_company: o.companyId, p_campaign: o.campaignId, p_amount: cents, p_free_parts: free, p_parts: total,
      p_price_per_part: pricePerPart || null, p_period: hold?.period || allowance.period,
      p_used_at_reserve: usedAtReserve, p_created_by: uuidOrNull(o.createdBy),
    })
    r = error ? { ok: false, reason: isMissingTable(error) ? 'not_set_up' : 'error' } : (data || { ok: false, reason: 'error' })
  } catch (e) { r = { ok: false, reason: isMissingTable(e) ? 'not_set_up' : 'error' } }
  if (!r.ok && r.reason === 'insufficient') {
    const t = await maybeAutoTopUp(db, o.companyId, { needCents: Number(r.needed_cents) || cents }).catch(() => ({ ok: false }))
    if ((t as any).ok) return extendCampaignHold(db, o)
  }
  if (!r.ok) {
    const shortfall = Number(r.needed_cents) || 0
    return { ok: false, reason: r.reason, shortfallCents: shortfall, message: creditRefusalText(r.reason, shortfall) }
  }
  return { ok: true, heldCents: Number(r.held_cents) || cents, message: null }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** The ledger's created_by is a user id; a display name would make the function fail. */
export const uuidOrNull = (v: any) => (typeof v === 'string' && UUID_RE.test(v) ? v : null)
