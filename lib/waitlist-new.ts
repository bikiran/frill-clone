// "New" tags on the Waitlists page — who signed up since the last visit.
//
// A sign-up is new on the same terms as the side-menu badge (see the
// op=newcount branch of /api/waitlist): still waiting (waiting or queued) and
// created after the last time Waitlists was opened on this device. The page
// collects those ids as entries load and keeps them for the whole visit, so a
// tag doesn't vanish when that customer is notified or edited. Pure helpers,
// safe on the client and in tests.

export const WAITLIST_SEEN_KEY = 'colvy-waitlist-seen-at'
// Nothing stored yet (first visit on this device): sign-ups from the last two
// days count as new.
export const FIRST_VISIT_WINDOW_MS = 48 * 3600_000

const time = (v: unknown) => (typeof v === 'string' && v ? Date.parse(v) : NaN)

// The moment this visit judges "new" from: the previous seen-at, or the
// first-visit window when there isn't a usable one.
export function resolveNewSince(stored: string | null | undefined, now = Date.now()): { since: string; firstVisit: boolean } {
  const t = time(stored)
  if (Number.isFinite(t)) return { since: new Date(t).toISOString(), firstVisit: false }
  return { since: new Date(now - FIRST_VISIT_WINDOW_MS).toISOString(), firstVisit: true }
}

// The badge's definition: still waiting, and created after `since`.
export function isNewSignup(e: any, since: string | null | undefined): boolean {
  const s = time(since)
  if (!e || !Number.isFinite(s)) return false
  if (e.status !== 'waiting' && e.status !== 'queued') return false
  const c = time(e.created_at)
  return Number.isFinite(c) && c > s
}

// Adds any new sign-ups in `entries` to the ids already tagged this visit.
// Ids are never dropped, so a tag stays after notifying or editing. Returns
// `prev` itself when nothing was added, so React can skip a re-render.
export function collectNewIds(prev: ReadonlySet<string>, entries: any[], since: string | null | undefined): ReadonlySet<string> {
  let next: Set<string> | null = null
  for (const e of entries || []) {
    if (!e?.id || prev.has(String(e.id)) || !isNewSignup(e, since)) continue
    next = next || new Set(prev)
    next.add(String(e.id))
  }
  return next || prev
}

// Tagged this visit and not since removed from the waitlist.
export function isTaggedNew(e: any, ids: ReadonlySet<string>): boolean {
  return !!e?.id && ids.has(String(e.id)) && e.status !== 'cancelled'
}

export function countNew(entries: any[], ids: ReadonlySet<string>): number {
  let n = 0
  for (const e of entries || []) if (isTaggedNew(e, ids)) n++
  return n
}

// Items with new customers first, keeping the existing order otherwise.
export function sortNewFirst<T extends { newCount: number }>(list: T[], cmp: (a: T, b: T) => number): T[] {
  return list.sort((a, b) => (b.newCount > 0 ? 1 : 0) - (a.newCount > 0 ? 1 : 0) || cmp(a, b))
}
