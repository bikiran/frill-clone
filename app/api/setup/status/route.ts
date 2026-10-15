import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess, callerUser, SUPER_ADMIN } from '@/lib/company-access'
import { hasFullAccess } from '@/lib/permissions'
import { computeSetupStatus, redactSetupStatus, type SetupDb } from '@/lib/setup-status'

// GET /api/setup/status?companyId=
//
// Which of the seven setup steps this workspace has done (lib/setup-status),
// for the dashboard checklist and the /onboarding launcher. Members only. The
// owner and admins also get the details (the connected address, Page name,
// number); other staff just see done / waiting / to do.
//
// 403 means "not one of yours" and nothing else: /onboarding on a workspace's
// subdomain sends someone to their own workspace on that answer. When the
// check itself couldn't be made (Supabase Auth or the database didn't answer)
// it's a 503, so a blip never looks like "not a member".

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// Owner, an owner/admin team member, or the platform super admin.
async function runsWorkspace(req: NextRequest, db: ReturnType<typeof admin>, companyId: string): Promise<boolean> {
  try {
    // The token was just checked by requireCompanyAccess; this reuses that.
    const user = await callerUser(req, db)
    if (!user) return false
    if ((user.email || '').toLowerCase() === SUPER_ADMIN) return true
    const [{ data: co }, { data: tm }] = await Promise.all([
      db.from('companies').select('owner_id').eq('id', companyId).maybeSingle(),
      db.from('team_members').select('role, status').eq('company_id', companyId).eq('user_id', user.id).limit(5),
    ])
    if (co?.owner_id === user.id) return true
    return ((tm || []) as { role?: string | null; status?: string | null }[]).some(r => String(r.status || '').toLowerCase() !== 'removed' && hasFullAccess(r.role))
  } catch { return false }
}

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId || !/^Bearer\s+\S+/i.test(req.headers.get('authorization') || '')) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }
  const db = admin()
  const access = await requireCompanyAccess(req, db, companyId)
  if (!access.ok && access.unavailable) return NextResponse.json({ error: 'Couldn’t check your access just now. Try again in a moment.' }, { status: 503 })
  if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  const [status, full] = await Promise.all([
    computeSetupStatus(db as unknown as SetupDb, companyId),
    runsWorkspace(req, db, companyId),
  ])
  return NextResponse.json({ ...(full ? status : redactSetupStatus(status)), full })
}
