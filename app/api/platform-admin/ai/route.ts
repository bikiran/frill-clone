import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AI_JOBS, AI_MODELS, modelsForJob, getAiSettings, clearAiSettingsCache, estimateCost, type AiJob } from '@/lib/ai-models'
import { logSuperAdminAudit } from '@/lib/super-admin-audit'

export const dynamic = 'force-dynamic'

const SUPER_ADMIN = 'bishalstha76@gmail.com'
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

async function superAdmin(req: NextRequest, db: any): Promise<{ id: string; email: string } | null> {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return null
    const { data } = await db.auth.getUser(token)
    return data?.user?.email === SUPER_ADMIN ? { id: data.user.id, email: data.user.email } : null
  } catch { return null }
}

type Agg = { calls: number; tokensIn: number; tokensOut: number; cost: number; costKnown: boolean }
const blank = (): Agg => ({ calls: 0, tokensIn: 0, tokensOut: 0, cost: 0, costKnown: true })

/**
 * GET /api/platform-admin/ai?days=30
 * Which model each job uses, the models it could use, and AI usage + estimated
 * cost over the period: overall, per job, per model and per business.
 */
export async function GET(req: NextRequest) {
  const db = admin()
  if (!(await superAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days')) || 30, 1), 365)
  const settings = await getAiSettings(db, true)

  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const rows: any[] = []
  let missing = false
  // Page through (newest first); enough for a busy month on one screen.
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await db.from('ai_usage_log').select('company_id, job, model, tokens_in, tokens_out').gte('created_at', since).order('created_at', { ascending: false }).range(from, from + 999)
    if (error) { missing = /does not exist|schema cache/i.test(error.message || ''); break }
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }

  const total = blank()
  const byJob: Record<string, Agg> = {}, byModel: Record<string, Agg> = {}, byCompany: Record<string, Agg> = {}
  const add = (a: Agg, r: any, cost: number | null) => {
    a.calls++; a.tokensIn += r.tokens_in || 0; a.tokensOut += r.tokens_out || 0
    if (cost == null) a.costKnown = false; else a.cost += cost
  }
  for (const r of rows) {
    const cost = estimateCost(r.model, r.tokens_in || 0, r.tokens_out || 0, settings.prices)
    add(total, r, cost)
    add(byJob[r.job] ||= blank(), r, cost)
    add(byModel[r.model] ||= blank(), r, cost)
    add(byCompany[r.company_id || 'none'] ||= blank(), r, cost)
  }
  const ids = Object.keys(byCompany).filter(id => id !== 'none')
  const names: Record<string, string> = {}
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from('companies').select('id, name').in('id', ids.slice(i, i + 200))
    for (const c of data || []) names[c.id] = c.name
  }

  return NextResponse.json({
    days, missing,
    jobs: (Object.keys(AI_JOBS) as AiJob[]).map(key => ({
      key, ...AI_JOBS[key], picked: settings.models[key] || null,
      options: modelsForJob(key).map(m => m.id), usage: byJob[key] || blank(),
    })),
    models: AI_MODELS.map(m => ({ ...m, price: settings.prices[m.id] || (m.priceIn != null ? { in: m.priceIn, out: m.priceOut } : null), priceSet: !!settings.prices[m.id], usage: byModel[m.id] || blank() })),
    otherModels: Object.keys(byModel).filter(id => !AI_MODELS.some(m => m.id === id)).map(id => ({ id, usage: byModel[id] })),
    companies: Object.entries(byCompany).map(([id, a]) => ({ id: id === 'none' ? null : id, name: id === 'none' ? 'Not tied to a business' : names[id] || 'Deleted business', ...a })).sort((a, b) => b.tokensIn + b.tokensOut - (a.tokensIn + a.tokensOut)).slice(0, 100),
    total,
  })
}

/** POST { models: { job: modelId | null }, prices: { modelId: { in, out } | null } } */
export async function POST(req: NextRequest) {
  const db = admin()
  const who = await superAdmin(req, db)
  if (!who) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const current = await getAiSettings(db, true)

  const models: Record<string, string> = { ...current.models }
  for (const [job, id] of Object.entries(body?.models || {})) {
    if (!(job in AI_JOBS)) continue
    if (!id || id === AI_JOBS[job as AiJob].default) { delete models[job]; continue }
    if (!modelsForJob(job as AiJob).some(m => m.id === id)) return NextResponse.json({ error: `${id} can’t do “${AI_JOBS[job as AiJob].label}”.` }, { status: 400 })
    models[job] = String(id)
  }
  const prices: Record<string, { in: number; out: number }> = { ...current.prices }
  for (const [id, p] of Object.entries(body?.prices || {}) as [string, any][]) {
    if (!AI_MODELS.some(m => m.id === id)) continue
    const i = Number(p?.in), o = Number(p?.out)
    if (p == null || !Number.isFinite(i) || !Number.isFinite(o) || i < 0 || o < 0) { delete prices[id]; continue }
    prices[id] = { in: i, out: o }
  }

  const { error } = await db.from('platform_settings').upsert({ key: 'ai_models', value: { models, prices }, updated_by: who.email, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: /does not exist|schema cache/i.test(error.message) ? 'Platform settings aren’t set up yet (COLVY_V220_PLATFORM_SETTINGS.sql).' : error.message }, { status: 500 })
  clearAiSettingsCache()
  await logSuperAdminAudit(db, { adminId: who.id, adminEmail: who.email, action: 'ai_models_updated', summary: 'Changed AI model choices', detail: { models, prices } })
  return NextResponse.json({ ok: true, models, prices })
}
