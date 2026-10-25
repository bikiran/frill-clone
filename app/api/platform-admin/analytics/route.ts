import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PLAN_PRICES } from '@/lib/plan'
import { isSuperAdminEmail } from '@/lib/super-admin'
import { cachedReport } from '@/lib/intel/cache'
import { PAYING } from '@/lib/intel/billing'


// Monthly price per plan for the ESTIMATE fallback. Covers both plan taxonomies
// present in the app: entitlements (pro/enterprise) and the self-serve checkout
// tiers (startup/business/growth). Enterprise is custom-priced → 0 in the
// estimate; real revenue comes from live subscription amounts below.
// Current plans come from lib/plan (feedback / omnichannel / everything …);
// the legacy self-serve tiers are kept so old rows still estimate sensibly.
const PLAN_PRICE: Record<string, number> = {
  startup: 25, business: 49, growth: 149,
  ...Object.fromEntries(Object.entries(PLAN_PRICES).map(([k, v]) => [k, v || 0])),
}
// A company is "paying" if it's on any plan that isn't free/trial/suspended.
const NON_PAID = new Set(['free', 'trial', 'suspended', ''])
const isPaidPlan = (p: any) => { const s = String(p || '').toLowerCase(); return !!s && !NON_PAID.has(s) }

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
    return isSuperAdminEmail(data?.user?.email)
  } catch { return false }
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()

/** Every row of a query, 1000 at a time ([] if the table is missing). */
async function allRows(make: () => any, max = 50_000): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await make().range(from, from + 999)
    if (error || !data) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}
const headCount = async (q: any): Promise<number | null> => { try { const { count, error } = await q; return error ? null : (count || 0) } catch { return null } }
const rowsOf = async (q: any): Promise<any[] | null> => { try { const { data, error } = await q; return error ? null : data || [] } catch { return null } }

// GET /api/platform-admin/analytics — the Overview dashboard's numbers.
// Every query runs at once, and the result is saved (lib/intel/cache) so the
// dashboard opens instantly and refreshes in the background; ?fresh=1
// recomputes now.
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    if (!(await requireSuperAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const fresh = req.nextUrl.searchParams.get('fresh') === '1'
    const body = await cachedReport(db, 'pa:analytics', { ttlMs: 60_000, maxStaleMs: 12 * 3600_000, fresh }, () => compute(db))
    return NextResponse.json(body)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

async function compute(db: any) {
  const now = new Date()
  const today = dayStart(now)
  const thirtyAgo = new Date(now.getTime() - 30 * 86400000).toISOString()
  const sevenAgo = new Date(now.getTime() - 7 * 86400000).toISOString()

  const [companies, billingSubs, subs, allSubs, convs, ideas, ideaCount, artCount, saleRows, bookings30d, payLinksPaid30d] = await Promise.all([
    allRows(() => db.from('companies').select('id, name, slug, plan, created_at, trial_ends_at').order('id')),
    // The Stripe/Shopify mirror Revenue uses (V416), so both pages agree.
    rowsOf(db.from('billing_subscriptions').select('company_id, status, kind, mrr_cents').in('status', [...PAYING]).limit(20000)),
    rowsOf(db.from('subscriptions').select('amount_cents, billing_interval, status').eq('status', 'active')),
    rowsOf(db.from('subscriptions').select('status, created_at, updated_at, canceled_at')),
    rowsOf(db.from('conversations').select('company_id, last_message_at').gte('last_message_at', thirtyAgo).limit(5000)),
    rowsOf(db.from('ideas').select('company_id, created_at').gte('created_at', thirtyAgo).limit(5000)),
    headCount(db.from('ideas').select('*', { count: 'exact', head: true })),
    headCount(db.from('help_articles').select('*', { count: 'exact', head: true })),
    rowsOf(db.from('conversation_sales').select('amount, company_id').gte('created_at', thirtyAgo).limit(20000)),
    headCount(db.from('bookings').select('id', { count: 'exact', head: true }).gte('created_at', thirtyAgo)),
    headCount(db.from('chat_payments').select('id', { count: 'exact', head: true }).eq('status', 'paid').gte('created_at', thirtyAgo)),
  ])

  // ── Companies + plan distribution (companies.plan)
  const totalCompanies = companies.length
  const planCounts: Record<string, number> = {}
  companies.forEach((c: any) => { const p = (c.plan || 'free').toLowerCase(); planCounts[p] = (planCounts[p] || 0) + 1 })
  const paidCompanies = companies.filter((c: any) => isPaidPlan(c.plan)).length
  const trialRows = companies.filter((c: any) => (c.plan || '').toLowerCase() === 'trial')
  const trialCompanies = trialRows.length
  const newToday = companies.filter((c: any) => c.created_at && c.created_at >= today).length
  const newLast7 = companies.filter((c: any) => c.created_at && c.created_at >= sevenAgo).length

  // ── Trial funnel (companies.trial_ends_at)
  const nowMs = Date.now()
  const sevenAheadMs = nowMs + 7 * 86400000
  const activeTrials = trialRows.filter((c: any) => c.trial_ends_at && new Date(c.trial_ends_at).getTime() >= nowMs).length
  const trialsEndingSoon = trialRows.filter((c: any) => { const t = c.trial_ends_at ? new Date(c.trial_ends_at).getTime() : 0; return t >= nowMs && t <= sevenAheadMs }).length
  const expiredTrials = trialRows.filter((c: any) => c.trial_ends_at && new Date(c.trial_ends_at).getTime() < nowMs).length

  // ── MRR: the billing mirror, else live subscription amounts, else a plan estimate.
  let mrr = 0
  let mrrSource = 'plan_estimate'
  const mirrored = (billingSubs || []).filter((s: any) => s.kind !== 'other').reduce((sum: number, s: any) => sum + (Number(s.mrr_cents) || 0), 0)
  if (mirrored > 0) { mrr = Math.round(mirrored / 100); mrrSource = 'billing' }
  else if (subs && subs.length) {
    const monthly = (a: number, iv: string) => iv === 'year' ? a / 12 : iv === 'week' ? a * 52 / 12 : iv === 'day' ? a * 365 / 12 : a
    const totalCents = subs.reduce((sum: number, s: any) => sum + monthly(s.amount_cents || 0, s.billing_interval || 'month'), 0)
    if (totalCents > 0) { mrr = Math.round(totalCents / 100); mrrSource = 'subscriptions' }
  }
  if (mrrSource === 'plan_estimate') mrr = companies.reduce((sum: number, c: any) => sum + (PLAN_PRICE[(c.plan || 'free').toLowerCase()] || 0), 0)

  // ── Subscription lifecycle: new paid + churn (30d).
  let newPaidLast30 = 0, canceledLast30 = 0, activeSubs = 0
  for (const s of allSubs || []) {
    const st = String(s.status || '').toLowerCase()
    if (st === 'active') activeSubs++
    if (st === 'active' && s.created_at && s.created_at >= thirtyAgo) newPaidLast30++
    const cancelTs = s.canceled_at || (st === 'canceled' ? s.updated_at : null)
    if (st === 'canceled' && cancelTs && cancelTs >= thirtyAgo) canceledLast30++
  }
  // Churn = cancellations ÷ (still-active + cancelled) over the window.
  const churn = (activeSubs + canceledLast30) > 0 ? Math.round((canceledLast30 / (activeSubs + canceledLast30)) * 1000) / 10 : 0
  const arpa = paidCompanies > 0 ? Math.round(mrr / paidCompanies) : 0

  // ── Active companies: a conversation or idea in the last 30 days; DAC = today.
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
  ;(convs || []).forEach((c: any) => addActivity(c.company_id, c.last_message_at))
  ;(ideas || []).forEach((it: any) => addActivity(it.company_id, it.created_at))
  const activeSeries: { day: string; count: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const dk = dayStart(new Date(now.getTime() - i * 86400000))
    activeSeries.push({ day: dk, count: dailyCounts[dk]?.size || 0 })
  }

  // ── Conversion: paid / (paid + on trial). Best-effort.
  const conversionBase = paidCompanies + trialCompanies
  const conversion = conversionBase > 0 ? (paidCompanies / conversionBase) * 100 : 0

  // ── Sales tenants log in chat (attributed to Colvy), last 30 days.
  let salesLogged30d = 0, salesCount30d = 0
  const nameOf = new Map<string, string>(companies.map((c: any) => [c.id, c.name || 'Workspace']))
  const byCo = new Map<string, number>()
  for (const r of saleRows || []) {
    const a = Number(r.amount) || 0
    salesLogged30d += a; salesCount30d++
    byCo.set(r.company_id, (byCo.get(r.company_id) || 0) + a)
  }
  const topSalesCompanies = Array.from(byCo.entries())
    .map(([id, total]) => ({ id, name: nameOf.get(id) || 'Workspace', total: Math.round(total) }))
    .sort((a, b) => b.total - a.total).slice(0, 5)

  // ── Businesses that need a look (the dashboard's "Needs your attention").
  const DAYMS = 86400000
  const pick = (xs: any[]) => ({ count: xs.length, items: xs.slice(0, 8).map((c: any) => ({ id: c.id, name: c.name || c.slug || 'Untitled', slug: c.slug || null })) })
  const age = (c: any) => (c.created_at ? (nowMs - Date.parse(c.created_at)) / DAYMS : 0)
  const trialEnd = (c: any) => (c.trial_ends_at ? Date.parse(c.trial_ends_at) : NaN)
  const pastDueIds = new Set((billingSubs || []).filter((s: any) => s.status === 'past_due' && s.company_id).map((s: any) => s.company_id))
  const attention = {
    pastDue: pick(companies.filter((c: any) => pastDueIds.has(c.id))),
    suspended: pick(companies.filter((c: any) => String(c.plan || '').toLowerCase() === 'suspended')),
    trialEnding: pick(trialRows.filter((c: any) => trialEnd(c) >= nowMs && trialEnd(c) <= nowMs + 3 * DAYMS).sort((a: any, b: any) => trialEnd(a) - trialEnd(b))),
    trialExpired: pick(trialRows.filter((c: any) => trialEnd(c) < nowMs).sort((a: any, b: any) => trialEnd(b) - trialEnd(a))),
    newSignups: pick(companies.filter((c: any) => age(c) < 2).sort((a: any, b: any) => age(a) - age(b))),
    longFree: pick(companies.filter((c: any) => String(c.plan || 'free').toLowerCase() === 'free' && age(c) > 45)),
  }

  return {
    attention,
    bookings30d, payLinksPaid30d,
    companies: totalCompanies,
    active: activeSet.size,
    dac: dacSet.size,
    paid: paidCompanies,
    trials: trialCompanies,
    today: newToday,
    newLast7,
    mrr, arr: mrr * 12, mrrSource,
    arpa,
    conversion: Math.round(conversion * 10) / 10,
    activeTrials, trialsEndingSoon, expiredTrials,
    newPaidLast30, canceledLast30, churn,
    salesLogged30d: Math.round(salesLogged30d), salesCount30d, topSalesCompanies,
    planDistribution: planCounts,
    activeSeries,
    ideas: ideaCount || 0,
    articles: artCount || 0,
  }
}
