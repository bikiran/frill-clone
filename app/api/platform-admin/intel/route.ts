import { NextRequest, NextResponse } from 'next/server'
import { adminDb, superAdmin, safe } from '../_lib/super-admin'
import { hogql, funnel, cached, posthogConfig } from '@/lib/intel/posthog'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET /api/platform-admin/intel?report=overview|live|traffic|pages|journeys|funnels
//   &range=24h|7d|28d|90d|custom&from=YYYY-MM-DD&to=YYYY-MM-DD&fresh=1
//
// Super Admin → Intelligence. Website and product analytics come from
// PostHog (lib/intel/posthog); business facts (new workspaces, signup
// attempts) from Supabase. Every number is a real count of collected data:
// a report with nothing collected yet returns zeros and empty lists, never
// estimates. Only Colvy's marketing site is counted in traffic reports
// (events tagged site=marketing, or older events on colvy.com).

const MKT = `(properties.site = 'marketing' OR (isNull(properties.site) AND properties.$host IN ('colvy.com', 'www.colvy.com')))`
const DAY = 86400000

type Period = { from: Date; to: Date; prevFrom: Date; prevTo: Date; label: string }

function period(sp: URLSearchParams): Period {
  const range = sp.get('range') || '7d'
  const now = new Date()
  let from: Date, to: Date = now
  if (range === 'custom' && sp.get('from') && sp.get('to')) {
    from = new Date(`${sp.get('from')}T00:00:00Z`)
    to = new Date(new Date(`${sp.get('to')}T00:00:00Z`).getTime() + DAY)
  } else {
    const ms = range === '24h' ? DAY : range === '28d' ? 28 * DAY : range === '90d' ? 90 * DAY : 7 * DAY
    from = new Date(now.getTime() - ms)
  }
  if (!(from < to) || to.getTime() - from.getTime() > 400 * DAY) { from = new Date(now.getTime() - 7 * DAY); to = now }
  const len = to.getTime() - from.getTime()
  return { from, to, prevFrom: new Date(from.getTime() - len), prevTo: from, label: range }
}

const ch = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19)
const between = `timestamp >= toDateTime({from}) AND timestamp < toDateTime({to})`
const vals = (a: Date, b: Date) => ({ from: ch(a), to: ch(b) })
const num = (v: any) => Number(v || 0)

/** Run a query; on failure record the error and return the fallback. */
async function attempt<T>(errors: string[], label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn() } catch (e: any) { errors.push(`${label}: ${e?.message || 'failed'}`); return fallback }
}

// ── Channel grouping for traffic sources ────────────────────────────────────
const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|baidu|yandex|search\.brave)\./i
const SOCIAL = /(^|\.)(facebook|instagram|t\.co|twitter|x\.com|linkedin|lnkd|youtube|tiktok|reddit|pinterest|threads)\./i
const AI = /(chatgpt|openai|perplexity|claude|anthropic|gemini|copilot|you\.com)/i
function channelOf(s: { src?: string; med?: string; ref?: string }): string {
  const med = String(s.med || '').toLowerCase(), src = String(s.src || '').toLowerCase(), ref = String(s.ref || '').toLowerCase()
  if (/cpc|ppc|paid|ads?$/.test(med)) return 'Paid'
  if (/email|newsletter/.test(med) || /email|newsletter/.test(src)) return 'Email'
  if (med === 'social' || SOCIAL.test(ref) || /facebook|instagram|linkedin|tiktok/.test(src)) return 'Social'
  if (AI.test(ref) || AI.test(src)) return 'AI assistants'
  if (SEARCH.test(ref) || /google|bing/.test(src)) return 'Organic search'
  if (!ref || ref === '$direct' || /colvy\.com$/.test(ref)) return src ? 'Campaign' : 'Direct'
  return 'Referral'
}

function rollup(rows: any[], keyOf: (r: any) => string, converted: Set<string>, limit = 25) {
  const m = new Map<string, { key: string; sessions: number; visitors: Set<string>; signups: Set<string> }>()
  for (const r of rows) {
    const k = keyOf(r) || '(none)'
    let e = m.get(k)
    if (!e) { e = { key: k, sessions: 0, visitors: new Set(), signups: new Set() }; m.set(k, e) }
    e.sessions++
    if (r.pid) { e.visitors.add(r.pid); if (converted.has(r.pid)) e.signups.add(r.pid) }
  }
  return [...m.values()].map(e => ({ key: e.key, sessions: e.sessions, visitors: e.visitors.size, signups: e.signups.size }))
    .sort((a, b) => b.sessions - a.sessions).slice(0, limit)
}

// ── Reports ──────────────────────────────────────────────────────────────────

async function kpis(a: Date, b: Date, errors: string[]) {
  const [base] = await attempt(errors, 'traffic totals', () => hogql(
    `SELECT uniq(person_id) AS visitors, uniq(properties.$session_id) AS sessions, count() AS pageviews
     FROM events WHERE event = '$pageview' AND ${MKT} AND ${between}`, vals(a, b)), [{}])
  const [sess] = await attempt(errors, 'session totals', () => hogql(
    `SELECT avg(dur) AS avg_duration, avg(bounce) AS bounce_rate FROM (
       SELECT properties.$session_id AS sid, dateDiff('second', min(timestamp), max(timestamp)) AS dur,
              if(countIf(event = '$pageview') <= 1, 1, 0) AS bounce
       FROM events WHERE event IN ('$pageview', '$pageleave') AND ${MKT} AND ${between} AND notEmpty(properties.$session_id)
       GROUP BY sid)`, vals(a, b)), [{}])
  const conv = await attempt(errors, 'conversions', () => hogql(
    `SELECT event, count() AS n, uniq(person_id) AS people FROM events
     WHERE event IN ('pricing_viewed', 'pricing_cta_clicked', 'cta_clicked', 'signup_started', 'signup_completed', 'account_created', 'business_created', 'checkout_started', 'checkout_completed', 'demo_requested')
       AND ${between} GROUP BY event LIMIT 50`, vals(a, b)), [] as any[])
  const byEvent = Object.fromEntries(conv.map(r => [r.event, { n: num(r.n), people: num(r.people) }]))
  const people = (e: string) => byEvent[e]?.people || 0
  const visitors = num(base?.visitors)
  const signups = Math.max(people('account_created'), people('signup_completed'))
  return {
    visitors, sessions: num(base?.sessions), pageviews: num(base?.pageviews),
    avgDuration: Math.round(num(sess?.avg_duration)), bounceRate: num(sess?.bounce_rate),
    pricingViews: people('pricing_viewed'), pricingClicks: byEvent.pricing_cta_clicked?.n || 0, ctaClicks: byEvent.cta_clicked?.n || 0,
    signupStarted: people('signup_started'), signups, businesses: people('business_created'),
    checkouts: people('checkout_started'), demos: people('demo_requested'),
    conversionRate: visitors ? signups / visitors : 0,
  }
}

async function overview(p: Period, errors: string[]) {
  const db = adminDb()
  const [cur, prev, series, newBusinesses, prevBusinesses] = await Promise.all([
    kpis(p.from, p.to, errors),
    kpis(p.prevFrom, p.prevTo, errors),
    attempt(errors, 'daily traffic', () => hogql(
      `SELECT toDate(timestamp) AS day, uniq(person_id) AS visitors, count() AS pageviews,
              uniqIf(person_id, event = 'signup_started') AS starts
       FROM events WHERE ((event = '$pageview' AND ${MKT}) OR event = 'signup_started') AND ${between}
       GROUP BY day ORDER BY day LIMIT 500`, vals(p.from, p.to)), [] as any[]),
    safe<any[]>(db.from('companies').select('id', { count: 'exact', head: false }).gte('created_at', p.from.toISOString()).lt('created_at', p.to.toISOString()).limit(10000), []),
    safe<any[]>(db.from('companies').select('id').gte('created_at', p.prevFrom.toISOString()).lt('created_at', p.prevTo.toISOString()).limit(10000), []),
  ])
  return {
    current: { ...cur, newWorkspaces: newBusinesses.data.length },
    previous: { ...prev, newWorkspaces: prevBusinesses.data.length },
    series: series.map(r => ({ day: String(r.day).slice(0, 10), visitors: num(r.visitors), pageviews: num(r.pageviews), starts: num(r.starts) })),
  }
}

async function live(errors: string[]) {
  const scope = `(${MKT} OR properties.site = 'app')`
  const [now] = await attempt(errors, 'active now', () => hogql(
    `SELECT uniq(properties.$session_id) AS sessions, uniq(person_id) AS visitors,
            uniqIf(properties.$session_id, properties.site = 'app') AS app_sessions
     FROM events WHERE timestamp > now() - INTERVAL 5 MINUTE AND ${scope}`), [{}])
  const [minutes, pages, countries, recent] = await Promise.all([
    attempt(errors, 'per minute', () => hogql(
      `SELECT toStartOfMinute(timestamp) AS minute, uniq(properties.$session_id) AS sessions
       FROM events WHERE timestamp > now() - INTERVAL 30 MINUTE AND ${scope} GROUP BY minute ORDER BY minute LIMIT 60`), [] as any[]),
    attempt(errors, 'pages now', () => hogql(
      `SELECT properties.$pathname AS path, any(properties.site) AS site, uniq(properties.$session_id) AS sessions
       FROM events WHERE event = '$pageview' AND timestamp > now() - INTERVAL 30 MINUTE AND ${scope}
       GROUP BY path ORDER BY sessions DESC LIMIT 12`), [] as any[]),
    attempt(errors, 'countries now', () => hogql(
      `SELECT properties.$geoip_country_name AS country, properties.$geoip_country_code AS code, uniq(properties.$session_id) AS sessions
       FROM events WHERE timestamp > now() - INTERVAL 30 MINUTE AND ${scope}
       GROUP BY country, code ORDER BY sessions DESC LIMIT 10`), [] as any[]),
    attempt(errors, 'recent activity', () => hogql(
      `SELECT timestamp, event, properties.$pathname AS path, properties.cta_id AS cta, properties.site AS site,
              properties.$geoip_city_name AS city, properties.$geoip_country_code AS country, properties.$device_type AS device, properties.$browser AS browser
       FROM events WHERE timestamp > now() - INTERVAL 30 MINUTE AND ${scope}
         AND event NOT IN ('$feature_flag_called', '$set', '$identify', '$groupidentify', '$autocapture', '$web_vitals', '$rageclick', '$dead_click', '$exception')
       ORDER BY timestamp DESC LIMIT 30`), [] as any[]),
  ])
  return {
    activeSessions: num(now?.sessions), activeVisitors: num(now?.visitors), appSessions: num(now?.app_sessions),
    minutes: minutes.map(r => ({ minute: r.minute, sessions: num(r.sessions) })),
    pages: pages.map(r => ({ path: r.path || '/', site: r.site || 'marketing', sessions: num(r.sessions) })),
    countries: countries.map(r => ({ country: r.country || 'Unknown', code: r.code || '', sessions: num(r.sessions) })),
    recent: recent.map(r => ({ at: r.timestamp, event: r.event, path: r.path || '', cta: r.cta || '', site: r.site || '', place: [r.city, r.country].filter(Boolean).join(', '), device: [r.device, r.browser].filter(Boolean).join(' · ') })),
  }
}

/** One row per marketing session with its first-touch attributes. */
async function sessions(p: Period, errors: string[]) {
  const rows = await attempt(errors, 'sessions', () => hogql(
    `SELECT properties.$session_id AS sid, any(person_id) AS pid,
            argMin(properties.$referring_domain, timestamp) AS ref,
            argMin(properties.utm_source, timestamp) AS src, argMin(properties.utm_medium, timestamp) AS med,
            argMin(properties.utm_campaign, timestamp) AS camp, argMin(properties.$pathname, timestamp) AS landing,
            argMin(properties.$device_type, timestamp) AS device, argMin(properties.$browser, timestamp) AS browser,
            argMin(properties.$os, timestamp) AS os, argMin(properties.$geoip_country_name, timestamp) AS country,
            argMin(properties.$geoip_city_name, timestamp) AS city
     FROM events WHERE event = '$pageview' AND ${MKT} AND ${between} AND notEmpty(properties.$session_id)
     GROUP BY sid LIMIT 50000`, vals(p.from, p.to)), [] as any[])
  const conv = await attempt(errors, 'signups', () => hogql(
    `SELECT DISTINCT person_id AS pid FROM events WHERE event IN ('account_created', 'signup_completed') AND ${between} LIMIT 50000`,
    vals(p.from, p.to)), [] as any[])
  return { rows: rows.map(r => ({ ...r, pid: r.pid ? String(r.pid) : '' })), converted: new Set(conv.map(r => String(r.pid))) }
}

async function traffic(p: Period, errors: string[]) {
  const { rows, converted } = await sessions(p, errors)
  return {
    totalSessions: rows.length,
    channels: rollup(rows, r => channelOf(r), converted, 10),
    referrers: rollup(rows, r => (r.ref && r.ref !== '$direct' ? r.ref : '(direct)'), converted),
    sources: rollup(rows.filter(r => r.src), r => r.src, converted),
    mediums: rollup(rows.filter(r => r.med), r => r.med, converted),
    campaigns: rollup(rows.filter(r => r.camp), r => r.camp, converted),
    landing: rollup(rows, r => r.landing || '/', converted),
    devices: rollup(rows, r => r.device || 'Unknown', converted, 6),
    browsers: rollup(rows, r => r.browser || 'Unknown', converted, 10),
    os: rollup(rows, r => r.os || 'Unknown', converted, 10),
    countries: rollup(rows, r => r.country || 'Unknown', converted, 15),
    cities: rollup(rows, r => (r.city ? `${r.city}${r.country ? `, ${r.country}` : ''}` : 'Unknown'), converted, 15),
  }
}

async function pages(p: Period, errors: string[]) {
  const v = vals(p.from, p.to)
  const [top, time, ctas, plans] = await Promise.all([
    attempt(errors, 'pages', () => hogql(
      `SELECT properties.$pathname AS path, count() AS views, uniq(person_id) AS visitors, uniq(properties.$session_id) AS sessions
       FROM events WHERE event = '$pageview' AND ${MKT} AND ${between} GROUP BY path ORDER BY views DESC LIMIT 100`, v), [] as any[]),
    attempt(errors, 'time on page', () => hogql(
      `SELECT properties.$prev_pageview_pathname AS path, avg(toFloat(properties.$prev_pageview_duration)) AS secs
       FROM events WHERE event IN ('$pageview', '$pageleave') AND ${MKT} AND ${between}
         AND notEmpty(properties.$prev_pageview_pathname) AND toFloat(properties.$prev_pageview_duration) < 3600
       GROUP BY path LIMIT 1000`, v), [] as any[]),
    attempt(errors, 'clicks', () => hogql(
      `SELECT properties.cta_id AS cta, properties.location AS location, count() AS clicks, uniq(person_id) AS people
       FROM events WHERE event = 'cta_clicked' AND ${between} GROUP BY cta, location ORDER BY clicks DESC LIMIT 100`, v), [] as any[]),
    attempt(errors, 'pricing clicks', () => hogql(
      `SELECT properties.plan AS plan, properties.billing AS billing, count() AS clicks, uniq(person_id) AS people
       FROM events WHERE event = 'pricing_cta_clicked' AND ${between} GROUP BY plan, billing ORDER BY clicks DESC LIMIT 50`, v), [] as any[]),
  ])
  const secs = new Map(time.map(r => [r.path, num(r.secs)]))
  return {
    pages: top.map(r => ({ path: r.path || '/', views: num(r.views), visitors: num(r.visitors), sessions: num(r.sessions), avgSeconds: Math.round(secs.get(r.path) || 0) })),
    ctas: ctas.map(r => ({ cta: r.cta || '(unnamed)', location: r.location || '', clicks: num(r.clicks), people: num(r.people) })),
    pricing: plans.map(r => ({ plan: r.plan || '(none)', billing: r.billing || '', clicks: num(r.clicks), people: num(r.people) })),
  }
}

async function journeys(p: Period, errors: string[]) {
  const rows = await attempt(errors, 'journeys', () => hogql(
    `SELECT properties.$session_id AS sid, timestamp, properties.$pathname AS path
     FROM events WHERE event = '$pageview' AND ${MKT} AND ${between} AND notEmpty(properties.$session_id)
     ORDER BY sid, timestamp LIMIT 50000`, vals(p.from, p.to)), [] as any[])
  const bySession = new Map<string, string[]>()
  for (const r of rows) {
    const list = bySession.get(r.sid) || []
    const path = r.path || '/'
    if (list[list.length - 1] !== path) list.push(path)   // collapse reloads
    bySession.set(r.sid, list)
  }
  const count = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) || 0) + 1)
  const paths = new Map<string, number>(), entries = new Map<string, number>(), exits = new Map<string, number>()
  const next = new Map<string, Map<string, number>>()
  let totalLen = 0
  for (const list of bySession.values()) {
    totalLen += list.length
    count(paths, list.slice(0, 4).join(' → ') + (list.length > 4 ? ' → …' : ''))
    count(entries, list[0]); count(exits, list[list.length - 1])
    for (let i = 0; i < list.length; i++) {
      const to = list[i + 1] || '(left)'
      const m = next.get(list[i]) || new Map<string, number>()
      count(m, to); next.set(list[i], m)
    }
  }
  const top = (m: Map<string, number>, n = 20) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, sessions]) => ({ key, sessions }))
  const transitions = [...next.entries()].sort((a, b) => [...b[1].values()].reduce((x, y) => x + y, 0) - [...a[1].values()].reduce((x, y) => x + y, 0)).slice(0, 15)
    .map(([from, m]) => ({ from, next: top(m, 5) }))
  return {
    sessions: bySession.size,
    avgPages: bySession.size ? totalLen / bySession.size : 0,
    paths: top(paths, 25), entries: top(entries), exits: top(exits), transitions,
    truncated: rows.length >= 50000,
  }
}

async function funnels(p: Period, errors: string[]) {
  const from = p.from.toISOString().slice(0, 10), to = p.to.toISOString().slice(0, 10)
  const v = vals(p.from, p.to)
  const db = adminDb()
  const [web, steps, errs, starts, attempts] = await Promise.all([
    attempt(errors, 'website funnel', () => funnel([
      { event: '$pageview', label: 'Visited the site', properties: [{ key: 'site', value: 'marketing', operator: 'exact', type: 'event' }] },
      { event: 'pricing_viewed', label: 'Viewed pricing' },
      { event: 'signup_started', label: 'Started signup' },
      { event: 'account_created', label: 'Created an account' },
      { event: 'business_created', label: 'Workspace created' },
    ], from, to), [] as any[]),
    attempt(errors, 'signup steps', () => hogql(
      `SELECT toInt(properties.step) AS step, any(properties.name) AS name, uniq(person_id) AS people
       FROM events WHERE event = 'signup_step_completed' AND ${between} GROUP BY step ORDER BY step LIMIT 20`, v), [] as any[]),
    attempt(errors, 'signup errors', () => hogql(
      `SELECT properties.code AS code, toInt(properties.step) AS step, count() AS n, uniq(person_id) AS people
       FROM events WHERE event = 'signup_error' AND ${between} GROUP BY code, step ORDER BY n DESC LIMIT 30`, v), [] as any[]),
    attempt(errors, 'signup starts', () => hogql(
      `SELECT uniq(person_id) AS people FROM events WHERE event = 'signup_started' AND ${between}`, v), [{}] as any[]),
    // Colvy's own record of every signup attempt (lib/signup-attempts): real
    // history that predates PostHog collection.
    safe<any[]>(db.from('signup_attempts').select('stage, step_reached, email_verified_at, mobile_verified_at, account_created_at, wrong_codes, codes_sent')
      .gte('created_at', p.from.toISOString()).lt('created_at', p.to.toISOString()).limit(20000), []),
  ])
  const a = attempts.data
  return {
    website: web,
    signupSteps: [{ step: 0, name: 'started', people: num(starts?.[0]?.people) }, ...steps.map(r => ({ step: num(r.step), name: r.name || '', people: num(r.people) }))],
    signupErrors: errs.map(r => ({ code: r.code || 'other', step: num(r.step), count: num(r.n), people: num(r.people) })),
    attempts: {
      available: !attempts.missing,
      total: a.length,
      codeSent: a.filter(r => num(r.codes_sent) > 0).length,
      emailVerified: a.filter(r => r.email_verified_at).length,
      mobileVerified: a.filter(r => r.mobile_verified_at).length,
      accountCreated: a.filter(r => r.account_created_at).length,
      wrongCodes: a.reduce((s, r) => s + num(r.wrong_codes), 0),
    },
  }
}

export async function GET(req: NextRequest) {
  const db = adminDb()
  if (!(await superAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const sp = req.nextUrl.searchParams
  const report = sp.get('report') || 'overview'
  const cfg = posthogConfig()
  const p = period(sp)
  const fresh = sp.get('fresh') === '1'
  const meta = { report, range: p.label, from: p.from.toISOString(), to: p.to.toISOString(), prevFrom: p.prevFrom.toISOString(), prevTo: p.prevTo.toISOString(), posthog: cfg }

  // Without the PostHog read key, only the Supabase-backed parts can answer.
  if (!cfg.ok && report !== 'funnels') return NextResponse.json({ ...meta, configured: false })

  try {
    const key = `${report}:${p.label}:${sp.get('from') || ''}:${sp.get('to') || ''}:${cfg.ok}`
    const ttl = report === 'live' ? 15_000 : 300_000
    const data = await cached(key, ttl, fresh, async () => {
      const errors: string[] = []
      const body =
        report === 'live' ? await live(errors)
        : report === 'traffic' ? await traffic(p, errors)
        : report === 'pages' ? await pages(p, errors)
        : report === 'journeys' ? await journeys(p, errors)
        : report === 'funnels' ? await funnels(p, errors)
        : await overview(p, errors)
      return { data: body, errors }
    })
    return NextResponse.json({ ...meta, configured: cfg.ok, ...data })
  } catch (e: any) {
    console.error('[intel]', report, e?.message || e)
    return NextResponse.json({ ...meta, configured: cfg.ok, error: e?.message || 'failed' }, { status: 500 })
  }
}
