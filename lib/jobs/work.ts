// Jobs Phase 2, the work itself: who's on a job, whether that clashes with
// anything else they're doing, time on the job, checklists, and what field
// staff may see. Pure (no database) so scripts/jobs.test.mjs can test it.

export type Assignee = { id: string; name: string }
export const MAX_ASSIGNEES = 12
export const DEFAULT_JOB_MINUTES = 120

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The assignees asked for, kept only if they're on this team (staff = loadStaff), deduped, named as the team names them. */
export function cleanAssignees(raw: any, staff: { id: string; name: string }[]): Assignee[] {
  const byId = new Map(staff.map(s => [s.id, s]))
  const out: Assignee[] = []
  for (const r of Array.isArray(raw) ? raw : []) {
    const id = typeof r === 'string' ? r : r?.id
    if (typeof id !== 'string' || !UUID.test(id) || out.some(a => a.id === id)) continue
    const s = byId.get(id)
    if (!s) continue
    out.push({ id, name: String(s.name || 'Team member').slice(0, 80) })
    if (out.length >= MAX_ASSIGNEES) break
  }
  return out
}

export const assigneesOf = (job: any): Assignee[] => (Array.isArray(job?.assignees) ? job.assignees.filter((a: any) => a && typeof a.id === 'string') : [])
export const isAssigned = (job: any, userId: string) => assigneesOf(job).some(a => a.id === userId)

/** Half-open ranges [a0, a1) and [b0, b1) overlap. */
export const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1

/** The time a job takes up: its start to its finish, or two hours when no finish is set. */
export function jobWindow(start: string | null | undefined, end: string | null | undefined): [number, number] | null {
  const s = start ? Date.parse(start) : NaN
  if (!Number.isFinite(s)) return null
  const e = end ? Date.parse(end) : NaN
  return [s, Number.isFinite(e) && e > s ? e : s + DEFAULT_JOB_MINUTES * 60_000]
}

export type Busy = { userId: string; from: number; until: number; kind: 'job' | 'booking' | 'event'; label: string; refId?: string }

/** Everything that clashes with the job's time for the people being assigned. */
export function findConflicts(o: { userIds: string[]; start: string | null; end: string | null; busy: Busy[]; excludeRefId?: string }): Busy[] {
  const w = jobWindow(o.start, o.end)
  if (!w) return []
  const who = new Set(o.userIds)
  return o.busy
    .filter(b => who.has(b.userId) && (!o.excludeRefId || b.refId !== o.excludeRefId) && overlaps(w[0], w[1], b.from, b.until))
    .sort((a, b) => a.from - b.from)
}

// ── Time on the job ─────────────────────────────────────────────────────────

export type TimeEntry = { id?: string; user_id: string; user_name?: string | null; started_at: string; ended_at?: string | null; seconds?: number | null }

export function entrySeconds(e: TimeEntry, nowMs = Date.now()): number {
  const s = Date.parse(e.started_at)
  if (!Number.isFinite(s)) return 0
  const end = e.ended_at ? Date.parse(e.ended_at) : nowMs
  return Math.max(0, Math.round((end - s) / 1000))
}

/** Total time, per person, and who's on the clock now. */
export function timeTotals(entries: TimeEntry[], nowMs = Date.now()) {
  const byUser: Record<string, { name: string; seconds: number; running: boolean }> = {}
  let total = 0
  for (const e of entries || []) {
    const secs = entrySeconds(e, nowMs)
    total += secs
    const u = (byUser[e.user_id] = byUser[e.user_id] || { name: e.user_name || 'Team member', seconds: 0, running: false })
    u.seconds += secs
    if (!e.ended_at) u.running = true
  }
  return { totalSeconds: total, byUser, runningUserIds: Object.keys(byUser).filter(k => byUser[k].running) }
}

/** 2h 05m · 45m · under a minute */
export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0))
  if (s < 60) return s ? 'under a minute' : '0m'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

// ── Who sees what ───────────────────────────────────────────────────────────

/**
 * With "field staff see only their own jobs" on, a member who isn't an owner
 * or admin sees only jobs they're assigned to, and no prices. Off: everyone
 * with Jobs access sees every job (Phase 1 behaviour).
 */
export function canSeeJob(o: { isManager: boolean; userId: string; restrict: boolean; job: any }): boolean {
  if (o.isManager || !o.restrict) return true
  return isAssigned(o.job, o.userId)
}
export const canSeeMoney = (o: { isManager: boolean; restrict: boolean }) => o.isManager || !o.restrict

// ── Checklists ──────────────────────────────────────────────────────────────

export const MAX_CHECKLIST_ITEMS = 100
export const cleanChecklistText = (v: any) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)
export function cleanChecklistItems(raw: any): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split('\n') : []
  return list.map(cleanChecklistText).filter(Boolean).slice(0, MAX_CHECKLIST_ITEMS)
}

export const PHOTO_KINDS = ['before', 'after', 'other'] as const
export type PhotoKind = typeof PHOTO_KINDS[number]
export const PHOTO_KIND_LABEL: Record<PhotoKind, string> = { before: 'Before', after: 'After', other: 'Other' }
export const isPhotoKind = (k: any): k is PhotoKind => (PHOTO_KINDS as readonly string[]).includes(k)

/**
 * Is `url` a file in this job's own folder (chat-attachments/<company>/jobs/<job>/)
 * under one of our storage bases? Anything else (another host, another
 * workspace's or job's folder, a "../" path, a look-alike host) is refused.
 */
export function jobFileUrlOk(url: any, companyId: string, jobId: string, bases: string[]): boolean {
  if (typeof url !== 'string' || url.length > 1000 || url.includes('..') || /[\s\\]/.test(url)) return false
  try { const u = new URL(url); if (u.protocol !== 'https:' && u.protocol !== 'http:') return false } catch { return false }
  const key = `chat-attachments/${companyId}/jobs/${jobId}/`
  return bases.some(b => !!b && url.startsWith(`${b.replace(/\/+$/, '')}/${key}`) && url.length > b.length + key.length + 1)
}
