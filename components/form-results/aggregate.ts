// Pure helpers for the form Results page: per-question stats, filters, cell
// text, payment/booking verification, export rows and formatting.
// No React, no Supabase, no DOM — imported by the page, the components, the
// exporters and the tests.

import {
  readResponseLogic, stripReservedAnswers, answerToPlainText, isBlankAnswer, toNum,
  valueKindOf, choicesOf, formatVariable, variablesInUse, computePath, summariseLogic,
  type FormQuestion, type LogicForm, type LogicSummary, type ResponseLogic, type ResponseRow,
} from '@/lib/form-logic'
import { choiceAnswerText, otherChoiceLabel, otherTextOf } from '@/lib/form-choice-options'
import { dbDate, dbTimeOr0 } from '@/lib/db-time'

// ─── Constants ──────────────────────────────────────────────────────────────

export const RESPONSE_CAP = 10000
export const PAGE_SIZE = 1000
export const DELETE_CHUNK = 200
export const MAX_DURATION_S = 86400
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ResultRow = ResponseRow & {
  language?: string | null
  screen_width?: number | null
  screen_height?: number | null
  referrer?: string | null
  user_agent?: string | null
  city?: string | null
  country?: string | null
}

// ─── Type tints and labels (own copy of the builder's table; page files can't export it) ──

export const CATEGORY_TINT: Record<string, { bg: string; fg: string }> = {
  'Contact info': { bg: '#fde4ea', fg: '#b4235a' },
  'Choice': { bg: '#ebe5fc', fg: '#6a45d6' },
  'Rating & ranking': { bg: '#daf3ea', fg: '#0f7a5c' },
  'Text & video': { bg: '#dfeafc', fg: '#2a62c9' },
  'Other': { bg: '#fdedd5', fg: '#b25e09' },
}

const TYPES: [string, string, string][] = [
  ['contact_info', 'Contact info', 'Contact info'],
  ['email', 'Email', 'Contact info'],
  ['phone', 'Phone number', 'Contact info'],
  ['address', 'Address', 'Contact info'],
  ['website', 'Website', 'Contact info'],
  ['multiple_choice', 'Multiple choice', 'Choice'],
  ['dropdown', 'Dropdown', 'Choice'],
  ['picture_choice', 'Picture choice', 'Choice'],
  ['yes_no', 'Yes/No', 'Choice'],
  ['legal', 'Legal', 'Choice'],
  ['checkbox', 'Checkbox', 'Choice'],
  ['nps', 'Net Promoter Score', 'Rating & ranking'],
  ['opinion_scale', 'Opinion scale', 'Rating & ranking'],
  ['rating', 'Rating', 'Rating & ranking'],
  ['ranking', 'Ranking', 'Rating & ranking'],
  ['matrix', 'Matrix', 'Rating & ranking'],
  ['long_text', 'Long text', 'Text & video'],
  ['short_text', 'Short text', 'Text & video'],
  ['statement', 'Statement', 'Text & video'],
  ['video_audio', 'Video and audio', 'Text & video'],
  ['number', 'Number', 'Other'],
  ['date', 'Date', 'Other'],
  ['signature', 'Signature', 'Other'],
  ['payment', 'Payment', 'Other'],
  ['file_upload', 'File upload', 'Other'],
  ['scheduler', 'Scheduler', 'Other'],
]
const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES.map(([t, l]) => [t, l]))
const TYPE_TINT: Record<string, { bg: string; fg: string }> = Object.fromEntries(TYPES.map(([t, , c]) => [t, CATEGORY_TINT[c]]))

export const tintOf = (type: string) => TYPE_TINT[type] || { bg: '#eef0f3', fg: '#4b5563' }
export const typeLabel = (type: string) => TYPE_LABEL[type] || 'Question'

// ─── Text of possibly-odd stored values ─────────────────────────────────────

/** Strings as they are; numbers/booleans as text; anything else (null, objects) → ''. */
export function textOf(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}
/** A question's title, trimmed, safe for any stored value. */
export const titleOf = (q: { title?: unknown } | null | undefined) => textOf(q?.title).trim()
/** "N. Title" with a fallback for blank titles. */
export const titleOr = (q: { title?: unknown } | null | undefined, fallback = 'Untitled question') => titleOf(q) || fallback

// ─── Formatting ─────────────────────────────────────────────────────────────

export function formatDuration(s: unknown): string {
  const n = toNum(s)
  if (!Number.isFinite(n) || n < 0) return '—'
  const t = Math.round(n)
  if (t < 60) return `${t}s`
  if (t < 3600) return `${Math.floor(t / 60)}m ${String(t % 60).padStart(2, '0')}s`
  return `${Math.floor(t / 3600)}h ${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}m`
}

export function formatMoney(cents: number, currency?: unknown): string {
  const cur = (typeof currency === 'string' && /^[a-z]{3}$/i.test(currency) ? currency : 'aud').toUpperCase()
  try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: cur }).format((cents || 0) / 100) }
  catch { return `${((cents || 0) / 100).toFixed(2)} ${cur}` }
}

// created_at on form_responses, survey_responses and poll_votes is TIMESTAMP
// without time zone: lib/db-time.ts reads those as UTC, not as local time.
function validDate(iso: unknown): Date | null {
  if (typeof iso !== 'string' && typeof iso !== 'number') return null
  return dbDate(iso)
}

export function formatDateTime(iso: unknown): string {
  const d = validDate(iso)
  return d ? d.toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
}

export function formatDay(iso: unknown): string {
  const d = validDate(iso)
  return d ? d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

export function formatBooking(startsAt: unknown, endsAt?: unknown): string {
  const s = validDate(startsAt)
  if (!s) return ''
  const e = validDate(endsAt)
  const day = s.toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  return e ? `${day} – ${e.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}` : day
}

export function relativeTime(iso: unknown, now = Date.now()): string {
  const d = validDate(iso)
  if (!d) return '—'
  const s = Math.round((now - d.getTime()) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const days = Math.round(h / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return formatDay(iso)
}

export const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0)
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-AU')} ${n === 1 ? one : many}`

/** Only http(s) links and inline media images/audio/video are rendered or linked. */
export function safeUrl(u: unknown): string | null {
  if (typeof u !== 'string') return null
  const s = u.trim()
  if (/^https?:\/\//i.test(s)) return s
  if (/^data:(image\/(png|jpe?g|gif|webp)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+)[;,]/i.test(s)) return s
  return null
}

// Same fallback as lib/supabase (not imported: it builds a client).
const DEFAULT_SUPABASE_URL = 'https://mtfhctgdayeqrguodksv.supabase.co'

/** Public-object prefix of this project's Supabase storage, where the public form uploads files. */
export function storagePrefix(base: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL): string | null {
  try { return `${new URL(base).origin}/storage/v1/object/public/` } catch { return null }
}

/**
 * Answers are untrusted, so only our own storage and inline data: media may load
 * as <img> / <video> / <audio>. Anything else is shown as a plain link (or not at all).
 */
export function inlineMediaUrl(u: unknown, prefix: string | null = storagePrefix()): string | null {
  const s = safeUrl(u)
  if (!s) return null
  if (s.startsWith('data:')) return s
  if (prefix && s.startsWith(prefix) && !/(^|\/)\.\.(\/|$)|%2e%2e/i.test(s.slice(prefix.length))) return s
  return null
}

export type MediaKind = 'image' | 'video' | 'audio' | 'file'
export function mediaKindOf(url: string, name?: unknown): MediaKind {
  const probe = `${url.split(/[?#]/)[0]} ${typeof name === 'string' ? name : ''}`.toLowerCase()
  if (url.startsWith('data:image') || /\.(jpe?g|png|gif|webp|avif|heic)\b/.test(probe)) return 'image'
  if (url.startsWith('data:video') || /\.(mp4|webm|mov|m4v)\b/.test(probe)) return 'video'
  if (url.startsWith('data:audio') || /\.(mp3|wav|ogg|oga|m4a|aac|opus)\b/.test(probe)) return 'audio'
  return 'file'
}

// ─── Per-row view (cached) ──────────────────────────────────────────────────

export type Prepared = {
  answers: Record<string, unknown>      // reserved keys stripped
  logic: ResponseLogic | null
  seen: Set<string> | null              // path ∪ offPath for rows with __logic
  time: number                          // created_at in ms (0 if unparsable)
}

const prepCache = new WeakMap<object, Prepared>()

export function prep(row: ResultRow): Prepared {
  const hit = prepCache.get(row)
  if (hit) return hit
  const logic = readResponseLogic(row.answers)
  const out: Prepared = {
    answers: stripReservedAnswers(row.answers),
    logic,
    seen: logic ? new Set([...logic.path, ...(logic.offPath || [])]) : null,
    time: dbTimeOr0(row.created_at),
  }
  prepCache.set(row, out)
  return out
}

/** The typed "Other" text for this question on this row ('' when none). */
export function otherTextFor(row: ResultRow, qid: string): string {
  return otherTextOf(row.answers as any, qid).trim()
}

/** Row has `__logic` and the question is in neither its path nor its offPath. */
export function isSkipped(row: ResultRow, qid: string): boolean {
  const p = prep(row)
  return !!p.seen && !p.seen.has(qid)
}

// ─── Payment and booking verification (section G) ───────────────────────────

export type PayRecord = {
  id: string; company_id: string | null; status: string | null
  amount_cents: number | null; currency: string | null
  conversation_id: string | null; description: string | null
  refunded_cents?: number | null
  /** V380: the form and payment question the payment was taken on (null on older rows). */
  form_id?: string | null
  question_id?: string | null
}
export type EventRecord = {
  id: string; company_id: string | null; event_type: string | null; status: string | null
  starts_at: string | null; ends_at: string | null
  title?: string | null
}
/** The response that first claimed a payment / booking, across every form of the company (/api/forms/claims). */
export type Claim = { responseId: string; formId: string; questionId: string; createdAt: string }
export type Claims = { payments: Record<string, Claim>; events: Record<string, Claim> }
export type VerifyState = {
  status: 'idle' | 'loading' | 'done' | 'error'
  payments: Record<string, PayRecord>
  events: Record<string, EventRecord>
  /** null until the company-wide claims check has answered. */
  claims: Claims | null
}
export const EMPTY_VERIFY: VerifyState = { status: 'idle', payments: {}, events: {}, claims: null }

export type PaymentCheck = {
  state: 'paid' | 'refunded' | 'unverified' | 'checking'
  amountCents?: number; currency?: string; refundedCents?: number; reason?: string
}
export type BookingCheck = {
  state: 'booked' | 'cancelled' | 'unverified' | 'checking'
  startsAt?: string; endsAt?: string; reason?: string
}

export type VerifyContext = {
  state: VerifyState
  companyId: string | null
  formId: string | null
  /** The title /api/forms/schedule gives a booking from this form: "Booking — <form title>". */
  bookingTitle: string
  /** Older payment rows only (no form_id): descriptions /api/forms/payment wrote for this form. */
  paymentDescriptions: Set<string>
  /** Older payment rows only (no form_id): expected amount per payment question id. */
  paymentAmounts: Record<string, number>
}

const idOf = (v: unknown, key: string): string | null => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const x = (v as any)[key]
  return typeof x === 'string' && UUID_RE.test(x) ? x.toLowerCase() : null
}
const lower = (v: unknown) => (typeof v === 'string' ? v.toLowerCase() : v == null ? null : String(v))

/** Payment ids and calendar event ids claimed by answers to payment / scheduler questions. */
export function sideEffectIds(rows: ResultRow[], logic: LogicForm): { paymentIds: string[]; eventIds: string[] } {
  const pays = new Set<string>(), evs = new Set<string>()
  const payQs = logic.questions.filter(q => q.type === 'payment')
  const schQs = logic.questions.filter(q => q.type === 'scheduler')
  if (!payQs.length && !schQs.length) return { paymentIds: [], eventIds: [] }
  for (const row of rows) {
    const a = prep(row).answers
    for (const q of payQs) { const id = idOf(a[q.id], 'payment_id'); if (id) pays.add(id) }
    for (const q of schQs) { const id = idOf(a[q.id], 'calendar_event_id'); if (id) evs.add(id) }
  }
  return { paymentIds: [...pays], eventIds: [...evs] }
}

export function buildVerifyContext(
  form: { id?: unknown; title?: unknown; company_id?: unknown } | null,
  logic: LogicForm, state: VerifyState,
): VerifyContext {
  const formTitle = textOf(form?.title)
  const paymentDescriptions = new Set<string>()
  const paymentAmounts: Record<string, number> = {}
  for (const q of logic.questions) {
    if (q.type !== 'payment') continue
    const t = titleOf(q)
    if (t) paymentDescriptions.add(t)
    const cents = Math.round(toNum(q.amountCents))
    if (Number.isFinite(cents) && cents > 0) paymentAmounts[q.id] = cents
  }
  paymentDescriptions.add(`Payment to ${formTitle}`.trim())
  return {
    state,
    companyId: typeof form?.company_id === 'string' ? form.company_id : null,
    formId: typeof form?.id === 'string' ? form.id.toLowerCase() : null,
    bookingTitle: `Booking — ${formTitle}`,
    paymentDescriptions, paymentAmounts,
  }
}

/** The company-wide first claim must be this very answer (row and question). */
function claimCheck(claim: Claim | undefined, rowId: string, qid: string, what: 'payment' | 'booking'): string | null {
  if (!claim) return `Couldn't confirm this ${what} is only counted once.`
  if (claim.responseId !== rowId || claim.questionId !== qid) return `This ${what} is already counted on another response.`
  return null
}

/**
 * "Paid" only when the answer's payment_id is a paid chat_payments row of this
 * company, taken on THIS form's question (V380 form_id / question_id), and this
 * response is the first one anywhere in the company to claim it. Rows from
 * before V380 have no link, so for those only: no chat conversation, and the
 * description or amount /api/forms/payment uses for this form. The amount shown
 * is the database's, never the answer's.
 */
export function checkPayment(answer: unknown, q: FormQuestion, rowId: string, ctx: VerifyContext | null | undefined): PaymentCheck {
  if (!ctx) return { state: 'unverified', reason: 'Not checked' }
  const pid = idOf(answer, 'payment_id')
  if (!pid) return { state: 'unverified', reason: 'No payment record is linked to this answer.' }
  if (ctx.state.status === 'idle' || ctx.state.status === 'loading') return { state: 'checking' }
  if (ctx.state.status === 'error') return { state: 'unverified', reason: "Couldn't check payments just now." }
  const rec = ctx.state.payments[pid]
  if (!rec) return { state: 'unverified', reason: 'No matching payment was found.' }
  if (!ctx.companyId || rec.company_id !== ctx.companyId) return { state: 'unverified', reason: 'No matching payment was found.' }
  if (rec.conversation_id) return { state: 'unverified', reason: 'That payment belongs to a chat, not this form.' }
  const linked = (rec.form_id !== null && rec.form_id !== undefined) || (rec.question_id !== null && rec.question_id !== undefined)
  if (linked) {
    if (!ctx.formId || lower(rec.form_id) !== ctx.formId || rec.question_id !== q.id) {
      return { state: 'unverified', reason: 'That payment was taken on a different form or question.' }
    }
  } else {
    const desc = typeof rec.description === 'string' ? rec.description.trim() : ''
    const amountOk = ctx.paymentAmounts[q.id] !== undefined && Number(rec.amount_cents) === ctx.paymentAmounts[q.id]
    if (!ctx.paymentDescriptions.has(desc) && !amountOk) return { state: 'unverified', reason: 'That payment was for something else.' }
  }
  const dup = claimCheck(ctx.state.claims?.payments[pid], rowId, q.id, 'payment')
  if (dup) return { state: 'unverified', reason: dup }
  const amountCents = Math.max(0, Math.round(Number(rec.amount_cents) || 0))
  const currency = rec.currency || 'aud'
  if (rec.status === 'refunded') return { state: 'refunded', amountCents, currency }
  if (rec.status !== 'paid') return { state: 'unverified', reason: 'That payment was never completed.' }
  const refunded = Math.max(0, Math.round(Number(rec.refunded_cents) || 0))
  return { state: 'paid', amountCents, currency, ...(refunded > 0 ? { refundedCents: Math.min(refunded, amountCents) } : {}) }
}

/**
 * A booking counts when its calendar event is a booking of this company that
 * /api/forms/schedule made for this form (title "Booking — <form title>"), and
 * this response is the first in the company to claim it. The time shown is the
 * calendar's. (Renaming the form makes its older bookings show as unverified.)
 */
export function checkBooking(answer: unknown, q: FormQuestion, rowId: string, ctx: VerifyContext | null | undefined): BookingCheck {
  if (!ctx) return { state: 'unverified', reason: 'Not checked' }
  const eid = idOf(answer, 'calendar_event_id')
  if (!eid) return { state: 'unverified', reason: 'No booking is linked to this answer.' }
  if (ctx.state.status === 'idle' || ctx.state.status === 'loading') return { state: 'checking' }
  if (ctx.state.status === 'error') return { state: 'unverified', reason: "Couldn't check bookings just now." }
  const rec = ctx.state.events[eid]
  if (!rec || !ctx.companyId || rec.company_id !== ctx.companyId || rec.event_type !== 'booking') {
    return { state: 'unverified', reason: 'No matching booking was found.' }
  }
  if (rec.title !== ctx.bookingTitle) return { state: 'unverified', reason: 'That booking was made for something else.' }
  const dup = claimCheck(ctx.state.claims?.events[eid], rowId, q.id, 'booking')
  if (dup) return { state: 'unverified', reason: dup }
  const out = { startsAt: rec.starts_at || undefined, endsAt: rec.ends_at || undefined }
  if (rec.status === 'cancelled') return { state: 'cancelled', ...out }
  return { state: 'booked', ...out }
}

/** Claims as the route returned them, keeping only well-formed entries. */
export function sanitizeClaims(raw: unknown): Claims | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const pick = (m: unknown): Record<string, Claim> => {
    const out: Record<string, Claim> = {}
    if (!m || typeof m !== 'object' || Array.isArray(m)) return out
    for (const [k, v] of Object.entries(m as Record<string, any>)) {
      if (!UUID_RE.test(k) || !v || typeof v !== 'object') continue
      if (typeof v.responseId !== 'string' || typeof v.questionId !== 'string') continue
      out[k.toLowerCase()] = { responseId: v.responseId, questionId: v.questionId, formId: String(v.formId ?? ''), createdAt: String(v.createdAt ?? '') }
    }
    return out
  }
  const r = raw as any
  if (r.payments === undefined && r.events === undefined) return null
  return { payments: pick(r.payments), events: pick(r.events) }
}

export function paymentText(c: PaymentCheck): string {
  if (c.state === 'checking') return 'Checking payment…'
  if (c.state === 'unverified') return 'Unverified payment'
  const money = formatMoney(c.amountCents || 0, c.currency)
  if (c.state === 'refunded') return `Refunded ${money}`
  return c.refundedCents ? `Paid ${money} (${formatMoney(c.refundedCents, c.currency)} refunded)` : `Paid ${money}`
}

export function bookingText(c: BookingCheck): string {
  if (c.state === 'checking') return 'Checking booking…'
  if (c.state === 'unverified') return 'Unverified booking'
  const when = formatBooking(c.startsAt, c.endsAt)
  return c.state === 'cancelled' ? `Cancelled booking${when ? ` (${when})` : ''}` : when || 'Booked'
}

// ─── Cell text ──────────────────────────────────────────────────────────────

export type CellOpts = {
  otherText?: string
  payment?: PaymentCheck
  booking?: BookingCheck
  /** Exports: files print their link. */
  forExport?: boolean
}

/** One answer as plain text: never quoted, never JSON, no emoji. '' when blank. */
export function cellText(answer: unknown, q: FormQuestion | undefined, opts: CellOpts = {}): string {
  if (isBlankAnswer(answer)) return ''
  const type = q?.type
  if (type === 'payment') return paymentText(opts.payment || { state: 'unverified' })
  if (type === 'scheduler') return bookingText(opts.booking || { state: 'unverified' })
  if (type === 'legal') return answer === true || answer === 'true' ? 'Accepted' : answerToPlainText(answer, q)
  if (typeof answer === 'string' && answer.startsWith('data:')) {
    if (answer.startsWith('data:audio')) return 'Voice recording'
    if (answer.startsWith('data:video')) return 'Video'
    return type === 'signature' ? 'Signature' : 'File'
  }
  if (type === 'ranking' && Array.isArray(answer)) {
    return answer.map((x, i) => `${i + 1}. ${answerToPlainText(x)}`).join(', ')
  }
  if (q && (type === 'multiple_choice' || type === 'dropdown' || type === 'checkbox' || type === 'picture_choice')) {
    const text = opts.otherText || ''
    if (otherChoiceLabel(q as any) && (typeof answer === 'string' || Array.isArray(answer))) {
      return choiceAnswerText(q as any, Array.isArray(answer) ? answer.map(x => answerToPlainText(x)) : answer, text)
    }
  }
  if (answer && typeof answer === 'object' && !Array.isArray(answer) && ('url' in (answer as any) || 'name' in (answer as any))) {
    const a = answer as any
    const name = typeof a.name === 'string' && a.name.trim() ? a.name.trim() : ''
    const url = safeUrl(a.url)
    if (opts.forExport && url && !url.startsWith('data:')) return name ? `${name} (${url})` : url
    if (name) return name
    if (url && url.startsWith('data:audio')) return 'Voice recording'
    return 'File'
  }
  return answerToPlainText(answer, q)
}

export type Cell = { state: 'skipped' | 'empty' | 'value'; text: string }

/** What the table, drawer and exports show for one question on one row. */
export function cellFor(row: ResultRow, q: FormQuestion, verify: VerifyContext | null | undefined, opts: { forExport?: boolean } = {}): Cell {
  const p = prep(row)
  const a = p.answers[q.id]
  if (isBlankAnswer(a)) return { state: isSkipped(row, q.id) ? 'skipped' : 'empty', text: '' }
  const text = cellText(a, q, {
    forExport: opts.forExport,
    otherText: otherTextFor(row, q.id),
    payment: q.type === 'payment' ? checkPayment(a, q, row.id, verify) : undefined,
    booking: q.type === 'scheduler' ? checkBooking(a, q, row.id, verify) : undefined,
  })
  return { state: text ? 'value' : 'empty', text }
}

// ─── Filters (section 7.9) ──────────────────────────────────────────────────

export type DatePreset = 'all' | 'today' | '7d' | '30d' | '90d' | 'custom'
export type AnswerOp = 'is_any' | 'contains' | 'between' | 'answered' | 'not_answered'
export type ResultsFilter =
  | { kind: 'date'; from?: string; to?: string; preset?: DatePreset }
  | { kind: 'answer'; questionId: string; op: AnswerOp; values?: string[]; text?: string; min?: number; max?: number }
  | { kind: 'variable'; variableId: string; min?: number; max?: number }

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** A local YYYY-MM-DD → local midnight instant (ms), or NaN. */
export function localDayStart(day: string | undefined): number {
  const m = typeof day === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(day) : null
  if (!m) return NaN
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
}

/** Inclusive local dates → [fromMs, toMsExclusive). Either side may be NaN (open). */
export function dateBounds(f: { from?: string; to?: string } | null | undefined): { from: number; to: number } {
  if (!f) return { from: NaN, to: NaN }
  const from = localDayStart(f.from)
  const toStart = localDayStart(f.to)
  let to = NaN
  if (Number.isFinite(toStart)) {
    const d = new Date(toStart); d.setDate(d.getDate() + 1)
    to = d.getTime()
  }
  return { from, to }
}

export function presetRange(preset: DatePreset, now = new Date()): { from?: string; to?: string } {
  if (preset === 'all' || preset === 'custom') return {}
  const days = preset === 'today' ? 0 : preset === '7d' ? 6 : preset === '30d' ? 29 : 89
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days)
  return { from: ymd(from), to: ymd(now) }
}

export function dateFilterOf(filters: ResultsFilter[]): Extract<ResultsFilter, { kind: 'date' }> | null {
  const f = filters.find(x => x.kind === 'date') as Extract<ResultsFilter, { kind: 'date' }> | undefined
  return f && (f.from || f.to) ? f : null
}

export function answerOpsFor(q: FormQuestion | undefined): AnswerOp[] {
  const kind = valueKindOf(q)
  if (kind === 'choice' || kind === 'multi' || kind === 'yesno') return ['is_any', 'answered', 'not_answered']
  if (kind === 'text' || kind === 'date') return ['contains', 'answered', 'not_answered']
  if (kind === 'number') return ['between', 'answered', 'not_answered']
  if (kind === 'none') return []
  return ['answered', 'not_answered']
}

export const ANSWER_OP_LABEL: Record<AnswerOp, string> = {
  is_any: 'is any of', contains: 'contains', between: 'is between', answered: 'is answered', not_answered: 'is not answered',
}

function matchAnswer(row: ResultRow, f: Extract<ResultsFilter, { kind: 'answer' }>, q: FormQuestion | undefined): boolean {
  const a = prep(row).answers[f.questionId]
  const blank = isBlankAnswer(a)
  switch (f.op) {
    case 'answered': return !blank
    case 'not_answered': return blank
    case 'is_any': {
      const want = (f.values || []).map(String)
      if (!want.length) return true
      if (blank) return false
      const list = Array.isArray(a) ? a.map(String) : [String(a)]
      return list.some(x => want.includes(x))
    }
    case 'contains': {
      const needle = (f.text || '').trim().toLowerCase()
      if (!needle) return true
      if (blank) return false
      const hay = `${answerToPlainText(a, q)} ${otherTextFor(row, f.questionId)}`.toLowerCase()
      return hay.includes(needle)
    }
    case 'between': {
      const hasMin = typeof f.min === 'number' && Number.isFinite(f.min)
      const hasMax = typeof f.max === 'number' && Number.isFinite(f.max)
      if (!hasMin && !hasMax) return true
      const n = toNum(a)
      if (!Number.isFinite(n)) return false
      return (!hasMin || n >= f.min!) && (!hasMax || n <= f.max!)
    }
  }
  return true
}

/** Filters AND together. Rows missing a filtered variable are excluded. */
export function applyFilters<R extends ResultRow>(rows: R[], filters: ResultsFilter[], logic: LogicForm): R[] {
  const active = (filters || []).filter(Boolean)
  if (!active.length) return rows
  const checks: ((r: R) => boolean)[] = []
  for (const f of active) {
    if (f.kind === 'date') {
      const { from, to } = dateBounds(f)
      if (!Number.isFinite(from) && !Number.isFinite(to)) continue
      checks.push(r => {
        const t = prep(r).time
        return (!Number.isFinite(from) || t >= from) && (!Number.isFinite(to) || t < to)
      })
    } else if (f.kind === 'answer') {
      const q = logic.questions[logic.indexOf[f.questionId]]
      checks.push(r => matchAnswer(r, f, q))
    } else if (f.kind === 'variable') {
      const hasMin = typeof f.min === 'number' && Number.isFinite(f.min)
      const hasMax = typeof f.max === 'number' && Number.isFinite(f.max)
      checks.push(r => {
        const v = prep(r).logic?.variables[f.variableId]
        if (typeof v !== 'number' || !Number.isFinite(v)) return false
        return (!hasMin || v >= f.min!) && (!hasMax || v <= f.max!)
      })
    }
  }
  return checks.length ? rows.filter(r => checks.every(c => c(r))) : rows
}

export function describeFilter(f: ResultsFilter, logic: LogicForm): string {
  if (f.kind === 'date') {
    const a = f.from ? formatDay(localDayStart(f.from)) : ''
    const b = f.to ? formatDay(localDayStart(f.to)) : ''
    return a && b ? (a === b ? a : `${a} – ${b}`) : a ? `From ${a}` : b ? `Until ${b}` : 'All time'
  }
  if (f.kind === 'variable') {
    const v = logic.variables.find(x => x.id === f.variableId)
    const name = v ? v.label : 'Deleted variable'
    return `${name} ${rangeText(f.min, f.max)}`
  }
  const idx = logic.indexOf[f.questionId]
  const q = idx === undefined ? undefined : logic.questions[idx]
  const name = q ? `${idx + 1}. ${titleOr(q, 'Untitled')}` : 'Deleted question'
  if (f.op === 'is_any') return `${name} is ${(f.values || []).join(' or ') || 'anything'}`
  if (f.op === 'contains') return `${name} contains ${f.text || ''}`.trim()
  if (f.op === 'between') return `${name} ${rangeText(f.min, f.max)}`
  return `${name} ${ANSWER_OP_LABEL[f.op]}`
}

function rangeText(min?: number, max?: number): string {
  const a = typeof min === 'number' && Number.isFinite(min) ? formatVariable(min) : ''
  const b = typeof max === 'number' && Number.isFinite(max) ? formatVariable(max) : ''
  if (a && b) return `${a} to ${b}`
  if (a) return `at least ${a}`
  if (b) return `at most ${b}`
  return 'any value'
}

// ─── Per-question stats (section 7.6) ───────────────────────────────────────

export type Bar = {
  label: string; count: number; pct: number
  image?: string | null
  hidden?: number
  otherTexts?: { text: string; at: string; rowId: string }[]
}
export type QuestionStats =
  | { kind: 'choice'; answered: number; multi: boolean; bars: Bar[]; extra: (Bar & { values: string[] }) | null; sorted: boolean }
  | { kind: 'legal'; accepted: number }
  | { kind: 'scale'; type: 'rating' | 'opinion_scale' | 'nps'; min: number; max: number; columns: { value: number; count: number }[]; answered: number; avg: number
      nps?: { score: number; promoters: number; passives: number; detractors: number } }
  | { kind: 'number'; count: number; avg: number; min: number; max: number; sum: number }
  | { kind: 'text'; items: { text: string; at: string; rowId: string }[] }
  | { kind: 'ranking'; people: number; items: { label: string; avg: number; count: number }[] }
  | { kind: 'matrix'; rows: string[]; cols: string[]; counts: number[][]; rowTotals: number[]; answered: number }
  | { kind: 'media'; items: { rowId: string; at: string; url: string; name: string; media: MediaKind; signature: boolean; inline: boolean }[] }
  | { kind: 'payment'; count: number; totals: { currency: string; cents: number; count: number }[]; refunded: number; unverified: number; checking: number }
  | { kind: 'scheduler'; bookings: { rowId: string; startsAt: string; endsAt?: string }[]; next: { startsAt: string; endsAt?: string } | null; cancelled: number; unverified: number; checking: number }
  | { kind: 'none' }

const CHOICE_CARD_TYPES = ['multiple_choice', 'checkbox', 'dropdown', 'picture_choice', 'yes_no']
const TEXT_CARD_TYPES = ['short_text', 'long_text', 'email', 'phone', 'address', 'website', 'contact_info', 'date']
const MEDIA_TYPES = ['file_upload', 'video_audio', 'signature']
/** Choice cards with more options than this list bars by count, then "Show all". */
export const LONG_CHOICE_LIST = 12

/** Rows newest first (the page's order); stats count every saved non-blank answer. */
export function questionStats(q: FormQuestion, rows: ResultRow[], opts: { summary?: LogicSummary | null; verify?: VerifyContext | null; now?: number } = {}): QuestionStats {
  const type = q.type
  const answered: { row: ResultRow; a: unknown }[] = []
  for (const row of rows) {
    const a = prep(row).answers[q.id]
    if (!isBlankAnswer(a)) answered.push({ row, a })
  }

  if (CHOICE_CARD_TYPES.includes(type)) {
    const options = choicesOf(q)
    const multi = valueKindOf(q) === 'multi' || answered.some(x => Array.isArray(x.a))
    const counts = new Map<string, number>(options.map(o => [o, 0]))
    const extraValues: string[] = []
    let extraCount = 0
    const otherLabel = otherChoiceLabel(q as any)
    const otherTexts: Bar['otherTexts'] = []
    for (const { row, a } of answered) {
      const list = (Array.isArray(a) ? a : [a]).map(x => answerToPlainText(x)).filter(Boolean)
      let extraHit = false
      for (const label of new Set(list)) {
        if (counts.has(label)) counts.set(label, counts.get(label)! + 1)
        else { extraHit = true; if (!extraValues.includes(label) && extraValues.length < 50) extraValues.push(label) }
        if (otherLabel && label === otherLabel) {
          const t = otherTextFor(row, q.id)
          if (t) otherTexts.push({ text: t, at: row.created_at, rowId: row.id })
        }
      }
      if (extraHit) extraCount++
    }
    const n = answered.length
    const hidden = opts.summary?.perQuestion[q.id]?.hidden || {}
    const images = Array.isArray(q.optionImages) ? q.optionImages : []
    let bars: Bar[] = options.map((label, i) => ({
      label, count: counts.get(label) || 0, pct: pct(counts.get(label) || 0, n),
      ...(type === 'picture_choice' ? { image: safeUrl(images[i]) } : {}),
      ...(hidden[label] ? { hidden: hidden[label] } : {}),
      ...(otherLabel && label === otherLabel ? { otherTexts } : {}),
    }))
    const sorted = bars.length > LONG_CHOICE_LIST
    if (sorted) bars = [...bars].sort((x, y) => y.count - x.count)
    return {
      kind: 'choice', answered: n, multi, bars, sorted,
      extra: extraCount ? { label: 'Other / removed choice', count: extraCount, pct: pct(extraCount, n), values: extraValues } : null,
    }
  }

  if (type === 'legal') return { kind: 'legal', accepted: answered.filter(x => x.a === true || x.a === 'true').length }

  if (type === 'rating' || type === 'opinion_scale' || type === 'nps') {
    const min = type === 'nps' ? 0 : 1
    const max = type === 'rating' ? 5 : type === 'opinion_scale' ? 7 : 10
    const columns = Array.from({ length: max - min + 1 }, (_, i) => ({ value: min + i, count: 0 }))
    let sum = 0, count = 0
    for (const { a } of answered) {
      const v = toNum(a)
      if (!Number.isInteger(v) || v < min || v > max) continue
      columns[v - min].count++; sum += v; count++
    }
    const out: QuestionStats = { kind: 'scale', type, min, max, columns, answered: count, avg: count ? sum / count : 0 }
    if (type === 'nps') {
      const promoters = columns.filter(c => c.value >= 9).reduce((s, c) => s + c.count, 0)
      const passives = columns.filter(c => c.value >= 7 && c.value <= 8).reduce((s, c) => s + c.count, 0)
      const detractors = columns.filter(c => c.value <= 6).reduce((s, c) => s + c.count, 0)
      out.nps = {
        promoters, passives, detractors,
        score: count ? Math.round(((promoters - detractors) / count) * 100) : 0,
      }
    }
    return out
  }

  if (type === 'number') {
    const nums = answered.map(x => toNum(x.a)).filter(Number.isFinite)
    if (!nums.length) return { kind: 'number', count: 0, avg: 0, min: 0, max: 0, sum: 0 }
    let min = Infinity, max = -Infinity, sum = 0
    for (const v of nums) { if (v < min) min = v; if (v > max) max = v; sum += v }
    return { kind: 'number', count: nums.length, avg: sum / nums.length, min, max, sum }
  }

  if (type === 'ranking') {
    const options = choicesOf(q)
    const pos = new Map<string, { sum: number; count: number }>(options.map(o => [o, { sum: 0, count: 0 }]))
    let people = 0
    for (const { a } of answered) {
      if (!Array.isArray(a)) continue
      people++
      a.forEach((x, i) => {
        const label = answerToPlainText(x)
        if (!label) return
        if (!pos.has(label)) pos.set(label, { sum: 0, count: 0 })
        const p = pos.get(label)!; p.sum += i + 1; p.count++
      })
    }
    const items = [...pos.entries()]
      .map(([label, p]) => ({ label, avg: p.count ? p.sum / p.count : 0, count: p.count }))
      .sort((x, y) => (x.count ? x.avg : Infinity) - (y.count ? y.avg : Infinity))
    return { kind: 'ranking', people, items }
  }

  if (type === 'matrix') {
    const mRows = (Array.isArray(q.matrixRows) ? q.matrixRows : []).map(String)
    const mCols = (Array.isArray(q.matrixCols) ? q.matrixCols : []).map(String)
    const counts = mRows.map(() => mCols.map(() => 0))
    let n = 0
    for (const { a } of answered) {
      if (!a || typeof a !== 'object' || Array.isArray(a)) continue
      n++
      for (const [r, c] of Object.entries(a as Record<string, unknown>)) {
        const ri = mRows.indexOf(r), ci = mCols.indexOf(String(c))
        if (ri !== -1 && ci !== -1) counts[ri][ci]++
      }
    }
    return { kind: 'matrix', rows: mRows, cols: mCols, counts, rowTotals: counts.map(r => r.reduce((s, x) => s + x, 0)), answered: n }
  }

  if (MEDIA_TYPES.includes(type)) {
    const items: Extract<QuestionStats, { kind: 'media' }>['items'] = []
    for (const { row, a } of answered) {
      const raw = typeof a === 'string' ? a : a && typeof a === 'object' ? (a as any).url : null
      const url = safeUrl(raw)
      if (!url) continue
      const name = a && typeof a === 'object' && typeof (a as any).name === 'string' ? (a as any).name : ''
      items.push({ rowId: row.id, at: row.created_at, url, name, media: mediaKindOf(url, name), signature: type === 'signature', inline: inlineMediaUrl(url) !== null })
    }
    return { kind: 'media', items }
  }

  if (type === 'payment') {
    const totals = new Map<string, { cents: number; count: number }>()
    let refunded = 0, unverified = 0, checking = 0, count = 0
    for (const { row, a } of answered) {
      const c = checkPayment(a, q, row.id, opts.verify)
      if (c.state === 'checking') { checking++; continue }
      if (c.state === 'unverified') { unverified++; continue }
      if (c.state === 'refunded') { refunded++; continue }
      const cur = (c.currency || 'aud').toUpperCase()
      const t = totals.get(cur) || { cents: 0, count: 0 }
      t.cents += (c.amountCents || 0) - (c.refundedCents || 0); t.count++
      totals.set(cur, t); count++
    }
    return { kind: 'payment', count, totals: [...totals.entries()].map(([currency, t]) => ({ currency, ...t })), refunded, unverified, checking }
  }

  if (type === 'scheduler') {
    const bookings: Extract<QuestionStats, { kind: 'scheduler' }>['bookings'] = []
    let cancelled = 0, unverified = 0, checking = 0
    for (const { row, a } of answered) {
      const c = checkBooking(a, q, row.id, opts.verify)
      if (c.state === 'checking') { checking++; continue }
      if (c.state === 'unverified') { unverified++; continue }
      if (c.state === 'cancelled') { cancelled++; continue }
      if (c.startsAt) bookings.push({ rowId: row.id, startsAt: c.startsAt, endsAt: c.endsAt })
    }
    bookings.sort((x, y) => Date.parse(x.startsAt) - Date.parse(y.startsAt))
    const now = opts.now ?? Date.now()
    const next = bookings.find(b => Date.parse(b.startsAt) >= now) || null
    return { kind: 'scheduler', bookings, next, cancelled, unverified, checking }
  }

  if (type === 'statement') return { kind: 'none' }

  // Text-like (and any type this version doesn't know): a plain list, newest first.
  const items = answered
    .map(({ row, a }) => ({ text: type === 'date' && typeof a === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a) ? formatDay(localDayStart(a)) : cellText(a, q), at: row.created_at, rowId: row.id }))
    .filter(x => x.text)
  return { kind: 'text', items }
}

export const isWideCard = (q: FormQuestion) => q.type === 'matrix' || q.type === 'long_text'
export const isTextCard = (q: FormQuestion) => TEXT_CARD_TYPES.includes(q.type)

// ─── Logic summary with cached estimates ────────────────────────────────────

type Estimate = { onPath: Set<string>; branches: Record<string, string> }
/** Per form view, per row: the estimated path of an older response (computePath is the expensive part). */
const estimateCache = new WeakMap<LogicForm, WeakMap<object, Estimate>>()

function estimateFor(logic: LogicForm, row: ResultRow): Estimate {
  let byRow = estimateCache.get(logic)
  if (!byRow) { byRow = new WeakMap(); estimateCache.set(logic, byRow) }
  const hit = byRow.get(row)
  if (hit) return hit
  const run = computePath(logic, prep(row).answers)
  const out = { onPath: new Set(run.path), branches: run.branches }
  byRow.set(row, out)
  return out
}

/**
 * The engine's summariseLogic, with each older response's estimated path
 * computed once per form (and cached), so filtering or deleting doesn't
 * re-walk 10,000 legacy rows. Rows with __logic go through summariseLogic as
 * they are (cheap); older rows are added here with exactly the engine's rules
 * (seen = estimated path ∪ answered, all flagged as estimated). The tests check
 * the result equals summariseLogic on the same rows.
 */
export function summariseRows(logic: LogicForm, rows: ResultRow[]): LogicSummary {
  const fresh: ResultRow[] = [], legacy: ResultRow[] = []
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue
    if (prep(r).logic) fresh.push(r); else legacy.push(r)
  }
  const sum = summariseLogic(logic, fresh)
  if (!legacy.length) return sum
  const branchQs = Object.keys(sum.branches)
  for (const row of legacy) {
    const answers = prep(row).answers
    const est = estimateFor(logic, row)
    for (const q of logic.questions) {
      const answered = !isBlankAnswer(answers[q.id])
      if (!est.onPath.has(q.id) && !answered) continue
      const pq = sum.perQuestion[q.id]
      pq.seen++; pq.seenEstimated++
      if (answered) pq.answered++
    }
    for (const qid of branchQs) {
      const taken = est.branches[qid]
      if (typeof taken !== 'string') continue
      const entries = sum.branches[qid]
      let e = entries.find(x => x.ruleId === taken && x.ruleId !== 'removed')
      if (!e) {
        e = entries.find(x => x.ruleId === 'removed')
        if (!e) { e = { ruleId: 'removed', to: null, count: 0, estimated: 0 }; entries.push(e) }
      }
      e.count++; e.estimated++
    }
  }
  sum.total += legacy.length
  sum.legacy += legacy.length
  sum.endings = { default: sum.total }
  sum.reach = logic.questions.map(q => ({ questionId: q.id, reached: sum.perQuestion[q.id].seen }))
  return sum
}

// ─── KPIs (section 7.5) ─────────────────────────────────────────────────────

export type StatsResult =
  | { tracked: false }
  | { tracked: true; since: string; views: number; starts: number; byDay: { day: string; views: number; starts: number }[]; abandons: Record<string, number>; submitted?: number }

const finiteInt = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0 }

/** Whatever came back (rpc output or JSON), as a safe StatsResult. Anything odd → not tracked. */
export function sanitizeStats(raw: unknown): StatsResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { tracked: false }
  const r = raw as any
  if (r.tracked === false) return { tracked: false }
  const since = typeof r.since === 'string' && !isNaN(Date.parse(r.since)) ? r.since : null
  if (!since) return { tracked: false }
  const byDay = (Array.isArray(r.byDay) ? r.byDay : []).slice(0, 4000)
    .filter((d: any) => d && typeof d.day === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d.day))
    .map((d: any) => ({ day: d.day.slice(0, 10), views: finiteInt(d.views), starts: finiteInt(d.starts) }))
  const abandons: Record<string, number> = {}
  if (r.abandons && typeof r.abandons === 'object' && !Array.isArray(r.abandons)) {
    let n = 0
    for (const [k, v] of Object.entries(r.abandons)) {
      if (n >= 500) break
      if (k && k !== '__proto__' && k !== 'constructor' && k !== 'prototype') { abandons[k] = finiteInt(v); n++ }
    }
  }
  const out: StatsResult = { tracked: true, since, views: finiteInt(r.views), starts: finiteInt(r.starts), byDay, abandons }
  if (r.submitted !== undefined && r.submitted !== null && Number.isFinite(Number(r.submitted))) out.submitted = finiteInt(r.submitted)
  return out
}

/** Mean time to complete over rows with 1 ≤ t ≤ 86,400 seconds; null when none. */
export function averageDuration(rows: ResultRow[]): number | null {
  let sum = 0, n = 0
  for (const r of rows) {
    const t = toNum(r.response_time_seconds as any)
    if (Number.isFinite(t) && t >= 1 && t <= MAX_DURATION_S) { sum += t; n++ }
  }
  return n ? sum / n : null
}

/** Completion rate when tracked: submitted since tracking began (date filter only) ÷ starts, capped at 100%. */
export function completionRate(stats: StatsResult | null, dateRows: ResultRow[], useServerCount: boolean): { rate: number | null; submitted: number; starts: number } | null {
  if (!stats || !stats.tracked) return null
  const since = Date.parse(stats.since)
  const submitted = useServerCount && typeof stats.submitted === 'number'
    ? stats.submitted
    : dateRows.filter(r => prep(r).time >= since).length
  return { rate: stats.starts > 0 ? Math.min(100, Math.round((submitted / stats.starts) * 100)) : null, submitted, starts: stats.starts }
}

/** Average per used variable over the given rows (rows that saved it only). */
export function variableAverages(rows: ResultRow[], logic: LogicForm): { id: string; label: string; avg: number; count: number }[] {
  return variablesInUse(logic).map(v => {
    let sum = 0, count = 0
    for (const r of rows) {
      const x = prep(r).logic?.variables[v.id]
      if (typeof x === 'number' && Number.isFinite(x)) { sum += x; count++ }
    }
    return { id: v.id, label: v.label, avg: count ? sum / count : 0, count }
  }).filter(v => v.count > 0)
}

// ─── Drawer path (section 7.7) ──────────────────────────────────────────────

export type PathStep = { id: string; label: string; deleted: boolean; note?: string }

/** The saved path as steps. "Jumped to" comes from the saved path, not the current rule. */
export function pathSteps(row: ResultRow, logic: LogicForm): { steps: PathStep[]; offPath: PathStep[] } | null {
  const lg = prep(row).logic
  if (!lg) return null
  const label = (id: string): PathStep => {
    const idx = logic.indexOf[id]
    if (idx === undefined) return { id, label: '(deleted question)', deleted: true }
    return { id, label: `${idx + 1}. ${titleOr(logic.questions[idx])}`, deleted: false }
  }
  const steps = lg.path.map((id, i) => {
    const s = label(id)
    const taken = lg.branches?.[id]
    if (taken && taken !== 'otherwise') {
      if (i < lg.path.length - 1) s.note = `Jumped to ${label(lg.path[i + 1]).label}`
      else if (lg.endedBy === 'jump') s.note = 'Went to the end'
    }
    return s
  })
  return { steps, offPath: (lg.offPath || []).map(label) }
}

// ─── Exports (section 7.10) ─────────────────────────────────────────────────

export function exportQuestions(logic: LogicForm): FormQuestion[] {
  return logic.questions.filter(q => q.type !== 'statement')
}

export function pathText(row: ResultRow, logic: LogicForm): string {
  const lg = prep(row).logic
  if (!lg) return 'Not recorded'
  return lg.path.map(id => (logic.indexOf[id] === undefined ? '(deleted)' : String(logic.indexOf[id] + 1))).join(' > ')
}

/** Header + one row per response. "Skipped" exports as an empty string. */
export function exportTable(rows: ResultRow[], logic: LogicForm, verify: VerifyContext | null): { header: string[]; body: (string | number)[][] } {
  const qs = exportQuestions(logic)
  const vars = variablesInUse(logic)
  const header = ['Response ID', 'Submitted at', 'Time to complete (s)', ...qs.map((q, i) => titleOr(q, `Question ${i + 1}`)), ...vars.map(v => v.label), 'Path']
  const body = rows.map(r => {
    const t = toNum(r.response_time_seconds as any)
    const lg = prep(r).logic
    return [
      r.id,
      formatDateTime(r.created_at),
      Number.isFinite(t) ? Math.round(t) : '',
      ...qs.map(q => { const c = cellFor(r, q, verify, { forExport: true }); return c.state === 'value' ? c.text : '' }),
      ...vars.map(v => { const x = lg?.variables[v.id]; return typeof x === 'number' ? formatVariable(x) : '' }),
      pathText(r, logic),
    ]
  })
  return { header, body }
}

const FORMULA_RE = /^[=+\-@\t\r]/
/** RFC 4180 CSV with a UTF-8 BOM. Text that a spreadsheet would run as a formula is prefixed with '. */
export function toCsv(header: string[], body: (string | number)[][]): string {
  const cell = (v: string | number) => {
    let s = typeof v === 'number' ? String(v) : String(v ?? '')
    if (typeof v !== 'number' && FORMULA_RE.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [header, ...body].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

/** Lines for the PDF: per response only questions on its path (all answered ones for older rows), then the variables. */
export function pdfSections(rows: ResultRow[], logic: LogicForm, verify: VerifyContext | null): { title: string; items: { q: string; a: string }[] }[] {
  const vars = variablesInUse(logic)
  return rows.map((r, i) => {
    const p = prep(r)
    const qs = p.logic
      ? [...p.logic.path, ...(p.logic.offPath || [])].map(id => logic.questions[logic.indexOf[id]]).filter((q): q is FormQuestion => !!q && q.type !== 'statement')
      : exportQuestions(logic)
    const items = qs.map(q => {
      const c = cellFor(r, q, verify, { forExport: true })
      return { q: titleOr(q), a: c.state === 'value' ? c.text : '(No answer)' }
    })
    for (const v of vars) {
      const x = p.logic?.variables[v.id]
      if (typeof x === 'number') items.push({ q: v.label, a: formatVariable(x) })
    }
    return { title: `Response ${i + 1} - ${formatDateTime(r.created_at)}`, items }
  })
}

export function safeFileName(title: unknown): string {
  const s = textOf(title).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  return s || 'form'
}

// ─── Loading helpers ────────────────────────────────────────────────────────

/** Appends a page, de-duplicating by id (a response arriving mid-load shifts the offsets). */
export function mergeRows<R extends { id: string }>(existing: R[], page: R[], cap = RESPONSE_CAP): R[] {
  const seen = new Set(existing.map(r => r.id))
  const out = existing.slice()
  for (const r of page) {
    if (!r || typeof r.id !== 'string' || seen.has(r.id)) continue
    seen.add(r.id); out.push(r)
    if (out.length >= cap) break
  }
  return out
}
