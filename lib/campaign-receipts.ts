// Delivery receipts for campaign texts (Twilio status callbacks, Telnyx
// message.finalized events).
//
// Each receipt used to run two exact COUNT queries over the campaign's
// recipients to refresh delivered_count / failed_count — for a 9,000-text
// campaign that's 18,000 full counts as the receipts pour in. Now the
// recipient's own change decides the counters: one row read, one conditional
// update, one increment.

import { isMissingRpc } from './sms-quota'

/**
 * Add to a campaign's delivered / failed counters.
 *
 * campaign_bump_counts() (V394) does it in one UPDATE … SET n = n + d. Before
 * the migration, read-then-write: two small queries, still no COUNT. The
 * worker's per-batch recount puts any drift right.
 */
export async function bumpCampaignCounts(db: any, campaignId: string, delivered: number, failed: number) {
  if (!delivered && !failed) return
  if (typeof db?.rpc === 'function') {
    try {
      const { error } = await db.rpc('campaign_bump_counts', { p_campaign: campaignId, p_delivered: delivered, p_failed: failed })
      if (!error) return
      if (!isMissingRpc(error)) return
    } catch (e) { if (!isMissingRpc(e)) return }
  }
  const { data: c } = await db.from('campaigns').select('delivered_count, failed_count').eq('id', campaignId).maybeSingle()
  if (!c) return
  await db.from('campaigns').update({
    delivered_count: Math.max(0, (Number(c.delivered_count) || 0) + delivered),
    failed_count: Math.max(0, (Number(c.failed_count) || 0) + failed),
  }).eq('id', campaignId)
}

/**
 * Record a final delivery status against the campaign recipient with this
 * provider message id. Returns what changed (null when nothing did — not a
 * campaign text, or a repeat of a receipt already applied).
 */
export async function applyDeliveryReceipt(
  db: any, providerId: string, outcome: 'delivered' | 'failed', errText?: string | null
): Promise<{ campaignId: string; from: string; to: string } | null> {
  if (!providerId) return null
  const { data: rec } = await db.from('campaign_recipients')
    .select('id, campaign_id, status').eq('provider_id', providerId).maybeSingle()
  if (!rec?.id || rec.status === outcome) return null
  // Conditional on the status we read, so two receipts racing can't both count.
  const { data: changed } = await db.from('campaign_recipients').update({
    status: outcome,
    delivered_at: outcome === 'delivered' ? new Date().toISOString() : null,
    error: outcome === 'failed' ? String(errText || 'failed').slice(0, 300) : null,
  }).eq('id', rec.id).eq('status', rec.status).select('id')
  if (!changed?.length) return null
  if (rec.campaign_id) {
    const d = (outcome === 'delivered' ? 1 : 0) - (rec.status === 'delivered' ? 1 : 0)
    const f = (outcome === 'failed' ? 1 : 0) - (rec.status === 'failed' ? 1 : 0)
    await bumpCampaignCounts(db, rec.campaign_id, d, f)
  }
  return { campaignId: rec.campaign_id, from: rec.status, to: outcome }
}
