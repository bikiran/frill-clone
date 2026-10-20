// Public status page: how each component's health is judged. Pure functions
// only (no database, no Next), shared by the server that gathers the signals
// (lib/status-server.ts), the public page (app/status) and the platform admin.
//
// Principles:
//   • Evidence or nothing. A component with no recent data is "unknown"
//     ("No recent data"), never "operational".
//   • Conservative. Thresholds need a minimum sample before they can say
//     degraded, and a larger one before they can say outage. A handful of
//     failures in a quiet hour is not an outage.
//   • Platform-wide only. One business's broken store, bad mailbox or wrong
//     password must not turn a component amber: per-tenant failures only
//     count when they span several businesses or most of the platform.
//   • Nothing about customers leaves. The public payload (toPublicStatus) is
//     a whitelist: coarse statuses, fixed wording and our own latency. No
//     tenant names, ids, error text or counts.

export type Health = 'operational' | 'degraded' | 'outage' | 'unknown'
export type OverallLevel = 'operational' | 'partial' | 'degraded' | 'outage' | 'unknown'
export type ComponentKey = 'web' | 'database' | 'jobs' | 'messaging' | 'email' | 'payments' | 'integrations'

export const STATUS_COMPONENTS: { key: ComponentKey; name: string; desc: string; icon: string }[] = [
  { key: 'web', name: 'Web app & API', desc: 'Signing in, the dashboard and the public API', icon: 'globe' },
  { key: 'database', name: 'Database', desc: 'Saving and loading your conversations, contacts and settings', icon: 'folder' },
  { key: 'jobs', name: 'Scheduled jobs', desc: 'Scheduled messages, campaigns, email and order sync, booking reminders', icon: 'calendar' },
  { key: 'messaging', name: 'SMS & voice', desc: 'Texts and calls in and out', icon: 'phone' },
  { key: 'email', name: 'Email', desc: 'Receiving customer email and sending campaigns', icon: 'mail' },
  { key: 'payments', name: 'Payments', desc: 'Card payments, payment links and billing', icon: 'tag' },
  { key: 'integrations', name: 'Store integrations', desc: 'WooCommerce and Shopify order sync', icon: 'plug' },
]
export const COMPONENT_KEYS = STATUS_COMPONENTS.map(c => c.key)
export const isComponentKey = (k: any): k is ComponentKey => COMPONENT_KEYS.includes(k)

/** What a component evaluator returns. `detail` is for the platform admin only
 *  (it never reaches the public payload). */
export type Verdict = { status: Health; note: string; latencyMs?: number | null; detail?: string[] }

export const HEALTH_LABEL: Record<Health, string> = { operational: 'Operational', degraded: 'Degraded', outage: 'Outage', unknown: 'No recent data' }

const RANK: Record<Health, number> = { unknown: -1, operational: 0, degraded: 1, outage: 2 }

/** The worst known status; unknown only when nothing is known. */
export function worst(list: Health[]): Health {
  let out: Health = 'unknown'
  for (const h of list) if (RANK[h] > RANK[out]) out = h
  return out
}
const atLeast = (h: Health, floor: Health): Health => (RANK[h] >= RANK[floor] ? h : floor)

// ── Probes (database, sign-in) ──────────────────────────────────────────────
export type Probe = { ok: boolean; ms: number | null; error?: 'timeout' | 'error' | 'unconfigured' }
export const PROBE_RULE = { slowMs: 1500, timeoutMs: 5000 }

/** One probe plus, when the first one failed, a single retry: a lone blip
 *  reads "degraded", only two failures in a row read "outage". */
export function evaluateProbe(first: Probe | null, retry: Probe | null = null): Verdict {
  if (!first || first.error === 'unconfigured') return { status: 'unknown', note: 'No recent data', latencyMs: null, detail: ['not configured in this environment'] }
  if (first.ok) {
    const slow = (first.ms ?? 0) > PROBE_RULE.slowMs
    return { status: slow ? 'degraded' : 'operational', note: slow ? 'Responding slowly' : 'Responding normally', latencyMs: first.ms, detail: [`${first.ms} ms`] }
  }
  if (retry?.ok) return { status: 'degraded', note: 'Recovered after a failed check', latencyMs: retry.ms, detail: [`first check ${first.error || 'failed'}, retry ${retry.ms} ms`] }
  return { status: 'outage', note: 'Not responding', latencyMs: null, detail: [`check ${first.error || 'failed'}${retry ? `, retry ${retry.error || 'failed'}` : ''}`] }
}

/** The web app and API: up when this server answers (it is, or nothing would
 *  render), sign-in answers, and the database answers. */
export function evaluateWeb(db: Verdict, auth: Verdict): Verdict {
  const status = worst([db.status, auth.status])
  if (status === 'unknown') return { status, note: 'No recent data', latencyMs: null, detail: ['no checks configured'] }
  const authBad = RANK[auth.status] > 0, dbBad = RANK[db.status] > 0
  const note = status === 'operational' ? 'Responding normally'
    : status === 'outage' ? (authBad && !dbBad ? 'Signing in is failing' : 'Not responding')
    : authBad && !dbBad ? 'Signing in is slow' : 'Pages may load slowly'
  return { status, note, latencyMs: auth.latencyMs ?? db.latencyMs ?? null, detail: [`sign-in: ${auth.status}`, `database: ${db.status}`] }
}

// ── Scheduled jobs (job_runs, lib/job-log) ──────────────────────────────────
// The workers customers notice when they stop. staleMs mirrors the Background
// Jobs registry in app/platform-admin/page.tsx (a generous multiple of each
// cadence in vercel.json).
export const KEY_JOBS: { key: string; label: string; staleMs: number }[] = [
  { key: 'send-scheduled', label: 'Scheduled messages', staleMs: 8 * 60_000 },
  { key: 'campaigns-process', label: 'Campaign worker', staleMs: 10 * 60_000 },
  { key: 'email-sync', label: 'Email sync', staleMs: 20 * 60_000 },
  { key: 'order-sync', label: 'Order sync', staleMs: 15 * 60_000 },
  { key: 'booking-reminders', label: 'Booking reminders', staleMs: 30 * 60_000 },
]
export const JOB_RULE = { lookbackMs: 2 * 3600_000, failStreak: 3, outageJobs: 3 }

export type JobRunLite = { job: string; status: string | null; created_at: string; ran?: any; errored?: any; processed?: any; integrations?: any }

const num = (v: any): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/** Did this run do its job? A run marked "error" because one business's store
 *  or mailbox failed (errored < ran) still ran for everyone else, so it counts
 *  as working; only a run where everything (or the job itself) failed doesn't. */
export function runWorked(r: JobRunLite): boolean {
  if (r.status === 'success' || r.status === 'idle') return true
  if (r.status !== 'error') return false
  const errored = num(r.errored), ran = num(r.ran) ?? num(r.processed)
  return errored != null && ran != null && ran > 0 && errored < ran
}

/** runs: the key jobs' runs in the last JOB_RULE.lookbackMs, newest first
 *  (null = couldn't read job_runs). everRan: whether any key job has ever
 *  logged a run (so "nothing in two hours" means stopped, not "never set up"). */
export function evaluateJobs(input: { runs: JobRunLite[] | null; everRan: boolean; now: number }): Verdict {
  const { runs, everRan, now } = input
  if (!runs) return { status: 'unknown', note: 'No recent data', detail: ['job_runs unavailable'] }
  if (!runs.length) {
    return everRan
      ? { status: 'outage', note: 'Scheduled jobs are not running', detail: ['no key job has run in the last 2 hours'] }
      : { status: 'unknown', note: 'No recent data', detail: ['no key job has ever logged a run'] }
  }
  const detail: string[] = []
  let problems = 0
  for (const j of KEY_JOBS) {
    const mine = runs.filter(r => r.job === j.key).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    const lastGood = mine.find(runWorked)
    const age = lastGood ? now - new Date(lastGood.created_at).getTime() : Infinity
    const stale = age > j.staleMs
    const streak = mine.slice(0, JOB_RULE.failStreak)
    const failing = streak.length >= JOB_RULE.failStreak && streak.every(r => !runWorked(r))
    if (stale || failing) {
      problems++
      detail.push(failing
        ? `${j.key}: last ${JOB_RULE.failStreak} runs failed`
        : `${j.key}: ${lastGood ? `last good run ${Math.round(age / 60_000)}m ago` : 'no good run in 2h'} (expected within ${Math.round(j.staleMs / 60_000)}m)`)
    }
  }
  if (!problems) return { status: 'operational', note: 'Running on schedule', detail: ['all key jobs on schedule'] }
  if (problems >= JOB_RULE.outageJobs) return { status: 'outage', note: 'Most scheduled jobs are not running', detail }
  return { status: 'degraded', note: 'Some scheduled jobs are delayed', detail }
}

// ── Error-rate signals (webhook_events, lib/webhook-log) ───────────────────
export type RateCounts = { total: number; errors: number }
export type RateRule = {
  windowMs: number
  minSample: number                                  // fewer events than this: no judgement
  degradedRate: number; degradedMin: number          // error share AND error count
  outageRate: number; outageMin: number; outageSample: number
}
// Twilio / Telnyx (SMS, MMS, calls, delivery receipts) processed by our webhooks.
export const MESSAGING_RULE: RateRule = { windowMs: 30 * 60_000, minSample: 20, degradedRate: 0.25, degradedMin: 5, outageRate: 0.6, outageMin: 25, outageSample: 50 }
// Inbound customer email (Resend → /api/webhooks/email). Bounces and complaints
// are the recipient's business and are not counted.
export const EMAIL_INBOUND_RULE: RateRule = { windowMs: 30 * 60_000, minSample: 20, degradedRate: 0.25, degradedMin: 5, outageRate: 0.6, outageMin: 25, outageSample: 50 }
// Stripe webhooks: low volume, so a longer window and smaller sample.
export const PAYMENTS_RULE: RateRule = { windowMs: 3 * 3600_000, minSample: 5, degradedRate: 0.25, degradedMin: 3, outageRate: 0.75, outageMin: 10, outageSample: 10 }

/** 'unknown' when there's nothing (or too little) to judge from. Signature
 *  rejections are left out by the caller (anyone can send us junk). */
export function evaluateRate(c: RateCounts | null, rule: RateRule): { status: Health; reason: 'no-data' | 'low-sample' | 'ok' | 'elevated' | 'high' } {
  if (!c || c.total <= 0) return { status: 'unknown', reason: 'no-data' }
  const errors = Math.min(Math.max(0, c.errors), c.total)
  if (c.total < rule.minSample) return errors < c.total ? { status: 'operational', reason: 'low-sample' } : { status: 'unknown', reason: 'low-sample' }
  const rate = errors / c.total
  if (c.total >= rule.outageSample && errors >= rule.outageMin && rate >= rule.outageRate) return { status: 'outage', reason: 'high' }
  if (errors >= rule.degradedMin && rate >= rule.degradedRate) return { status: 'degraded', reason: 'elevated' }
  return { status: 'operational', reason: 'ok' }
}
const rateDetail = (name: string, c: RateCounts | null) => `${name}: ${c ? `${c.errors} errors / ${c.total} events` : 'unavailable'}`

export function evaluateMessaging(c: RateCounts | null): Verdict {
  const r = evaluateRate(c, MESSAGING_RULE)
  const note = r.status === 'operational' ? 'Sending and receiving normally'
    : r.status === 'degraded' ? 'Some texts and calls are delayed or failing'
    : r.status === 'outage' ? 'Texts and calls are failing'
    : r.reason === 'low-sample' ? 'Not enough recent activity to measure' : 'No recent data'
  return { status: r.status, note, detail: [rateDetail('sms/voice webhooks 30m', c)] }
}

// Campaign email sends (email_campaign_recipients): Resend refusing or failing
// a send. Only a platform-wide pattern counts: most sends failing, with many
// failures, across several businesses (one business's unverified domain
// shouldn't turn email amber for everyone).
export const EMAIL_SEND_RULE = { windowMs: 60 * 60_000, minSample: 20, minCompanies: 3, degradedRate: 0.5, degradedMin: 20, outageRate: 0.9, outageMin: 50 }
export type EmailSendCounts = { sent: number; failed: number; failedCompanies: number }

export function evaluateEmailSending(c: EmailSendCounts | null): Health {
  if (!c) return 'unknown'
  const total = c.sent + c.failed
  if (total <= 0) return 'unknown'
  if (total < EMAIL_SEND_RULE.minSample || c.failedCompanies < EMAIL_SEND_RULE.minCompanies) return c.sent > 0 ? 'operational' : 'unknown'
  const rate = c.failed / total
  if (c.failed >= EMAIL_SEND_RULE.outageMin && rate >= EMAIL_SEND_RULE.outageRate) return 'outage'
  if (c.failed >= EMAIL_SEND_RULE.degradedMin && rate >= EMAIL_SEND_RULE.degradedRate) return 'degraded'
  return 'operational'
}

export function evaluateEmail(input: { inbound: RateCounts | null; sending: EmailSendCounts | null }): Verdict {
  const inbound = evaluateRate(input.inbound, EMAIL_INBOUND_RULE)
  const sending = evaluateEmailSending(input.sending)
  const status = worst([inbound.status, sending])
  const note = status === 'operational' ? 'Sending and receiving normally'
    : status === 'degraded' ? (RANK[sending] >= 1 && RANK[inbound.status] < 1 ? 'Some emails are failing to send' : 'Some incoming email is delayed')
    : status === 'outage' ? 'Email is failing'
    : inbound.reason === 'low-sample' ? 'Not enough recent activity to measure' : 'No recent data'
  const s = input.sending
  return { status, note, detail: [rateDetail('inbound email webhooks 30m', input.inbound), `campaign sends 60m: ${s ? `${s.failed} failed / ${s.sent + s.failed} (${s.failedCompanies} businesses with failures)` : 'unavailable'}`] }
}

export function evaluatePayments(c: RateCounts | null): Verdict {
  const r = evaluateRate(c, PAYMENTS_RULE)
  const note = r.status === 'operational' ? 'Processing normally'
    : r.status === 'degraded' ? 'Some payment updates are delayed'
    : r.status === 'outage' ? 'Payment updates are failing'
    : r.reason === 'low-sample' ? 'Not enough recent activity to measure' : 'No recent data'
  return { status: r.status, note, detail: [rateDetail('stripe webhooks 3h', c)] }
}

// ── Store integrations ──────────────────────────────────────────────────────
// WooCommerce: order-sync's own run summaries (job_runs.detail: integrations,
// ran, errored) over the last 30 minutes. Shopify: stores past their first
// import whose last successful sync (shopify_integrations.last_synced_at) is
// older than an hour, against a 15-minute cron. Needs at least minActive
// stores, and more than half of them failing, before it says anything bad.
// Meta (Facebook / Instagram) isn't measured: its failures are per-page token
// problems, and the only platform-level signal (signature rejections) can be
// produced by anyone on the internet.
export const INTEGRATION_RULE = { windowMs: 30 * 60_000, minActive: 5, degradedShare: 0.5, outageShare: 0.9, outageMinActive: 10, shopifyStaleMs: 60 * 60_000 }
export type WooSignal = { integrations: number; ran: number; errored: number }
export type ShopifySignal = { active: number; stale: number }

function share(failing: number, of: number, active: number): Health {
  if (active < INTEGRATION_RULE.minActive || of <= 0) return 'unknown'
  const s = failing / of
  if (s >= INTEGRATION_RULE.outageShare && active >= INTEGRATION_RULE.outageMinActive) return 'outage'
  if (s > INTEGRATION_RULE.degradedShare) return 'degraded'
  return 'operational'
}

export function wooSignal(orderSyncRuns: JobRunLite[]): WooSignal | null {
  if (!orderSyncRuns.length) return null
  let integrations = 0, ran = 0, errored = 0
  for (const r of orderSyncRuns) {
    integrations = Math.max(integrations, num(r.integrations) ?? 0)
    ran += num(r.ran) ?? 0
    errored += num(r.errored) ?? 0
  }
  return { integrations, ran, errored }
}

export function evaluateIntegrations(input: { woo: WooSignal | null; shopify: ShopifySignal | null }): Verdict {
  const woo = input.woo ? share(input.woo.errored, input.woo.ran, input.woo.integrations) : 'unknown'
  const shop = input.shopify ? share(input.shopify.stale, input.shopify.active, input.shopify.active) : 'unknown'
  const status = worst([woo, shop])
  const note = status === 'operational' ? 'Syncing normally'
    : status === 'degraded' ? 'Store sync is delayed for many stores'
    : status === 'outage' ? 'Store sync is failing'
    : 'Not enough connected stores to measure'
  const w = input.woo, s = input.shopify
  return { status, note, detail: [
    `woocommerce 30m: ${w ? `${w.errored} failed / ${w.ran} store syncs, ${w.integrations} stores` : 'no order-sync runs'} → ${woo}`,
    `shopify: ${s ? `${s.stale} stale / ${s.active} stores` : 'unavailable'} → ${shop}`,
  ] }
}

// ── Incidents ───────────────────────────────────────────────────────────────
export const INCIDENT_STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'] as const
export type IncidentStatus = typeof INCIDENT_STATUSES[number]
export const INCIDENT_IMPACTS = ['minor', 'major', 'critical'] as const
export type IncidentImpact = typeof INCIDENT_IMPACTS[number]
export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = { investigating: 'Investigating', identified: 'Identified', monitoring: 'Monitoring', resolved: 'Resolved' }
export const INCIDENT_IMPACT_LABEL: Record<IncidentImpact, string> = { minor: 'Minor', major: 'Major', critical: 'Critical' }
/** An active incident lifts each component it names to at least this. */
export const IMPACT_FLOOR: Record<IncidentImpact, Health> = { minor: 'degraded', major: 'outage', critical: 'outage' }

export type IncidentUpdate = { at: string; status: IncidentStatus; message: string }
export type Incident = {
  id: string; title: string; status: IncidentStatus; impact: IncidentImpact
  components: string[]; updates: IncidentUpdate[]
  started_at: string; resolved_at: string | null; published: boolean
  created_at?: string; updated_at?: string
}
export const isActiveIncident = (i: Pick<Incident, 'status' | 'published'>) => i.published && i.status !== 'resolved'

export type ComponentStatus = Verdict & { key: ComponentKey; name: string; desc: string; incident?: boolean }

/** Raise each component an active incident names to at least its impact. */
export function applyIncidents(components: ComponentStatus[], incidents: Incident[]): ComponentStatus[] {
  const active = incidents.filter(isActiveIncident)
  return components.map(c => {
    let floor: Health = 'unknown'
    for (const i of active) if ((i.components || []).includes(c.key)) floor = worst([floor, IMPACT_FLOOR[i.impact] || 'degraded'])
    if (floor === 'unknown') return c
    const status = atLeast(c.status, floor)
    return { ...c, status, incident: true, note: status !== c.status || c.status === 'unknown' ? 'Affected by an active incident' : c.note }
  })
}

/** The banner. Unknown components never make it green. */
export function overallStatus(components: { name: string; status: Health }[], incidents: Incident[] = []): { status: OverallLevel; title: string; sub: string } {
  const active = incidents.filter(isActiveIncident)
  let floor: Health = 'unknown'
  for (const i of active) floor = worst([floor, IMPACT_FLOOR[i.impact] || 'degraded'])
  const statuses = components.map(c => c.status)
  const top = worst([...statuses, floor])
  const unknown = components.filter(c => c.status === 'unknown')
  const listNames = (xs: { name: string }[]) => xs.length <= 1 ? (xs[0]?.name || '') : `${xs.slice(0, -1).map(x => x.name).join(', ')} and ${xs[xs.length - 1].name}`
  const incidentSub = active.length ? `${active.length === 1 ? 'An incident is' : `${active.length} incidents are`} open: see the details below.` : ''
  if (top === 'outage') {
    const outs = components.filter(c => c.status === 'outage')
    const major = active.some(i => i.impact === 'critical') || outs.length >= Math.ceil(components.length / 2)
    return { status: 'outage', title: major ? 'Major outage' : 'Partial outage', sub: incidentSub || (outs.length ? `${listNames(outs)} ${outs.length === 1 ? 'is' : 'are'} not working right now.` : '') }
  }
  if (top === 'degraded') {
    const degs = components.filter(c => c.status === 'degraded')
    return { status: 'degraded', title: 'Degraded performance', sub: incidentSub || (degs.length ? `${listNames(degs)} ${degs.length === 1 ? 'is' : 'are'} slower or less reliable than usual.` : '') }
  }
  if (top === 'unknown') return { status: 'unknown', title: 'Status unavailable', sub: 'We couldn’t check our systems just now. Please try again shortly.' }
  if (unknown.length) return { status: 'partial', title: 'Most systems operational', sub: `Everything we can measure is working. No recent data for ${listNames(unknown)}.` }
  return { status: 'operational', title: 'All systems operational', sub: 'Every component passed its latest checks.' }
}

// ── Uptime history ──────────────────────────────────────────────────────────
export const HISTORY_DAYS = 30
export const HISTORY_RETENTION_DAYS = 90
export const SNAPSHOT_EVERY_MS = 5 * 60_000
export const STATUS_TZ = 'Australia/Sydney'
/** Samples (5 minutes each) of a status before a day takes that colour, so a
 *  single blip doesn't paint the whole day. */
export const DAY_MIN_SAMPLES = 2

export type DayStatus = 'operational' | 'degraded' | 'outage' | 'none'
export type DailyCounts = { day: string; component: string; operational: number; degraded: number; outage: number; unknown: number }

export function snapshotBucket(now: number): string {
  return new Date(Math.floor(now / SNAPSHOT_EVERY_MS) * SNAPSHOT_EVERY_MS).toISOString()
}
/** YYYY-MM-DD in Sydney time (the day customers see). */
export function dayKey(at: number | string | Date, tz = STATUS_TZ): string {
  const d = at instanceof Date ? at : new Date(at)
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const g = (t: string) => p.find(x => x.type === t)?.value || '00'
  return `${g('year')}-${g('month')}-${g('day')}`
}
/** The n day keys ending with `today`, oldest first. */
export function lastDays(today: string, n: number): string[] {
  const base = Date.parse(`${today}T12:00:00Z`)
  return Array.from({ length: n }, (_, i) => new Date(base - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10))
}

export function dayStatus(c: Pick<DailyCounts, 'operational' | 'degraded' | 'outage'> | null | undefined): DayStatus {
  if (!c || c.operational + c.degraded + c.outage <= 0) return 'none'
  if (c.outage >= DAY_MIN_SAMPLES) return 'outage'
  if (c.degraded + c.outage >= DAY_MIN_SAMPLES) return 'degraded'
  return 'operational'
}

/** Count one day's snapshots per component (absolute, so recounting is idempotent). */
export function countSnapshots(day: string, snaps: { components: Record<string, any> | null }[]): DailyCounts[] {
  return COMPONENT_KEYS.map(component => {
    const c: DailyCounts = { day, component, operational: 0, degraded: 0, outage: 0, unknown: 0 }
    for (const s of snaps) {
      const h = s.components?.[component]
      if (h === 'operational' || h === 'degraded' || h === 'outage') c[h]++
      else c.unknown++
    }
    return c
  })
}

export type PublicHistory = { days: string[]; components: Record<string, { day: string; status: DayStatus }[]>; uptime: Record<string, number | null> }

export function buildHistory(rows: DailyCounts[] | null, today: string, n = HISTORY_DAYS): PublicHistory | null {
  if (!rows) return null
  const days = lastDays(today, n)
  const by = new Map(rows.map(r => [`${r.day}|${r.component}`, r]))
  const components: PublicHistory['components'] = {}
  const uptime: PublicHistory['uptime'] = {}
  for (const k of COMPONENT_KEYS) {
    let known = 0, out = 0
    components[k] = days.map(day => {
      const r = by.get(`${day}|${k}`)
      if (r) { known += r.operational + r.degraded + r.outage; out += r.outage }
      return { day, status: dayStatus(r) }
    })
    uptime[k] = known ? Math.floor((1 - out / known) * 10000) / 100 : null
  }
  return { days, components, uptime }
}

// ── The payloads ────────────────────────────────────────────────────────────
export type PublicIncident = Pick<Incident, 'id' | 'title' | 'status' | 'impact' | 'components' | 'updates' | 'started_at' | 'resolved_at'>
export type PublicComponent = { key: ComponentKey; name: string; desc: string; status: Health; note: string; latencyMs: number | null }
export type PublicStatus = {
  generatedAt: string
  overall: { status: OverallLevel; title: string; sub: string }
  components: PublicComponent[]
  incidents: { active: PublicIncident[]; recent: PublicIncident[] } | null
  history: PublicHistory | null
}
export type FullStatus = Omit<PublicStatus, 'components' | 'incidents'> & {
  components: ComponentStatus[]
  incidents: { active: Incident[]; recent: Incident[] } | null
}

export const INCIDENT_HISTORY_DAYS = 14

/** Split published incidents into open ones and those resolved in the last 14 days. */
export function splitIncidents(all: Incident[], now: number): { active: Incident[]; recent: Incident[] } {
  const since = now - INCIDENT_HISTORY_DAYS * 86_400_000
  const published = all.filter(i => i.published)
  const active = published.filter(isActiveIncident).sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
  const recent = published.filter(i => i.status === 'resolved' && new Date(i.resolved_at || i.started_at).getTime() >= since)
    .sort((a, b) => ((a.resolved_at || a.started_at) < (b.resolved_at || b.started_at) ? 1 : -1))
  return { active, recent }
}

const pubIncident = (i: Incident): PublicIncident => ({
  id: String(i.id), title: String(i.title || ''), status: i.status, impact: i.impact,
  components: (i.components || []).filter(isComponentKey),
  updates: (i.updates || []).map(u => ({ at: String(u.at), status: u.status, message: String(u.message || '') })),
  started_at: String(i.started_at), resolved_at: i.resolved_at ? String(i.resolved_at) : null,
})

/** The whitelist: exactly these keys reach the public page and /api/status. */
export function toPublicStatus(s: FullStatus): PublicStatus {
  return {
    generatedAt: s.generatedAt,
    overall: { status: s.overall.status, title: s.overall.title, sub: s.overall.sub },
    components: s.components.map(c => ({
      key: c.key, name: c.name, desc: c.desc, status: c.status, note: c.note,
      latencyMs: (c.key === 'web' || c.key === 'database') && typeof c.latencyMs === 'number' ? Math.round(c.latencyMs) : null,
    })),
    incidents: s.incidents ? { active: s.incidents.active.map(pubIncident), recent: s.incidents.recent.map(pubIncident) } : null,
    history: s.history ? { days: [...s.history.days], components: Object.fromEntries(Object.entries(s.history.components).map(([k, v]) => [k, v.map(d => ({ day: d.day, status: d.status }))])), uptime: { ...s.history.uptime } } : null,
  }
}

/** Put the evaluated components together with incidents and the banner. */
export function assembleStatus(input: {
  now: number
  verdicts: Record<ComponentKey, Verdict>
  incidents: Incident[] | null
  history: PublicHistory | null
}): FullStatus {
  const base: ComponentStatus[] = STATUS_COMPONENTS.map(c => ({ ...input.verdicts[c.key], key: c.key, name: c.name, desc: c.desc }))
  const incidents = input.incidents ? splitIncidents(input.incidents, input.now) : null
  const components = incidents ? applyIncidents(base, incidents.active) : base
  return {
    generatedAt: new Date(input.now).toISOString(),
    overall: overallStatus(components, incidents?.active || []),
    components,
    incidents,
    history: input.history,
  }
}
