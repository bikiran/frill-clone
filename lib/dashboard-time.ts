// Small date/call helpers for the admin dashboard summary (server + tests).

import { outcomeOf, normaliseCall } from '@/lib/command-centre'

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

/**
 * Same rules as the Command Centre (lib/command-centre outcomeOf): answered,
 * voicemail, still live, or missed. A missed status wins over talk time (a
 * caller leg answered only to play the voicemail greeting has a duration), and
 * a caller who hung up during the greeting left no message, so it's missed.
 */
export function callOutcome(c: any): 'answered' | 'voicemail' | 'live' | 'missed' {
  // A row read without created_at: a ringing call is taken as recent (live),
  // but a voicemail-state row never is, so a Twilio caller who hung up at the
  // greeting reads as missed rather than live for ever.
  const st = String(c?.status || '').toLowerCase()
  const vmish = !!c?.is_voicemail || st.startsWith('voicemail') || st === 'recording_voicemail'
  return outcomeOf(normaliseCall({ ...c, created_at: c?.created_at || (vmish ? new Date(0).toISOString() : new Date().toISOString()) }))
}
