import { NextRequest } from 'next/server'
import { jobsDb, jobsAccess, json, loadCompany } from '@/lib/jobs/server'
import { jobStaff } from '@/lib/jobs/field'

export const dynamic = 'force-dynamic'

// GET ?companyId — the people jobs can be assigned to (the owner and active
// staff), for the assign picker.
export async function GET(req: NextRequest) {
  try {
    const db = jobsDb()
    const companyId = req.nextUrl.searchParams.get('companyId')
    const access = await jobsAccess(req, db, companyId)
    if (!access.ok) return access.response
    const company = await loadCompany(db, companyId!)
    if (!company) return json({ error: 'Workspace not found.' }, 404)
    const staff = await jobStaff(db, company)
    return json({ staff: staff.map(s => ({ id: s.id, name: s.name, avatar_url: s.avatar_url || null })), me: access.userId })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not load the team.' }, 500)
  }
}
