import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPER_ADMIN = 'bishalstha76@gmail.com'

// Monthly price per plan (AUD). Adjust to match real pricing.
const PLAN_PRICE: Record<string, number> = {
  free: 0, trial: 0, startup: 19, business: 49, growth: 149, enterprise: 399,
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireSuperAdmin(req: NextRequest, db: any): Promise<boolean> {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return false
    const { data } = await db.auth.getUser(token)
    return data?.user?.email === SUPER_ADMIN
  } catch { return false }
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()

export async function GET(req: NextRequest) {
  try {
    const db = admin()
    if (!(await requireSuperAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const now = new Date()
    const today = dayStart(now)
    const thirtyAgo = new Date(now.getTime() - 30 * 86400000).toISOString()
    const sevenAgo = new Date(now.getTime() - 7 * 86400000).toISOString()

    // ── Companies + plan distribution (REAL from companies.plan)
    const { data: companies } = await db.from('companies').select('id, plan, created_at')
    const totalCompanies = companies?.length || 0
    const planCounts: Record<string, number> = {}
    ;(companies || []).forEach((c: any) => { const p = (c.plan || 'free').toLowerCase(); planCounts[p] = (planCounts[p] || 0) + 1 })
    const paidPlans = ['startup', 'business', 'growth', 'enterprise']
    const paidCompanies = (companies || []).filter((c: any) => paidPlans.includes((c.plan || '').toLowerCase())).length
    const trialCompanies = (companies || []).filter((c: any) => (c.plan || '').toLowerCase() === 'trial').length
    const newToday = (companies || []).filter((c: any) => c.created_at && c.created_at >= today).length

    // ── MRR (REAL): prefer live subscriptions; fall back to plan-based estimate.
    let mrr = 0
    let mrrSource = 'plan_estimate'
    try {
      const { data: subs } = await db.from('subscriptions').select('tier, status').eq('status', 'active')
      if (subs && subs.length) {
        mrr = subs.reduce((sum: number, s: any) => sum + (PLAN_PRICE[(s.tier || 'free').toLowerCase()] || 0), 0)
        mrrSource = 'subscriptions'
      }
    } catch {}
    if (mrrSource === 'plan_estimate') {
      mrr = (companies || []).reduce((sum: number, c: any) => sum + (PLAN_PRICE[(c.plan || 'free').toLowerCase()] || 0), 0)
    }

    // ── Active companies (REAL): distinct companies with a conversation or idea
    //    updated in the last 30 days. DAC = same but for today.
    const activeSet = new Set<string>()
    const dacSet = new Set<string>()
    const dailyCounts: Record<string, Set<string>> = {}
    for (let i = 0; i < 7; i++) dailyCounts[dayStart(new Date(now.getTime() - i * 86400000))] = new Set<string>()

    const addActivity = (companyId: string, ts: string) => {
      if (!companyId || !ts) return
      if (ts >= thirtyAgo) activeSet.add(companyId)
      if (ts >= today) dacSet.add(companyId)
      const dk = dayStart(new Date(ts))
      if (dailyCounts[dk]) dailyCounts[dk].add(companyId)
    }
    try {
      const { data: convs } = await db.from('conversations').select('company_id, last_message_at').gte('last_message_at', thirtyAgo).limit(5000)
      ;(convs || []).forEach((c: any) => addActivity(c.company_id, c.last_message_at))
    } catch {}
    try {
      const { data: ideas } = await db.from('ideas').select('company_id, created_at').gte('created_at', thirtyAgo).limit(5000)
      ;(ideas || []).forEach((it: any) => addActivity(it.company_id, it.created_at))
    } catch {}

    // 7-day active series (oldest → newest)
    const activeSeries: { day: string; count: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const dk = dayStart(new Date(now.getTime() - i * 86400000))
      activeSeries.push({ day: dk, count: dailyCounts[dk]?.size || 0 })
    }

    // ── Conversion: paid / (companies that ever trialed or are paid). Best-effort.
    const conversionBase = paidCompanies + trialCompanies
    const conversion = conversionBase > 0 ? (paidCompanies / conversionBase) * 100 : 0

    // ── Content counts (REAL)
    const [{ count: ideaCount }, { count: artCount }] = await Promise.all([
      db.from('ideas').select('*', { count: 'exact', head: true }),
      db.from('help_articles').select('*', { count: 'exact', head: true }),
    ])

    // New signups in the last 7 days (for a small trend)
    const newLast7 = (companies || []).filter((c: any) => c.created_at && c.created_at >= sevenAgo).length

    return NextResponse.json({
      companies: totalCompanies,
      active: activeSet.size,
      dac: dacSet.size,
      paid: paidCompanies,
      trials: trialCompanies,
      today: newToday,
      newLast7,
      mrr, arr: mrr * 12, mrrSource,
      conversion: Math.round(conversion * 10) / 10,
      planDistribution: planCounts,
      activeSeries,
      ideas: ideaCount || 0,
      articles: artCount || 0,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
