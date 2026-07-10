import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function origin(req: NextRequest) {
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('host')
  if (host) return `${proto}://${host}`
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
}

// Starts a background sync: creates a job and kicks off the first batch.
// The batch runner self-chains server-side, so the sync keeps going even if
// the user closes their browser / laptop.
export async function POST(req: NextRequest) {
  try {
    const { companyId, incremental, integrationId } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()

    // Resolve the target store: the given integrationId, or the company's first.
    let integ: any = null
    if (integrationId) {
      const r = await db.from('woocommerce_integrations').select('id, last_full_sync_at').eq('id', integrationId).maybeSingle()
      integ = r.data
    } else {
      const r = await db.from('woocommerce_integrations').select('id, last_full_sync_at').eq('company_id', companyId).order('created_at', { ascending: true }).limit(1)
      integ = r.data?.[0] || null
    }
    if (!integ) return NextResponse.json({ error: 'No WooCommerce store found' }, { status: 404 })

    // Don't start a second job for the SAME store if one is already running
    const { data: running } = await db.from('woo_sync_jobs')
      .select('id').eq('company_id', companyId).eq('integration_id', integ.id).eq('status', 'running')
      .order('started_at', { ascending: false }).limit(1).maybeSingle()
    if (running) return NextResponse.json({ ok: true, jobId: running.id, alreadyRunning: true })

    // For incremental syncs, only fetch records changed since the last full sync
    let modifiedAfter: string | null = null
    if (incremental) {
      modifiedAfter = integ.last_full_sync_at || null
    }

    const { data: job } = await db.from('woo_sync_jobs').insert({
      company_id: companyId, integration_id: integ.id, status: 'running', phase: 'customers', current_page: 1,
      modified_after: modifiedAfter,
      message: incremental ? 'Checking for updates…' : 'Starting sync…',
    }).select().maybeSingle()

    // Fire-and-forget the first batch (don't await — returns immediately)
    fetch(`${origin(req)}/api/woocommerce/sync-run`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job?.id }),
    }).catch(() => {})

    return NextResponse.json({ ok: true, jobId: job?.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
