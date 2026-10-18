import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  resolveAudience, resolveAudienceCached, invalidateAudienceCache, audienceFilterProblem, emptyExcluded,
  AudienceFilter, AudienceResult, AUDIENCE_TYPE_KEYS,
} from '@/lib/campaign-audience'
import { smsAllowanceSummary } from '@/lib/sms-quota'
import { partsForRecipients, quoteCampaign, TOP_UP_PATH } from '@/lib/campaign-credits'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/** Counts and a short sample only — never the full recipient list. */
function summary(result: AudienceResult & { cached?: boolean }, channel: string) {
  return {
    ok: true,
    incomplete: result.incomplete || null,
    matched: result.matched,
    recipients: result.recipients.length,
    excludedTotal: result.excludedTotal,
    excluded: result.excluded,
    // A short preview so staff can sanity-check they've targeted who they meant.
    sample: result.recipients.slice(0, 8).map(r => ({
      name: r.name,
      destination: channel === 'email' ? r.email : r.phone,
    })),
    excludedSample: result.excludedContacts.slice(0, 8),
    cached: !!result.cached,
  }
}

/** Only the keys the resolver knows, with the right types. */
function cleanFilter(f: any): AudienceFilter | null {
  if (!f || typeof f !== 'object' || !AUDIENCE_TYPE_KEYS.includes(f.type)) return null
  const out: any = { type: f.type }
  if (typeof f.segment === 'string') out.segment = f.segment
  if (Array.isArray(f.contactIds)) out.contactIds = f.contactIds.filter((x: any) => typeof x === 'string').slice(0, 20000)
  if (typeof f.productQuery === 'string') out.productQuery = f.productQuery.slice(0, 120)
  if (Number.isFinite(Number(f.lapsedDays)) && f.lapsedDays != null) out.lapsedDays = Number(f.lapsedDays)
  if (typeof f.locationId === 'string') out.locationId = f.locationId
  if (Array.isArray(f.tags)) out.tags = f.tags.filter((x: any) => typeof x === 'string').slice(0, 100)
  if (typeof f.campaignId === 'string') out.campaignId = f.campaignId
  for (const k of ['minSpend', 'minOrders']) if (f[k] != null && f[k] !== '' && Number.isFinite(Number(f[k]))) out[k] = Number(f[k])
  for (const k of ['state', 'postcode']) if (typeof f[k] === 'string' && f[k].trim()) out[k] = f[k].trim()
  return out
}

/**
 * POST /api/campaigns/audience
 *
 * Who a campaign would reach. Three uses:
 *   { companyId, filter, channel }             — live preview while editing
 *                                                 (kept for a minute per filter)
 *   { companyId, campaignId, saved: true }     — the campaign's SAVED audience,
 *                                                 the one the sender will use,
 *                                                 plus the month's SMS allowance
 *   { companyId, campaignId, filter, save: true } — save the audience, then
 *                                                 answer as for saved
 * The recipient list itself is resolved again at send time, so a contact who
 * unsubscribes in between is still excluded.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { companyId, campaignId } = body || {}
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()
    // Workspace members only (this lists customers' contact details).
    if (!(await requireCompanyAccess(req, db, companyId)).ok) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // ── Live preview ───────────────────────────────────────────────────────
    if (!campaignId) {
      const channel = body.channel === 'email' ? 'email' : 'sms'
      const filter = cleanFilter(body.filter)
      if (!filter) return NextResponse.json({ error: 'Missing or unknown filter' }, { status: 400 })
      const result = await resolveAudienceCached(companyId, filter, channel, { db })
      return NextResponse.json(summary(result, channel))
    }

    const { data: campaign } = await db.from('campaigns')
      .select('id, company_id, channel, status, audience_type, audience_filter, message, attachments, sender_name')
      .eq('id', campaignId).eq('company_id', companyId).maybeSingle()
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    const channel = campaign.channel === 'email' ? 'email' : 'sms'
    // What the send would cost: the allowance first, then prepaid credit.
    // `message` lets the Review step quote the text on screen before it's saved.
    const creditFor = async (result: AudienceResult) => {
      if (channel !== 'sms' || !result.recipients.length) return null
      const msg = typeof body.message === 'string' ? body.message : campaign.message
      if (!String(msg || '').trim()) return null
      const { data: company } = await db.from('companies').select('name, slug').eq('id', companyId).maybeSingle()
      const parts = partsForRecipients({ ...campaign, message: msg }, company, result.recipients.map(r => r.name))
      const q = await quoteCampaign(db, companyId, campaignId, parts).catch(() => null)
      return q ? { ...q, topUpUrl: TOP_UP_PATH } : null
    }

    // ── Save ───────────────────────────────────────────────────────────────
    if (body.save) {
      if (['sending', 'sent'].includes(campaign.status)) {
        return NextResponse.json({ error: `This campaign is already ${campaign.status}` }, { status: 409 })
      }
      const filter = cleanFilter(body.filter)
      if (!filter) return NextResponse.json({ error: 'Missing or unknown filter' }, { status: 400 })
      const problem = audienceFilterProblem(filter)
      if (problem) return NextResponse.json({ error: problem, incomplete: problem }, { status: 400 })
      invalidateAudienceCache(companyId)
      const [result, allowance] = await Promise.all([
        resolveAudience(companyId, filter, channel, { db }),
        smsAllowanceSummary(db, companyId),
      ])
      const { error } = await db.from('campaigns').update({
        audience_type: filter.type,
        audience_filter: filter,
        audience_count: result.recipients.length,
        excluded_count: result.excludedTotal,
        updated_at: new Date().toISOString(),
      }).eq('id', campaignId).eq('company_id', companyId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ...summary(result, channel), saved: true, filter, allowance, credit: await creditFor(result) })
    }

    // ── The saved audience ─────────────────────────────────────────────────
    const saved = campaign.audience_filter
    const allowance = await smsAllowanceSummary(db, companyId)
    if (!saved?.type) {
      return NextResponse.json({
        ...summary({ recipients: [], matched: 0, excluded: emptyExcluded(channel), excludedTotal: 0, excludedContacts: [], incomplete: 'The audience hasn’t been saved yet. Choose who this goes to on the Audience step.' }, channel),
        filter: null, allowance,
      })
    }
    const result = await resolveAudienceCached(companyId, saved, channel, { db })
    return NextResponse.json({ ...summary(result, channel), filter: saved, allowance, credit: await creditFor(result) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
