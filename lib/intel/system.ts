// System health for Super Admin → Intelligence. Server only.
//
//   gatherSystem()   what's happening now, from records Colvy already keeps:
//                    every scheduled job (vercel.json) against its runs in
//                    job_runs, webhooks by source, API errors, AI agent runs,
//                    the public status components, failing payments, sign-up
//                    code delivery, and what AI and SMS cost this month.
//   alertsFrom()     turns that into alerts with plain rules (pure).
//   runAlerts()      the hourly job: keeps intel_alerts current (raised,
//                    still open, resolved) and tells the Colvy team about new
//                    critical ones, at most once a day each (bell + email,
//                    lib/billing-alert alertColvyTeamOncePerDay).

import vercelConfig from '@/vercel.json'

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

// ── Schedules ────────────────────────────────────────────────────────────────

/** Roughly how often a cron expression runs, in minutes. */
export function cronEveryMinutes(expr: string): number {
  const [m, h, dom, mon, dow] = String(expr || '').trim().split(/\s+/)
  if (!m || !h) return 1440
  const step = (f: string) => { const x = /^\*\/(\d+)$/.exec(f); return x ? Number(x[1]) : null }
  if (h === '*' && dom === '*' && mon === '*' && dow === '*') {
    if (m === '*') return 1
    if (step(m)) return step(m)!
    if (m.includes(',')) return Math.round(60 / m.split(',').length)
    return 60
  }
  if (step(h)) return step(h)! * 60
  if (h.includes(',')) return Math.round(1440 / h.split(',').length)
  if (dow && dow !== '*') return 7 * 1440
  return 1440
}

/** The names a cron path may log under in job_runs ("/api/campaigns/process" → campaigns-process). */
export function jobNamesFor(path: string): string[] {
  const segs = String(path).replace(/^\/?api\//, '').split('/').filter(Boolean)
  if (segs[0] === 'cron') return [segs.slice(1).join('-')]
  const joined = segs.join('-')
  const singular = segs.length > 1 ? [segs[0].replace(/s$/, ''), ...segs.slice(1)].join('-') : joined
  return [...new Set([joined, singular, segs[segs.length - 1]])]
}

export type CronJob = { path: string; schedule: string; everyMin: number; names: string[] }
export const CRON_JOBS: CronJob[] = ((vercelConfig as any).crons || []).map((c: any) => ({ path: c.path, schedule: c.schedule, everyMin: cronEveryMinutes(c.schedule), names: jobNamesFor(c.path) }))

// ── Gather ───────────────────────────────────────────────────────────────────

export type JobState = 'ok' | 'overdue' | 'failing' | 'not_logged' | 'error' | 'quiet'
export type JobRow = { job: string; path: string; schedule: string; everyMin: number; lastAt: string | null; lastStatus: string | null; lastError: string | null; runs24h: number; failed24h: number; avgMs: number | null; state: JobState; lateMin: number | null }

async function count(q: any): Promise<number> { try { const { count: n, error } = await q; return error ? 0 : n || 0 } catch { return 0 } }
async function rows<T = any>(q: any): Promise<T[]> { try { const { data, error } = await q; return error ? [] : data || [] } catch { return [] } }

async function inBatches<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < xs.length; i += n) out.push(...await Promise.all(xs.slice(i, i + n).map(fn)))
  return out
}

export async function gatherJobs(db: any, now = Date.now()): Promise<JobRow[]> {
  const since = new Date(now - DAY).toISOString()
  return inBatches(CRON_JOBS, 8, async j => {
    // Which of its possible names it actually logs under.
    let name = j.names[0], last: any[] = []
    for (const n of j.names) {
      last = await rows(db.from('job_runs').select('job, status, error, created_at, duration_ms').eq('job', n).order('created_at', { ascending: false }).limit(3))
      if (last.length) { name = n; break }
    }
    if (!last.length) return { job: name, path: j.path, schedule: j.schedule, everyMin: j.everyMin, lastAt: null, lastStatus: null, lastError: null, runs24h: 0, failed24h: 0, avgMs: null, state: 'not_logged' as JobState, lateMin: null }
    const [runs24h, failed24h, recent] = await Promise.all([
      count(db.from('job_runs').select('id', { count: 'exact', head: true }).eq('job', name).gte('created_at', since)),
      count(db.from('job_runs').select('id', { count: 'exact', head: true }).eq('job', name).eq('status', 'error').gte('created_at', since)),
      rows<any>(db.from('job_runs').select('duration_ms').eq('job', name).gte('created_at', since).order('created_at', { ascending: false }).limit(50)),
    ])
    const durs = recent.map(r => Number(r.duration_ms)).filter(n => Number.isFinite(n) && n >= 0)
    const ageMin = (now - Date.parse(last[0].created_at)) / MIN
    const allowed = Math.max(3 * j.everyMin, j.everyMin + 30)
    const failing = last.length >= 3 && last.every(r => r.status === 'error')
    // Silence only means "stopped" for a job that logs every run. Some log only
    // when they had work; judge by the day before its last run: if it logged
    // fewer than half the runs its schedule makes, a quiet spell is normal.
    let logsEveryRun = true
    if (ageMin > allowed && j.everyMin < 1440) {
      const lastAt = Date.parse(last[0].created_at)
      const before = await count(db.from('job_runs').select('id', { count: 'exact', head: true }).eq('job', name)
        .gte('created_at', new Date(lastAt - DAY).toISOString()).lte('created_at', new Date(lastAt).toISOString()))
      logsEveryRun = before >= 0.5 * (1440 / j.everyMin)
    }
    const state: JobState = failing ? 'failing' : ageMin > allowed ? (logsEveryRun ? 'overdue' : 'quiet') : last[0].status === 'error' ? 'error' : 'ok'
    return {
      job: name, path: j.path, schedule: j.schedule, everyMin: j.everyMin,
      lastAt: last[0].created_at, lastStatus: last[0].status, lastError: last[0].error ? String(last[0].error).slice(0, 240) : null,
      runs24h, failed24h, avgMs: durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null,
      state, lateMin: ageMin > allowed ? Math.round(ageMin - j.everyMin) : null,
    }
  })
}

export type SystemData = Awaited<ReturnType<typeof gatherSystem>>

export async function gatherSystem(db: any, now = Date.now()) {
  const d1 = new Date(now - DAY).toISOString()
  const h1 = new Date(now - HOUR).toISOString()
  const stuckBefore = new Date(now - 15 * MIN).toISOString()
  const monthStart = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1)).toISOString()
  const head = { count: 'exact' as const, head: true }

  const [jobs, hooks, apiErr24, apiErr1h, apiRows, agentRuns, agentFailed, agentStuck, stripeEvents, pastDue, status, smsHealth, usage, smsMonth] = await Promise.all([
    gatherJobs(db, now),
    rows<any>(db.from('webhook_events').select('source, status, error, created_at').gte('created_at', d1).order('created_at', { ascending: false }).limit(5000)),
    count(db.from('api_logs').select('id', head).eq('level', 'error').gte('created_at', d1)),
    count(db.from('api_logs').select('id', head).eq('level', 'error').gte('created_at', h1)),
    rows<any>(db.from('api_logs').select('source, route, message, created_at').eq('level', 'error').gte('created_at', d1).order('created_at', { ascending: false }).limit(2000)),
    count(db.from('agent_runs').select('id', head).gte('created_at', d1)),
    count(db.from('agent_runs').select('id', head).eq('status', 'failed').gte('created_at', d1)),
    count(db.from('agent_runs').select('id', head).in('status', ['queued', 'running']).lt('updated_at', stuckBefore)),
    count(db.from('stripe_events').select('id', head).gte('created_at', d1)),
    rows<any>(db.from('billing_subscriptions').select('id, company_id, mrr_cents, kind').eq('status', 'past_due').limit(500)),
    (async () => { try { const { computeStatus } = await import('@/lib/status-server'); return await computeStatus(db, { history: false, now }) } catch { return null } })(),
    (async () => { try { const { signupSmsHealth } = await import('@/lib/signup-attempts'); return await signupSmsHealth(db, now) } catch { return null } })(),
    (async () => { const { data, error } = await db.rpc('intel_tenant_usage', { p_from: monthStart, p_to: new Date(now).toISOString() }); return error || !Array.isArray(data) ? null : data })().catch(() => null),
    rows<any>(db.from('sms_usage').select('sent').eq('period', monthStart.slice(0, 7)).limit(10000)),
  ])

  // Webhooks by source.
  const bySource = new Map<string, { source: string; total: number; processed: number; errors: number; rejected: number; lastError: string | null; lastErrorAt: string | null; lastAt: string | null }>()
  for (const h of hooks) {
    const k = h.source || 'unknown'
    const e = bySource.get(k) || { source: k, total: 0, processed: 0, errors: 0, rejected: 0, lastError: null, lastErrorAt: null, lastAt: null }
    e.total++
    if (h.status === 'processed') e.processed++
    if (h.status === 'error') e.errors++
    if (h.status === 'rejected') e.rejected++
    if ((h.status === 'error' || h.status === 'rejected') && !e.lastErrorAt) { e.lastError = String(h.error || h.status).slice(0, 200); e.lastErrorAt = h.created_at }
    if (!e.lastAt) e.lastAt = h.created_at
    bySource.set(k, e)
  }

  // API errors by source, and per hour.
  const apiBySource = new Map<string, { key: string; errors: number; lastMessage: string; lastAt: string }>()
  const perHour = Array.from({ length: 24 }, (_, i) => ({ hour: new Date(now - (23 - i) * HOUR).toISOString().slice(0, 13), errors: 0 }))
  for (const r of apiRows) {
    const k = r.source || r.route || 'unknown'
    const e = apiBySource.get(k) || { key: k, errors: 0, lastMessage: String(r.message || '').slice(0, 200), lastAt: r.created_at }
    e.errors++; apiBySource.set(k, e)
    const slot = perHour.find(p => p.hour === String(r.created_at).slice(0, 13)); if (slot) slot.errors++
  }

  // AI cost this month (list prices, USD) and SMS parts.
  let aiUsd = 0, aiTokens = 0, aiUnpriced = 0
  if (usage) {
    const { estimateCost, getAiSettings } = await import('@/lib/ai-models')
    const prices = (await getAiSettings(db).catch(() => null))?.prices || {}
    for (const u of usage) if (u.kind === 'ai') {
      const tokens = Number(u.a) + Number(u.b), usd = estimateCost(u.key, Number(u.a), Number(u.b), prices)
      aiTokens += tokens
      if (usd == null) aiUnpriced += tokens; else aiUsd += usd
    }
  }

  return {
    now: new Date(now).toISOString(),
    jobs,
    webhooks: [...bySource.values()].sort((a, b) => b.total - a.total),
    webhooksSampled: hooks.length >= 5000,
    api: { errors24h: apiErr24, errors1h: apiErr1h, bySource: [...apiBySource.values()].sort((a, b) => b.errors - a.errors).slice(0, 12), perHour },
    agents: { runs24h: agentRuns, failed24h: agentFailed, stuck: agentStuck, paused: process.env.AGENTS_DISABLED === '1' },
    billing: { stripeEvents24h: stripeEvents, pastDue: pastDue.length, pastDueCents: pastDue.reduce((s, r) => s + Number(r.mrr_cents || 0), 0) },
    status: status ? { overall: status.overall, components: status.components.map((c: any) => ({ key: c.key, name: c.name, status: c.status, note: c.note })) } : null,
    signupSms: smsHealth ? { day: smsHealth.day, week: smsHealth.week, missing: smsHealth.missing } : null,
    usage: { aiUsdMonth: Math.round(aiUsd * 100) / 100, aiTokensMonth: aiTokens, aiUnpricedTokensMonth: aiUnpriced, smsPartsMonth: smsMonth.reduce((s, r) => s + Number(r.sent || 0), 0) },
  }
}

// ── Alerts ───────────────────────────────────────────────────────────────────

export type Alert = { fingerprint: string; severity: 'critical' | 'warning' | 'info'; category: string; title: string; detail: string; link: string }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const every = (min: number) => (min < 60 ? `every ${min} min` : min < 1440 ? `every ${Math.round(min / 60)} h` : 'daily')

export function alertsFrom(s: Pick<SystemData, 'jobs' | 'webhooks' | 'api' | 'agents' | 'billing' | 'status' | 'signupSms'>): Alert[] {
  const out: Alert[] = []
  for (const j of s.jobs) {
    if (j.state === 'failing') out.push({ fingerprint: `job_failing:${j.job}`, severity: 'critical', category: 'jobs', title: `${j.job} keeps failing`, detail: `The last 3 runs failed${j.lastError ? `: ${j.lastError}` : ''}.`, link: 'jobs' })
    else if (j.state === 'overdue') out.push({ fingerprint: `job_stale:${j.job}`, severity: j.everyMin <= 15 ? 'critical' : 'warning', category: 'jobs', title: `${j.job} has stopped running`, detail: `It runs ${every(j.everyMin)}; the last run was ${j.lateMin != null ? `${j.lateMin + j.everyMin} min` : 'long'} ago.`, link: 'jobs' })
  }
  for (const w of s.webhooks) {
    const bad = w.errors + w.rejected
    if (bad >= 5 && bad / Math.max(1, w.total) >= 0.2) out.push({ fingerprint: `webhook_errors:${w.source}`, severity: 'warning', category: 'webhooks', title: `${w.source} webhooks are failing`, detail: `${bad} of ${w.total} in the last 24 hours failed${w.rejected ? ` (${w.rejected} rejected)` : ''}${w.lastError ? `. Latest: ${w.lastError}` : ''}.`, link: 'webhooks' })
  }
  if (s.api.errors1h >= 25) out.push({ fingerprint: 'api_errors_spike', severity: 'warning', category: 'api', title: 'API errors are spiking', detail: `${s.api.errors1h} errors in the last hour (${s.api.errors24h} in 24 hours).`, link: 'apilogs' })
  for (const c of s.status?.components || []) {
    if (c.status === 'outage') out.push({ fingerprint: `status:${c.key}`, severity: 'critical', category: 'status', title: `${c.name}: outage`, detail: c.note || '', link: 'status' })
    else if (c.status === 'degraded') out.push({ fingerprint: `status:${c.key}`, severity: 'warning', category: 'status', title: `${c.name}: degraded`, detail: c.note || '', link: 'status' })
  }
  if (s.agents.stuck > 0) out.push({ fingerprint: 'agents_stuck', severity: 'warning', category: 'agents', title: `${plural(s.agents.stuck, 'AI agent run')} stuck`, detail: 'Queued or running for more than 15 minutes.', link: 'agents' })
  if (s.billing.pastDue > 0) out.push({ fingerprint: 'billing_past_due', severity: 'warning', category: 'billing', title: `${plural(s.billing.pastDue, 'subscription')} with failing payments`, detail: `A$${(s.billing.pastDueCents / 100).toFixed(2)} a month at risk.`, link: 'intel_revenue' })
  const day = s.signupSms?.day as any
  if (day && Number(day.sent) >= 5 && Number(day.delivered) / Math.max(1, Number(day.sent)) < 0.7) out.push({ fingerprint: 'signup_sms_delivery', severity: 'warning', category: 'signups', title: 'Sign-up code texts aren’t arriving', detail: `${day.delivered} of ${day.sent} delivered in the last 24 hours.`, link: 'signups' })
  return out
}

const RANK = { critical: 0, warning: 1, info: 2 }

export async function runAlerts(db: any, now = new Date()): Promise<{ ok: boolean; setup?: false; open?: number; raised?: number; resolved?: number; notified?: number; error?: string }> {
  const existing = await db.from('intel_alerts').select('fingerprint, resolved_at, notified_at, occurrences, first_seen_at').limit(2000)
  if (existing.error) return { ok: true, setup: false }
  const sys = await gatherSystem(db, now.getTime())
  const current = alertsFrom(sys).sort((a, b) => RANK[a.severity] - RANK[b.severity])
  const byFp = new Map<string, any>((existing.data || []).map((r: any) => [r.fingerprint, r]))
  const iso = now.toISOString()
  let raised = 0, resolved = 0, notified = 0

  const upserts = current.map(a => {
    const prev = byFp.get(a.fingerprint)
    const open = prev && !prev.resolved_at
    if (!open) raised++
    return {
      ...a, last_seen_at: iso,
      first_seen_at: open ? prev.first_seen_at : iso,
      resolved_at: null,
      notified_at: open ? prev.notified_at : null,
      occurrences: open ? Number(prev.occurrences || 1) + 1 : 1,
    }
  })
  if (upserts.length) {
    const { error } = await db.from('intel_alerts').upsert(upserts, { onConflict: 'fingerprint' })
    if (error) return { ok: false, error: error.message }
  }
  const gone = (existing.data || []).filter((r: any) => !r.resolved_at && !current.some(a => a.fingerprint === r.fingerprint)).map((r: any) => r.fingerprint)
  if (gone.length) { await db.from('intel_alerts').update({ resolved_at: iso }).in('fingerprint', gone); resolved = gone.length }
  // Resolved alerts are kept 30 days; so is the job log (Background jobs and
  // these checks only look back a week), which nothing else ever pruned.
  await db.from('intel_alerts').delete().lt('resolved_at', new Date(now.getTime() - 30 * DAY).toISOString())
  try { await db.from('job_runs').delete().lt('created_at', new Date(now.getTime() - 30 * DAY).toISOString()) } catch {}

  // Tell the team about new critical alerts (bell in Colvy's workspace + email).
  const { alertColvyTeamOncePerDay } = await import('@/lib/billing-alert')
  for (const a of upserts.filter(u => u.severity === 'critical' && !u.notified_at)) {
    const sent = await alertColvyTeamOncePerDay(db, {
      key: `intel_alert:${a.fingerprint}`,
      subject: `Colvy alert: ${a.title}`,
      message: `${a.title}. ${a.detail} See super admin → Intelligence → System health.`,
    })
    if (sent) { notified++; await db.from('intel_alerts').update({ notified_at: iso }).eq('fingerprint', a.fingerprint) }
  }
  return { ok: true, open: current.length, raised, resolved, notified }
}
