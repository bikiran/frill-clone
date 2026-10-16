// Form version history: what a snapshot holds, when the server records one,
// and how a snapshot is put back onto a form. Pure functions, no I/O, so the
// server route (app/api/form-versions) and the tests share one set of rules.
//
// The table is created by migrations/COLVY_V382_FORM_VERSIONS.sql. Until that
// runs the route skips quietly (see isMissingTable).

/** Versions kept per form; older ones are pruned after each new snapshot. */
export const VERSION_KEEP = 50
/** An ordinary save records a version at most this often per form. */
export const SNAPSHOT_EVERY_MS = 10 * 60_000
/** Even a big change waits this long after the previous version (one add after another is one version, not ten). */
export const SNAPSHOT_MIN_GAP_MS = 60_000
/** Questions added since the last version that count as a big change on their own. */
export const SNAPSHOT_ADDED_QUESTIONS = 3

export type SnapshotReason = 'autosave' | 'publish' | 'restore' | 'before_restore'
export const SNAPSHOT_REASONS: SnapshotReason[] = ['autosave', 'publish', 'restore', 'before_restore']

/**
 * The form columns a version stores. Columns the forms row doesn't have on an
 * older database are left out (description, end_actions… are not on every one).
 */
export const SNAPSHOT_COLUMNS = [
  'title', 'description', 'questions', 'theme',
  'welcome_message', 'thank_you_message', 'end_actions', 'show_confetti', 'display_style',
] as const
type SnapshotColumn = (typeof SNAPSHOT_COLUMNS)[number]
export type FormSnapshotRow = Partial<Record<SnapshotColumn, unknown>>

/** The columns the hand-made form_versions table had before V382 (and the old route wrote). */
export const LEGACY_COLUMNS: SnapshotColumn[] = ['title', 'description', 'questions', 'theme']

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** What to store for this form row: every snapshot column the row has. */
export function snapshotOf(form: Record<string, unknown>): FormSnapshotRow {
  const out: FormSnapshotRow = {}
  for (const c of SNAPSHOT_COLUMNS) if (c in form) out[c] = form[c] ?? null
  if (!Array.isArray(out.questions)) out.questions = []
  if (!isPlain(out.theme)) out.theme = {}
  return out
}

/** JSON with object keys sorted, so jsonb's own key order never looks like a change. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(x => (x === undefined ? 'null' : stableJson(x))).join(',')}]`
  if (isPlain(v)) {
    return `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`
  }
  return JSON.stringify(v ?? null)
}

/**
 * Whether a version already holds the same form. Only the columns the version
 * has are compared (an old version without end_actions isn't "different" just
 * because the form now has the column).
 */
export function sameContent(version: Record<string, unknown> | null | undefined, snap: FormSnapshotRow): boolean {
  if (!version) return false
  for (const c of SNAPSHOT_COLUMNS) {
    if (!(c in snap) || !(c in version)) continue
    const a = c === 'questions' ? (Array.isArray(version[c]) ? version[c] : []) : c === 'theme' ? (isPlain(version[c]) ? version[c] : {}) : version[c] ?? null
    if (stableJson(a) !== stableJson(snap[c] ?? null)) return false
  }
  return true
}

const questionList = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v : []).filter(isPlain)

/**
 * A change worth its own version straight away: a question removed, a
 * question's type changed, or several questions added. Rewording, reordering
 * and option edits wait for the 10-minute rule.
 */
export function bigQuestionChange(before: unknown, after: unknown): boolean {
  const prev = questionList(before)
  const next = questionList(after)
  const typeOf = new Map<string, unknown>()
  prev.forEach((q, i) => typeOf.set(typeof q.id === 'string' && q.id ? q.id : `#${i}`, q.type))
  const nextIds = new Set<string>()
  let added = 0
  next.forEach((q, i) => {
    const id = typeof q.id === 'string' && q.id ? q.id : `#${i}`
    nextIds.add(id)
    if (!typeOf.has(id)) added++
    else if (typeOf.get(id) !== q.type) added += SNAPSHOT_ADDED_QUESTIONS   // a type change counts as big
  })
  for (const id of typeOf.keys()) if (!nextIds.has(id)) return true
  return added >= SNAPSHOT_ADDED_QUESTIONS
}

export type SnapshotDecision = { save: true; why: string } | { save: false; why: string }

/**
 * Whether to record a version now. Never when nothing changed since the
 * latest version. Otherwise always for publish / restore / before_restore,
 * and for an ordinary save when there is no version yet, the latest is at
 * least 10 minutes old, or the questions changed a lot (at least a minute after
 * the latest, so a burst of edits makes one version).
 */
export function shouldSnapshot(opts: {
  reason: SnapshotReason
  latest: Record<string, unknown> | null | undefined
  snap: FormSnapshotRow
  now: number
}): SnapshotDecision {
  const { reason, latest, snap, now } = opts
  if (sameContent(latest, snap)) return { save: false, why: 'unchanged' }
  if (reason !== 'autosave') return { save: true, why: reason }
  if (!latest) return { save: true, why: 'first' }
  const at = Date.parse(String(latest.created_at || ''))
  const age = Number.isFinite(at) ? now - at : Infinity
  if (age >= SNAPSHOT_EVERY_MS) return { save: true, why: 'interval' }
  if (age >= SNAPSHOT_MIN_GAP_MS && bigQuestionChange(latest.questions, snap.questions)) return { save: true, why: 'big_change' }
  return { save: false, why: 'too_soon' }
}

// Theme keys the builder manages itself (buildSavedTheme): on restore they
// follow the version exactly, including being absent (= the default).
const BUILDER_THEME_KEYS = ['color', 'welcome', 'variables', 'listMode']

/**
 * The theme to write on restore: the version's theme over the current one.
 * Builder-managed keys (colour, welcome screen settings, logic variables, list
 * mode) follow the version exactly; any other key the version doesn't have
 * (a background added later, a key from a newer feature) is kept, as the
 * builder's own save keeps it. A version with no theme keeps the current one.
 */
export function restoredTheme(current: unknown, versionTheme: unknown): Record<string, unknown> {
  const cur = isPlain(current) ? current : {}
  if (!isPlain(versionTheme)) return { ...cur }
  const out: Record<string, unknown> = { ...cur, ...versionTheme }
  for (const k of BUILDER_THEME_KEYS) if (!(k in versionTheme)) delete out[k]
  return out
}

/**
 * The forms update that puts a version back. Only columns the forms row has
 * are written, and a column the version doesn't hold (an old version made
 * before end_actions was saved) keeps its current value. Questions go back
 * verbatim, with their logic.
 */
export function restorePatch(form: Record<string, unknown>, version: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const c of SNAPSHOT_COLUMNS) {
    if (!(c in form)) continue
    if (c === 'theme') { patch.theme = restoredTheme(form.theme, version.theme); continue }
    if (c === 'questions') { if (Array.isArray(version.questions)) patch.questions = version.questions; continue }
    if (c === 'title') { if (typeof version.title === 'string' && version.title.trim()) patch.title = version.title; continue }
    // Text / settings columns: only when the version has a value for it.
    if (version[c] !== undefined && version[c] !== null) patch[c] = version[c]
  }
  return patch
}

/** The table isn't there yet (V382 not run): Postgres 42P01 or PostgREST's schema-cache miss. */
export function isMissingTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: unknown; message?: unknown }
  if (e.code === '42P01' || e.code === 'PGRST205') return true
  return /relation "?(public\.)?form_versions"? does not exist|could not find the table '?(public\.)?form_versions/i.test(String(e.message || ''))
}

/** A column the insert named isn't on the table (a hand-made table from before V382). */
export function isMissingColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: unknown; message?: unknown }
  if (e.code === '42703' || e.code === 'PGRST204') return true
  return /column .* does not exist|could not find the '.*' column/i.test(String(e.message || ''))
}

/** A second snapshot took the same version number at the same moment. */
export function isDuplicate(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: unknown }).code === '23505'
}
