// The decision behind the reservations API's access check, kept pure for the
// tests. Same rules as Jobs (lib/jobs/access-core.ts), for the "reservations"
// permission: the owner always; otherwise a staff row in THIS workspace (not
// a board viewer, not removed) whose permissions allow reservations.

import { canUseFeature, hasFullAccess } from '@/lib/permissions'
import { isStaffRow } from '@/lib/company-access'

export type ReservationsAccessDecision = { ok: boolean; role?: string; reason?: 'not_member' | 'no_permission' }

export function checkReservationsAccess(input: { isOwner: boolean; rows: { role?: string | null; status?: string | null; permissions?: any }[] }): ReservationsAccessDecision {
  if (input.isOwner) return { ok: true, role: 'owner' }
  const staff = (input.rows || []).filter(isStaffRow)
  if (!staff.length) return { ok: false, reason: 'not_member' }
  for (const row of staff) {
    const role = String(row.role || 'editor').toLowerCase()
    if (hasFullAccess(role)) return { ok: true, role }
    const perms = row.permissions && typeof row.permissions === 'object' ? row.permissions : null
    if (canUseFeature(role as any, perms, 'reservations')) return { ok: true, role }
  }
  return { ok: false, reason: 'no_permission' }
}
