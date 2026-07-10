import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ShopifyService } from '@/lib/shopify-service'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// POST: run a Shopify customer sync for one store. Loops through cursor pages
// within a time budget so it completes without a self-HTTP-call (no 508 risk).
export async function POST(req: NextRequest) {
  try {
    const { companyId, integrationId } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()

    // Resolve the target store
    let integ: any = null
    if (integrationId) {
      const r = await db.from('shopify_integrations').select('*').eq('id', integrationId).maybeSingle()
      integ = r.data
    } else {
      const r = await db.from('shopify_integrations').select('*').eq('company_id', companyId).order('created_at', { ascending: true }).limit(1)
      integ = r.data?.[0] || null
    }
    if (!integ?.access_token) return NextResponse.json({ error: 'Shopify store not connected' }, { status: 404 })

    const svc = new ShopifyService({ storeDomain: integ.store_domain, accessToken: integ.access_token })

    // Create a job row for progress tracking
    const { data: job } = await db.from('shopify_sync_jobs').insert({
      company_id: companyId, integration_id: integ.id, status: 'running', phase: 'customers', message: 'Syncing customers…',
    }).select().maybeSingle()

    const START = Date.now()
    const BUDGET_MS = 45000
    let pageInfo: string | undefined = undefined
    let totalSynced = 0
    let pages = 0

    try {
      while (Date.now() - START < BUDGET_MS) {
        let result
        let attempt = 0
        while (true) {
          try {
            result = await svc.getCustomersPage(pageInfo, 100)
            break
          } catch (e: any) {
            // Shopify rate limit is 429 — back off and retry
            if (e.status === 429 && attempt < 5) { attempt++; await sleep(attempt * 2000); continue }
            throw e
          }
        }

        const rows = (result.customers || []).map((c: any) => ({
          company_id: companyId,
          integration_id: integ.id,
          shopify_customer_id: c.id,
          email: c.email?.trim() || `shopify-customer-${c.id}@no-email.colvy.internal`,
          first_name: c.first_name || c.default_address?.first_name || '',
          last_name: c.last_name || c.default_address?.last_name || '',
          phone: c.phone || c.default_address?.phone || '',
          address: c.default_address || null,
          total_spend: parseFloat(c.total_spent || '0') || 0,
          total_orders: c.orders_count || 0,
          synced_at: new Date().toISOString(),
        }))

        if (rows.length > 0) {
          const { error } = await db.from('shopify_customers').upsert(rows, { onConflict: 'company_id,shopify_customer_id' })
          if (error) throw new Error(error.message)
          totalSynced += rows.length
        }
        pages++

        if (job) await db.from('shopify_sync_jobs').update({
          customers_synced: totalSynced, page_info: result.nextPageInfo || null,
          message: `Synced ${totalSynced} customers…`, updated_at: new Date().toISOString(),
        }).eq('id', job.id)

        if (!result.nextPageInfo) {
          // Done
          if (job) await db.from('shopify_sync_jobs').update({ status: 'done', message: `Synced ${totalSynced} customers.`, updated_at: new Date().toISOString() }).eq('id', job.id)
          await db.from('shopify_integrations').update({ last_synced_at: new Date().toISOString(), last_full_sync_at: new Date().toISOString() }).eq('id', integ.id)
          return NextResponse.json({ ok: true, done: true, synced: totalSynced, pages })
        }
        pageInfo = result.nextPageInfo
      }

      // Budget exhausted but more remain — client should call again with the cursor.
      if (job) await db.from('shopify_sync_jobs').update({ status: 'running', message: `Synced ${totalSynced} so far…`, updated_at: new Date().toISOString() }).eq('id', job.id)
      await db.from('shopify_integrations').update({ last_synced_at: new Date().toISOString() }).eq('id', integ.id)
      return NextResponse.json({ ok: true, done: false, synced: totalSynced, pages, nextPageInfo: pageInfo, jobId: job?.id })
    } catch (e: any) {
      if (job) await db.from('shopify_sync_jobs').update({ status: 'error', error: e.message, updated_at: new Date().toISOString() }).eq('id', job.id)
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
