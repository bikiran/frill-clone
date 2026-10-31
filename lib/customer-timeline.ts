// Shared pieces of the customer timeline: the API (GET /api/contacts/timeline)
// and the component that shows it (components/CustomerTimeline.tsx).
//
// Safe to import from both client components and server routes — no database
// or Node-only code in here.

// ── Filter groups ────────────────────────────────────────────────────────────
// Every event belongs to one group, which is what the filter chips pick from.
// 'other' events (link clicks, AI agent actions, identity changes) only show
// under "All".
export type TimelineGroup = 'messages' | 'orders' | 'bookings' | 'calls' | 'reviews' | 'payments' | 'tasks' | 'other'

export const TIMELINE_FILTERS: { key: 'all' | TimelineGroup; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'messages', label: 'Messages' },
  { key: 'orders', label: 'Orders' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'calls', label: 'Calls' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'payments', label: 'Payments' },
  { key: 'tasks', label: 'Tasks & notes' },
]

export const TIMELINE_GROUP_KEYS: TimelineGroup[] = ['messages', 'orders', 'bookings', 'calls', 'reviews', 'payments', 'tasks', 'other']

export const KIND_GROUP: Record<string, TimelineGroup> = {
  message: 'messages', comment: 'messages', form: 'messages', media: 'messages',
  order: 'orders',
  booking: 'bookings',
  call: 'calls',
  review: 'reviews',
  payment: 'payments', sale: 'payments',
  task: 'tasks', note: 'tasks', ticket: 'tasks',
  link: 'other', agent: 'other', audit: 'other', campaign: 'other',
}

export type TimelineEvent = {
  id: string
  kind: string
  group: TimelineGroup
  source: string            // short label shown on the card ("Shopify", "Google", "SMS"…)
  date: string              // ISO — when it happened; what the stream is ordered by
  title: string
  detail?: string
  link?: string             // where "Open" goes in the admin
  at?: string               // a second time worth showing (a booking's appointment time)
  tz?: string               // the time zone `at` is shown in (a booking's own); else the viewer's
  status?: string
  tone?: 'good' | 'warn' | 'bad' | 'muted'
  recordingUrl?: string
  runId?: string            // an AI agent run, for the "Why?" link
  conversationId?: string
}

export type TimelineSummary = {
  lifetimeValue: number | null    // null when the viewer can't see orders or payments
  currency: string
  orderCount: number | null       // null when the viewer can't see orders
  firstSeen: string | null
  lastContact: { at: string; channel: string } | null
  openTasks: number
  nextBooking: { id: string; at: string; tz: string; service: string | null; status: string } | null
  avgRating: number | null
  reviewCount: number
  channels: string[]
}

// ── Timestamps ───────────────────────────────────────────────────────────────
// Postgres hands back timestamptz with an offset, but a few older tables use
// plain `timestamp` (no zone). Those are written in UTC, so read them as UTC
// rather than letting the server's own zone shift them.
export function toMs(v: unknown): number {
  if (v == null || v === '') return NaN
  if (v instanceof Date) return v.getTime()
  const s = String(v)
  const noZone = /T\d\d:\d\d(:\d\d(\.\d+)?)?$/.test(s) || /^\d{4}-\d\d-\d\d \d\d:\d\d(:\d\d(\.\d+)?)?$/.test(s)
  return new Date(noZone ? s.replace(' ', 'T') + 'Z' : s).getTime()
}

// ── "Load older" across many sources ────────────────────────────────────────
// Each source (messages, orders, calls, …) is read newest-first, up to its own
// limit, older than the cursor. Merging them is only safe down to the point
// where every source is still complete: once a source hits its limit, anything
// older than its oldest row might be missing a few of its rows, so the page
// stops there and the next page starts from that point.
//
// Timestamps are compared to the millisecond. The page keeps only items
// strictly newer than the cut-off millisecond and the next cursor is the
// cut-off + 1ms, so the next page (which asks for "older than the cursor")
// starts with exactly the items this page left out — nothing skipped, nothing
// shown twice.
//
// `fullOldest` holds, for every source that came back full, the time of its
// oldest row. `pageSize` caps how much one page shows.
export function cutPage<T extends { ms: number }>(items: T[], fullOldest: number[], pageSize: number): { page: T[]; nextBefore: string | null } {
  const sorted = items.filter(i => Number.isFinite(i.ms)).sort((a, b) => b.ms - a.ms)
  let bound = -Infinity
  for (const m of fullOldest) if (Number.isFinite(m) && m > bound) bound = m
  if (sorted.length > pageSize) bound = Math.max(bound, sorted[pageSize - 1].ms)
  if (bound === -Infinity) return { page: sorted, nextBefore: null }
  const page = sorted.filter(i => i.ms > bound)
  if (page.length) return { page, nextBefore: new Date(bound + 1).toISOString() }
  // Everything left shares one millisecond (a bulk import, say). Show it all
  // and step past that millisecond so "Load older" can never get stuck.
  return { page: sorted.filter(i => i.ms >= bound), nextBefore: new Date(bound).toISOString() }
}
