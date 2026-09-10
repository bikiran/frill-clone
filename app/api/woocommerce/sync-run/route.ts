import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncPage } from '../sync/route'

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

// The order a full sync walks, and what each step is called in the progress
// message. Products come last because the first two feed the CRM, which people
// watch, while the catalogue mirror only backs the product picker's search.
// Products is terminal either way, so a products-only job (started straight at
// that phase) finishes when it runs out of pages without any extra bookkeeping.
type Phase = 'customers' | 'orders' | 'products'
const NEXT_PHASE: Record<Phase, Phase | 'done'> = { customers: 'orders', orders: 'products', products: 'done' }
const PHASE_LABEL: Record<Phase, string> = {
  customers: 'Syncing customers',
  orders: 'Syncing orders',
  products: 'Syncing products',
}

// Close out a finished job. The catalogue size is counted from the mirror
// rather than tallied as we go: woo_sync_jobs has no products column, and a
// batch only ever sees its own pages.
async function finishJob(
  db: any, jobId: string, job: any, companyId: string,
  customersSynced: number, ordersSynced: number, note?: string,
) {
  let productsMirrored = 0
  try {
    const { count } = await db.from('woocommerce_products')
      .select('woo_product_id', { count: 'exact', head: true }).eq('company_id', companyId)
    productsMirrored = count || 0
  } catch {}
  // A products-only run has no customer or order numbers to report, so leave
  // them out rather than printing two zeroes.
  const crm = customersSynced || ordersSynced
    ? [`${customersSynced} customers`, `${ordersSynced} order updates`]
    : []
  const summary = [...crm, `${productsMirrored} products`].join(', ')
  await db.from('woo_sync_jobs').update({
    status: 'completed', phase: 'done', finished_at: new Date().toISOString(),
    message: `Done — ${summary}${note ? ` · ${note}` : ''}`,
    updated_at: new Date().toISOString(),
  }).eq('id', jobId)

  // Stamp the integration so future syncs can run incrementally. Only when this
  // job actually pulled customers or orders: the stamp is the cutoff a later
  // incremental sync fetches from, so moving it after a products-only run would
  // silently skip every customer and order changed since the last real sync.
  if (!customersSynced && !ordersSynced) return
  try {
    const upd = db.from('woocommerce_integrations').update({ last_full_sync_at: new Date().toISOString() })
    if (job.integration_id) await upd.eq('id', job.integration_id)
    else await upd.eq('company_id', companyId)
  } catch {}
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
    let phase = job.phase as Phase
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
      // Call the per-page sync logic DIRECTLY (in-process) — no HTTP self-call,
      // so there's no chance of a Vercel 508 redirect loop. Retry on 429.
      try {
        while (true) {
          try {
            const result = await syncPage({ companyId, integrationId: job.integration_id || undefined, mode: phase, page, modifiedAfter })
            if (result.status === 200) { data = result.body; break }
            if (result.status === 429 && attempt < 5) { attempt++; await sleep(attempt * 4000); continue }
            throw new Error(result.body?.error || `Sync failed on ${phase} page ${page}`)
          } catch (e: any) {
            if (e.status === 429 && attempt < 5) { attempt++; await sleep(attempt * 4000); continue }
            throw e
          }
        }
      } catch (e: any) {
        // The catalogue mirror is the last phase and needs a table the product
        // search migration creates. On a database that has not had it run, this
        // would otherwise report the whole sync as failed and throw away the
        // customer and order work that already landed. Finish the job instead
        // and say in the message that products were skipped.
        if (phase !== 'products') throw e
        await finishJob(db, jobId, job, companyId, customersSynced, ordersSynced,
          `products skipped: ${e?.message || String(e)}`)
        return NextResponse.json({ ok: true, done: true, productsSkipped: true })
      }

      totalPages = data.totalPages || 1
      if (phase === 'customers') customersSynced += data.syncedCount || 0
      else if (phase === 'orders') ordersSynced += data.updated || 0
      // The products count is not carried on the job row, so there is nothing
      // to accumulate here; it is read from the catalogue itself at the end.

      page++
      await db.from('woo_sync_jobs').update({
        current_page: page, total_pages: totalPages, phase,
        customers_synced: customersSynced, orders_synced: ordersSynced,
        message: `${PHASE_LABEL[phase]}: page ${Math.min(page - 1, totalPages)}/${totalPages}`,
        updated_at: new Date().toISOString(),
      }).eq('id', jobId)

      // Phase finished?
      if (page > totalPages) {
        const next = NEXT_PHASE[phase]
        if (next !== 'done') {
          phase = next; page = 1; totalPages = 1
          await db.from('woo_sync_jobs').update({ phase, current_page: 1, total_pages: 1, message: `Starting ${phase} sync…`, updated_at: new Date().toISOString() }).eq('id', jobId)
          break // start the next phase in the next batch
        } else {
          await finishJob(db, jobId, job, companyId, customersSynced, ordersSynced)
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
