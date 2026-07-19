import { createClient } from '@supabase/supabase-js'
import { resolveAudience, AudienceFilter, isValidAuMobile } from './campaign-audience'
import { renderVariables, analyseSms } from './sms-segments'
import { calculateCost, DEFAULT_PRICING, SmsPricing } from './sms-pricing'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/** Marketing messages are only sent between these hours, local time. */
export const QUIET_START = 9   // 9am
export const QUIET_END = 20    // 8pm

export function isWithinSendingHours(d = new Date(), tz = 'Australia/Melbourne'): boolean {
  try {
    const hour = parseInt(
      new Intl.DateTimeFormat('en-AU', { timeZone: tz, hour: 'numeric', hour12: false }).format(d), 10
    )
    return hour >= QUIET_START && hour < QUIET_END
  } catch {
    const h = d.getHours()
    return h >= QUIET_START && h < QUIET_END
  }
}

async function loadPricing(db: any, companyId: string): Promise<SmsPricing> {
  try {
    const { data } = await db.from('sms_pricing').select('*').eq('company_id', companyId).maybeSingle()
    if (!data) return DEFAULT_PRICING
    return {
      price_per_part: Number(data.price_per_part) || DEFAULT_PRICING.price_per_part,
      gst_rate: Number(data.gst_rate) ?? DEFAULT_PRICING.gst_rate,
      gst_inclusive: data.gst_inclusive !== false,
      carrier_cost: Number(data.carrier_cost) || DEFAULT_PRICING.carrier_cost,
      carrier_currency: data.carrier_currency || 'USD',
      fx_rate: Number(data.fx_rate) || DEFAULT_PRICING.fx_rate,
      volume_tiers: Array.isArray(data.volume_tiers) ? data.volume_tiers : DEFAULT_PRICING.volume_tiers,
    }
  } catch { return DEFAULT_PRICING }
}

/**
 * Freeze the recipient list for a campaign and mark it ready to send.
 *
 * The audience is resolved HERE, not when it was configured — someone who
 * unsubscribed between building the audience and pressing send is excluded.
 * Skipped contacts are written too, with their reason, so the report can
 * explain who was left out.
 *
 * Idempotent: a unique index on (campaign_id, contact_id) means re-running this
 * can't duplicate recipients, and it refuses to run on a campaign that has
 * already been sent.
 */
export async function prepareCampaign(companyId: string, campaignId: string) {
  const db = admin()

  const { data: campaign } = await db.from('campaigns')
    .select('*').eq('id', campaignId).eq('company_id', companyId).maybeSingle()
  if (!campaign) throw new Error('Campaign not found')

  if (['sending', 'sent'].includes(campaign.status)) {
    throw new Error(`This campaign is already ${campaign.status}`)
  }
  if (!campaign.message?.trim()) throw new Error('The campaign has no message')
  if (campaign.channel !== 'sms') {
    throw new Error(`Sending is only implemented for SMS, not ${campaign.channel}`)
  }

  // Re-resolve against live data.
  const filter: AudienceFilter = campaign.audience_filter?.type
    ? campaign.audience_filter
    : { type: campaign.audience_type || 'all_subscribed' }
  const audience = await resolveAudience(companyId, filter, 'sms')

  if (audience.recipients.length === 0) {
    throw new Error('No contacts match this audience — nothing would be sent')
  }

  // Write recipient rows. upsert + the unique index makes this safe to re-run.
  const rows = audience.recipients.map(r => ({
    campaign_id: campaignId,
    company_id: companyId,
    contact_id: r.contact_id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    status: 'pending',
  }))
  for (let i = 0; i < rows.length; i += 500) {
    await db.from('campaign_recipients')
      .upsert(rows.slice(i, i + 500), { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true })
  }

  // Record the excluded contacts and why.
  const skipRows = audience.excludedContacts.map(e => ({
    campaign_id: campaignId,
    company_id: companyId,
    contact_id: e.contact_id,
    name: e.name,
    status: 'skipped',
    skip_reason: e.reason,
  }))
  for (let i = 0; i < skipRows.length; i += 500) {
    await db.from('campaign_recipients')
      .upsert(skipRows.slice(i, i + 500), { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true })
  }

  const pricing = await loadPricing(db, companyId)
  const segments = analyseSms(campaign.message).segments || 1
  const costing = calculateCost(pricing, segments, audience.recipients.length)

  await db.from('campaigns').update({
    status: 'sending',
    recipients_total: audience.recipients.length,
    audience_count: audience.recipients.length,
    excluded_count: audience.excludedTotal,
    segments,
    price_per_part: costing.pricePerPart,
    estimated_cost: costing.totalIncGst,
    sent_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', campaignId)

  return {
    recipients: audience.recipients.length,
    excluded: audience.excludedTotal,
    excludedBreakdown: audience.excluded,
    segments,
    estimatedCost: costing.totalIncGst,
  }
}

/**
 * Send one batch of a campaign's pending recipients.
 *
 * Called repeatedly (by cron) rather than looping over thousands of recipients
 * in a single request, which would exceed the serverless timeout and leave a
 * half-sent campaign with no record of where it stopped.
 *
 * Each recipient is CLAIMED with a conditional update before sending, so two
 * overlapping processor runs can't send the same person twice.
 */
export async function processCampaignBatch(campaignId: string, batchSize = 60) {
  const db = admin()

  const { data: campaign } = await db.from('campaigns')
    .select('*').eq('id', campaignId).maybeSingle()
  if (!campaign) return { done: true, reason: 'not found' }
  if (campaign.status !== 'sending') return { done: true, reason: `status is ${campaign.status}` }

  // Quiet hours — checked on every batch, so a long send that runs past 8pm
  // pauses rather than continuing into the night.
  if (campaign.quiet_hours !== false) {
    if (!isWithinSendingHours(new Date(), campaign.timezone || 'Australia/Melbourne')) {
      return { done: false, paused: true, reason: 'outside sending hours' }
    }
  }

  const { data: pending } = await db.from('campaign_recipients')
    .select('*').eq('campaign_id', campaignId).eq('status', 'pending')
    .limit(Math.min(batchSize, campaign.rate_per_minute || 60))

  if (!pending || pending.length === 0) {
    // Nothing left — finalise.
    const { count: sentCount } = await db.from('campaign_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId).in('status', ['sent', 'delivered'])
    const { count: failedCount } = await db.from('campaign_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId).eq('status', 'failed')

    const pricing = await loadPricing(db, companyIdOf(campaign))
    const costing = calculateCost(pricing, campaign.segments || 1, sentCount || 0)

    await db.from('campaigns').update({
      status: 'sent',
      sent_count: sentCount || 0,
      failed_count: failedCount || 0,
      actual_cost: costing.totalIncGst,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', campaignId)
    return { done: true, sent: sentCount || 0, failed: failedCount || 0 }
  }

  const { data: company } = await db.from('companies')
    .select('name, slug').eq('id', campaign.company_id).maybeSingle()
  const atts = Array.isArray(campaign.attachments) ? campaign.attachments : []
  const primary = atts.find((a: any) => a.kind !== 'coupon')
  const cp = atts.find((a: any) => a.kind === 'coupon')
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || (company?.slug ? `https://${company.slug}.colvy.com` : 'https://colvy.com')

  let sent = 0
  let failed = 0

  for (const r of pending) {
    // Claim this recipient. If the conditional update matches nothing, another
    // processor already took it.
    const { data: claimed } = await db.from('campaign_recipients')
      .update({ status: 'sending' })
      .eq('id', r.id).eq('status', 'pending')
      .select('id')
    if (!claimed || claimed.length === 0) continue

    try {
      // Final consent check against live contact data. The audience was
      // resolved at prepare time; someone may have replied STOP since.
      if (r.contact_id) {
        const { data: ct } = await db.from('contacts')
          .select('is_blocked, subscribed_to_marketing, consent_basis, unsubscribed_at, phone')
          .eq('id', r.contact_id).maybeSingle()
        const blocked = ct?.is_blocked
          || ct?.unsubscribed_at
          || !ct?.subscribed_to_marketing
          || ct?.consent_basis === 'none'
        if (blocked) {
          await db.from('campaign_recipients').update({
            status: 'skipped',
            skip_reason: ct?.unsubscribed_at ? 'unsubscribed' : ct?.is_blocked ? 'blocked' : 'no_consent',
          }).eq('id', r.id)
          continue
        }
      }
      if (!isValidAuMobile(r.phone)) {
        await db.from('campaign_recipients')
          .update({ status: 'skipped', skip_reason: 'invalid_number' }).eq('id', r.id)
        continue
      }

      // Mint a tracked short link for this recipient, tagged with the campaign
      // so clicks land in both Link Reports and the campaign report.
      let shortLink = primary?.url || ''
      let linkId: string | null = null
      if (primary?.url) {
        try {
          const code = Math.random().toString(36).slice(2, 9)
          const { data: link } = await db.from('short_links').insert({
            company_id: campaign.company_id,
            code,
            target_url: primary.url,
            label: primary.label || null,
            campaign_id: campaignId,
            contact_id: r.contact_id || null,
            channel: 'sms',
            link_type: primary.kind || 'external',
            sent_by: campaign.created_by || null,
            location_id: campaign.location_id || null,
            clicks: 0,
          }).select('id, code').maybeSingle()
          if (link) {
            linkId = link.id
            shortLink = `${baseUrl}/l/${link.code}`
          }
        } catch { /* fall back to the plain URL */ }
      }

      const firstName = String(r.name || '').trim().split(/\s+/)[0] || 'there'
      const body = renderVariables(campaign.message, {
        first_name: firstName,
        store_name: company?.name || 'our store',
        outlet: campaign.sender_name || company?.name || 'our store',
        order_number: '',
        coupon_code: cp?.code ? String(cp.code).toUpperCase() : '',
        short_link: shortLink,
      })

      const res = await fetch(`${baseUrl}/api/telnyx/sms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: campaign.company_id,
          to: r.phone,
          text: body,
          senderName: campaign.sender_name || company?.name || null,
          skipChatMessage: true,
        }),
      })
      const data = await res.json().catch(() => ({}))

      if (res.ok) {
        await db.from('campaign_recipients').update({
          status: 'sent',
          provider_id: data?.id || data?.messageId || null,
          link_id: linkId,
          sent_at: new Date().toISOString(),
        }).eq('id', r.id)
        sent++
      } else {
        await db.from('campaign_recipients').update({
          status: 'failed',
          error: String(data?.error || 'Send failed').slice(0, 300),
        }).eq('id', r.id)
        failed++
      }
    } catch (e: any) {
      await db.from('campaign_recipients').update({
        status: 'failed',
        error: String(e.message || 'Unexpected error').slice(0, 300),
      }).eq('id', r.id)
      failed++
    }
  }

  // Keep running counters current so the report is useful mid-send.
  const { count: totalSent } = await db.from('campaign_recipients')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId).in('status', ['sent', 'delivered'])
  const { count: totalFailed } = await db.from('campaign_recipients')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId).eq('status', 'failed')
  await db.from('campaigns').update({
    sent_count: totalSent || 0,
    failed_count: totalFailed || 0,
    updated_at: new Date().toISOString(),
  }).eq('id', campaignId)

  return { done: false, sent, failed, batch: pending.length }
}

function companyIdOf(campaign: any) { return campaign.company_id }
