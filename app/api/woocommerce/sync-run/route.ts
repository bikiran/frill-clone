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
  // Call our own API on a canonical, non-rewriting origin. Using the incoming
  // Host header directly can point at a company subdomain (e.g.
  // neplay.colvy.com) whose proxy rewrites create a redirect cycle → Vercel
  // 508 "Infinite loop detected". Prefer the explicit site URL, then the
  // deployment's own VERCEL_URL, and only fall back to the request host.
  const site = process.env.NEXT_PUBLIC_SITE_URL
  if (site) return site.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  const host = req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  if (host) return `${proto}://${host}`
  return 'https://colvy.com'
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Safely parse a fetch response as JSON; if it's HTML/text (e.g. an error
// page), surface a clean error instead of throwing an opaque JSON parse error.
async function safeJson(res: Response, label: string) {
  const text = await res.text()
  try { return JSON.parse(text) }
  catch { throw new Error(`${label} returned a non-JSON response (${res.status}). First chars: ${text.slice(0, 40)}`) }
}

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
    // Auto batch size: start conservative, grow if pages are fast. Capped so a
    // single batch stays well under the serverless time limit.
    const batchStart = Date.now()
    const MAX_BATCH_MS = 45000        // stop chaining a batch after ~45s of work
    const MIN_PAGES = 2
    const MAX_PAGES = 12
    const modifiedAfter = job.modified_after || null   // incremental cutoff
    let phase = job.phase as 'customers' | 'orders'
    let page = job.current_page || 1
    let customersSynced = job.customers_synced || 0
    let ordersSynced = job.orders_synced || 0
    let totalPages = job.total_pages || 1
    let pagesThisBatch = 0

    for (let i = 0; i < MAX_PAGES; i++) {
      // Stop this batch if we're approaching the time budget (auto-sizing)
      if (pagesThisBatch >= MIN_PAGES && Date.now() - batchStart > MAX_BATCH_MS) break
      pagesThisBatch++
      let attempt = 0
      let data: any = null
      // Per-page call to the existing sync endpoint, with 429 backoff
      while (true) {
        const res = await fetch(`${origin(req)}/api/woocommerce/sync`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-colvy-internal': '1' },
          body: JSON.stringify({ companyId, mode: phase, page, modifiedAfter }),
        })
        data = await safeJson(res, `sync/${phase}`)
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
          // Stamp the integration so future syncs can run incrementally
          try { await db.from('woocommerce_integrations').update({ last_full_sync_at: new Date().toISOString() }).eq('company_id', companyId) } catch {}
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
