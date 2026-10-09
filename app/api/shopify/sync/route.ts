import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ShopifyService } from '@/lib/shopify-service'
import { getAccessToken, ShopifyAuthError } from '@/lib/shopify-auth'
import { saveShopifyCustomers } from '@/lib/shopify-customers'

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

// Protected customer data the app isn't approved for comes back as null fields
// plus an ACCESS_DENIED-style error. Worth telling the merchant, not fatal.
const hiddenFieldsNote = (errors: any[]) =>
  errors.some(e => /access|approved|protected/i.test(String(e?.message || '')) || e?.extensions?.code === 'ACCESS_DENIED')
    ? 'Shopify is hiding some customer details (name, email, phone or address) until the Colvy app is approved for protected customer data.'
    : null

/**
 * POST { companyId, integrationId?, jobId? } — sync a store's customers.
 *
 * Resumable: each call works for up to ~40s and saves the Shopify cursor on the
 * job. While `done` is false, call again with the returned jobId and it carries
 * on from that cursor (the old version restarted at page 1 every call and could
 * report "complete" on a big store that wasn't). Each page also links/creates
 * Colvy contacts.
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

    const token = await getAccessToken(db, integ)
    const svc = new ShopifyService({ storeDomain: integ.store_domain, accessToken: token, onUnauthorized: () => getAccessToken(db, integ, { force: true }) })

    // Continue the given job, or start a new one.
    let job: any = null
    if (jobId) {
      job = (await db.from('shopify_sync_jobs').select('*').eq('id', jobId).eq('company_id', companyId).eq('integration_id', integ.id).maybeSingle()).data
      if (!job) return NextResponse.json({ error: 'Sync job not found' }, { status: 404 })
      if (job.status === 'done') return NextResponse.json({ ok: true, done: true, jobId: job.id, synced: job.customers_synced || 0, created: job.contacts_linked || 0 })
      if (job.status !== 'running') await db.from('shopify_sync_jobs').update({ status: 'running', error: null }).eq('id', job.id)
    } else {
      job = (await db.from('shopify_sync_jobs').insert({
        company_id: companyId, integration_id: integ.id, status: 'running', phase: 'customers', message: 'Syncing customers…',
      }).select('*').single()).data
    }
    if (!job) return NextResponse.json({ error: 'Could not start the sync' }, { status: 500 })

    const START = Date.now()
    let cursor: string | null = job.page_info || null
    let synced = Number(job.customers_synced) || 0
    let created = Number(job.contacts_linked) || 0
    let note: string | null = null

    try {
      while (Date.now() - START < BUDGET_MS) {
        const page = await svc.getCustomersPage({ after: cursor, first: 100 })
        const res = await saveShopifyCustomers(db, companyId, integ.id, page.customers)
        synced += res.saved
        created += res.created
        note = note || hiddenFieldsNote(page.errors)
        cursor = page.endCursor

        if (!page.hasNextPage) {
          const now = new Date().toISOString()
          await db.from('shopify_sync_jobs').update({
            status: 'done', page_info: null, customers_synced: synced, contacts_linked: created,
            message: `Synced ${synced} customers${created ? `, ${created} new contacts` : ''}.`, finished_at: now, updated_at: now,
          }).eq('id', job.id)
          await db.from('shopify_integrations').update({ last_synced_at: now, last_full_sync_at: now, last_error: note, updated_at: now }).eq('id', integ.id)
          return NextResponse.json({ ok: true, done: true, jobId: job.id, synced, created, note })
        }
        await db.from('shopify_sync_jobs').update({
          page_info: cursor, customers_synced: synced, contacts_linked: created,
          message: `Synced ${synced} customers…`, updated_at: new Date().toISOString(),
        }).eq('id', job.id)
      }
      await db.from('shopify_integrations').update({ last_synced_at: new Date().toISOString() }).eq('id', integ.id)
      return NextResponse.json({ ok: true, done: false, jobId: job.id, synced, created, note })
    } catch (e: any) {
      // Keep the cursor so a retry resumes rather than restarts.
      await db.from('shopify_sync_jobs').update({ status: 'error', error: e.message, page_info: cursor, customers_synced: synced, contacts_linked: created, updated_at: new Date().toISOString() }).eq('id', job.id)
      const reauth = e instanceof ShopifyAuthError && e.reauth
      return NextResponse.json({ error: e.message, reauth, jobId: job.id }, { status: reauth ? 409 : 500 })
    }
  } catch (err: any) {
    const reauth = err instanceof ShopifyAuthError && err.reauth
    return NextResponse.json({ error: err.message, reauth }, { status: reauth ? 409 : 500 })
  }
}
