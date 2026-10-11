import { canUseFeature } from './permissions'

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
 * Of `userIds`, the ones allowed at least one of `features` in this
 * workspace. The owner is always allowed, and so is anyone without a
 * team_members row here (e.g. an owner with no row) — only a member whose
 * permissions switch every one of the features off is dropped.
 */
export async function filterUsersByFeature(db: any, companyId: string, userIds: string[], features: string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)))
  if (!features.length || !ids.length) return new Set(ids)
  const [{ data: co }, { data: rows }] = await Promise.all([
    db.from('companies').select('owner_id').eq('id', companyId).maybeSingle(),
    db.from('team_members').select('user_id, role, permissions').eq('company_id', companyId).in('user_id', ids),
  ])
  const byUser = new Map<string, any>()
  for (const r of rows || []) byUser.set(r.user_id, r)
  return new Set(ids.filter(uid => {
    if (co?.owner_id && uid === co.owner_id) return true
    const m = byUser.get(uid)
    if (!m) return true
    return features.some(f => canUseFeature(m.role, m.permissions, f))
  }))
}
