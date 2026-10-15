// The Team page's list (app/admin/team), read in the browser: COLVY_V364 lets
// staff read their own workspace's team.
//
// Every visitor who signs in on a board gets a 'viewer' row, and one read
// returns at most 1,000 rows. The page read the whole team newest first in one
// go, so on a busy board the visitors filled that read and staff added before
// them never showed: nobody could change their role, access or outlet, or
// remove them. It still reads that way first, and for nearly every workspace
// that is everyone. When it isn't, staff (every role but Viewer, invites
// included) are read on their own and in full, and viewers a page at a time.

// PostgREST's max-rows on Supabase: no single read returns more.
const MAX_ROWS = 1000

// Viewers listed at first on a busy board, and added by each "Show more".
export const VIEWER_PAGE = 200

/** A Viewer row: a board visitor, or someone given the Viewer role. */
export const isViewerRow = (m: any) => String(m?.role ?? '').toLowerCase() === 'viewer'

/** Newest first, as Postgres orders created_at DESC (no date first), then id. */
export function newestFirst(a: any, b: any): number {
  const x = a?.created_at ?? null, y = b?.created_at ?? null
  if (x !== y) {
    if (x === null) return -1
    if (y === null) return 1
    return x < y ? 1 : -1
  }
  const i = String(a?.id ?? ''), j = String(b?.id ?? '')
  return i === j ? 0 : i < j ? 1 : -1
}

/** Rows already listed plus more, each once, newest first. */
export function mergeTeam(cur: any[], more: any[]): any[] {
  const seen = new Set(cur.map(m => m.id))
  return [...cur, ...more.filter(m => !seen.has(m.id))].sort(newestFirst)
}

// One workspace's team, its staff or its viewers, newest first. A missing role
// is the column's default ('editor'), so it counts as staff.
const teamRows = (db: any, companyId: string, part: 'all' | 'staff' | 'viewers', count = false) => {
  let q = db.from('team_members').select('*', count ? { count: 'exact' } : undefined).eq('company_id', companyId)
  if (part === 'staff') q = q.or('role.is.null,role.not.ilike.viewer')
  if (part === 'viewers') q = q.ilike('role', 'viewer')
  return q.order('created_at', { ascending: false }).order('id', { ascending: false })
}

// Rows [from, to) of staff or viewers, a read at a time, until a short read.
async function readRows(db: any, companyId: string, part: 'staff' | 'viewers', from: number, to: number): Promise<any[]> {
  const rows: any[] = []
  for (let at = from; at < to; at += MAX_ROWS) {
    const end = Math.min(at + MAX_ROWS, to)
    const { data, error } = await teamRows(db, companyId, part).range(at, end - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data || []))
    if ((data || []).length < end - at) break
  }
  return rows
}

export type TeamList = { staff: any[]; viewers: any[]; viewerTotal: number; split: boolean }

/**
 * The team, newest first. When it all fits one read (`split` false) that's
 * everyone, listed together as always. Otherwise `staff` is every staff row
 * and `viewers` the newest `viewers` of `viewerTotal` viewer rows.
 */
export async function loadTeamList(db: any, companyId: string, viewers = VIEWER_PAGE): Promise<TeamList> {
  const { data, error, count } = await teamRows(db, companyId, 'all', true).range(0, MAX_ROWS - 1)
  if (error) throw new Error(error.message)
  const rows: any[] = data || []
  if ((count ?? rows.length) <= rows.length) {
    const v = rows.filter(isViewerRow)
    return { staff: rows.filter(m => !isViewerRow(m)), viewers: v, viewerTotal: v.length, split: false }
  }
  // A busy board. The viewers in that read are the newest ones.
  const newest = rows.filter(isViewerRow)
  const [staff, older] = await Promise.all([
    readRows(db, companyId, 'staff', 0, Infinity),
    viewers > newest.length ? readRows(db, companyId, 'viewers', newest.length, viewers) : Promise.resolve([]),
  ])
  const shown = mergeTeam(newest.slice(0, viewers), older)
  return { staff, viewers: shown, viewerTotal: Math.max(count! - staff.length, shown.length), split: true }
}

/** `n` more viewers, after the newest `from`. */
export async function loadMoreViewers(db: any, companyId: string, from: number, n = VIEWER_PAGE): Promise<any[]> {
  return readRows(db, companyId, 'viewers', from, from + n)
}
