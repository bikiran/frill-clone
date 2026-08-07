import { createClient } from '@supabase/supabase-js'

// Records background/scheduled job executions into `job_runs` so the Super Admin
// console can show cadence, duration, throughput and failures.
//
// Same discipline as the webhook logger: never throw, keep the row small, and
// self-disable if the table doesn't exist yet (migration not applied) so we
// don't error on every run.

let missing = false

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function trim(detail: any): any {
  if (detail == null) return null
  try {
    const s = JSON.stringify(detail)
    if (s.length <= 8000) return JSON.parse(s)
    return { _truncated: true, _bytes: s.length, preview: s.slice(0, 2000) }
  } catch {
    return { _unserializable: true }
  }
}

export type JobRun = {
  job: string
  status?: 'success' | 'error' | 'idle' | 'running'
  startedAt?: string | null
  durationMs?: number | null
  detail?: any
  error?: string | null
}

export async function logJobRun(run: JobRun): Promise<void> {
  if (missing) return
  try {
    const db = admin()
    const { error } = await db.from('job_runs').insert({
      job: run.job,
      status: run.status || 'success',
      started_at: run.startedAt || null,
      finished_at: new Date().toISOString(),
      duration_ms: run.durationMs != null ? Math.round(run.durationMs) : null,
      detail: trim(run.detail),
      error: run.error ? String(run.error).slice(0, 500) : null,
    })
    if (error && /does not exist|schema cache/i.test(error.message)) missing = true
  } catch {
    /* logging must never break the job */
  }
}
