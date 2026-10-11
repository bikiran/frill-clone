// Server-side glue for the import routes: the service-role client and the
// "move this job forward" call shared by the routes and the cron worker.

import { createClient } from '@supabase/supabase-js'
import { claim, step } from './engine'

export function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  ) as any
}

// Vercel gives these routes up to 300s; stop well before that.
export const STEP_BUDGET_MS = 240_000

/** Claims the job and runs it until it's finished or the budget is spent.
 *  Does nothing when another worker already holds it. */
export async function drive(db: any, jobId: string, deadline = Date.now() + STEP_BUDGET_MS) {
  const job = await claim(db, jobId)
  if (!job) return null
  return step(db, job, deadline)
}

export const missingTable = (e: any) => /import_jobs/i.test(String(e?.message || '')) && /does not exist|schema cache|relation/i.test(String(e?.message || ''))
