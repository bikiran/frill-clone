// Super Admin → Intelligence reports, server only: website and product
// analytics from PostHog (lib/intel/posthog), the business facts beside them
// from Supabase, and the Supabase-only reports (business, health, revenue,
// system). Used by /api/platform-admin/intel and by the hourly intel job,
// which keeps the common ones warm (lib/intel/cache). Every number is a real
// count of collected data: a report with nothing collected yet returns zeros
// and empty lists, never estimates. Only Colvy's marketing site is counted in
// traffic reports (events tagged site=marketing, or older events on colvy.com).

import { createClient } from '@supabase/supabase-js'
import { hogql, funnel, posthogConfig } from '@/lib/intel/posthog'
import { channelOf } from '@/lib/intel/channel'
import { businessReport, healthReport } from '@/lib/intel/business-report'
import { revenueReport, systemReport } from '@/lib/intel/revenue-report'

export const INTEL_REPORTS = ['overview', 'live', 'traffic', 'pages', 'journeys', 'funnels', 'business', 'health', 'revenue', 'system'] as const
export type IntelReport = typeof INTEL_REPORTS[number]
const SUPABASE_ONLY = new Set<string>(['business', 'health', 'revenue', 'system'])

const MKT = `(properties.site = 'marketing' OR (isNull(properties.site) AND properties.$host IN ('colvy.com', 'www.colvy.com')))`
const DAY = 86400000

function serviceDb(): any {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** Supabase query that answers [] on a missing table instead of failing. */
async function safe<T>(q: any, fallback: T): Promise<{ data: T; missing: boolean }> {
  try {
    const { data, error } = await q
    if (error) return { data: fallback, missing: /42P01|PGRST205|does not exist|schema cache/i.test(`${error.code} ${error.message}`) }
    return { data: (data ?? fallback) as T, missing: false }
  } catch { return { data: fallback, missing: false } }
}

export type Period = { from: Date; to: Date; prevFrom: Date; prevTo: Date; label: string }

export function period(sp: URLSearchParams): Period {
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
  const [[base], [sess], conv] = await Promise.all([
    attempt(errors, 'traffic totals', () => hogql(
      `SELECT uniq(person_id) AS visitors, uniq(properties.$session_id) AS sessions, count() AS pageviews
       FROM events WHERE event = '$pageview' AND ${MKT} AND ${between}`, vals(a, b)), [{}] as any[]),
    attempt(errors, 'session totals', () => hogql(
      `SELECT avg(dur) AS avg_duration, avg(bounce) AS bounce_rate FROM (
         SELECT properties.$session_id AS sid, dateDiff('second', min(timestamp), max(timestamp)) AS dur,
                if(countIf(event = '$pageview') <= 1, 1, 0) AS bounce
         FROM events WHERE event IN ('$pageview', '$pageleave') AND ${MKT} AND ${between} AND notEmpty(properties.$session_id)
         GROUP BY sid)`, vals(a, b)), [{}] as any[]),
    attempt(errors, 'conversions', () => hogql(
      `SELECT event, count() AS n, uniq(person_id) AS people FROM events
       WHERE event IN ('pricing_viewed', 'pricing_cta_clicked', 'cta_clicked', 'signup_started', 'signup_completed', 'account_created', 'business_created', 'checkout_started', 'checkout_completed', 'demo_requested')
         AND ${between} GROUP BY event LIMIT 50`, vals(a, b)), [] as any[]),
  ])
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

// Both periods in one pass: each query reads from the start of the previous
// period to the end of this one and splits the counts at the boundary, so the
// overview asks PostHog three questions instead of six (PostHog runs only a
// few queries at a time per project, so fewer questions answer sooner).
const isCur = (v: any) => v === true || v === 1 || v === '1' || v === 'true'
async function kpisBoth(p: Period): Promise<{ cur: any; prev: any }> {
  const v = { from: ch(p.from), to: ch(p.to), pfrom: ch(p.prevFrom) }
  const span = `timestamp >= toDateTime({pfrom}) AND timestamp < toDateTime({to})`
  const now = `timestamp >= toDateTime({from})`
  const [[base], sess, conv] = await Promise.all([
    hogql(`SELECT uniqIf(person_id, ${now}) AS visitors, uniqIf(properties.$session_id, ${now}) AS sessions, countIf(${now}) AS pageviews,
                  uniqIf(person_id, NOT (${now})) AS p_visitors, uniqIf(properties.$session_id, NOT (${now})) AS p_sessions, countIf(NOT (${now})) AS p_pageviews
           FROM events WHERE event = '$pageview' AND ${MKT} AND ${span}`, v),
    hogql(`SELECT cur, avg(dur) AS avg_duration, avg(bounce) AS bounce_rate FROM (
             SELECT properties.$session_id AS sid, if(min(timestamp) >= toDateTime({from}), 1, 0) AS cur,
                    dateDiff('second', min(timestamp), max(timestamp)) AS dur, if(countIf(event = '$pageview') <= 1, 1, 0) AS bounce
             FROM events WHERE event IN ('$pageview', '$pageleave') AND ${MKT} AND ${span} AND notEmpty(properties.$session_id)
             GROUP BY sid)
           GROUP BY cur`, v),
    hogql(`SELECT event, if(${now}, 1, 0) AS cur, count() AS n, uniq(person_id) AS people FROM events
           WHERE event IN ('pricing_viewed', 'pricing_cta_clicked', 'cta_clicked', 'signup_started', 'signup_completed', 'account_created', 'business_created', 'checkout_started', 'checkout_completed', 'demo_requested')
             AND ${span} GROUP BY event, cur LIMIT 100`, v),
  ])
  const side = (cur: boolean) => {
    const pre = cur ? '' : 'p_'
    const s1 = sess.find(r => isCur(r.cur) === cur) || {}
    const byEvent = Object.fromEntries(conv.filter(r => isCur(r.cur) === cur).map(r => [r.event, { n: num(r.n), people: num(r.people) }]))
    const people = (e: string) => byEvent[e]?.people || 0
    const visitors = num(base?.[`${pre}visitors`])
    const signups = Math.max(people('account_created'), people('signup_completed'))
    return {
      visitors, sessions: num(base?.[`${pre}sessions`]), pageviews: num(base?.[`${pre}pageviews`]),
      avgDuration: Math.round(num(s1.avg_duration)), bounceRate: num(s1.bounce_rate),
      pricingViews: people('pricing_viewed'), pricingClicks: byEvent.pricing_cta_clicked?.n || 0, ctaClicks: byEvent.cta_clicked?.n || 0,
      signupStarted: people('signup_started'), signups, businesses: people('business_created'),
      checkouts: people('checkout_started'), demos: people('demo_requested'),
      conversionRate: visitors ? signups / visitors : 0,
    }
  }
  return { cur: side(true), prev: side(false) }
}

/** New workspaces in a window, counted without fetching their rows. */
async function workspaceCount(db: any, a: Date, b: Date): Promise<number> {
  try {
    const { count, error } = await db.from('companies').select('id', { count: 'exact', head: true }).gte('created_at', a.toISOString()).lt('created_at', b.toISOString())
    return error ? 0 : count || 0
  } catch { return 0 }
}

async function overview(p: Period, errors: string[]) {
  const db = serviceDb()
  // Combined questions first; if PostHog won't run them, ask the old way.
  const both = kpisBoth(p).catch(async (e: any) => {
    console.warn('[intel] combined overview query failed, asking per period:', e?.message || e)
    const [cur, prev] = await Promise.all([kpis(p.from, p.to, errors), kpis(p.prevFrom, p.prevTo, errors)])
    return { cur, prev }
  })
  const [{ cur, prev }, series, newBusinesses, prevBusinesses] = await Promise.all([
    both,
    attempt(errors, 'daily traffic', () => hogql(
      `SELECT toDate(timestamp) AS day, uniq(person_id) AS visitors, count() AS pageviews,
              uniqIf(person_id, event = 'signup_started') AS starts
       FROM events WHERE ((event = '$pageview' AND ${MKT}) OR event = 'signup_started') AND ${between}
       GROUP BY day ORDER BY day LIMIT 500`, vals(p.from, p.to)), [] as any[]),
    workspaceCount(db, p.from, p.to),
    workspaceCount(db, p.prevFrom, p.prevTo),
  ])
  return {
    current: { ...cur, newWorkspaces: newBusinesses },
    previous: { ...prev, newWorkspaces: prevBusinesses },
    series: series.map(r => ({ day: String(r.day).slice(0, 10), visitors: num(r.visitors), pageviews: num(r.pageviews), starts: num(r.starts) })),
  }
}

const LIVE_SCOPE = `(${MKT} OR properties.site = 'app')`
const LIVE_QUIET = `('$feature_flag_called', '$set', '$identify', '$groupidentify', '$autocapture', '$web_vitals', '$rageclick', '$dead_click', '$exception')`

/** Live, in two questions: one row per session of the last 30 minutes (the
 *  counts, minutes, pages and places are worked out here) and the activity feed. */
async function liveFast() {
  const [rows, recent] = await Promise.all([
    hogql(`SELECT properties.$session_id AS sid, any(person_id) AS pid, any(properties.site) AS site,
                  dateDiff('second', max(timestamp), now()) AS idle,
                  dateDiff('second', maxIf(timestamp, properties.site = 'app'), now()) AS app_idle,
                  argMax(properties.$geoip_country_name, timestamp) AS country, argMax(properties.$geoip_country_code, timestamp) AS code,
                  groupUniqArray(toStartOfMinute(timestamp)) AS mins,
                  groupUniqArrayIf(properties.$pathname, event = '$pageview') AS paths
           FROM events WHERE timestamp > now() - INTERVAL 30 MINUTE AND ${LIVE_SCOPE}
           GROUP BY sid LIMIT 10000`),
    hogql(`SELECT timestamp, event, properties.$pathname AS path, properties.cta_id AS cta, properties.site AS site,
                  properties.$geoip_city_name AS city, properties.$geoip_country_code AS country, properties.$device_type AS device, properties.$browser AS browser
           FROM events WHERE timestamp > now() - INTERVAL 30 MINUTE AND ${LIVE_SCOPE} AND event NOT IN ${LIVE_QUIET}
           ORDER BY timestamp DESC LIMIT 30`),
  ])
  const active = rows.filter(r => num(r.idle) <= 300)
  const people = new Set(active.map(r => String(r.pid || '')).filter(Boolean))
  // Minutes inside arrays can come back as "YYYY-MM-DD hh:mm:ss" (UTC).
  const iso = (m: any) => { const t = String(m); return /^\d{4}-\d\d-\d\d \d\d:\d\d(:\d\d)?$/.test(t) ? `${t.replace(' ', 'T')}Z` : t }
  const perMinute = new Map<string, number>(), perPage = new Map<string, { site: string; sessions: number }>(), perPlace = new Map<string, { country: string; code: string; sessions: number }>()
  for (const r of rows) {
    for (const m of (Array.isArray(r.mins) ? r.mins : [])) perMinute.set(iso(m), (perMinute.get(iso(m)) || 0) + 1)
    for (const path of (Array.isArray(r.paths) ? r.paths : [])) {
      const k = String(path || '/'), e = perPage.get(k) || { site: r.site || 'marketing', sessions: 0 }
      e.sessions++; perPage.set(k, e)
    }
    const k = `${r.country || 'Unknown'}|${r.code || ''}`, e = perPlace.get(k) || { country: r.country || 'Unknown', code: r.code || '', sessions: 0 }
    e.sessions++; perPlace.set(k, e)
  }
  return {
    activeSessions: active.length, activeVisitors: people.size,
    appSessions: rows.filter(r => r.app_idle != null && num(r.app_idle) >= 0 && num(r.app_idle) <= 300).length,
    minutes: [...perMinute.entries()].sort((a, b) => Date.parse(a[0]) - Date.parse(b[0])).map(([minute, sessions]) => ({ minute, sessions })),
    pages: [...perPage.entries()].map(([path, e]) => ({ path, site: e.site, sessions: e.sessions })).sort((a, b) => b.sessions - a.sessions).slice(0, 12),
    countries: [...perPlace.values()].sort((a, b) => b.sessions - a.sessions).slice(0, 10),
    recent: recent.map(r => ({ at: r.timestamp, event: r.event, path: r.path || '', cta: r.cta || '', site: r.site || '', place: [r.city, r.country].filter(Boolean).join(', '), device: [r.device, r.browser].filter(Boolean).join(' · ') })),
  }
}

async function live(errors: string[]) {
  try { return await liveFast() } catch (e: any) {
    console.warn('[intel] combined live query failed, asking separately:', e?.message || e)
  }
  const scope = LIVE_SCOPE
  const [[now], minutes, pages, countries, recent] = await Promise.all([
    attempt(errors, 'active now', () => hogql(
      `SELECT uniq(properties.$session_id) AS sessions, uniq(person_id) AS visitors,
              uniqIf(properties.$session_id, properties.site = 'app') AS app_sessions
       FROM events WHERE timestamp > now() - INTERVAL 5 MINUTE AND ${scope}`), [{}] as any[]),
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
  const [rows, conv] = await Promise.all([
  attempt(errors, 'sessions', () => hogql(
    `SELECT properties.$session_id AS sid, any(person_id) AS pid,
            argMin(properties.$referring_domain, timestamp) AS ref,
            argMin(properties.utm_source, timestamp) AS src, argMin(properties.utm_medium, timestamp) AS med,
            argMin(properties.utm_campaign, timestamp) AS camp, argMin(properties.$pathname, timestamp) AS landing,
            argMin(properties.$device_type, timestamp) AS device, argMin(properties.$browser, timestamp) AS browser,
            argMin(properties.$os, timestamp) AS os, argMin(properties.$geoip_country_name, timestamp) AS country,
            argMin(properties.$geoip_city_name, timestamp) AS city
     FROM events WHERE event = '$pageview' AND ${MKT} AND ${between} AND notEmpty(properties.$session_id)
     GROUP BY sid LIMIT 50000`, vals(p.from, p.to)), [] as any[]),
  attempt(errors, 'signups', () => hogql(
    `SELECT DISTINCT person_id AS pid FROM events WHERE event IN ('account_created', 'signup_completed') AND ${between} LIMIT 50000`,
    vals(p.from, p.to)), [] as any[]),
  ])
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
  const db = serviceDb()
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


// ── Entry points ─────────────────────────────────────────────────────────────

/** Cache key for a report over a period (what the route and the warm-up share). */
export function reportKey(report: string, range: string, from = '', to = ''): string {
  return SUPABASE_ONLY.has(report) ? `intel:${report}:${report === 'health' || report === 'system' ? '' : `${range}:${from}:${to}`}` : `intel:${report}:${range}:${from}:${to}:${posthogConfig().ok}`
}

/** Freshness window and how long a saved copy may still be shown while it refreshes. */
export function reportTtl(report: string): { ttlMs: number; maxStaleMs: number } {
  // Live: anything up to two minutes old shows at once and refreshes behind it
  // (the page asks again a few seconds later for the new numbers).
  if (report === 'live') return { ttlMs: 15_000, maxStaleMs: 2 * 60_000 }
  if (report === 'system') return { ttlMs: 60_000, maxStaleMs: 30 * 60_000 }
  if (SUPABASE_ONLY.has(report)) return { ttlMs: 2 * 60_000, maxStaleMs: 24 * 3600_000 }
  return { ttlMs: 5 * 60_000, maxStaleMs: 24 * 3600_000 }
}

/** Compute one report: { data, errors }. Throws only on an unexpected failure. */
export async function computeReport(db: any, report: string, p: Period): Promise<{ data: any; errors: string[] }> {
  const errors: string[] = []
  const data =
    report === 'business' ? await businessReport(db, p)
    : report === 'health' ? await healthReport(db)
    : report === 'revenue' ? await revenueReport(db, p)
    : report === 'system' ? await systemReport(db)
    : report === 'live' ? await live(errors)
    : report === 'traffic' ? await traffic(p, errors)
    : report === 'pages' ? await pages(p, errors)
    : report === 'journeys' ? await journeys(p, errors)
    : report === 'funnels' ? await funnels(p, errors)
    : await overview(p, errors)
  return { data, errors }
}

export const isSupabaseOnly = (report: string) => SUPABASE_ONLY.has(report)
