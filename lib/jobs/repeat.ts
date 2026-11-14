// Repeating jobs: the rule (every N weeks or months, until never / after N
// visits / a date) and the date maths, shared by the job page (to preview the
// next visits) and the server (lib/jobs/repeat-server.ts, which makes them).
// Pure: no database, no time zone (dates are the business's local days).

export type RepeatUnit = 'week' | 'month'
export type RepeatEnds = 'never' | 'after' | 'on'
export type RepeatRule = { every: number; unit: RepeatUnit; ends: RepeatEnds; endsAfter: number | null; endsOn: string | null }

export const REPEAT_PRESETS: { key: string; label: string; every: number; unit: RepeatUnit }[] = [
  { key: 'weekly', label: 'Every week', every: 1, unit: 'week' },
  { key: 'fortnightly', label: 'Every 2 weeks', every: 2, unit: 'week' },
  { key: 'four_weekly', label: 'Every 4 weeks', every: 4, unit: 'week' },
  { key: 'monthly', label: 'Every month', every: 1, unit: 'month' },
  { key: 'quarterly', label: 'Every 3 months', every: 3, unit: 'month' },
]

const DATE = /^\d{4}-\d{2}-\d{2}$/
export const MAX_VISITS = 520

/** A tidy rule from anything, or null when it doesn't make sense. */
export function cleanRule(raw: any): RepeatRule | null {
  const unit: RepeatUnit | null = raw?.unit === 'week' || raw?.unit === 'month' ? raw.unit : null
  const every = Math.round(Number(raw?.every))
  if (!unit || !Number.isFinite(every) || every < 1 || every > (unit === 'week' ? 52 : 12)) return null
  const ends: RepeatEnds = raw?.ends === 'after' || raw?.ends === 'on' ? raw.ends : 'never'
  const after = Math.round(Number(raw?.endsAfter))
  if (ends === 'after' && (!Number.isFinite(after) || after < 2 || after > MAX_VISITS)) return null
  if (ends === 'on' && !DATE.test(String(raw?.endsOn || ''))) return null
  return { every, unit, ends, endsAfter: ends === 'after' ? after : null, endsOn: ends === 'on' ? String(raw.endsOn) : null }
}

const daysIn = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate()

/**
 * The date of visit `seq` (1 = the first visit, on startDate). Weeks add
 * 7-day steps; months keep the same day of the month, or the month's last
 * day when it's shorter (31 Jan, then 28 Feb, 31 Mar…).
 */
export function visitDate(startDate: string, rule: Pick<RepeatRule, 'every' | 'unit'>, seq: number): string {
  const [y, m, d] = startDate.split('-').map(Number)
  const k = Math.max(0, seq - 1) * rule.every
  if (rule.unit === 'week') {
    const t = new Date(Date.UTC(y, m - 1, d + k * 7))
    return t.toISOString().slice(0, 10)
  }
  const total = (m - 1) + k
  const ty = y + Math.floor(total / 12), tm = ((total % 12) + 12) % 12
  const td = Math.min(d, daysIn(ty, tm))
  return `${ty}-${String(tm + 1).padStart(2, '0')}-${String(td).padStart(2, '0')}`
}

/** Whether visit `seq` (on `date`) is still inside the rule's end. */
export function withinEnd(rule: RepeatRule, seq: number, date: string): boolean {
  if (seq > MAX_VISITS) return false
  if (rule.ends === 'after') return seq <= (rule.endsAfter || 0)
  if (rule.ends === 'on') return date <= (rule.endsOn || '')
  return true
}

/** "Every 2 weeks", "Every month" */
export function ruleLabel(rule: Pick<RepeatRule, 'every' | 'unit'>): string {
  const p = REPEAT_PRESETS.find(x => x.every === rule.every && x.unit === rule.unit)
  if (p) return p.label
  return `Every ${rule.every} ${rule.unit}${rule.every === 1 ? '' : 's'}`
}

/** "until 1 March 2027", "for 10 visits", "" (no end) */
export function endLabel(rule: RepeatRule): string {
  if (rule.ends === 'after') return `for ${rule.endsAfter} visits`
  if (rule.ends === 'on' && rule.endsOn) {
    const [y, m, d] = rule.endsOn.split('-').map(Number)
    return `until ${new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-AU', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })}`
  }
  return ''
}

/** The next `count` visit dates after visit `afterSeq`, within the rule's end. */
export function upcomingDates(startDate: string, rule: RepeatRule, afterSeq: number, count: number): { seq: number; date: string }[] {
  const out: { seq: number; date: string }[] = []
  for (let seq = afterSeq + 1; out.length < count && seq <= MAX_VISITS; seq++) {
    const date = visitDate(startDate, rule, seq)
    if (!withinEnd(rule, seq, date)) break
    out.push({ seq, date })
  }
  return out
}
