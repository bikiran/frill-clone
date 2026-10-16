// One parser for timestamps that come back from the database.
//
// Many older tables (forms, form_responses, surveys, survey_responses, polls,
// poll_votes, announcements, ideas...) use TIMESTAMP *without* time zone. The
// database writes them in UTC, but PostgREST returns them with no offset
// ("2026-10-16T12:35:00.123456"). Date.parse / new Date() read an offset-less
// date-time as the viewer's LOCAL time, so in Melbourne (UTC+11 in summer) a
// response that arrived seconds ago showed as "11 hours ago". These helpers
// read an offset-less value as UTC and leave values that carry an offset
// (TIMESTAMPTZ columns, toISOString output) exactly as they are.
//
// Pure: safe on the client, the server and in tests.

const DB_TS = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)\s*(Z|z|[+-]\d{2}(?::?\d{2})?)?$/

/** A database timestamp (or epoch ms, or a Date) as epoch ms; NaN when it isn't one. */
export function parseDbTime(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  if (v instanceof Date) return v.getTime()
  if (typeof v !== 'string' || !v.trim()) return NaN
  const s = v.trim()
  const m = DB_TS.exec(s)
  if (!m) return Date.parse(s)
  let tz = m[3] || 'Z'
  if (/^[+-]\d{2}$/.test(tz)) tz += ':00'
  else if (/^[+-]\d{4}$/.test(tz)) tz = `${tz.slice(0, 3)}:${tz.slice(3)}`
  // JS Date only keeps milliseconds; Postgres sends up to microseconds.
  const time = m[2].replace(/(\.\d{3})\d+$/, '$1')
  return Date.parse(`${m[1]}T${time}${tz.toUpperCase()}`)
}

/** parseDbTime as a Date, or null when it isn't a timestamp. */
export function dbDate(v: unknown): Date | null {
  const t = parseDbTime(v)
  return Number.isFinite(t) ? new Date(t) : null
}

/** parseDbTime, with 0 for missing / unreadable values (for sorting). */
export function dbTimeOr0(v: unknown): number {
  const t = parseDbTime(v)
  return Number.isFinite(t) ? t : 0
}

/** The newest of some rows' timestamps, compared as instants (not as text). */
export function newestDbTime<T>(rows: readonly T[], pick: (row: T) => unknown): { at: string | null; ms: number } {
  let at: string | null = null
  let ms = -Infinity
  for (const r of rows) {
    const v = pick(r)
    const t = parseDbTime(v)
    if (Number.isFinite(t) && t > ms) { ms = t; at = typeof v === 'string' ? v : new Date(t).toISOString() }
  }
  return { at, ms: at ? ms : NaN }
}
