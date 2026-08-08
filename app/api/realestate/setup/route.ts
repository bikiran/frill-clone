import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { reaConfigured, createEnquirySubscription, deleteSubscription } from '@/lib/rea'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const SUPER_ADMIN = 'bishalstha76@gmail.com'

// Identify the caller; return their user id + whether they're the super admin.
async function whoami(db: any, token: string): Promise<{ uid: string | null; isSuper: boolean }> {
  if (!token) return { uid: null, isSuper: false }
  const { data } = await db.auth.getUser(token)
  const u = data?.user
  return { uid: u?.id || null, isSuper: (u?.email || '').toLowerCase() === SUPER_ADMIN }
}

async function memberOf(db: any, uid: string | null, companyId: string): Promise<boolean> {
  if (!uid || !companyId) return false
  const { data: owned } = await db.from('companies').select('id').eq('id', companyId).eq('owner_id', uid).maybeSingle()
  if (owned) return true
  const { data: member } = await db.from('team_members').select('id').eq('company_id', companyId).eq('user_id', uid).maybeSingle()
  return !!member
}

// GET ?companyId= — authorization status for the agency. No credentials, ever.
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    const companyId = new URL(req.url).searchParams.get('companyId') || ''
    const { uid, isSuper } = await whoami(db, (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''))
    if (!(await memberOf(db, uid, companyId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let { data: row } = await db.from('realestate_integrations').select('*').eq('company_id', companyId).maybeSingle()
    if (!row) {
      const { data: created } = await db.from('realestate_integrations').insert({ company_id: companyId }).select('*').maybeSingle()
      row = created
    }

    return NextResponse.json({
      ok: true,
      // Whether Colvy itself is set up as a REA partner (drives the UI's
      // "available?" state). Never leaks the credentials themselves.
      platformReady: reaConfigured(),
      config: {
        authorized: !!row?.authorized,
        agency_id: row?.agency_id || '',
        office_id: row?.office_id || '',
        scopes: (row?.scopes || '').split(/\s+/).filter(Boolean),
        authorized_at: row?.authorized_at || null,
        // Super-admin only: the underlying subscription id, for support/debug.
        ...(isSuper ? { subscription_id: row?.subscription_id || null } : {}),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST { companyId, action: 'connect'|'disconnect', agencyId?, officeId? }
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const body = await req.json().catch(() => ({}))
    const { companyId, action, agencyId, officeId } = body
    const { uid } = await whoami(db, (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''))
    if (!(await memberOf(db, uid, companyId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: row } = await db.from('realestate_integrations').select('*').eq('company_id', companyId).maybeSingle()
    const token = row?.webhook_token
    if (!token) return NextResponse.json({ error: 'Integration row missing — reopen the page' }, { status: 400 })

    if (action === 'connect') {
      if (!reaConfigured()) {
        return NextResponse.json({ error: 'realestate.com.au isn’t enabled on the server yet. Contact support.' }, { status: 503 })
      }
      const agency = String(agencyId || '').trim()
      if (!agency) return NextResponse.json({ error: 'Enter your agency / office ID to connect.' }, { status: 400 })

      const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')
      const callbackUrl = `${base}/api/webhooks/realestate?t=${token}`

      // Authorize Colvy for this agency by creating their EnquiryCreated
      // subscription with OUR partner credentials.
      let sub: { id: string | null; scopes: string[] }
      try {
        sub = await createEnquirySubscription({ agencyId: agency, officeId: officeId || undefined, callbackUrl })
      } catch (e: any) {
        return NextResponse.json({ error: `Could not authorize with realestate.com.au: ${e.message}` }, { status: 502 })
      }

      await db.from('realestate_integrations').update({
        agency_id: agency,
        office_id: String(officeId || '').trim() || null,
        subscription_id: sub.id,
        scopes: sub.scopes.join(' '),
        authorized: true,
        is_active: true,
        authorized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('company_id', companyId)

      return NextResponse.json({ ok: true, authorized: true, scopes: sub.scopes })
    }

    if (action === 'disconnect') {
      // Best-effort remove the REA subscription, then mark disconnected.
      if (row?.subscription_id && reaConfigured()) {
        try { await deleteSubscription(row.subscription_id) } catch (e) { console.warn('[rea] subscription delete failed', e) }
      }
      await db.from('realestate_integrations').update({
        authorized: false, is_active: false, subscription_id: null, scopes: null,
        updated_at: new Date().toISOString(),
      }).eq('company_id', companyId)
      return NextResponse.json({ ok: true, authorized: false })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
