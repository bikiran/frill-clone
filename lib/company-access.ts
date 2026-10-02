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
    const { data: co } = await db.from('companies').select('id').eq('id', companyId).eq('owner_id', user.id).maybeSingle()
    if (co) return { ok: true, userId: user.id }
    const { data: tm } = await db.from('team_members').select('id').eq('company_id', companyId).eq('user_id', user.id).limit(1)
    if (tm?.length) return { ok: true, userId: user.id }
    return { ok: false }
  } catch { return { ok: false } }
}
