import { randomBytes } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { resolveAudience, audienceFilterProblem, AudienceFilter, isValidAuMobile, invalidateAudienceCache } from './campaign-audience'
import { renderVariables, sampleSegments } from './sms-segments'
import { calculateCost, SmsPricing, resolveSmsPricing } from './sms-pricing'
import { addSmsUsage, smsAllowanceSummary, allowanceProblem, SmsQuotaError } from './sms-quota'
import { resolveSmsSender, explainSmsFailure, smsParts, type SmsSender } from './sms-provider'
import { assertMayText } from './sms-consent'
import { toE164 } from './telnyx-service'
import { trackLinks } from './link-tracking'
import { isExternalSendBlocked, DEMO_BLOCK_MESSAGE } from './demo-guard'
import {
  partsForRecipients, campaignPartsSent, campaignHold, walletReady, holdForCampaign, extendCampaignHold,
  creditRefusalText, campaignVars, uuidOrNull, TOP_UP_PATH,
} from './campaign-credits'
import { settleCampaign, releaseCampaign, maybeAutoTopUp, type Refusal } from './sms-credits'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// A recipient whose opt-out can't be checked is retried by later batches, up
// to this many checks or this long, then skipped as 'unverified'.
export const UNVERIFIED_AFTER_TRIES = 3
export const UNVERIFIED_AFTER_MS = 24 * 3600_000

/** Marketing messages are only sent between these hours, local time. */
export const QUIET_START = 9   // 9am
export const QUIET_END = 20    // 8pm

/** The campaign worker's cron interval (vercel.json: every 2 minutes). */
export const CRON_EVERY_MINUTES = 2
/** Texts in flight at once within a batch. */
export const SEND_CONCURRENCY = 5
/** Stop taking new recipients this long into a run (the function limit is 60s). */
export const BATCH_BUDGET_MS = 45_000
/** A recipient left 'sending' this long (a run that timed out) is looked at again. */
export const STUCK_AFTER_MS = 10 * 60_000

export function isWithinSendingHours(d = new Date(), tz = 'Australia/Melbourne'): boolean {
  try {
    const hour = parseInt(
      new Intl.DateTimeFormat('en-AU', { timeZone: tz, hour: 'numeric', hour12: false }).format(d), 10
    ) % 24
    return hour >= QUIET_START && hour < QUIET_END
  } catch {
    const h = d.getHours()
    return h >= QUIET_START && h < QUIET_END
  }
}

/** Does this campaign's quiet-hours rule allow sending right now? */
export function campaignMaySendNow(campaign: any, now = new Date()): boolean {
  if (campaign?.quiet_hours === false) return true
  return isWithinSendingHours(now, campaign?.timezone || 'Australia/Melbourne')
}

/** How many recipients one worker run may send: a cron interval's worth at the campaign's rate. */
export function batchSizeFor(campaign: any, minutes = CRON_EVERY_MINUTES): number {
  const rate = Math.max(1, Number(campaign?.rate_per_minute) || 60)
  return rate * minutes
}

/** A problem the person who pressed send can fix (shown to them, word for word). */
export class CampaignNotReadyError extends Error {
  code: 'audience' | 'allowance' | 'message' | 'empty' | 'status' | 'credit' | 'plan'
  /** For the credit codes: the wallet's reason and what's missing (cents). */
  reason?: Refusal
  shortfallCents?: number
  constructor(code: CampaignNotReadyError['code'], message: string, extra: { reason?: Refusal; shortfallCents?: number } = {}) {
    super(message)
    this.name = 'CampaignNotReadyError'
    this.code = code
    this.reason = extra.reason
    this.shortfallCents = extra.shortfallCents
  }
  /** Payment needed (credit / plan / allowance) → the routes answer 402. */
  get paymentRequired() { return this.code === 'credit' || this.code === 'plan' || this.code === 'allowance' }
}

/** The JSON a route sends for a CampaignNotReadyError (fields only added, never renamed). */
export function notReadyBody(e: CampaignNotReadyError) {
  return {
    error: e.message, code: e.code,
    ...(e.reason ? { reason: e.reason } : {}),
    ...(e.shortfallCents != null ? { shortfallCents: e.shortfallCents } : {}),
    ...(e.paymentRequired ? { topUpUrl: TOP_UP_PATH } : {}),
  }
}

// Columns added by V394. Before it runs, an update naming one fails; the
// helper below retries without them so the campaign still moves on.
const V394_CAMPAIGN_COLS = ['status_reason', 'excluded_breakdown']
const missingColumn = (error: any, cols: string[]) => {
  const m = String(error?.message || '')
  return cols.find(c => m.includes(`'${c}'`) || m.includes(`"${c}"`) || new RegExp(`\\b${c}\\b`).test(m))
}

export async function updateCampaign(db: any, id: string, patch: Record<string, any>) {
  let p = { ...patch }
  for (let i = 0; i < V394_CAMPAIGN_COLS.length + 1; i++) {
    const { error } = await db.from('campaigns').update(p).eq('id', id)
    if (!error) return
    const col = missingColumn(error, V394_CAMPAIGN_COLS.filter(c => c in p))
    if (!col) return
    const { [col]: _drop, ...rest } = p
    p = rest
  }
}

/** Pause a campaign with a reason the editor shows. */
export async function pauseCampaign(db: any, id: string, reason: string) {
  await updateCampaign(db, id, { status: 'paused', status_reason: reason, updated_at: new Date().toISOString() })
}

async function loadPricing(db: any, companyId: string): Promise<SmsPricing> {
  // SMS pricing is a platform decision (super-admin global default), with an
  // optional per-company override. resolveSmsPricing handles that precedence.
  return resolveSmsPricing(db, companyId)
}

/**
 * The campaign's saved audience, or a CampaignNotReadyError.
 *
 * There is no fallback any more: a campaign with no saved filter used to go
 * to every subscribed contact (audience_type defaults to 'all_subscribed'),
 * whatever the editor had shown. Every campaign the builder creates saves its
 * filter when you leave the Audience step, so a missing one means the audience
 * was never chosen.
 */
export function savedFilterOf(campaign: any): AudienceFilter {
  const f = campaign?.audience_filter
  if (!f || typeof f !== 'object' || !f.type) {
    throw new CampaignNotReadyError('audience', 'Choose and save who this campaign goes to before sending it.')
  }
  const problem = audienceFilterProblem(f)
  if (problem) throw new CampaignNotReadyError('audience', `The saved audience isn’t finished: ${problem}`)
  return f as AudienceFilter
}

export interface Preflight {
  filter: AudienceFilter
  audience: Awaited<ReturnType<typeof resolveAudience>>
  segments: number
  /** Parts the send will really use (each recipient's own first name). */
  parts: number
  allowance: Awaited<ReturnType<typeof smsAllowanceSummary>>
  /** The credit hold (null when the plan is unlimited or nothing is billable). */
  heldCents: number
}

/**
 * Everything that must be true before a campaign may be scheduled or sent:
 * a message, a finished saved audience with someone in it, and the money for
 * every part of every message — the month's allowance first, then prepaid
 * credit, which is HELD for the campaign here (reserveForCampaign; calling it
 * again re-quotes the same hold). Throws CampaignNotReadyError with the words
 * to show. Before the wallet exists (V395) this is the allowance-only check.
 */
export async function preflightCampaign(db: any, companyId: string, campaign: any): Promise<Preflight> {
  if (!campaign?.message?.trim()) throw new CampaignNotReadyError('message', 'The campaign has no message')
  if ((campaign.channel || 'sms') !== 'sms') {
    throw new CampaignNotReadyError('message', `Sending is only implemented for SMS, not ${campaign.channel}`)
  }
  const filter = savedFilterOf(campaign)
  const [audience, allowance, company] = await Promise.all([
    resolveAudience(companyId, filter, 'sms', { db }),
    smsAllowanceSummary(db, companyId),
    db.from('companies').select('name, slug').eq('id', companyId).maybeSingle().then((r: any) => r?.data || null, () => null),
  ])
  if (audience.recipients.length === 0) {
    throw new CampaignNotReadyError('empty', 'No contacts match this audience — nothing would be sent')
  }
  const segments = sampleSegments(campaign.message)
  const parts = partsForRecipients(campaign, company, audience.recipients.map(r => r.name))
  const hold = await holdForCampaign(db, { companyId, campaignId: campaign.id, parts, createdBy: campaign.created_by_id })
  if (!hold.ok) {
    if (hold.reason === 'not_set_up') {
      // No wallet yet: today's rule, the allowance alone.
      throw new CampaignNotReadyError('allowance', allowanceProblem(allowance, parts) || creditRefusalText('not_set_up'), { reason: 'not_set_up' })
    }
    throw new CampaignNotReadyError(hold.reason === 'plan' ? 'plan' : 'credit', hold.message || creditRefusalText(hold.reason), { reason: hold.reason, shortfallCents: hold.shortfallCents || 0 })
  }
  return { filter, audience, segments, parts, allowance, heldCents: hold.heldCents || 0 }
}

/** Run async work over items, `n` at a time. */
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const x = items[i++]; await fn(x) }
  }))
}

/**
 * Freeze the recipient list for a campaign and mark it ready to send.
 *
 * The audience is resolved HERE, not when it was configured — someone who
 * unsubscribed between building the audience and pressing send is excluded.
 * Every skipped contact is written too, with its reason, so the report can
 * explain who was left out.
 *
 * Idempotent: a unique index on (campaign_id, contact_id) means re-running this
 * can't duplicate recipients, and it refuses to run on a campaign that has
 * already been sent.
 */
export async function prepareCampaign(companyId: string, campaignId: string, opts: { db?: any } = {}) {
  const db = opts.db || admin()

  const { data: campaign } = await db.from('campaigns')
    .select('*').eq('id', campaignId).eq('company_id', companyId).maybeSingle()
  if (!campaign) throw new Error('Campaign not found')

  if (['sending', 'sent'].includes(campaign.status)) {
    throw new Error(`This campaign is already ${campaign.status}`)
  }
  if (campaign.status === 'paused' && Number(campaign.recipients_total) > 0) {
    throw new CampaignNotReadyError('status', 'This campaign was paused part-way through. Resume it rather than starting again.')
  }

  // Re-quotes the hold made at scheduling with the real, frozen audience.
  let pf: Preflight
  try { pf = await preflightCampaign(db, companyId, campaign) }
  catch (e) {
    // Couldn't start: give back anything held for it.
    await releaseCampaign(db, { companyId, campaignId, note: 'Campaign couldn\u2019t start: hold returned' }).catch(() => null)
    throw e
  }
  const { audience, segments } = pf

  // Write recipient and skip rows. upsert + the unique index makes this safe
  // to re-run. A few chunks at a time rather than one after another.
  const now = new Date().toISOString()
  const rows: any[] = audience.recipients.map(r => ({
    campaign_id: campaignId, company_id: companyId, contact_id: r.contact_id,
    name: r.name, phone: r.phone, email: r.email, status: 'pending',
  }))
  const skipRows: any[] = audience.excludedContacts.map(e => ({
    campaign_id: campaignId, company_id: companyId, contact_id: e.contact_id,
    name: e.name, status: 'skipped', skip_reason: e.reason,
  }))
  const chunks: any[][] = []
  for (const list of [rows, skipRows]) for (let i = 0; i < list.length; i += 500) chunks.push(list.slice(i, i + 500))
  await pool(chunks, 4, async ch => {
    await db.from('campaign_recipients').upsert(ch, { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true })
  })

  const pricing = await loadPricing(db, companyId)
  const costing = calculateCost(pricing, segments, audience.recipients.length)

  await updateCampaign(db, campaignId, {
    status: 'sending',
    status_reason: null,
    recipients_total: audience.recipients.length,
    audience_count: audience.recipients.length,
    excluded_count: audience.excludedTotal,
    excluded_breakdown: audience.excluded,
    segments,
    price_per_part: costing.pricePerPart,
    estimated_cost: costing.totalIncGst,
    sent_at: now,
    updated_at: now,
  })
  invalidateAudienceCache(companyId)

  return {
    recipients: audience.recipients.length,
    excluded: audience.excludedTotal,
    excludedBreakdown: audience.excluded,
    segments,
    estimatedCost: costing.totalIncGst,
  }
}

/**
 * Carry on with a campaign that paused part-way (allowance used up, SMS not
 * set up …): checks the allowance covers what's still to go, then sets it
 * sending again.
 */
export async function resumeCampaign(companyId: string, campaignId: string, opts: { db?: any } = {}) {
  const db = opts.db || admin()
  const { data: campaign } = await db.from('campaigns')
    .select('*').eq('id', campaignId).eq('company_id', companyId).maybeSingle()
  if (!campaign) throw new Error('Campaign not found')
  if (campaign.status !== 'paused' || !(Number(campaign.recipients_total) > 0)) {
    throw new CampaignNotReadyError('status', 'Only a campaign paused part-way through can be resumed.')
  }
  const left: any[] = []
  for (let from = 0; from < 200000; from += 1000) {
    const { data } = await db.from('campaign_recipients').select('name')
      .eq('campaign_id', campaignId).in('status', ['pending', 'sending']).order('id', { ascending: true }).range(from, from + 999)
    left.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  const { data: company } = await db.from('companies').select('name, slug').eq('id', companyId).maybeSingle()
  const remainingParts = partsForRecipients(campaign, company, left.map(r => r.name))
  if (await walletReady(db, companyId)) {
    // Hold credit for what's left (the parts already sent stay as they were).
    const sentParts = await campaignPartsSent(db, campaign, company)
    const r = await extendCampaignHold(db, { companyId, campaignId, totalParts: sentParts + remainingParts, sentParts, createdBy: campaign.created_by_id })
    if (!r.ok) {
      if (r.reason !== 'not_set_up') {
        throw new CampaignNotReadyError(r.reason === 'plan' ? 'plan' : 'credit', (r.message || '').replace('This campaign needs', 'The rest of this campaign needs'), { reason: r.reason, shortfallCents: r.shortfallCents || 0 })
      }
    } else {
      await updateCampaign(db, campaignId, { status: 'sending', status_reason: null, updated_at: new Date().toISOString() })
      return { remaining: left.length }
    }
  }
  const allowance = await smsAllowanceSummary(db, companyId)
  const short = allowanceProblem(allowance, remainingParts)
  if (short) throw new CampaignNotReadyError('allowance', short.replace('This campaign needs', 'The rest of this campaign needs'), { reason: 'not_set_up' })
  await updateCampaign(db, campaignId, { status: 'sending', status_reason: null, updated_at: new Date().toISOString() })
  return { remaining: left.length }
}

/**
 * Stop a scheduled (or paused, not yet started) campaign, or delete a draft,
 * and give back any credit held for it.
 */
export async function cancelCampaign(companyId: string, campaignId: string, opts: { db?: any; remove?: boolean } = {}) {
  const db = opts.db || admin()
  const { data: campaign } = await db.from('campaigns')
    .select('id, status, recipients_total').eq('id', campaignId).eq('company_id', companyId).maybeSingle()
  if (!campaign) throw new Error('Campaign not found')
  const started = ['sending', 'sent'].includes(campaign.status) || Number(campaign.recipients_total) > 0
  if (started) throw new CampaignNotReadyError('status', 'This campaign has already started sending, so it can\u2019t be cancelled here.')
  const rel = await releaseCampaign(db, { companyId, campaignId, note: opts.remove ? 'Campaign deleted: hold returned' : 'Campaign unscheduled: hold returned' })
  if (opts.remove) await db.from('campaigns').delete().eq('id', campaignId).eq('company_id', companyId)
  else await updateCampaign(db, campaignId, { status: 'draft', status_reason: null, updated_at: new Date().toISOString() })
  return { releasedCents: rel.releasedCents || 0 }
}

/** A short-link code: 7 characters from a 62-letter alphabet (about 3.5 trillion). */
export function newLinkCode(len = 7): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) out += A[bytes[i] % A.length]
  return out
}

const isUniqueViolation = (e: any) => e?.code === '23505' || /duplicate key|unique constraint/i.test(String(e?.message || ''))

/**
 * Mint a tracked short link, trying a fresh code if one is already taken.
 * Returns null only if every attempt failed — the caller then holds the
 * recipient back rather than texting the raw, untracked URL.
 */
export async function mintShortLink(db: any, row: Record<string, any>, attempts = 5): Promise<{ id: string; code: string } | null> {
  for (let i = 0; i < attempts; i++) {
    const code = newLinkCode()
    const { data, error } = await db.from('short_links').insert({ ...row, code }).select('id, code').maybeSingle()
    if (!error && data) return data
    if (error && !isUniqueViolation(error)) return null
  }
  return null
}

const nextMonthStart = () => {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    .toLocaleDateString('en-AU', { day: 'numeric', month: 'long', timeZone: 'UTC' })
}

export interface BatchOptions {
  /** How many recipients this run may take (defaults to a cron interval's worth). */
  batchSize?: number
  /** Or: this many minutes' worth at the campaign's rate. */
  minutes?: number
  /** Absolute time (ms) after which no new recipient is started. */
  deadline?: number
  db?: any
  /** A provider sender, for tests; normally resolved for the company. */
  sender?: SmsSender | null
  concurrency?: number
  now?: () => number
}

/**
 * Send one batch of a campaign's pending recipients.
 *
 * Called repeatedly (by cron) rather than looping over thousands of recipients
 * in a single request, which would exceed the serverless timeout and leave a
 * half-sent campaign with no record of where it stopped.
 *
 * Each recipient is CLAIMED with a conditional update before sending, so two
 * overlapping processor runs can't send the same person twice. A run that
 * dies part-way leaves its claims in 'sending'; after STUCK_AFTER_MS they're
 * put back — unless a provider message id shows the text went.
 *
 * Texts go straight to the provider, SEND_CONCURRENCY at a time, each one's
 * parts reserved against the monthly allowance first. Running out pauses the
 * campaign (with the reason) rather than failing everyone left.
 */
export async function processCampaignBatch(campaignId: string, opts: BatchOptions | number = {}) {
  const o: BatchOptions = typeof opts === 'number' ? { batchSize: opts } : opts
  const db = o.db || admin()
  const now = o.now || Date.now
  const deadline = o.deadline ?? now() + BATCH_BUDGET_MS

  const { data: campaign } = await db.from('campaigns')
    .select('*').eq('id', campaignId).maybeSingle()
  if (!campaign) return { done: true, reason: 'not found' }
  if (campaign.status !== 'sending') return { done: true, reason: `status is ${campaign.status}` }
  const companyId = campaign.company_id

  // Quiet hours — checked on every batch (in the campaign's own time zone), so
  // a long send that runs past 8pm pauses rather than continuing into the night.
  if (!campaignMaySendNow(campaign, new Date(now()))) {
    return { done: false, paused: true, reason: 'outside sending hours' }
  }

  await reclaimStuck(db, campaign, now())

  const limit = Math.max(1, o.batchSize ?? batchSizeFor(campaign, o.minutes ?? CRON_EVERY_MINUTES))
  const { data: pending } = await db.from('campaign_recipients')
    .select('*').eq('campaign_id', campaignId).eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (!pending || pending.length === 0) {
    const fin = await finishIfDone(db, campaign)
    return fin.finished ? { done: true, sent: fin.sent, failed: fin.failed } : { done: false, waiting: fin.inFlight }
  }

  // Demo workspaces never text anyone.
  if (await isExternalSendBlocked(companyId, db)) {
    await pauseCampaign(db, campaignId, DEMO_BLOCK_MESSAGE)
    return { done: false, paused: true, reason: 'demo' }
  }
  const sender = o.sender !== undefined ? o.sender : await resolveSmsSender(db, companyId, { metered: false })
  if (!sender) {
    await pauseCampaign(db, campaignId, 'SMS isn’t set up for this workspace. Connect a texting number, then resume the campaign.')
    return { done: false, paused: true, reason: 'no sender' }
  }
  const allowance = await smsAllowanceSummary(db, companyId)
  if (!allowance.entitled) {
    await pauseCampaign(db, campaignId, 'SMS isn’t included in this plan. Upgrade to the Inbox or Everything plan, then resume the campaign.')
    return { done: false, paused: true, reason: 'plan' }
  }
  const { data: company } = await db.from('companies')
    .select('name, slug').eq('id', companyId).maybeSingle()

  // Paid for by a credit hold? Then the allowance doesn't stop it: every part
  // still counts against the month (atomically), the hold pays for the parts
  // beyond the allowance at settlement, and the only limit is the parts the
  // hold covers. Texts are never charged one by one here.
  // No hold (before the wallet exists, or a campaign started before it was
  // wired in): the allowance caps it, as before.
  const hold = allowance.unlimited ? null : await campaignHold(db, campaignId)
  const covered = hold?.status === 'held'
  const cap = allowance.unlimited || covered ? null : allowance.limit
  let budget = covered ? Math.max(0, (Number(hold.parts) || 0) - await campaignPartsSent(db, campaign, company)) : Infinity
  let creditStop = false
  const atts = Array.isArray(campaign.attachments) ? campaign.attachments : []
  const primary = atts.find((a: any) => a.kind !== 'coupon')
  const cp = atts.find((a: any) => a.kind === 'coupon')
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || (company?.slug ? `https://${company.slug}.colvy.com` : 'https://colvy.com')
  const statusCallback = sender.provider === 'twilio'
    ? `${(process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')}/api/twilio/webhook`
    : undefined

  let sent = 0, failed = 0, skipped = 0
  let stop: string | null = null
  let claimedAtOk = true

  const setRow = (id: string, patch: Record<string, any>) => db.from('campaign_recipients').update(patch).eq('id', id)

  const claim = async (id: string): Promise<boolean> => {
    if (claimedAtOk) {
      const { data, error } = await db.from('campaign_recipients')
        .update({ status: 'sending', claimed_at: new Date(now()).toISOString() })
        .eq('id', id).eq('status', 'pending').select('id')
      if (!error) return !!data?.length
      if (!missingColumn(error, ['claimed_at'])) return false
      claimedAtOk = false   // pre-V394
    }
    const { data } = await db.from('campaign_recipients')
      .update({ status: 'sending' }).eq('id', id).eq('status', 'pending').select('id')
    return !!data?.length
  }
  const release = (id: string, extra: Record<string, any> = {}) =>
    setRow(id, { status: 'pending', ...(claimedAtOk ? { claimed_at: null } : {}), ...extra })

  const one = async (r: any) => {
    if (stop || now() >= deadline) return
    if (!(await claim(r.id))) return
    let reserved = 0
    try {
      // Final consent check against live contact data. The audience was
      // resolved at prepare time; someone may have replied STOP since.
      if (r.contact_id) {
        const { data: ct } = await db.from('contacts')
          .select('is_blocked, subscribed_to_marketing, consent_basis, unsubscribed_at, phone')
          .eq('id', r.contact_id).maybeSingle()
        const blocked = ct?.is_blocked || ct?.unsubscribed_at || !ct?.subscribed_to_marketing || ct?.consent_basis === 'none'
        if (blocked) {
          await setRow(r.id, { status: 'skipped', skip_reason: ct?.unsubscribed_at ? 'unsubscribed' : ct?.is_blocked ? 'blocked' : 'no_consent' })
          skipped++
          return
        }
      }
      if (!isValidAuMobile(r.phone)) {
        await setRow(r.id, { status: 'skipped', skip_reason: 'invalid_number' })
        skipped++
        return
      }
      const to = toE164(r.phone || '') || r.phone

      // The opt-out guard every automated text passes (lib/sms-consent):
      // a STOP texted in, a block, or an opt-out on another contact with
      // this number.
      try { await assertMayText(db, companyId, to, r.contact_id || null) }
      catch (e: any) {
        if (e?.name !== 'SmsOptOutError') throw e
        if (e.reason !== 'unknown') {
          // A skip, not a failure, so the report counts it as unsubscribed.
          await setRow(r.id, { status: 'skipped', skip_reason: 'unsubscribed' })
          skipped++
          return
        }
        // Couldn't check the opt-out just now: back to pending, so a later batch
        // retries. Not for ever: after the 3rd failed check, or once they've
        // been waiting over a day (created_at), they're skipped as 'unverified'
        // so the campaign can finish. The count lives in `error`.
        const tries = (Number(/opt-out check failed (\d+)/.exec(String(r.error || ''))?.[1]) || 0) + 1
        const waitedTooLong = now() - Date.parse(r.created_at || '') > UNVERIFIED_AFTER_MS
        if (tries >= UNVERIFIED_AFTER_TRIES || waitedTooLong) {
          await setRow(r.id, { status: 'skipped', skip_reason: 'unverified', error: `opt-out check failed ${tries} times` })
          skipped++
        } else {
          await release(r.id, { error: `opt-out check failed ${tries} time${tries === 1 ? '' : 's'}` })
        }
        return
      }

      // A tracked short link for this recipient, tagged with the campaign so
      // clicks land in both Link Reports and the campaign report.
      let shortLink = ''
      let linkId: string | null = null
      if (primary?.url) {
        const link = await mintShortLink(db, {
          company_id: companyId,
          target_url: primary.url,
          label: primary.label || null,
          campaign_id: campaignId,
          contact_id: r.contact_id || null,
          channel: 'sms',
          link_type: primary.kind || 'external',
          sent_by: campaign.created_by || null,
          location_id: campaign.location_id || null,
          clicks: 0,
        })
        if (!link) {
          // Never text the raw URL in place of the tracked one: try again next run.
          await release(r.id, { error: 'Could not create the tracked link' })
          return
        }
        linkId = link.id
        shortLink = `${baseUrl}/l/${link.code}`
      }

      let body = renderVariables(campaign.message, campaignVars(campaign, company, r.name, shortLink))
      // Any other URL typed into the message becomes a tracked link too, as it
      // did when campaigns went through the SMS route. Fail-safe.
      try {
        body = (await trackLinks(body, { companyId, contactId: r.contact_id || undefined, channel: 'sms', sentBy: campaign.created_by || undefined, locationId: campaign.location_id || undefined })).text
      } catch { /* keep the body as is */ }

      // Reserve this text's parts against the month's allowance. Out of
      // allowance → the campaign pauses; this recipient waits, not fails.
      const parts = smsParts(body)
      if (covered) {
        // Past what the hold pays for (more parts than quoted): stop here.
        if (parts > budget) {
          await release(r.id)
          creditStop = true
          stop = 'This campaign has sent all the texts the credit held for it covers, so the rest are waiting \u2014 nobody was marked as failed. Top up SMS credit, then resume it.'
          return
        }
        budget -= parts
      }
      const res = await addSmsUsage(db, companyId, parts, cap)
      if (!res.ok) {
        if (covered) budget += parts
        await release(r.id)
        stop = `This month\u2019s SMS allowance (${(cap ?? 0).toLocaleString('en-AU')} texts) is used up, so the rest are waiting \u2014 nobody was marked as failed. Resume when it resets on ${nextMonthStart()}, or upgrade for more.`
        return
      }
      reserved = parts

      const result = await sender.send({ to, text: body, statusCallback })
      reserved = 0   // used
      await setRow(r.id, {
        status: 'sent',
        provider_id: result?.id || null,
        link_id: linkId,
        sent_at: new Date(now()).toISOString(),
        error: null,
      })
      sent++
    } catch (e: any) {
      if (reserved) {
        await addSmsUsage(db, companyId, -reserved).catch(() => null)
        if (covered) budget += reserved
      }
      if (e instanceof SmsQuotaError || e?.name === 'SmsQuotaError') {
        await release(r.id)
        stop = e.message
        return
      }
      await setRow(r.id, { status: 'failed', error: String(explainSmsFailure(e) || 'Send failed').slice(0, 300) })
      failed++
    }
  }

  await pool(pending, Math.max(1, o.concurrency ?? SEND_CONCURRENCY), one)

  if (stop) {
    // Out of held credit: try the saved card (auto top-up) so resuming works.
    if (creditStop) await maybeAutoTopUp(db, companyId).catch(() => null)
    await pauseCampaign(db, campaignId, stop)
    await refreshCounters(db, campaignId)
    return { done: false, paused: true, reason: stop, credit: creditStop || undefined, sent, failed, skipped, batch: pending.length }
  }

  const fin = await finishIfDone(db, campaign)
  if (fin.finished) return { done: true, sent: fin.sent, failed: fin.failed, batchSent: sent }
  await refreshCounters(db, campaignId)
  return { done: false, sent, failed, skipped, batch: pending.length, outOfTime: now() >= deadline }
}

/**
 * Put back recipients a dead run left in 'sending'.
 *
 * With V394's claimed_at, a claim older than STUCK_AFTER_MS is stale. Before
 * it, the campaign's updated_at (touched at the end of every run) stands in:
 * nothing has finished a run for that long. A row that already has a provider
 * message id was sent — the run died before marking it — so it's marked sent,
 * never sent again.
 */
export async function reclaimStuck(db: any, campaign: any, nowMs = Date.now()) {
  const cutoff = nowMs - STUCK_AFTER_MS
  // Nothing has finished a run of this campaign for that long either.
  const untouched = nowMs - (Date.parse(campaign.updated_at || '') || 0) >= STUCK_AFTER_MS
  let stuck: any[] = []
  const r1 = await db.from('campaign_recipients').select('id, provider_id, claimed_at')
    .eq('campaign_id', campaign.id).eq('status', 'sending').limit(1000)
  if (!r1.error) {
    // A claim from before V394 has no claimed_at: judged by the campaign instead.
    stuck = (r1.data || []).filter((s: any) => s.claimed_at ? Date.parse(s.claimed_at) < cutoff : untouched)
  } else if (missingColumn(r1.error, ['claimed_at'])) {
    if (!untouched) return { reclaimed: 0, markedSent: 0 }
    const r2 = await db.from('campaign_recipients').select('id, provider_id')
      .eq('campaign_id', campaign.id).eq('status', 'sending').limit(1000)
    stuck = r2.data || []
  }
  if (!stuck?.length) return { reclaimed: 0, markedSent: 0 }
  const went = stuck.filter(s => s.provider_id).map(s => s.id)
  const back = stuck.filter(s => !s.provider_id).map(s => s.id)
  for (let i = 0; i < went.length; i += 200) {
    await db.from('campaign_recipients').update({ status: 'sent' }).in('id', went.slice(i, i + 200)).eq('status', 'sending')
  }
  for (let i = 0; i < back.length; i += 200) {
    // Only rows still 'sending' — a run that's merely slow may have just finished one.
    await db.from('campaign_recipients').update({ status: 'pending' }).in('id', back.slice(i, i + 200)).eq('status', 'sending').is('provider_id', null)
  }
  return { reclaimed: back.length, markedSent: went.length }
}

/** Keep the running counters current so the report is useful mid-send. */
async function refreshCounters(db: any, campaignId: string) {
  const [{ count: totalSent }, { count: totalFailed }] = await Promise.all([
    db.from('campaign_recipients').select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId).in('status', ['sent', 'delivered']),
    db.from('campaign_recipients').select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId).eq('status', 'failed'),
  ])
  await db.from('campaigns').update({
    sent_count: totalSent || 0,
    failed_count: totalFailed || 0,
    updated_at: new Date().toISOString(),
  }).eq('id', campaignId)
  return { sent: totalSent || 0, failed: totalFailed || 0 }
}

/**
 * Mark the campaign sent — but only when nobody is left pending or mid-send.
 * (It used to finish as soon as one run found no pending rows, while another
 * run's claims were still 'sending'.)
 */
export async function finishIfDone(db: any, campaign: any): Promise<{ finished: boolean; inFlight: number; sent: number; failed: number; chargedCents?: number }> {
  const { count: left } = await db.from('campaign_recipients').select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id).in('status', ['pending', 'sending'])
  if ((left || 0) > 0) return { finished: false, inFlight: left || 0, sent: 0, failed: 0 }
  const { sent, failed } = await refreshCounters(db, campaign.id)
  // Mark it sent first (only one run wins), then settle: charge the credit for
  // what really went (parts the carrier accepted) and give back the rest.
  const { data: won } = await db.from('campaigns').update({
    status: 'sent',
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', campaign.id).eq('status', 'sending').select('id')
  if (!won?.length) return { finished: true, inFlight: 0, sent, failed }
  const { data: company } = await db.from('companies').select('name, slug').eq('id', campaign.company_id).maybeSingle()
  const partsSent = await campaignPartsSent(db, campaign, company)
  const settled = await settleCampaign(db, { companyId: campaign.company_id, campaignId: campaign.id, partsSent, createdBy: uuidOrNull(campaign.created_by_id) })
  let actual: number
  if (settled.ok && !settled.skipped) actual = (settled.spentCents || 0) / 100   // what was really charged
  else {
    // No wallet (or unlimited): the estimate at the campaign's rate, as before.
    const pricing = await loadPricing(db, campaign.company_id)
    actual = calculateCost(pricing, campaign.segments || 1, sent).totalIncGst
  }
  await db.from('campaigns').update({ actual_cost: actual }).eq('id', campaign.id)
  return { finished: true, inFlight: 0, sent, failed, chargedCents: settled.ok && !settled.skipped ? settled.spentCents : undefined }
}
