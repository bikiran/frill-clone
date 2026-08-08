import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Identify the caller and confirm they belong to the company they're editing.
async function memberOf(db: any, token: string, companyId: string): Promise<boolean> {
  if (!token || !companyId) return false
  const { data } = await db.auth.getUser(token)
  const uid = data?.user?.id
  if (!uid) return false
  const { data: owned } = await db.from('companies').select('id').eq('id', companyId).eq('owner_id', uid).maybeSingle()
  if (owned) return true
  const { data: member } = await db.from('team_members').select('id').eq('company_id', companyId).eq('user_id', uid).maybeSingle()
  return !!member
}

function mask(secret: string | null | undefined): string | null {
  if (!secret) return null
  return secret.length <= 4 ? '••••' : `••••${secret.slice(-4)}`
}

// GET ?companyId= — return the current config (secret masked) + the webhook URL.
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    const companyId = new URL(req.url).searchParams.get('companyId') || ''
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!(await memberOf(db, token, companyId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let { data: row } = await db.from('realestate_integrations').select('*').eq('company_id', companyId).maybeSingle()
    // Create a dormant row (with a webhook token) on first open so the agency
    // can copy the webhook URL before entering credentials.
    if (!row) {
      const { data: created } = await db.from('realestate_integrations').insert({ company_id: companyId }).select('*').maybeSingle()
      row = created
    }
    const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')
    return NextResponse.json({
      ok: true,
      config: {
        client_id: row?.client_id || '',
        agency_id: row?.agency_id || '',
        api_secret_masked: mask(row?.api_secret),
        has_secret: !!row?.api_secret,
        is_active: !!row?.is_active,
        webhook_url: row?.webhook_token ? `${base}/api/webhooks/realestate?t=${row.webhook_token}` : null,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — save credentials / toggle active. api_secret is only overwritten when a
// new value is supplied (so we don't clobber it with the masked placeholder).
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const body = await req.json().catch(() => ({}))
    const { companyId, clientId, agencyId, apiSecret, isActive } = body
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!(await memberOf(db, token, companyId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const patch: any = { updated_at: new Date().toISOString() }
    if (clientId !== undefined) patch.client_id = String(clientId).trim() || null
    if (agencyId !== undefined) patch.agency_id = String(agencyId).trim() || null
    if (typeof isActive === 'boolean') patch.is_active = isActive
    if (apiSecret !== undefined && apiSecret !== '' && !/^•+/.test(String(apiSecret))) patch.api_secret = String(apiSecret).trim()

    // Upsert on company_id (the row usually exists from GET).
    const { data: existing } = await db.from('realestate_integrations').select('id').eq('company_id', companyId).maybeSingle()
    if (existing) await db.from('realestate_integrations').update(patch).eq('company_id', companyId)
    else await db.from('realestate_integrations').insert({ company_id: companyId, ...patch })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
