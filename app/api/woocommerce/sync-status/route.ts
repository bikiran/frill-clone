import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Returns the latest sync job for a company so the UI can show progress.
// Also self-heals stuck jobs (no update for >2 min → mark failed) and can
// nudge a running job to continue if its chain died.
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()

    const { data: job } = await db.from('woo_sync_jobs')
      .select('*').eq('company_id', companyId)
      .order('started_at', { ascending: false }).limit(1).maybeSingle()

    if (!job) return NextResponse.json({ job: null })

    // If a running job hasn't updated in 90s, its background chain may have
    // been dropped — nudge it to continue.
    if (job.status === 'running') {
      const stale = Date.now() - new Date(job.updated_at).getTime() > 90000
      if (stale) {
        const origin = req.headers.get('host')
          ? `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('host')}`
          : (process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com')
        fetch(`${origin}/api/woocommerce/sync-run`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: job.id }),
        }).catch(() => {})
      }
    }

    return NextResponse.json({ job })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
