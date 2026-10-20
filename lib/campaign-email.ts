// The campaign wizard's email channel (server only): what the SMS sender's
// preflight / prepare are for texts, for email. The sending itself is
// lib/email-campaign-sender (prepareEmailCampaign, sendEmailBatch).
//
// Email campaigns never touch SMS credit or the SMS allowance: no hold, no
// per-part usage. Resend batches set the pace (100 an API call), and quiet
// hours apply only when the campaign has them switched on.

import { createClient } from '@supabase/supabase-js'
import { resolveAudience, type AudienceFilter } from './campaign-audience'
import { CampaignNotReadyError, CampaignStateChangedError, savedFilterOf, updateCampaign } from './campaign-sender'
import { prepareEmailCampaign, sendEmailBatch, type SenderDeps } from './email-campaign-sender'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export const isEmailCampaign = (c: any) => String(c?.channel || 'sms') === 'email'

/** The campaign's email design (email_designs.campaign_id), or null. Before V396: null. */
export async function campaignDesign(db: any, companyId: string, campaignId: string): Promise<any | null> {
  try {
    const { data, error } = await db.from('email_designs').select('*')
      .eq('campaign_id', campaignId).eq('company_id', companyId)
      .order('updated_at', { ascending: false }).limit(1)
    if (error) return null
    return data?.[0] || null
  } catch { return null }
}

export interface EmailPreflight {
  filter: AudienceFilter
  audience: Awaited<ReturnType<typeof resolveAudience>>
  design: any
}

/**
 * What must be true before an email campaign may be scheduled or sent: a
 * finished saved audience with someone emailable in it, and a designed email
 * with a subject. Throws CampaignNotReadyError with the words to show.
 */
export async function preflightEmailCampaign(db: any, companyId: string, campaign: any): Promise<EmailPreflight> {
  if (!isEmailCampaign(campaign)) throw new CampaignNotReadyError('message', 'This isn’t an email campaign')
  const filter = savedFilterOf(campaign)
  const design = await campaignDesign(db, companyId, campaign.id)
  if (!design?.design?.blocks?.length) throw new CampaignNotReadyError('message', 'Design the email first: it has no content yet.')
  if (!String(design.subject || '').trim()) throw new CampaignNotReadyError('message', 'The email has no subject line.')
  const audience = await resolveAudience(companyId, filter, 'email', { db })
  if (audience.recipients.length === 0) {
    throw new CampaignNotReadyError('empty', 'Nobody in this audience can be emailed: nothing would be sent')
  }
  return { filter, audience, design }
}

/** Merge values a campaign adds to each email (coupon from the campaign, outlet = sender name). */
function campaignMerge(campaign: any): Record<string, string> {
  const atts = Array.isArray(campaign?.attachments) ? campaign.attachments : []
  const cp = atts.find((a: any) => a.kind === 'coupon')
  return { coupon_code: cp?.code ? String(cp.code).toUpperCase() : '', outlet: campaign?.sender_name || '' }
}

/**
 * Freeze an email campaign's audience and email and mark it sending (the
 * email counterpart of prepareCampaign). The audience is resolved again
 * here, against live consent and the suppression list.
 */
export async function startEmailCampaign(companyId: string, campaignId: string, opts: { db?: any; deps?: SenderDeps; expectStatus?: string[] } = {}) {
  const db = opts.db || admin()
  const { data: campaign } = await db.from('campaigns')
    .select('*').eq('id', campaignId).eq('company_id', companyId).maybeSingle()
  if (!campaign) throw new Error('Campaign not found')
  // The worker starts only what is still scheduled (it may have been
  // unscheduled since the worker listed it).
  if (opts.expectStatus && !opts.expectStatus.includes(campaign.status)) {
    throw new CampaignStateChangedError(`This campaign is ${campaign.status === 'draft' ? 'no longer scheduled' : `now ${campaign.status}`}, so it wasn\u2019t started.`)
  }
  if (['sending', 'sent'].includes(campaign.status)) throw new Error(`This campaign is already ${campaign.status}`)
  if (campaign.status === 'cancelled') throw new CampaignNotReadyError('status', 'This campaign was stopped part-way, so it can\u2019t be sent again. Create a new campaign to send it again.')
  const { audience } = await preflightEmailCampaign(db, companyId, campaign)
  const merge = campaignMerge(campaign)
  let prepared
  try {
    prepared = await prepareEmailCampaign(companyId, campaignId, audience.recipients.map(r => ({
      contact_id: r.contact_id, email: r.email, name: r.name, merge,
    })), { ...(opts.deps || {}), db, expectStatus: [campaign.status] })
  } catch (e: any) {
    if (e instanceof CampaignStateChangedError) throw e
    // The sender's refusals are written for people ("The email has no subject line").
    if (/already/i.test(e?.message || '')) throw e
    throw new CampaignNotReadyError('message', e?.message || 'Couldn’t prepare the email')
  }
  // Who was left out, by reason: the audience's exclusions plus anyone the
  // sender's live check dropped.
  const breakdown: Record<string, number> = { ...audience.excluded }
  for (const [k, n] of Object.entries(prepared.skippedBreakdown || {})) {
    const key = k === 'invalid_email' ? 'no_email' : k
    breakdown[key] = (breakdown[key] || 0) + Number(n || 0)
  }
  await updateCampaign(db, campaignId, {
    excluded_count: audience.excludedTotal + prepared.skipped,
    excluded_breakdown: breakdown,
    status_reason: null,
  })
  return { recipients: prepared.recipients, excluded: audience.excludedTotal + prepared.skipped, excludedBreakdown: breakdown, sender: prepared.sender }
}

/** One run of the email sender within a time budget (ms from now). */
export function emailBatch(campaignId: string, budgetMs: number, deps: SenderDeps = {}) {
  return sendEmailBatch(campaignId, { ...deps, budgetMs: Math.max(5_000, budgetMs) })
}
