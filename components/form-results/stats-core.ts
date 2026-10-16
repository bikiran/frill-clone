// Server-side core of GET /api/forms/stats (members only). Kept out of the
// route file so it can be tested with a fake database; the route supplies the
// service-role client and the company-access check.
//
// Returns views/starts/abandons from form_stats_summary (migration V376). Before
// V376 runs, or when nothing has been tracked yet, it answers { tracked: false }
// and the Results page simply leaves those tiles out.

import { sanitizeStats, UUID_RE, type StatsResult } from './aggregate'

export type StatsDeps = {
  db: { from(table: string): any; rpc(fn: string, args: Record<string, unknown>): any }
  /** The caller may act for this company (requireCompanyAccess). */
  access: (companyId: string) => Promise<{ ok: boolean }>
}

export type StatsReply = { status: number; body: StatsResult | { error: string } }

export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz || tz.length > 64) return 'UTC'
  try { new Intl.DateTimeFormat('en-AU', { timeZone: tz }); return tz } catch { return 'UTC' }
}

function isoOrNull(v: string | null): string | null {
  if (!v || v.length > 64) return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

export async function handleStatsRequest(params: URLSearchParams, deps: StatsDeps): Promise<StatsReply> {
  const formId = params.get('formId') || ''
  if (!UUID_RE.test(formId)) return { status: 400, body: { error: 'formId required' } }

  let form: { id: string; company_id: string | null } | null = null
  try {
    const { data, error } = await deps.db.from('forms').select('id, company_id').eq('id', formId).maybeSingle()
    if (error) return { status: 200, body: { tracked: false } }
    form = data || null
  } catch {
    return { status: 200, body: { tracked: false } }
  }
  // Same answer for "no such form" and "not yours", so ids can't be probed.
  if (!form || !form.company_id) return { status: 403, body: { error: 'Not authorized' } }
  if (!(await deps.access(form.company_id)).ok) return { status: 403, body: { error: 'Not authorized' } }

  const tz = safeTimeZone(params.get('tz'))
  const from = isoOrNull(params.get('from'))
  const to = isoOrNull(params.get('to'))

  let stats: StatsResult
  try {
    const { data, error } = await deps.db.rpc('form_stats_summary', { p_form_id: formId, p_from: from, p_to: to, p_tz: tz })
    if (error) return { status: 200, body: { tracked: false } }
    stats = sanitizeStats(data)
  } catch {
    return { status: 200, body: { tracked: false } }
  }
  if (!stats.tracked) return { status: 200, body: { tracked: false } }

  // Submitted responses in the same window since tracking began, counted on the
  // server so completion stays exact even when the page only loads the newest
  // 10,000 responses.
  try {
    const start = from && Date.parse(from) > Date.parse(stats.since) ? from : stats.since
    let q = deps.db.from('form_responses').select('id', { count: 'exact', head: true }).eq('form_id', formId).gte('created_at', start)
    if (to) q = q.lt('created_at', to)
    const { count, error } = await q
    if (!error && typeof count === 'number') stats = { ...stats, submitted: count }
  } catch { /* completion then falls back to the loaded rows */ }

  return { status: 200, body: stats }
}
