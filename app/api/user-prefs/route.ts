import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'

export const dynamic = 'force-dynamic'

// Per-user, per-company UI preferences (COLVY_V232). Generic key→value store so
// a user's choices — e.g. the Tasks default view + custom view names — follow
// them across devices instead of living in one browser. Resilient: if the table
// hasn't been migrated yet, reads return {} and writes no-op, so nothing breaks.
const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// The caller may only read or write their OWN preferences, in a workspace they
// belong to. Both used to be open: anyone could read or overwrite any user's
// saved views and defaults by passing their userId.
async function allowed(req: NextRequest, db: any, userId: string, companyId: string) {
  const access = await requireCompanyAccess(req, db, companyId)
  return access.ok && access.userId === userId
}

const missing = (msg?: string) => !!msg && /does not exist|schema cache|relation .* does not exist/i.test(msg)

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  const companyId = req.nextUrl.searchParams.get('companyId')
  const key = req.nextUrl.searchParams.get('key')
  if (!userId || !companyId) return NextResponse.json({ error: 'userId and companyId required' }, { status: 400 })
  try {
    const db = admin()
    if (!(await allowed(req, db, userId, companyId))) return NextResponse.json({ error: 'Not authorized', prefs: {} }, { status: 403 })
    let query = db.from('user_preferences').select('key, value').eq('user_id', userId).eq('company_id', companyId)
    if (key) query = query.eq('key', key)
    const { data, error } = await query
    if (error) { if (missing(error.message)) return NextResponse.json({ prefs: {} }); throw error }
    const prefs: Record<string, any> = {}
    for (const row of data || []) prefs[row.key] = row.value
    return NextResponse.json({ prefs })
  } catch (e: any) {
    return NextResponse.json({ prefs: {}, error: e.message })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, companyId, key, value } = await req.json()
    if (!userId || !companyId || !key) return NextResponse.json({ error: 'userId, companyId and key required' }, { status: 400 })
    const db = admin()
    if (!(await allowed(req, db, userId, companyId))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const { error } = await db.from('user_preferences')
      .upsert({ user_id: userId, company_id: companyId, key, value: value ?? {}, updated_at: new Date().toISOString() }, { onConflict: 'user_id,company_id,key' })
    if (error && !missing(error.message)) throw error
    return NextResponse.json({ ok: true, degraded: !!error })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
