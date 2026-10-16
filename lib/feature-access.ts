import { canUseFeature } from './permissions'
import { isStaffRow } from './company-access'

/**
 * Server-side feature access for a workspace's members: the same rules as
 * the admin sidebar and the mobile app (lib/permissions.ts canUseFeature).
 * Used so pushes and incoming-call rings only reach members who may use the
 * feature they're about.
 *
 * `db` must be a service-role client (team_members is read for other users).
 */

/** Mobile-app routes (expo-router paths carried in push data) → feature keys. */
const APP_ROUTE_FEATURES: [string, string][] = [
  ['/(tabs)/inbox', 'inbox'], ['/conversation', 'inbox'],
  ['/(tabs)/contacts', 'contacts'], ['/contact', 'contacts'],
  ['/(tabs)/tasks', 'tasks'], ['/tasks', 'tasks'],
  ['/(tabs)/orders', 'orders'], ['/orders', 'orders'],
  ['/calendar', 'calendar'], ['/notes', 'notes'], ['/gallery', 'gallery'],
  ['/call-detail', 'calls'], ['/calls', 'calls'],
  ['/reviews', 'reviews'], ['/social', 'social'], ['/team', 'team'],
  ['/announcements', 'announcements'], ['/help', 'help'], ['/article', 'help'],
]

export function featureForAppRoute(route: string | null | undefined): string | null {
  const r = String(route || '').split('?')[0]
  if (!r) return null
  for (const [prefix, f] of APP_ROUTE_FEATURES) if (r === prefix || r.startsWith(prefix + '/')) return f
  return null
}

/**
 * Which features a push is about, from what its caller already sends. A
 * member needs ANY one of them. Empty = not gated (everyone it targets).
 */
export function featuresForPush(p: { feature?: string | null; channelId?: string | null; conversationId?: string | null; route?: string | null }): string[] {
  if (p.feature) return [p.feature]
  // Call alerts (missed / answered elsewhere): whoever may take calls — the
  // same members the phone rings for.
  if (p.channelId === 'calls') return ['calls', 'inbox']
  if (p.channelId === 'orders') return ['orders']
  if (p.conversationId) return ['inbox']
  const f = featureForAppRoute(p.route)
  return f ? [f] : []
}

/**
 * Of `userIds`, the ones who may hear about this workspace, and are allowed at
 * least one of `features` (with none given, just the first part). The owner
 * always is, and so is anyone without a team_members row here (e.g. an owner
 * with no row). A board visitor ('viewer' row) or a removed member never is:
 * a viewer row has no permission map, which canUseFeature reads as "everything",
 * so they used to get message alerts and incoming calls. Staff with no map
 * still have full access. If the team can't be read, only the owner is.
 */
export async function filterUsersByFeature(db: any, companyId: string, userIds: string[], features: string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)))
  if (!ids.length) return new Set()
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200))
  const [{ data: co }, ...reads] = await Promise.all([
    db.from('companies').select('owner_id').eq('id', companyId).maybeSingle(),
    ...chunks.map(chunk => db.from('team_members').select('user_id, role, status, permissions').eq('company_id', companyId).in('user_id', chunk)),
  ])
  const failed = reads.some((r: any) => r.error)
  const byUser = new Map<string, any[]>()
  for (const { data } of reads) for (const r of data || []) (byUser.get(r.user_id) || byUser.set(r.user_id, []).get(r.user_id)!).push(r)
  return new Set(ids.filter(uid => {
    if (co?.owner_id && uid === co.owner_id) return true
    if (failed) return false
    const rows = byUser.get(uid)
    if (!rows) return true
    return rows.some(m => isStaffRow(m) && (!features.length || features.some(f => canUseFeature(m.role, m.permissions, f))))
  }))
}
