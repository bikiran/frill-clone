// The decision behind the jobs API's access check, kept pure so it can be
// tested without a database (scripts/jobs.test.mjs). lib/jobs/access.ts loads
// the caller's rows and calls this.

import { canUseFeature, hasFullAccess } from '@/lib/permissions'
import { isStaffRow } from '@/lib/company-access'

export type JobsAccessDecision = { ok: true; role: string } | { ok: false; status: 403; reason: 'not_member' | 'no_permission' }

/**
 * The owner always gets in. Otherwise the caller needs a staff row in THIS
 * workspace (not a board viewer, not removed) whose permissions allow "jobs".
 */
export function checkJobsAccess(input: { isOwner: boolean; rows: { role?: string | null; status?: string | null; permissions?: any }[] }): JobsAccessDecision {
  if (input.isOwner) return { ok: true, role: 'owner' }
  const staff = (input.rows || []).filter(isStaffRow)
  if (!staff.length) return { ok: false, status: 403, reason: 'not_member' }
  for (const row of staff) {
    const role = String(row.role || 'editor').toLowerCase()
    if (hasFullAccess(role)) return { ok: true, role }
    const perms = row.permissions && typeof row.permissions === 'object' ? row.permissions : null
    if (canUseFeature(role as any, perms, 'jobs')) return { ok: true, role }
  }
  return { ok: false, status: 403, reason: 'no_permission' }
}
