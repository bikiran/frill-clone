import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const SUPER_ADMIN = 'bishalstha76@gmail.com'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireSuperAdmin(req: NextRequest, db: any): Promise<boolean> {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return false
    const { data } = await db.auth.getUser(token)
    return data?.user?.email === SUPER_ADMIN
  } catch { return false }
}

// GET ?companyId= (optional) — the most recent super-admin actions, either for
// one company or platform-wide. Super-admin only; used by the in-workspace
// Super-Admin bar's Audit view and the platform console.
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    if (!(await requireSuperAdmin(req, db))) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
    const companyId = req.nextUrl.searchParams.get('companyId')
    const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit')) || 50, 1), 200)

    let q = db.from('super_admin_audit')
      .select('id, created_at, admin_email, company_id, action, summary, detail')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (companyId) q = q.eq('company_id', companyId)

    const { data, error } = await q
    if (error) {
      if (/does not exist|schema cache/i.test(error.message || '')) {
        return NextResponse.json({ needsMigration: true, entries: [], error: 'Run COLVY_V319_SUPER_ADMIN_AUDIT.sql, then reload.' })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ entries: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
