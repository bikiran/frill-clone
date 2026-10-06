// Server-side check that the caller may act for a company. Used by API routes
// that read/write company data with the service-role key.

import type { NextRequest } from 'next/server'

const SUPER_ADMIN = 'bishalstha76@gmail.com'

// The caller (Bearer access token) must be the company's owner, one of its team
// members, or the platform super-admin.
export async function requireCompanyAccess(req: NextRequest, db: any, companyId: string | null | undefined): Promise<{ ok: boolean; userId?: string }> {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token || !companyId) return { ok: false }
    const { data } = await db.auth.getUser(token)
    const user = data?.user
    if (!user) return { ok: false }
    if (user.email === SUPER_ADMIN) return { ok: true, userId: user.id }
    // Owner and team checks run together rather than one after the other.
    const [{ data: co }, staff] = await Promise.all([
      db.from('companies').select('id').eq('id', companyId).eq('owner_id', user.id).maybeSingle(),
      isStaffMember(db, companyId, user.id),
    ])
    if (co || staff) return { ok: true, userId: user.id }
    return { ok: false }
  } catch { return { ok: false } }
}

// Staff are team rows that aren't board visitors and haven't been removed.
// Anyone who signs up on a business's subdomain is added to its team as a
// 'viewer' (app/auth/callback), and the admin already keeps viewers out
// (only owner / admin / editor get in), so a viewer row is not membership.
export function isStaffRow(r: any): boolean {
  if (!r) return false
  const role = String(r.role || '').toLowerCase()
  const status = String(r.status || '').toLowerCase()
  return role !== 'viewer' && status !== 'removed'
}

export async function isStaffMember(db: any, companyId: string | null | undefined, userId: string | null | undefined): Promise<boolean> {
  if (!companyId || !userId) return false
  try {
    const { data } = await db.from('team_members').select('id, role, status')
      .eq('company_id', companyId).eq('user_id', userId).limit(5)
    return (data || []).some(isStaffRow)
  } catch { return false }
}
