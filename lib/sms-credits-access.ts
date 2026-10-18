// Who may see and who may spend a company's SMS credits (server only).
//
//   read   — any staff member (requireCompanyAccess: owner, team members who
//            aren't board visitors or removed, the platform super admin).
//   manage — money: top up, change auto top-up, remove the saved card. The
//            owner, a team admin, or the platform super admin.

import type { NextRequest } from 'next/server'
import { callerUser, requireCompanyAccess, SUPER_ADMIN } from '@/lib/company-access'

export type CreditsAccess = { ok: boolean; status: 200 | 401 | 403 | 503; userId?: string; email?: string; canManage: boolean; error?: string }

export async function smsCreditsAccess(req: NextRequest, db: any, companyId: string | null | undefined, need: 'read' | 'manage'): Promise<CreditsAccess> {
  if (!companyId) return { ok: false, status: 403, canManage: false, error: 'Not authorized' }
  const a = await requireCompanyAccess(req, db, companyId)
  if (!a.ok) {
    return a.unavailable
      ? { ok: false, status: 503, canManage: false, error: 'We couldn’t check your access just now. Try again in a minute.' }
      : { ok: false, status: 403, canManage: false, error: 'Not authorized' }
  }
  const user = await callerUser(req, db)
  let canManage = false
  if ((user?.email || '').toLowerCase() === SUPER_ADMIN) canManage = true
  else {
    try {
      const [{ data: co }, { data: rows }] = await Promise.all([
        db.from('companies').select('owner_id').eq('id', companyId).maybeSingle(),
        db.from('team_members').select('role, status').eq('company_id', companyId).eq('user_id', a.userId).limit(5),
      ])
      canManage = co?.owner_id === a.userId || (rows || []).some((r: any) =>
        ['owner', 'admin'].includes(String(r.role || '').toLowerCase()) && String(r.status || '').toLowerCase() !== 'removed')
    } catch { canManage = false }
  }
  if (need === 'manage' && !canManage) {
    return { ok: false, status: 403, userId: a.userId, email: user?.email, canManage, error: 'Only the business owner or an admin can manage SMS credits.' }
  }
  return { ok: true, status: 200, userId: a.userId, email: user?.email, canManage }
}
