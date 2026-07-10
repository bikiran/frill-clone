import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60 // allow up to 60s per batch (Vercel Pro)

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
function origin(req: NextRequest) {
  return process.env.NEXT_PUBLIC_SITE_URL || req.headers.get('origin') || 'https://colvy.com'
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Processes a few pages of the current phase, updates the job, then fires the
// next batch (fire-and-forget) so the whole sync runs server-side in the
// background. Resumable: always reads current_page from the job row.
export async function POST(req: NextRequest) {
  const db = admin()
  let jobId: string | undefined
  try {
    const body = await req.json()
    jobId = body.jobId
    if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })

    const { data: job } = await db.from('woo_sync_jobs').select('*').eq('id', jobId).maybeSingle()
    if (!job || job.status !== 'running') return NextResponse.json({ ok: true, stopped: true })

    const companyId = job.company_id
    const PAGES_PER_BATCH = 8   // pages processed before self-chaining
    let phase = job.phase as 'customers' | 'orders'
    let page = job.current_page || 1
    let customersSynced = job.customers_synced || 0
    let ordersSynced = job.orders_synced || 0
    let totalPages = job.total_pages || 1

    for (let i = 0; i < PAGES_PER_BATCH; i++) {
      let attempt = 0
      let data: any = null
      // Per-page call to the existing sync endpoint, with 429 backoff
      while (true) {
        const res = await fetch(`${origin(req)}/api/woocommerce/sync`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, mode: phase, page }),
        })
        data = await res.json()
        if (res.ok) break
        if ((res.status === 429 || (data.error || '').includes('Too Many Requests')) && attempt < 5) {
          attempt++; await sleep(attempt * 4000); continue
        }
        throw new Error(data.error || `Sync failed on ${phase} page ${page}`)
      }

      totalPages = data.totalPages || 1
      if (phase === 'customers') customersSynced += data.syncedCount || 0
      else ordersSynced += data.updated || 0

      page++
      await db.from('woo_sync_jobs').update({
        current_page: page, total_pages: totalPages, phase,
        customers_synced: customersSynced, orders_synced: ordersSynced,
        message: `${phase === 'customers' ? 'Syncing customers' : 'Syncing orders'}: page ${Math.min(page - 1, totalPages)}/${totalPages}`,
        updated_at: new Date().toISOString(),
      }).eq('id', jobId)

      // Phase finished?
      if (page > totalPages) {
        if (phase === 'customers') {
          phase = 'orders'; page = 1; totalPages = 1
          await db.from('woo_sync_jobs').update({ phase: 'orders', current_page: 1, total_pages: 1, message: 'Starting order sync…', updated_at: new Date().toISOString() }).eq('id', jobId)
          break // start orders in the next batch
        } else {
          // All done
          await db.from('woo_sync_jobs').update({
            status: 'completed', phase: 'done', finished_at: new Date().toISOString(),
            message: `Done — ${customersSynced} customers, ${ordersSynced} order updates`,
            updated_at: new Date().toISOString(),
          }).eq('id', jobId)
          return NextResponse.json({ ok: true, done: true })
        }
      }
      await sleep(300) // polite delay between pages
    }

    // Chain the next batch (fire-and-forget) so it continues in the background
    fetch(`${origin(req)}/api/woocommerce/sync-run`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
    }).catch(() => {})

    return NextResponse.json({ ok: true, continuing: true })
  } catch (err: any) {
    if (jobId) {
      await db.from('woo_sync_jobs').update({
        status: 'failed', error: err.message, message: `Failed: ${err.message}`,
        finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', jobId)
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
