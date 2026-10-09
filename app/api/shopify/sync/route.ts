import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ShopifyAuthError } from '@/lib/shopify-auth'
import { ensureStoreWebhooks, runImportStep, serviceFor } from '@/lib/shopify-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const BUDGET_MS = 40_000

/**
 * POST { companyId, integrationId?, jobId? } — import a store: customers, then
 * products, then orders (Shopify shares the last 60 days of orders unless the
 * app is granted older ones).
 *
 * Resumable: each call works for up to ~40s and saves the phase + cursor on the
 * job. While `done` is false, call again with the returned jobId and it carries
 * on exactly where it stopped. An error keeps the cursor too, so a retry
 * resumes rather than restarts. Each customer page links/creates contacts.
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, integrationId, jobId } = await req.json().catch(() => ({}))
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    let integ: any = null
    if (integrationId) {
      integ = (await db.from('shopify_integrations').select('*').eq('id', integrationId).eq('company_id', companyId).maybeSingle()).data
    } else {
      integ = (await db.from('shopify_integrations').select('*').eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true }).limit(1)).data?.[0] || null
    }
    if (!integ) return NextResponse.json({ error: 'Shopify store not connected' }, { status: 404 })
    if (!integ.is_active || !integ.access_token) return NextResponse.json({ error: 'This store is disconnected. Reinstall the Colvy app to sync it.', reauth: true }, { status: 409 })
    if (integ.needs_reauth) return NextResponse.json({ error: 'Shopify access expired. Reconnect this store to sync it.', reauth: true }, { status: 409 })

    const svc = await serviceFor(db, integ)

    let job: any = null
    if (jobId) {
      job = (await db.from('shopify_sync_jobs').select('*').eq('id', jobId).eq('company_id', companyId).eq('integration_id', integ.id).maybeSingle()).data
      if (!job) return NextResponse.json({ error: 'Sync job not found' }, { status: 404 })
      if (job.status === 'done') return NextResponse.json({ ok: true, done: true, jobId: job.id, phase: 'orders', counts: { customers: job.customers_synced || 0, products: job.products_synced || 0, orders: job.orders_synced || 0, created: job.contacts_linked || 0 } })
      if (job.status !== 'running') await db.from('shopify_sync_jobs').update({ status: 'running', error: null }).eq('id', job.id)
    } else {
      // A fresh import is also when a store installed before newer webhook
      // topics existed picks them up.
      try { await ensureStoreWebhooks(db, integ, svc) } catch {}
      job = (await db.from('shopify_sync_jobs').insert({
        company_id: companyId, integration_id: integ.id, status: 'running', phase: 'customers', message: 'Importing customers…',
      }).select('*').single()).data
    }
    if (!job) return NextResponse.json({ error: 'Could not start the import' }, { status: 500 })

    try {
      const r = await runImportStep(db, integ, job, svc, BUDGET_MS)
      return NextResponse.json({ ok: true, jobId: job.id, ...r, synced: r.counts.customers, created: r.counts.created })
    } catch (e: any) {
      await db.from('shopify_sync_jobs').update({ status: 'error', error: e.message, updated_at: new Date().toISOString() }).eq('id', job.id)
      const reauth = e instanceof ShopifyAuthError && e.reauth
      return NextResponse.json({ error: e.message, reauth, jobId: job.id }, { status: reauth ? 409 : 500 })
    }
  } catch (err: any) {
    const reauth = err instanceof ShopifyAuthError && err.reauth
    return NextResponse.json({ error: err.message, reauth }, { status: reauth ? 409 : 500 })
  }
}
