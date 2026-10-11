import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logSuperAdminAudit } from '@/lib/super-admin-audit'

export const dynamic = 'force-dynamic'

const SUPER_ADMIN = 'bishalstha76@gmail.com'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function superAdmin(req: NextRequest, db: any): Promise<{ id: string; email: string } | null> {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return null
    const { data } = await db.auth.getUser(token)
    const u = data?.user
    return u?.email === SUPER_ADMIN ? { id: u.id, email: u.email } : null
  } catch { return null }
}

const isUuid = (v: any) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)
const plainObject = (v: any) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

/**
 * Per-company plan overrides (company_entitlements). Super-admin only — the
 * table is no longer writable from the browser (COLVY_V347), so the platform
 * admin reads and saves through here with the service role.
 *
 * GET  ?companyId=                → { row }
 * POST { companyId, features, limits, reason } → { ok }
 */
export async function GET(req: NextRequest) {
  const db = admin()
  if (!(await superAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!isUuid(companyId)) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  const { data, error } = await db.from('company_entitlements').select('*').eq('company_id', companyId).maybeSingle()
  if (error) return NextResponse.json({ error: error.message, missing: /does not exist|schema cache/i.test(error.message) }, { status: 500 })
  return NextResponse.json({ row: data || null })
}

export async function POST(req: NextRequest) {
  const db = admin()
  const who = await superAdmin(req, db)
  if (!who) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { companyId } = body
  const reason = String(body.reason || '').trim()
  if (!isUuid(companyId)) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  if (!reason) return NextResponse.json({ error: 'A reason is required (audited).' }, { status: 400 })

  // Keep the branding add-on's own marker (lib/branding-addon) so saving other
  // overrides doesn't disconnect a paid add-on from its Stripe subscription.
  const { data: prev } = await db.from('company_entitlements').select('features').eq('company_id', companyId).maybeSingle()
  const features: Record<string, any> = { ...plainObject(body.features) }
  if (prev?.features?.brandingAddon && !('brandingAddon' in features)) features.brandingAddon = true

  const { error } = await db.from('company_entitlements').upsert({
    company_id: companyId,
    features,
    limits: plainObject(body.limits),
    reason,
    updated_by: who.email,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id' })
  if (error) return NextResponse.json({ error: error.message, missing: /does not exist|schema cache/i.test(error.message) }, { status: 500 })

  await logSuperAdminAudit(db, {
    adminId: who.id, adminEmail: who.email, companyId,
    action: 'entitlements.update', summary: reason,
    detail: { features, limits: plainObject(body.limits) },
  })
  return NextResponse.json({ ok: true })
}
