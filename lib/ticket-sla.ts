// Ticket deadlines (SLAs). Pure functions: used by the ticket pages (badges,
// deadline card) and the overdue-alert cron. Targets are in calendar hours,
// measured from when the ticket was raised.

export type Priority = 'urgent' | 'high' | 'normal' | 'low'

export type SlaSettings = {
  enabled: boolean
  first_response_hours: Record<Priority, number>
  resolution_hours: Record<Priority, number>
  auto_assign: boolean
}

export const DEFAULT_SLA: SlaSettings = {
  enabled: true,
  first_response_hours: { urgent: 1, high: 4, normal: 24, low: 48 },
  resolution_hours: { urgent: 8, high: 24, normal: 72, low: 168 },
  auto_assign: false,
}

const PRIORITIES: Priority[] = ['urgent', 'high', 'normal', 'low']

export function resolveSla(raw: any): SlaSettings {
  const s = raw || {}
  const hours = (src: any, def: Record<Priority, number>) => {
    const out = { ...def }
    for (const p of PRIORITIES) {
      const n = Number(src?.[p])
      if (Number.isFinite(n) && n > 0) out[p] = n
    }
    return out
  }
  return {
    enabled: s.enabled !== false,
    first_response_hours: hours(s.first_response_hours, DEFAULT_SLA.first_response_hours),
    resolution_hours: hours(s.resolution_hours, DEFAULT_SLA.resolution_hours),
    auto_assign: !!s.auto_assign,
  }
}

export type ClockState = 'met' | 'late' | 'due' | 'soon' | 'overdue' | 'off'
export type Clock = { state: ClockState; dueAt: Date | null; doneAt: Date | null; msLeft: number }

const isDone = (status: string) => ['resolved', 'closed'].includes(String(status || ''))
const pri = (p: any): Priority => (PRIORITIES.includes(p) ? p : 'normal')

function clock(start: Date, hours: number, doneAt: Date | null, now: Date): Clock {
  const dueAt = new Date(start.getTime() + hours * 3600_000)
  if (doneAt) return { state: doneAt <= dueAt ? 'met' : 'late', dueAt, doneAt, msLeft: dueAt.getTime() - doneAt.getTime() }
  const msLeft = dueAt.getTime() - now.getTime()
  if (msLeft < 0) return { state: 'overdue', dueAt, doneAt: null, msLeft }
  // "Due soon": the last quarter of the window, but always the final hour (or the
  // final half of a window shorter than two hours). 24h → last 6h; 4h → last
  // 1h; 1h → last 30m.
  const window = hours * 3600_000
  const soon = msLeft <= Math.max(window * 0.25, Math.min(3600_000, window * 0.5))
  return { state: soon ? 'soon' : 'due', dueAt, doneAt: null, msLeft }
}

export type TicketSla = { firstResponse: Clock; resolution: Clock; worst: ClockState }

export function computeSla(ticket: any, settings: SlaSettings, now = new Date()): TicketSla {
  const off: Clock = { state: 'off', dueAt: null, doneAt: null, msLeft: 0 }
  if (!settings.enabled || !ticket?.created_at) return { firstResponse: off, resolution: off, worst: 'off' }
  const start = new Date(ticket.created_at)
  const p = pri(ticket.priority)
  const resolvedAt = ticket.resolved_at ? new Date(ticket.resolved_at)
    : isDone(ticket.status) ? new Date(ticket.updated_at || ticket.created_at) : null
  const firstAt = ticket.first_response_at ? new Date(ticket.first_response_at) : null

  // A ticket closed without any reply doesn't owe a first response any more.
  const firstResponse = !firstAt && resolvedAt
    ? { state: 'off' as ClockState, dueAt: null, doneAt: null, msLeft: 0 }
    : clock(start, settings.first_response_hours[p], firstAt, now)
  const resolution = clock(start, settings.resolution_hours[p], resolvedAt, now)

  const rank: ClockState[] = ['overdue', 'soon', 'due', 'late', 'met', 'off']
  const open = [firstResponse.state, resolution.state].filter(s => s !== 'met' && s !== 'late' && s !== 'off')
  const worst = open.length ? open.sort((a, b) => rank.indexOf(a) - rank.indexOf(b))[0]
    : resolution.state === 'late' || firstResponse.state === 'late' ? 'late'
    : resolution.state === 'met' ? 'met' : 'off'
  return { firstResponse, resolution, worst }
}

export function humanDuration(ms: number): string {
  const m = Math.max(1, Math.round(Math.abs(ms) / 60000))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60), rm = m % 60
  if (h < 24) return rm && h < 10 ? `${h}h ${rm}m` : `${h}h`
  const d = Math.floor(h / 24), rh = h % 24
  return rh ? `${d}d ${rh}h` : `${d}d`
}

// One short label for a clock, e.g. "Due in 2h", "Overdue 3h", "Met".
export function clockLabel(c: Clock, what: 'Reply' | 'Resolve' = 'Reply'): string {
  switch (c.state) {
    case 'overdue': return `${what} overdue ${humanDuration(c.msLeft)}`
    case 'soon':
    case 'due': return `${what} due in ${humanDuration(c.msLeft)}`
    case 'met': return 'Met'
    case 'late': return `Late by ${humanDuration(c.msLeft)}`
    default: return '—'
  }
}

export const CLOCK_COLORS: Record<ClockState, { bg: string; c: string }> = {
  overdue: { bg: '#fef2f2', c: '#dc2626' },
  soon: { bg: '#fffbeb', c: '#b45309' },
  due: { bg: '#f8fafc', c: '#475569' },
  met: { bg: '#f0fdf4', c: '#059669' },
  late: { bg: '#fff7ed', c: '#c2410c' },
  off: { bg: '#f8fafc', c: '#94a3b8' },
}

// The clock that matters right now: the first reply until it's sent, then the
// resolution.
export function activeClock(sla: TicketSla): { clock: Clock; what: 'Reply' | 'Resolve' } {
  const fr = sla.firstResponse
  if (fr.state === 'overdue' || fr.state === 'soon' || fr.state === 'due') return { clock: fr, what: 'Reply' }
  return { clock: sla.resolution, what: 'Resolve' }
}
