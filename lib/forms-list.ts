// Pure helpers for the Forms list page (app/admin/forms/page.tsx): sorting,
// filtering, relative time, which drafts count as empty, the "N new since your
// last visit" bookkeeping and the completion rate from V376 stats. No React,
// no Supabase, so it is safe on the client and in tests.

export type FormSort = 'updated' | 'created' | 'name' | 'responses'
export type FormFilter = 'all' | 'live' | 'draft'
export type FormsView = 'list' | 'grid'

export const FORM_SORTS: { key: FormSort; label: string }[] = [
  { key: 'updated', label: 'Last updated' },
  { key: 'created', label: 'Date created' },
  { key: 'name', label: 'Name' },
  { key: 'responses', label: 'Responses' },
]

export const FORMS_VIEW_KEY = 'colvy-forms-view'
// Per workspace, so switching workspaces on one device keeps each one's "new".
export const formsSeenKey = (companyId: string) => `colvy-forms-seen-at:${companyId}`

export const DEFAULT_THEME_COLOR = '#ff7a6b'

/** One form as the list shows it: the forms row plus what the page worked out. */
export type FormListItem = {
  id: string
  title?: string | null
  is_published?: boolean | null
  questions?: unknown
  theme?: unknown
  created_at?: string | null
  updated_at?: string | null
  company_id?: string | null
  /** null while unknown (the count failed), so an unknown form is never "empty". */
  response_count: number | null
  /** Responses since the last visit; 0 on a first visit. */
  new_count?: number
  /** The new count hit the query's row limit, so it is a lower bound ("1000+ new"). */
  new_more?: boolean
  /** Percent, only when V376 stats answered for this form. */
  completion?: number | null
  [key: string]: unknown
}

const time = (v: unknown) => (typeof v === 'string' && v ? Date.parse(v) : NaN)

export function questionsOf(f: { questions?: unknown } | null | undefined): any[] {
  return f && Array.isArray(f.questions) ? f.questions : []
}

export function questionCount(f: { questions?: unknown } | null | undefined): number {
  return questionsOf(f).length
}

/** The new-form default ("Untitled Form") or blank. */
export function isUntitled(f: { title?: unknown } | null | undefined): boolean {
  const t = typeof f?.title === 'string' ? f.title.trim().toLowerCase() : ''
  return t === '' || t === 'untitled form' || t === 'untitled'
}

export function displayTitle(f: { title?: unknown }): string {
  return isUntitled(f) ? 'Untitled form' : String(f.title).trim()
}

/** A draft nobody has started on: not live, no questions, and known to have no responses. */
export function isEmptyDraft(f: FormListItem): boolean {
  return !f.is_published && questionCount(f) === 0 && f.response_count === 0
}

export function emptyDraftIds(forms: FormListItem[]): string[] {
  return forms.filter(isEmptyDraft).map(f => f.id)
}

/** The line under a form's title. */
export function formSubtitle(f: FormListItem): string {
  const n = questionCount(f)
  if (n === 0) return f.is_published ? 'No questions' : 'Empty draft'
  return `${n} question${n === 1 ? '' : 's'}`
}

export function themeColorOf(f: { theme?: unknown }): string {
  const c = f.theme && typeof f.theme === 'object' ? (f.theme as any).color : null
  return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : DEFAULT_THEME_COLOR
}

/** Dark or white text, whichever reads better on the colour. */
export function textOn(hex: string): '#ffffff' | '#1a1a1a' {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return '#ffffff'
  const [r, g, b] = [m[1], m[2], m[3]].map(x => {
    const c = parseInt(x, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // Contrast with white vs with near-black; pick the larger.
  return (1.05 / (lum + 0.05)) >= ((lum + 0.05) / 0.0603) ? '#ffffff' : '#1a1a1a'
}

/** First letter of the title for the tile, or '' for an untitled form (shows an icon). */
export function initialOf(f: { title?: unknown }): string {
  if (isUntitled(f)) return ''
  const ch = Array.from(String(f.title).trim())[0] || ''
  return /[\p{L}\p{N}]/u.test(ch) ? ch.toUpperCase() : ''
}

/** The first question with a title (statements count), for the grid preview. */
export function firstQuestionTitle(f: { questions?: unknown }): string | null {
  for (const q of questionsOf(f)) {
    const t = q && typeof q.title === 'string' ? q.title.trim() : ''
    if (t) return t
  }
  return null
}

export function updatedAt(f: FormListItem): number {
  const u = time(f.updated_at)
  if (Number.isFinite(u)) return u
  const c = time(f.created_at)
  return Number.isFinite(c) ? c : 0
}

const createdAt = (f: FormListItem) => { const c = time(f.created_at); return Number.isFinite(c) ? c : 0 }

export function filterForms(forms: FormListItem[], opts: { query?: string; status?: FormFilter }): FormListItem[] {
  const q = (opts.query || '').trim().toLowerCase()
  const status = opts.status || 'all'
  return forms.filter(f => {
    if (status === 'live' && !f.is_published) return false
    if (status === 'draft' && f.is_published) return false
    if (!q) return true
    return displayTitle(f).toLowerCase().includes(q)
  })
}

/** A sorted copy. Ties fall back to most recently updated, then id, so the order is stable. */
export function sortForms(forms: FormListItem[], sort: FormSort): FormListItem[] {
  const tie = (a: FormListItem, b: FormListItem) => updatedAt(b) - updatedAt(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const cmp: Record<FormSort, (a: FormListItem, b: FormListItem) => number> = {
    updated: (a, b) => updatedAt(b) - updatedAt(a),
    created: (a, b) => createdAt(b) - createdAt(a),
    // Named forms A to Z, untitled ones after them.
    name: (a, b) => (isUntitled(a) ? 1 : 0) - (isUntitled(b) ? 1 : 0)
      || displayTitle(a).localeCompare(displayTitle(b), undefined, { sensitivity: 'base', numeric: true }),
    responses: (a, b) => (b.response_count ?? -1) - (a.response_count ?? -1),
  }
  const c = cmp[sort] || cmp.updated
  return [...forms].sort((a, b) => c(a, b) || tie(a, b))
}

export function statusCounts(forms: FormListItem[]): Record<FormFilter, number> {
  let live = 0
  for (const f of forms) if (f.is_published) live++
  return { all: forms.length, live, draft: forms.length - live }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "just now", "5 min ago", "3 hours ago", "yesterday", "4 days ago", then "12 Sep" / "12 Sep 2025". */
export function relativeTime(iso: string | number | null | undefined, now = Date.now()): string {
  const t = typeof iso === 'number' ? iso : time(iso)
  if (!Number.isFinite(t) || t <= 0) return ''
  const s = Math.round((now - t) / 1000)
  if (s < 45) return 'just now'           // also covers a slightly fast clock
  const m = Math.round(s / 60)
  if (m < 60) return `${Math.max(1, m)} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d} days ago`
  if (d < 28) { const w = Math.floor(d / 7); return `${w} week${w === 1 ? '' : 's'} ago` }
  const dt = new Date(t), today = new Date(now)
  const base = `${dt.getDate()} ${MONTHS[dt.getMonth()]}`
  return dt.getFullYear() === today.getFullYear() ? base : `${base} ${dt.getFullYear()}`
}

export function readView(get: () => string | null): FormsView {
  try { return get() === 'grid' ? 'grid' : 'list' } catch { return 'list' }
}

/** The moment "new" is judged from: the stored last visit, or null on a first visit (nothing is new). */
export function resolveSeenAt(stored: string | null | undefined): string | null {
  const t = time(stored)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

/** Response rows ({ form_id }) since the last visit, counted per form. */
export function countByForm(rows: { form_id?: unknown }[] | null | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows || []) {
    const id = r && typeof r.form_id === 'string' ? r.form_id : null
    if (id) out[id] = (out[id] || 0) + 1
  }
  return out
}

/** The count from an embedded `form_responses(count)` select, or null when it isn't there. */
export function embeddedCount(f: { form_responses?: unknown }): number | null {
  const e = f?.form_responses
  const c = Array.isArray(e) ? e[0]?.count : (e as any)?.count
  const n = Number(c)
  return c !== undefined && c !== null && Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

/**
 * Completion rate from a /api/forms/stats answer: responses submitted since
 * tracking began over starts in that time. null unless the stats are tracked,
 * the server counted the submissions and someone has started, so it never
 * shows a made-up number.
 */
export function completionFromStats(s: unknown): number | null {
  if (!s || typeof s !== 'object') return null
  const r = s as any
  if (r.tracked !== true) return null
  const starts = Number(r.starts), submitted = Number(r.submitted)
  if (typeof r.submitted !== 'number' || !Number.isFinite(submitted) || !Number.isFinite(starts) || starts <= 0) return null
  return Math.min(100, Math.max(0, Math.round((submitted / starts) * 100)))
}

/** Runs `fn` over `items` with at most `limit` in flight; results keep the input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return out
}
