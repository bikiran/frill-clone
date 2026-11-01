import { NextRequest, NextResponse } from 'next/server'
import { requireCompanyAccess } from '@/lib/company-access'
import { guardAiRequest } from '@/lib/rate-limit'
import { emailAdminDb } from '@/lib/email-db'
import { loadEmailBrand } from '@/lib/email-brand'
import { campaignInsights } from '@/lib/campaign-insights'
import { buildCampaignPlan, productCandidates, type AiChannel, type AiPlan, type AiProduct, type PastCampaign } from '@/lib/ai-campaign'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// POST /api/campaigns/ai-build
// { companyId, prompt, channel: 'sms' | 'email' | 'both', previous?, change? }
// → { ok, plan } — a campaign to review (lib/ai-campaign). Nothing is created
// or sent; the browser makes the draft. Workspace staff, on an AI plan.

// How recent campaigns did, per business, for a few minutes (a follow-up
// shouldn't re-read every campaign).
const pastCache = new Map<string, { at: number; past: PastCampaign[] }>()
const PAST_TTL = 5 * 60_000

async function recentCampaigns(db: any, companyId: string): Promise<PastCampaign[]> {
  const hit = pastCache.get(companyId)
  if (hit && Date.now() - hit.at < PAST_TTL) return hit.past
  let past: PastCampaign[] = []
  try {
    const ins = await campaignInsights(companyId, 365, db)
    const recent = ins.campaigns.slice(0, 12)
    const ids = recent.filter(c => c.channel === 'sms').map(c => c.id)
    const messages = new Map<string, string>()
    if (ids.length) {
      const { data } = await db.from('campaigns').select('id, message').in('id', ids)
      for (const r of data || []) if (r.message) messages.set(r.id, r.message)
    }
    past = recent.map(c => ({ id: c.id, name: c.name, channel: c.channel, clickRate: c.clickRate, revenue: c.revenue, sent: c.sent, message: messages.get(c.id) || null }))
  } catch { past = [] }
  pastCache.set(companyId, { at: Date.now(), past })
  return past
}

export async function POST(req: NextRequest) {
  let body: any = {}
  try { body = await req.json() } catch {}
  const companyId = String(body.companyId || '')
  const prompt = String(body.prompt || '').trim()
  const channel: AiChannel = ['sms', 'email', 'both'].includes(body.channel) ? body.channel : 'sms'
  if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
  if (prompt.length < 3) return NextResponse.json({ error: 'Tell Colvy AI what the campaign is about.' }, { status: 400 })
  if (prompt.length > 2000) return NextResponse.json({ error: 'That’s a lot to read. Keep it to a few sentences.' }, { status: 400 })
  const db = emailAdminDb()
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  // A paid model: the same limits and plan check as the other Colvy AI tools.
  const guard = await guardAiRequest(req, companyId, 'ai', true, false)
  if (!guard.ok) return guard.response!

  const loaded = await loadEmailBrand(db, companyId)
  if (!loaded) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  const previous: AiPlan | null = body.previous && typeof body.previous === 'object' ? body.previous : null
  const change = previous ? String(body.change || '').trim().slice(0, 1000) : ''
  const [past, found] = await Promise.all([recentCampaigns(db, companyId), productCandidates(db, companyId, `${prompt} ${change}`)])
  // Keep the products already in the plan available to a follow-up.
  const products: AiProduct[] = [...(previous?.products || []).filter(p => p && p.id && p.url), ...found]
    .filter((p, i, all) => all.findIndex(x => x.id === p.id) === i).slice(0, 14)

  const out = await buildCampaignPlan({
    prompt, channel, past, products, previous, change: change || null,
    brand: { ...loaded.brand, industry: loaded.company?.industry || null },
    timezone: loaded.company?.timezone || 'Australia/Melbourne',
  }, { companyId })
  if (!out.ok || !out.plan) return NextResponse.json({ error: out.error || 'Colvy AI couldn’t build that. Please try again.' }, { status: 502 })
  return NextResponse.json({ ok: true, plan: out.plan }, { headers: { 'Cache-Control': 'no-store' } })
}
