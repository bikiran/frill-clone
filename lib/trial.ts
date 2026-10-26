// One way to count what's left of a trial, so the trial banner, Billing and
// the admin views always agree. They used to differ by a day: the banner
// rounded the remaining hours up from the end date, Billing counted 14 days
// from sign-up (wrong once a trial is extended or started later).
//
// Counted against the trial's end (companies.trial_ends_at: what
// effectivePlan goes by, and what an extension moves), in calendar days on
// this device's clock: ends later today → 0, tomorrow → 1, Friday → the
// days until Friday. So the number always matches the date shown beside it.

const DAY = 86_400_000
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

export type TrialLeft = { ends: Date; days: number; ended: boolean }

export function trialLeft(endsAt: string | Date | null | undefined, now: Date = new Date()): TrialLeft | null {
  if (!endsAt) return null
  const ends = endsAt instanceof Date ? endsAt : new Date(endsAt)
  if (isNaN(ends.getTime())) return null
  const ended = ends.getTime() <= now.getTime()
  // Rounded, so a daylight-saving change (a 23 or 25 hour day) can't shift it.
  const days = ended ? 0 : Math.max(0, Math.round((midnight(ends) - midnight(now)) / DAY))
  return { ends, days, ended }
}

/** How the end reads in a sentence: "today", "tomorrow", "in 4 days". */
export function trialEndsPhrase(t: TrialLeft): string {
  return t.days === 0 ? 'today' : t.days === 1 ? 'tomorrow' : `in ${t.days} days`
}
