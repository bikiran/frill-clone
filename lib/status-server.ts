// Server side of the public status page: gathers the signals each component
// is judged on (lib/status-health.ts has the rules), reads incidents and the
// uptime history, and records the five-minute snapshots the history is built
// from. Every query has a short timeout and fails to "unknown", never to a
// thrown error: a status page that crashes when the database is down is
// useless. Server only (service-role client); no Next imports, so it runs
// under tests and the cron alike. The cached entry point is lib/status-cached.ts.

import { createClient } from '@supabase/supabase-js'
import {
  COMPONENT_KEYS, EMAIL_INBOUND_RULE, EMAIL_SEND_RULE, HISTORY_DAYS, HISTORY_RETENTION_DAYS, INTEGRATION_RULE, JOB_RULE, KEY_JOBS,
  MESSAGING_RULE, PAYMENTS_RULE, PROBE_RULE,
  assembleStatus, buildHistory, countSnapshots, dayKey, evaluateEmail, evaluateIntegrations, evaluateJobs, evaluateMessaging,
  evaluatePayments, evaluateProbe, evaluateWeb, lastDays, snapshotBucket, wooSignal,
  type ComponentKey, type DailyCounts, type FullStatus, type Health, type Incident, type JobRunLite, type Probe, type RateCounts, type Verdict,
} from '@/lib/status-health'
import { isMissingTable, listIncidents } from '@/lib/status-incidents'

export const SNAPSHOT_TABLE = 'status_snapshots'
export const DAILY_TABLE = 'status_daily'

export function statusDb(): any {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const QUERY_TIMEOUT_MS = 4000
const TIMEOUT = Symbol('timeout')

/** Resolve the query, or TIMEOUT after `ms` (the query is left to finish on its own). */
async function within<T>(p: PromiseLike<T>, ms = QUERY_TIMEOUT_MS): Promise<T | typeof TIMEOUT> {
  let timer: any
  try {
    return await Promise.race([Promise.resolve(p), new Promise<typeof TIMEOUT>(res => { timer = setTimeout(() => res(TIMEOUT), ms) })])
  } finally { clearTimeout(timer) }
}

/** A query's rows, or null when it failed, timed out or the table is missing. */
async function rows<T = any>(q: PromiseLike<{ data: T[] | null; error: any }>): Promise<T[] | null> {
  try {
    const r = await within(q)
    if (r === TIMEOUT || r.error) return null
    return r.data || []
  } catch { return null }
}
async function count(q: PromiseLike<{ count: number | null; error: any }>): Promise<number | null> {
  try {
    const r = await within(q)
    if (r === TIMEOUT || r.error) return null
    return r.count || 0
  } catch { return null }
}

// ── Probes ──────────────────────────────────────────────────────────────────
export async function probeDatabase(db: any): Promise<Probe> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return { ok: false, ms: null, error: 'unconfigured' }
  const t0 = Date.now()
  try {
    const r = await within(db.from('companies').select('id').limit(1), PROBE_RULE.timeoutMs)
    if (r === TIMEOUT) return { ok: false, ms: null, error: 'timeout' }
    if ((r as any).error) return { ok: false, ms: Date.now() - t0, error: 'error' }
    return { ok: true, ms: Date.now() - t0 }
  } catch { return { ok: false, ms: null, error: 'error' } }
}

/** Supabase Auth's own health endpoint: sign-in works when this answers. */
export async function probeAuth(): Promise<Probe> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return { ok: false, ms: null, error: 'unconfigured' }
  const t0 = Date.now()
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/health`, { headers: { apikey: key }, cache: 'no-store', signal: AbortSignal.timeout(PROBE_RULE.timeoutMs) })
    return res.ok ? { ok: true, ms: Date.now() - t0 } : { ok: false, ms: Date.now() - t0, error: 'error' }
  } catch (e: any) {
    return { ok: false, ms: null, error: e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : 'error' }
  }
}

async function probeTwice(p: () => Promise<Probe>): Promise<Verdict> {
  const first = await p()
  if (first.ok || first.error === 'unconfigured') return evaluateProbe(first)
  return evaluateProbe(first, await p())
}

// ── Signals ─────────────────────────────────────────────────────────────────
const sinceIso = (now: number, ms: number) => new Date(now - ms).toISOString()

async function webhookCounts(db: any, sources: string[], since: string): Promise<RateCounts | null> {
  // Signature rejections are excluded: anyone can post junk at a webhook.
  const base = () => db.from('webhook_events').select('id', { count: 'exact', head: true }).in('source', sources).gte('created_at', since)
  const [total, errors] = await Promise.all([count(base().neq('status', 'rejected')), count(base().eq('status', 'error'))])
  if (total == null || errors == null) return null
  return { total, errors }
}

async function emailSendCounts(db: any, now: number) {
  const since = sinceIso(now, EMAIL_SEND_RULE.windowMs)
  // Recent email campaigns first (small table), so the recipient queries use
  // the (campaign_id, status) index instead of scanning every recipient.
  const camps = await rows<any>(db.from('campaigns').select('id, company_id').eq('channel', 'email').or(`status.eq.sending,completed_at.gte.${since}`).limit(50))
  if (camps == null) return null
  if (!camps.length) return { sent: 0, failed: 0, failedCompanies: 0 }
  const ids = camps.map(c => c.id)
  const [sent, failedRows] = await Promise.all([
    count(db.from('email_campaign_recipients').select('id', { count: 'exact', head: true }).in('campaign_id', ids).eq('status', 'sent').gte('sent_at', since)),
    rows<any>(db.from('email_campaign_recipients').select('campaign_id').in('campaign_id', ids).eq('status', 'failed').gte('claimed_at', since).limit(2000)),
  ])
  if (sent == null || failedRows == null) return null
  const companyOf = new Map(camps.map(c => [c.id, c.company_id]))
  return { sent, failed: failedRows.length, failedCompanies: new Set(failedRows.map(r => companyOf.get(r.campaign_id)).filter(Boolean)).size }
}

async function shopifySignal(db: any, now: number) {
  // Live stores past their first import (the shopify-sync cron's own filter).
  const list = await rows<any>(db.from('shopify_integrations').select('last_synced_at')
    .eq('is_active', true).eq('needs_reauth', false).is('uninstalled_at', null)
    .not('access_token', 'is', null).not('orders_synced_at', 'is', null).limit(2000))
  if (list == null) return null
  const cutoff = now - INTEGRATION_RULE.shopifyStaleMs
  return { active: list.length, stale: list.filter(s => !s.last_synced_at || new Date(s.last_synced_at).getTime() < cutoff).length }
}

export type Signals = {
  database: Verdict; auth: Verdict
  jobs: { runs: JobRunLite[] | null; everRan: boolean }
  messaging: RateCounts | null
  emailInbound: RateCounts | null
  emailSending: { sent: number; failed: number; failedCompanies: number } | null
  payments: RateCounts | null
  shopify: { active: number; stale: number } | null
}

export async function gatherSignals(db: any, o: { now?: number; authProbe?: () => Promise<Probe> } = {}): Promise<Signals> {
  const now = o.now ?? Date.now()
  const jobKeys = KEY_JOBS.map(j => j.key)
  const [database, auth, runs, messaging, emailInbound, emailSending, payments, shopify] = await Promise.all([
    probeTwice(() => probeDatabase(db)),
    probeTwice(o.authProbe || probeAuth),
    // Only the summary numbers out of `detail` (never the error text).
    rows<JobRunLite>(db.from('job_runs').select('job, status, created_at, ran:detail->ran, errored:detail->errored, processed:detail->processed, integrations:detail->integrations')
      .in('job', jobKeys).gte('created_at', sinceIso(now, JOB_RULE.lookbackMs)).order('created_at', { ascending: false }).limit(1000)),
    webhookCounts(db, ['twilio', 'telnyx', 'twilio_whatsapp'], sinceIso(now, MESSAGING_RULE.windowMs)),
    webhookCounts(db, ['email'], sinceIso(now, EMAIL_INBOUND_RULE.windowMs)),
    emailSendCounts(db, now),
    webhookCounts(db, ['stripe'], sinceIso(now, PAYMENTS_RULE.windowMs)),
    shopifySignal(db, now),
  ])
  let everRan = false
  if (runs && !runs.length) everRan = ((await rows(db.from('job_runs').select('id').in('job', jobKeys).limit(1))) || []).length > 0
  return { database, auth, jobs: { runs, everRan }, messaging, emailInbound, emailSending, payments, shopify }
}

export function verdictsFrom(s: Signals, now: number): Record<ComponentKey, Verdict> {
  const since = now - INTEGRATION_RULE.windowMs
  const orderSync = (s.jobs.runs || []).filter(r => r.job === 'order-sync' && new Date(r.created_at).getTime() >= since)
  return {
    web: evaluateWeb(s.database, s.auth),
    database: s.database,
    jobs: evaluateJobs({ runs: s.jobs.runs, everRan: s.jobs.everRan, now }),
    messaging: evaluateMessaging(s.messaging),
    email: evaluateEmail({ inbound: s.emailInbound, sending: s.emailSending }),
    payments: evaluatePayments(s.payments),
    integrations: evaluateIntegrations({ woo: s.jobs.runs ? wooSignal(orderSync) : null, shopify: s.shopify }),
  }
}

// ── History ─────────────────────────────────────────────────────────────────
export async function readHistory(db: any, now: number) {
  const today = dayKey(now)
  const from = lastDays(today, HISTORY_DAYS)[0]
  const data = await rows<DailyCounts>(db.from(DAILY_TABLE).select('day, component, operational, degraded, outage, unknown').gte('day', from).limit(2000))
  return buildHistory(data && data.map(r => ({ ...r, day: String(r.day).slice(0, 10) })), today)
}

// ── Everything ──────────────────────────────────────────────────────────────
export async function computeStatus(db: any, o: { now?: number; authProbe?: () => Promise<Probe>; history?: boolean } = {}): Promise<FullStatus> {
  const now = o.now ?? Date.now()
  const [signals, inc, history] = await Promise.all([
    gatherSignals(db, { now, authProbe: o.authProbe }),
    within(listIncidents(db, { days: 30, publishedOnly: true, now })).catch(() => TIMEOUT),
    o.history === false ? Promise.resolve(null) : readHistory(db, now).catch(() => null),
  ])
  const incidents: Incident[] | null = inc === TIMEOUT || (inc as any).unavailable ? null : (inc as any).incidents
  return assembleStatus({ now, verdicts: verdictsFrom(signals, now), incidents, history })
}

// ── Snapshots ───────────────────────────────────────────────────────────────
// One row per five-minute bucket (status_snapshots.bucket is unique, so a
// second run in the same bucket changes nothing), and the day's per-component
// counts (status_daily) recounted from that day's snapshots: absolute numbers,
// so recording twice can't double count. Both are pruned after 90 days.
export async function recordStatusSnapshot(db: any, status: Pick<FullStatus, 'overall' | 'components'>, now = Date.now()):
  Promise<{ ok: boolean; unavailable?: boolean; duplicate?: boolean; bucket?: string; error?: string; pruned?: { snapshots: number; days: number } }> {
  const bucket = snapshotBucket(now)
  const day = dayKey(bucket)
  const components: Record<string, Health> = {}
  for (const c of status.components) if (COMPONENT_KEYS.includes(c.key)) components[c.key] = c.status
  try {
    const ins = await db.from(SNAPSHOT_TABLE)
      .upsert({ bucket, day, overall: status.overall.status, components }, { onConflict: 'bucket', ignoreDuplicates: true })
      .select('id')
    if (ins.error) return isMissingTable(ins.error) ? { ok: false, unavailable: true } : { ok: false, error: ins.error.message }
    const duplicate = !(ins.data || []).length

    const snaps = await db.from(SNAPSHOT_TABLE).select('components').eq('day', day).limit(1000)
    if (snaps.error) return { ok: false, error: snaps.error.message }
    const counts = countSnapshots(day, snaps.data || []).map(c => ({ ...c, updated_at: new Date(now).toISOString() }))
    const up = await db.from(DAILY_TABLE).upsert(counts, { onConflict: 'day,component' })
    if (up.error) return isMissingTable(up.error) ? { ok: false, unavailable: true } : { ok: false, error: up.error.message }

    const pruned = await pruneStatusHistory(db, now)
    return { ok: true, duplicate, bucket, pruned }
  } catch (e: any) {
    return isMissingTable(e) ? { ok: false, unavailable: true } : { ok: false, error: e?.message || 'failed' }
  }
}

export async function pruneStatusHistory(db: any, now = Date.now()): Promise<{ snapshots: number; days: number }> {
  const cutoff = new Date(now - HISTORY_RETENTION_DAYS * 86_400_000)
  const [a, b] = await Promise.all([
    db.from(SNAPSHOT_TABLE).delete().lt('bucket', cutoff.toISOString()).select('id'),
    db.from(DAILY_TABLE).delete().lt('day', dayKey(cutoff)).select('day'),
  ])
  return { snapshots: (a?.data || []).length, days: (b?.data || []).length }
}
