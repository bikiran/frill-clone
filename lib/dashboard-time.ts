// Small date/call helpers for the admin dashboard summary (server + tests).

/** YYYY-MM-DD of an instant, in the business's timezone. */
export function dayKey(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** The instant local midnight began today, in `tz`. */
export function startOfDay(now: Date, tz: string): Date {
  const p: Record<string, string> = {}
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(now)) p[x.type] = x.value
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  const offset = wall - Math.floor(now.getTime() / 1000) * 1000
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day) - offset)
}

/** Same rules as the Command Centre: answered, voicemail, still live, or missed. */
export function callOutcome(c: any): 'answered' | 'voicemail' | 'live' | 'missed' {
  const s = String(c.status || '').toLowerCase()
  if (c.is_voicemail || s === 'voicemail') return 'voicemail'
  if (s === 'answered' || s === 'completed' || Number(c.duration_seconds) > 0) return 'answered'
  if (['initiated', 'ringing', 'in_progress'].includes(s)) return 'live'
  return 'missed'
}
