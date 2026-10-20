// Changing a campaign's plan after it's queued (server only), the same way
// for SMS and email:
//
//   scheduleCampaign    queue it for a time, or move a scheduled one to
//                       another time (reschedule). The same checks as
//                       sending (lib/campaign-sender preflightCampaign /
//                       lib/campaign-email preflightEmailCampaign). Quiet
//                       hours work as they do for scheduling: a time outside
//                       9am–8pm (the campaign's time zone) is allowed, and
//                       the worker holds it until sending opens when the
//                       campaign has quiet hours on (`heldForSendingHours`).
//   unscheduleCampaign  back to a draft, content and audience kept. Anything
//                       prepared for it is released: SMS credit held for it,
//                       an email campaign's recipient list.
//   stopCampaign        stop one that's sending (or paused part-way): no more
//                       batches go, everyone not yet sent is marked
//                       'cancelled' (the report counts them apart from sent,
//                       failed and skipped), and an SMS campaign's credit is
//                       settled for what really went.
//
// Every status change is a compare-and-set on the status read
// (updateCampaignIf), so a campaign the worker started a moment ago can't be
// flipped back to a draft or rescheduled without anyone noticing: the caller
// gets a 409 that says it's sending and to use Stop sending instead. The
// worker's own start is a compare-and-set too (prepareCampaign /
// prepareEmailCampaign), so an unschedule that lands while it is writing the
// recipient list wins and nothing is sent.

import {
  CampaignNotReadyError, isWithinSendingHours, preflightCampaign, settleSmsCampaign, updateCampaignIf,
} from './campaign-sender'
import { isEmailCampaign, preflightEmailCampaign } from './campaign-email'
import { releaseCampaign } from './sms-credits'

/** A refusal with the words to show and the HTTP status to answer with. */
export class CampaignActionError extends Error {
  status: number
  constructor(message: string, status = 409) { super(message); this.name = 'CampaignActionError'; this.status = status }
}

/** Has it started sending (so only Stop sending applies)? */
export const hasStarted = (c: any) =>
  ['sending', 'sent', 'cancelled'].includes(c?.status) || (c?.status === 'paused' && Number(c?.recipients_total) > 0)

async function load(db: any, companyId: string, campaignId: string) {
  const { data } = await db.from('campaigns').select('*').eq('id', campaignId).eq('company_id', companyId).maybeSingle()
  if (!data) throw new CampaignActionError('Campaign not found', 404)
  return data
}

async function statusNow(db: any, campaignId: string): Promise<string | null> {
  const { data } = await db.from('campaigns').select('status').eq('id', campaignId).maybeSingle()
  return data?.status ?? null
}

const startedWords = (c: any) =>
  c.status === 'sent' ? 'This campaign has already been sent.'
    : c.status === 'cancelled' ? 'This campaign was stopped part-way, so it can’t be scheduled again. Create a new campaign to send it again.'
    : 'This campaign has already started sending. Use Stop sending to stop the rest.'

export type ScheduleResult = {
  channel: 'sms' | 'email'
  scheduledAt: string
  recipients: number
  parts?: number
  heldCents?: number
  /** Quiet hours are on and the time is outside them: it waits until sending opens. */
  heldForSendingHours: boolean
}

/** When a campaign scheduled for `at` would really start (quiet hours on, outside 9am–8pm → held). */
export function heldForSendingHours(campaign: any, at: Date): boolean {
  return campaign?.quiet_hours !== false && !isWithinSendingHours(at, campaign?.timezone || 'Australia/Melbourne')
}

/**
 * Queue a campaign for `at`. With `reschedule`, it must already be scheduled
 * (only its time changes; the checks run again). Throws CampaignNotReadyError
 * (a problem the owner fixes) or CampaignActionError.
 */
export async function scheduleCampaign(db: any, companyId: string, campaignId: string, at: Date, opts: { reschedule?: boolean; now?: number } = {}): Promise<ScheduleResult> {
  const now = opts.now ?? Date.now()
  if (isNaN(at.getTime())) throw new CampaignActionError('Pick a date and time first.', 400)
  if (at.getTime() < now - 60_000) throw new CampaignActionError('The scheduled time is in the past', 400)
  const campaign = await load(db, companyId, campaignId)
  if (hasStarted(campaign)) {
    // The words the schedule route has always used for these.
    throw new CampaignActionError(campaign.status === 'cancelled' || campaign.status === 'sent' ? startedWords(campaign)
      : `This campaign is already ${campaign.status === 'paused' ? 'part-way through' : campaign.status}`)
  }
  if (opts.reschedule && campaign.status !== 'scheduled') {
    throw new CampaignActionError('This campaign isn’t scheduled, so there’s no time to change. Schedule it from the Review step.')
  }
  const scheduledAt = at.toISOString()
  const updated_at = new Date(now).toISOString()
  let result: ScheduleResult
  let patch: Record<string, any>
  if (isEmailCampaign(campaign)) {
    // Email: its own checks (a designed email with a subject, someone
    // emailable); no SMS credit or allowance.
    const ep = await preflightEmailCampaign(db, companyId, campaign)
    patch = { status: 'scheduled', status_reason: null, scheduled_at: scheduledAt, audience_count: ep.audience.recipients.length, excluded_count: ep.audience.excludedTotal, updated_at }
    result = { channel: 'email', scheduledAt, recipients: ep.audience.recipients.length, heldForSendingHours: heldForSendingHours(campaign, at) }
  } else {
    const pf = await preflightCampaign(db, companyId, campaign)
    patch = { status: 'scheduled', status_reason: null, scheduled_at: scheduledAt, audience_count: pf.audience.recipients.length, excluded_count: pf.audience.excludedTotal, segments: pf.segments, updated_at }
    result = { channel: 'sms', scheduledAt, recipients: pf.audience.recipients.length, parts: pf.parts, heldCents: pf.heldCents, heldForSendingHours: heldForSendingHours(campaign, at) }
  }
  if (!(await updateCampaignIf(db, campaignId, [campaign.status], patch))) {
    const live = await statusNow(db, campaignId)
    if (live === 'sending' || live === 'sent') throw new CampaignActionError('It started sending a moment ago, so its time can’t be changed. Use Stop sending to stop the rest.')
    throw new CampaignActionError('This campaign changed while you were scheduling it. Reload the page and try again.')
  }
  return result
}

export type UnscheduleResult = { already?: boolean; releasedCents: number; releasedRecipients: number; channel: 'sms' | 'email' }

/** A scheduled (or paused, not yet started) campaign back to a draft; anything held for it released. */
export async function unscheduleCampaign(db: any, companyId: string, campaignId: string): Promise<UnscheduleResult> {
  const campaign = await load(db, companyId, campaignId)
  const channel = isEmailCampaign(campaign) ? 'email' : 'sms'
  if (hasStarted(campaign)) throw new CampaignActionError(campaign.status === 'cancelled' ? 'This campaign was stopped part-way, so there’s nothing to unschedule.' : startedWords(campaign))
  if (campaign.status === 'draft') return { already: true, releasedCents: 0, releasedRecipients: 0, channel }
  const won = await updateCampaignIf(db, campaignId, [campaign.status], { status: 'draft', status_reason: null, updated_at: new Date().toISOString() })
  if (!won) {
    const live = await statusNow(db, campaignId)
    if (live === 'draft') return { already: true, releasedCents: 0, releasedRecipients: 0, channel }
    if (live === 'sending' || live === 'sent') throw new CampaignActionError('It started sending a moment ago, so it can’t be unscheduled. Use Stop sending to stop the rest.')
    throw new CampaignActionError('This campaign changed while you were unscheduling it. Reload the page and try again.')
  }
  let releasedCents = 0, releasedRecipients = 0
  if (channel === 'email') {
    // A list a start had begun writing (it undoes its own, too): nothing was
    // sent from it, since the campaign never reached 'sending'.
    const { data } = await db.from('email_campaign_recipients').delete().eq('campaign_id', campaignId).in('status', ['pending', 'skipped']).select('id')
    releasedRecipients = data?.length || 0
  }
  // SMS credit held for it (email never holds any; harmless if nothing is held).
  const rel = await releaseCampaign(db, { companyId, campaignId, note: 'Campaign unscheduled: hold returned' }).catch(() => ({ releasedCents: 0 }))
  releasedCents = rel.releasedCents || 0
  return { releasedCents, releasedRecipients, channel }
}

export type StopResult = { already?: boolean; channel: 'sms' | 'email'; sent: number; failed: number; cancelled: number; inFlight: number; chargedCents?: number }

const recipientsTable = (channel: 'sms' | 'email') => channel === 'email' ? 'email_campaign_recipients' : 'campaign_recipients'

async function tally(db: any, channel: 'sms' | 'email', campaignId: string) {
  const count = async (statuses: string[]) => {
    const { count: c } = await db.from(recipientsTable(channel)).select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId).in('status', statuses)
    return c || 0
  }
  const [sent, failed, cancelled, inFlight] = await Promise.all([
    count(channel === 'email' ? ['sent'] : ['sent', 'delivered']), count(['failed']), count(['cancelled']), count(['sending']),
  ])
  return { sent, failed, cancelled, inFlight }
}

/**
 * Stop a campaign that's sending (or paused part-way). Nobody else is sent
 * to: everyone still waiting is marked 'cancelled'. A batch already in flight
 * finishes the few it has claimed (they're counted as sent if they went) and
 * then stops. `by` goes in the reason the report shows.
 */
export async function stopCampaign(db: any, companyId: string, campaignId: string, opts: { by?: string | null } = {}): Promise<StopResult> {
  const campaign = await load(db, companyId, campaignId)
  const channel = isEmailCampaign(campaign) ? 'email' : 'sms'
  if (campaign.status === 'cancelled') return { already: true, channel, ...(await tally(db, channel, campaignId)) }
  if (campaign.status === 'sent') throw new CampaignActionError('This campaign has already finished sending.')
  if (!hasStarted(campaign)) throw new CampaignActionError('This campaign hasn’t started sending. Unschedule it instead.')
  const nowIso = new Date().toISOString()
  const won = await updateCampaignIf(db, campaignId, ['sending', 'paused'], {
    status: 'cancelled', status_reason: `Stopped part-way${opts.by ? ` by ${String(opts.by).slice(0, 80)}` : ''}.`, completed_at: nowIso, updated_at: nowIso,
  })
  if (!won) {
    const live = await statusNow(db, campaignId)
    if (live === 'cancelled') return { already: true, channel, ...(await tally(db, channel, campaignId)) }
    if (live === 'sent') throw new CampaignActionError('It finished sending before it could be stopped.')
    throw new CampaignActionError('This campaign changed while you were stopping it. Reload the page and try again.')
  }
  // Everyone still waiting: not sent. (A batch in flight claims rows one by
  // one / per 100 with "still pending", so it can't take these now.)
  await db.from(recipientsTable(channel)).update({ status: 'cancelled', skip_reason: 'cancelled' }).eq('campaign_id', campaignId).eq('status', 'pending')
  const t = await tally(db, channel, campaignId)
  await db.from('campaigns').update({ sent_count: t.sent, failed_count: t.failed, updated_at: nowIso }).eq('id', campaignId)
  let chargedCents: number | undefined
  if (channel === 'sms') {
    // Charge the credit for what went and give back the rest of the hold.
    try { chargedCents = (await settleSmsCampaign(db, campaign, t.sent)).chargedCents } catch (e) { console.error('[campaign stop] settling failed', campaignId, e) }
  }
  return { channel, ...t, chargedCents }
}

export { CampaignNotReadyError }
