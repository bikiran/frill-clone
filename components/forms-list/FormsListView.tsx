'use client'

// The Forms list (Typeform-style workspace view): header with search, filter,
// sort and a list/grid toggle, then one row (or card) per form. Presentational
// only: the page (app/admin/forms/page.tsx) owns the data and the actions, so
// this renders the same on the server and in tests. Uses the full width of the
// admin content area at every size: no max-width column.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  FORM_SORTS, displayTitle, emptyDraftIds, filterForms, firstQuestionTitle, formSubtitle, initialOf,
  isEmptyDraft, questionCount, relativeTime, sortForms, statusCounts, textOn, themeColorOf, updatedAt,
  type FormFilter, type FormListItem, type FormSort, type FormsView,
} from '@/lib/forms-list'
import EmptyScroll from '@/components/EmptyScroll'

export type FormAction = 'share' | 'copy' | 'duplicate' | 'rename' | 'delete'

export type FormsListViewProps = {
  forms: FormListItem[]
  loading?: boolean
  /** The forms couldn't be loaded; shows a retry instead of "make your first form". */
  error?: boolean
  onRetry?: () => void
  now: number
  view: FormsView
  onView: (v: FormsView) => void
  query: string
  onQuery: (q: string) => void
  sort: FormSort
  onSort: (s: FormSort) => void
  status: FormFilter
  onStatus: (s: FormFilter) => void
  creating?: boolean
  onCreate: (withAi: boolean) => void
  onAction: (action: FormAction, form: FormListItem) => void
  cleaning?: boolean
  onCleanup: () => void
}

// ── Icons (SVG only) ─────────────────────────────────────────────────────────
type IconName = 'plus' | 'search' | 'list' | 'grid' | 'more' | 'edit' | 'chart' | 'share' | 'link' | 'copy' | 'rename' | 'trash' | 'form' | 'spark' | 'x' | 'broom'
const PATHS: Record<IconName, ReactNode> = {
  plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  search: <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  list: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  more: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></>,
  chart: <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  rename: <><path d="M4 7V5h16v2" /><line x1="12" y1="5" x2="12" y2="19" /><line x1="9" y1="19" x2="15" y2="19" /></>,
  trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  form: <><rect x="3" y="3" width="18" height="18" rx="3" /><line x1="7" y1="8" x2="17" y2="8" /><line x1="7" y1="12" x2="13" y2="12" /><line x1="7" y1="16" x2="11" y2="16" /></>,
  spark: <><path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" /><path d="M19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" /></>,
  x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  broom: <><path d="M3 21l7-7" /><path d="M14.5 4.5l5 5-6 6-5-5z" /><path d="M8.5 10.5l5 5" /></>,
}
export function Icon({ name, size = 16, stroke = 2 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  )
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// ── Pieces ───────────────────────────────────────────────────────────────────
function StatusPill({ live }: { live: boolean }) {
  return <span className={`fl-pill ${live ? 'is-live' : 'is-draft'}`}>{live ? 'Live' : 'Draft'}</span>
}

function Tile({ form, size = 36 }: { form: FormListItem; size?: number }) {
  if (isEmptyDraft(form)) {
    return <span className="fl-tile is-empty" style={{ width: size, height: size }} aria-hidden="true"><Icon name="form" size={Math.round(size * 0.46)} stroke={1.8} /></span>
  }
  const color = themeColorOf(form)
  const letter = initialOf(form)
  return (
    <span className="fl-tile" style={{ width: size, height: size, background: color, color: textOn(color) }} aria-hidden="true">
      {letter || <Icon name="form" size={Math.round(size * 0.46)} stroke={1.8} />}
    </span>
  )
}

function Responses({ form }: { form: FormListItem }) {
  if (form.response_count === null) return <span className="fl-dim" title="Couldn't count responses right now">Not available</span>
  return (
    <span className="fl-resp">
      <span className="fl-num">{form.response_count.toLocaleString('en-AU')}</span>
      {(form.new_count || 0) > 0 && <span className="fl-new" title="Since your last visit">{form.new_count}{form.new_more ? '+' : ''} new</span>}
    </span>
  )
}

function Completion({ form }: { form: FormListItem }) {
  return typeof form.completion === 'number'
    ? <span className="fl-num" title="Of the people who started this form since tracking began, the share who finished it">{form.completion}%</span>
    : <span className="fl-dim" title="Not tracked yet">–</span>
}

function TitleText({ form }: { form: FormListItem }) {
  const empty = isEmptyDraft(form)
  return (
    <>
      <span className={`fl-title-text${empty ? ' is-empty' : ''}`}>{displayTitle(form)}</span>
      {empty && <span className="fl-empty-note"> · empty draft</span>}
    </>
  )
}

function RowMenu({ form, open, onToggle, onClose, onAction }: {
  form: FormListItem; open: boolean; onToggle: () => void; onClose: () => void; onAction: (a: FormAction, f: FormListItem) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, onClose])
  const act = (a: FormAction) => () => { onClose(); onAction(a, form) }
  return (
    <div className="fl-menu-wrap" ref={ref}>
      <button type="button" className="fl-icon-btn" aria-label={`Actions for ${displayTitle(form)}`} aria-haspopup="menu" aria-expanded={open} onClick={onToggle}>
        <Icon name="more" size={18} />
      </button>
      {open && (
        <div className="fl-menu" role="menu">
          <Link role="menuitem" className="fl-menu-item" href={`/admin/forms/${form.id}`} onClick={onClose}><Icon name="edit" size={15} />Edit</Link>
          <Link role="menuitem" className="fl-menu-item" href={`/admin/forms/${form.id}/results`} onClick={onClose}><Icon name="chart" size={15} />Results</Link>
          <button role="menuitem" type="button" className="fl-menu-item" onClick={act('share')}><Icon name="share" size={15} />Share or embed</button>
          <button role="menuitem" type="button" className="fl-menu-item" onClick={act('copy')}><Icon name="link" size={15} />Copy link</button>
          <div className="fl-menu-sep" />
          <button role="menuitem" type="button" className="fl-menu-item" onClick={act('duplicate')}><Icon name="copy" size={15} />Duplicate</button>
          <button role="menuitem" type="button" className="fl-menu-item" onClick={act('rename')}><Icon name="rename" size={15} />Rename</button>
          <div className="fl-menu-sep" />
          <button role="menuitem" type="button" className="fl-menu-item is-danger" onClick={act('delete')}><Icon name="trash" size={15} />Delete</button>
        </div>
      )}
    </div>
  )
}

// ── Main view ────────────────────────────────────────────────────────────────
export default function FormsListView(p: FormsListViewProps) {
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const closeMenu = useCallback(() => setMenuFor(null), [])
  const counts = statusCounts(p.forms)
  const shown = sortForms(filterForms(p.forms, { query: p.query, status: p.status }), p.sort)
  const emptyIds = emptyDraftIds(p.forms)
  const showCompletion = p.forms.some(f => typeof f.completion === 'number')
  const menu = (f: FormListItem) => (
    <RowMenu form={f} open={menuFor === f.id} onToggle={() => setMenuFor(m => (m === f.id ? null : f.id))} onClose={closeMenu} onAction={p.onAction} />
  )
  const updated = (f: FormListItem) => {
    const t = updatedAt(f)
    return t ? relativeTime(t, p.now) : ''
  }

  const header = (
    <header className="fl-header">
      <div className="fl-head-row">
        <div className="fl-head-text">
          <h1 className="fl-h1">Forms</h1>
          {!p.loading && p.forms.length > 0 && (
            <p className="fl-sub">{plural(counts.all, 'form')} · {counts.live} live · {plural(counts.draft, 'draft')}</p>
          )}
        </div>
        <button type="button" className="fl-btn fl-btn-primary" onClick={() => p.onCreate(false)} disabled={p.creating}>
          <Icon name="plus" size={16} stroke={2.4} />{p.creating ? 'Creating…' : 'New form'}
        </button>
      </div>
      {!p.loading && p.forms.length > 0 && (
        <div className="fl-toolbar">
          <label className="fl-search">
            <Icon name="search" size={15} />
            <input type="search" value={p.query} onChange={e => p.onQuery(e.target.value)} placeholder="Search forms" aria-label="Search forms" />
            {p.query && <button type="button" className="fl-search-clear" aria-label="Clear search" onClick={() => p.onQuery('')}><Icon name="x" size={14} /></button>}
          </label>
          <div className="fl-seg" role="tablist" aria-label="Show">
            {(['all', 'live', 'draft'] as FormFilter[]).map(k => (
              <button key={k} type="button" role="tab" aria-selected={p.status === k} className={`fl-seg-btn${p.status === k ? ' on' : ''}`} onClick={() => p.onStatus(k)}>
                {k === 'all' ? 'All' : k === 'live' ? 'Live' : 'Draft'} <span className="fl-seg-n">{counts[k]}</span>
              </button>
            ))}
          </div>
          <label className="fl-sort">
            <span className="fl-sort-label">Sort</span>
            <select value={p.sort} onChange={e => p.onSort(e.target.value as FormSort)} aria-label="Sort forms">
              {FORM_SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <div className="fl-viewtoggle" role="group" aria-label="View">
            <button type="button" className={`fl-icon-btn${p.view === 'list' ? ' on' : ''}`} aria-pressed={p.view === 'list'} aria-label="List view" title="List view" onClick={() => p.onView('list')}><Icon name="list" size={16} /></button>
            <button type="button" className={`fl-icon-btn${p.view === 'grid' ? ' on' : ''}`} aria-pressed={p.view === 'grid'} aria-label="Grid view" title="Grid view" onClick={() => p.onView('grid')}><Icon name="grid" size={16} /></button>
          </div>
          {emptyIds.length > 0 && (
            <button type="button" className="fl-quiet" onClick={p.onCleanup} disabled={p.cleaning}>
              <Icon name="broom" size={14} />{p.cleaning ? 'Cleaning up…' : `Clean up ${plural(emptyIds.length, 'empty draft')}`}
            </button>
          )}
        </div>
      )}
    </header>
  )

  let body: ReactNode
  if (p.loading) {
    body = (
      <div className="fl-list" aria-busy="true" aria-label="Loading forms">
        {[0, 1, 2, 3].map(i => <div key={i} className="fl-skel-row"><span className="fl-skel fl-skel-tile" /><span className="fl-skel fl-skel-line" /></div>)}
      </div>
    )
  } else if (p.error && p.forms.length === 0) {
    body = (
      <div className="fl-empty is-small" role="alert">
        <h2 className="fl-empty-title">Your forms didn&apos;t load</h2>
        <p className="fl-empty-text">Check your connection and try again.</p>
        <div className="fl-empty-actions">
          <button type="button" className="fl-btn" onClick={p.onRetry}>Try again</button>
        </div>
      </div>
    )
  } else if (p.forms.length === 0) {
    body = (
      <div className="fl-empty" style={{ padding: '24px 12px' }}>
        <EmptyScroll kinds={['form']} title="Make your first form"
          line="Collect feedback, sign-ups, bookings and payments with a form that asks one question at a time."
          action={<div className="fl-empty-actions" style={{ marginTop: 0 }}>
            <button type="button" className="fl-btn fl-btn-primary" onClick={() => p.onCreate(false)} disabled={p.creating}><Icon name="plus" size={16} stroke={2.4} />New form</button>
            <button type="button" className="fl-btn" onClick={() => p.onCreate(true)} disabled={p.creating}><Icon name="spark" size={16} stroke={1.9} />Build with Colvy AI</button>
          </div>} />
      </div>
    )
  } else if (shown.length === 0) {
    body = (
      <div className="fl-empty is-small" style={{ padding: '24px 12px' }}>
        <EmptyScroll kinds={['form']} title="No forms match"
          line={p.query.trim()
            ? `Nothing called “${p.query.trim()}”${p.status !== 'all' ? ` in ${p.status === 'live' ? 'Live' : 'Draft'}` : ''}.`
            : `No ${p.status === 'live' ? 'live forms' : 'drafts'} right now.`}
          action={<button type="button" className="fl-btn" onClick={() => { p.onQuery(''); p.onStatus('all') }}>Show all forms</button>} />
      </div>
    )
  } else if (p.view === 'grid') {
    body = (
      <div className="fl-grid">
        {shown.map(f => {
          const empty = isEmptyDraft(f)
          const color = themeColorOf(f)
          const firstQ = firstQuestionTitle(f)
          const n = questionCount(f)
          return (
            <article key={f.id} className={`fl-card${menuFor === f.id ? ' menu-open' : ''}`}>
              <Link href={`/admin/forms/${f.id}`} className={`fl-card-preview${empty ? ' is-empty' : ''}`} tabIndex={-1} aria-hidden="true"
                style={empty ? undefined : { background: color, color: textOn(color) }}>
                <span className="fl-card-q">{firstQ || (empty ? 'Empty draft' : 'No questions yet')}</span>
                {n > 1 && <span className="fl-card-more">+{plural(n - 1, 'more question')}</span>}
              </Link>
              <div className="fl-card-body">
                <div className="fl-card-top">
                  <Link href={`/admin/forms/${f.id}`} className="fl-title fl-card-title"><TitleText form={f} /></Link>
                  {menu(f)}
                </div>
                <div className="fl-card-stats">
                  <StatusPill live={!!f.is_published} />
                  <span className="fl-card-stat"><Responses form={f} />{f.response_count !== null && <span className="fl-dim"> {f.response_count === 1 ? 'response' : 'responses'}</span>}</span>
                  {typeof f.completion === 'number' && <span className="fl-card-stat"><Completion form={f} /><span className="fl-dim"> completed</span></span>}
                </div>
                <p className="fl-card-updated">Updated {updated(f)}</p>
              </div>
            </article>
          )
        })}
      </div>
    )
  } else {
    body = (
      <div className={`fl-list${showCompletion ? ' has-completion' : ''}`} role="table" aria-label="Forms">
        <div className="fl-list-head" role="row">
          <span role="columnheader">Form</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">Responses</span>
          {showCompletion && <span role="columnheader">Completion</span>}
          <span role="columnheader">Last updated</span>
          <span role="columnheader"><span className="fl-sr">Actions</span></span>
        </div>
        {shown.map(f => (
          <div key={f.id} role="row" className={`fl-row${menuFor === f.id ? ' menu-open' : ''}${isEmptyDraft(f) ? ' is-empty' : ''}`}>
            <span role="cell" className="fl-cell-main">
              <Tile form={f} />
              <span className="fl-main-text">
                <Link href={`/admin/forms/${f.id}`} className="fl-title fl-row-link"><TitleText form={f} /></Link>
                {!isEmptyDraft(f) && <span className="fl-subline">{formSubtitle(f)}</span>}
                <span className="fl-mobile-meta">
                  <StatusPill live={!!f.is_published} />
                  {f.response_count !== null && <span><Responses form={f} /> {f.response_count === 1 ? 'response' : 'responses'}</span>}
                  {typeof f.completion === 'number' && <span>{f.completion}% completed</span>}
                  <span>{updated(f)}</span>
                </span>
              </span>
            </span>
            <span role="cell" className="fl-cell"><StatusPill live={!!f.is_published} /></span>
            <span role="cell" className="fl-cell"><Responses form={f} /></span>
            {showCompletion && <span role="cell" className="fl-cell"><Completion form={f} /></span>}
            <span role="cell" className="fl-cell fl-dim">{updated(f)}</span>
            <span role="cell" className="fl-cell-menu">{menu(f)}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="fl-root">
      <FormsListStyles />
      {header}
      {body}
    </div>
  )
}

// ── Styles (fl-* classes; admin CSS variables so dark mode follows) ──────────
const CSS = `
.fl-root { --fl-card: var(--card, #fff); --fl-line: var(--border, #f0f0f0); --fl-soft: var(--canvas, #fafafa); --fl-strong: #e4e4e7; width: 100%; min-width: 0; box-sizing: border-box; padding: 18px 16px 40px; color: var(--ink); }
@media (min-width: 640px) { .fl-root { padding: 22px 20px 48px; } }
@media (min-width: 1024px) { .fl-root { padding: 26px 32px 56px; } }
[data-theme="dark"] .fl-root { --fl-strong: #3a3a3a; }
.fl-root *, .fl-root *::before, .fl-root *::after { box-sizing: border-box; }
.fl-root :focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }
.fl-root button::before { display: none; }
.fl-root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.fl-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.fl-dim { color: var(--slate); }

.fl-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 38px; padding: 0 16px; border-radius: 999px; border: none; background: #f4f4f5; color: #18181b; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background-color .15s, filter .15s, opacity .15s; font-family: inherit; }
.fl-btn:hover:not([disabled]) { background-color: #ececef; }
.fl-btn[disabled] { opacity: .6; cursor: default; }
.fl-btn-primary { background: var(--coral); color: #fff; }
.fl-btn-primary:hover:not([disabled]) { background: var(--coral); filter: brightness(.95); }
.fl-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 999px; border: none; background: transparent; color: #71717a; cursor: pointer; transition: background-color .15s, color .15s; }
.fl-icon-btn:hover { background-color: #f4f4f5; color: #18181b; }
.fl-icon-btn.on { background: #fff; color: #18181b; box-shadow: 0 1px 3px rgba(0,0,0,.1), 0 0 0 .5px rgba(0,0,0,.04); }

.fl-header { margin-bottom: 18px; }
.fl-head-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
.fl-head-text { min-width: 0; }
.fl-h1 { font-size: 30px; font-weight: 800; letter-spacing: -.025em; margin: 0; color: var(--ink); line-height: 1.1; }
.fl-sub { margin: 6px 0 0; font-size: 14px; color: #71717a; }
.fl-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 20px; }
.fl-search { position: relative; display: flex; align-items: center; gap: 8px; flex: 1 1 260px; min-width: 0; height: 38px; padding: 0 10px 0 14px; border: 1.5px solid transparent; border-radius: 999px; background: #f4f4f5; color: #a1a1aa; transition: background-color .15s, border-color .15s, box-shadow .15s; }
.fl-search:focus-within { background: #fff; border-color: #d4d4d8; box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 16%, transparent); }
.fl-search input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: 14px; color: var(--ink); font-family: inherit; }
.fl-search input:focus { box-shadow: none; }
.fl-search input::-webkit-search-cancel-button { display: none; }
.fl-search-clear { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: none; background: #e4e4e7; color: #52525b; cursor: pointer; padding: 0; border-radius: 999px; }
.fl-search-clear:hover { color: #18181b; }
.fl-seg { display: inline-flex; padding: 3px; gap: 2px; border: none; border-radius: 999px; background: #f4f4f5; }
.fl-seg-btn { height: 32px; padding: 0 13px; border: none; border-radius: 999px; background: transparent; color: #52525b; font-size: 13.5px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background .15s, color .15s, box-shadow .15s; font-family: inherit; display: inline-flex; align-items: center; gap: 6px; }
.fl-seg-btn:hover { color: #18181b; }
.fl-seg-btn.on { background: #fff; color: #18181b; box-shadow: 0 1px 3px rgba(0,0,0,.1), 0 0 0 .5px rgba(0,0,0,.04); }
.fl-seg-n { min-width: 18px; height: 18px; padding: 0 6px; border-radius: 999px; background: rgba(0,0,0,.06); font-size: 11.5px; font-weight: 700; color: inherit; margin-left: 0; display: inline-flex; align-items: center; justify-content: center; }
.fl-sort { display: inline-flex; align-items: center; gap: 4px; height: 38px; padding: 0 2px 0 14px; border: none; border-radius: 999px; background-color: #f4f4f5; transition: background-color .15s; }
.fl-sort:hover { background-color: #ececef; }
.fl-sort-label { font-size: 13.5px; color: #71717a; }
.fl-sort select { height: 36px; border: none; outline: none; background-color: transparent; font-size: 13.5px; font-weight: 600; color: var(--ink); cursor: pointer; padding: 0 30px 0 2px; font-family: inherit; box-shadow: none; }
.fl-viewtoggle { display: inline-flex; gap: 2px; padding: 3px; border: none; border-radius: 999px; background: #f4f4f5; }
.fl-quiet { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; border: none; background: none; height: 34px; padding: 0 12px; border-radius: 999px; color: #71717a; font-size: 13.5px; font-weight: 600; cursor: pointer; white-space: nowrap; font-family: inherit; }
.fl-quiet:hover:not([disabled]) { color: #18181b; background: #f4f4f5; }
.fl-quiet[disabled] { opacity: .6; cursor: default; }

.fl-pill { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 9px; border-radius: 999px; font-size: 12.5px; font-weight: 600; white-space: nowrap; }
.fl-pill::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.fl-pill.is-live { background: color-mix(in srgb, #22c55e 12%, #fff); color: #15803d; }
.fl-pill.is-live::before { background: #22c55e; }
.fl-pill.is-draft { background: #f4f4f5; color: #52525b; border: none; }
.fl-pill.is-draft::before { background: #a1a1aa; }
[data-theme="dark"] .fl-pill.is-live { background: rgba(34,197,94,.16); color: #4ade80; }
.fl-num { font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
.fl-resp { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.fl-new { display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 999px; background: color-mix(in srgb, var(--coral) 12%, #fff); color: color-mix(in srgb, var(--coral) 85%, #000); font-size: 12px; font-weight: 600; white-space: nowrap; }

.fl-tile { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 12px; font-size: 15px; font-weight: 700; line-height: 1; }
.fl-tile.is-empty { border: none; color: #a1a1aa; background: #f4f4f5; }

/* List view: full-width rows, columns spread across the width. */
.fl-list { width: 100%; border: none; border-radius: 20px; background: var(--fl-card); box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 1px 2px rgba(16,24,40,.04); }
.fl-list-head, .fl-row { display: grid; grid-template-columns: minmax(0, 3.2fr) minmax(90px, 1fr) minmax(120px, 1fr) minmax(120px, 1fr) 48px; align-items: center; column-gap: 16px; padding: 0 12px 0 18px; }
.fl-list.has-completion .fl-list-head, .fl-list.has-completion .fl-row { grid-template-columns: minmax(0, 3.2fr) minmax(90px, 1fr) minmax(120px, 1fr) minmax(100px, 1fr) minmax(120px, 1fr) 48px; }
.fl-list-head { height: 46px; border-bottom: 1px solid #f0f0f2; font-size: 12.5px; font-weight: 600; color: #8e8e93; }
.fl-row { position: relative; min-height: 68px; border-bottom: 1px solid #f4f4f5; font-size: 14px; transition: background-color .12s; }
.fl-row:last-child { border-bottom: none; border-radius: 0 0 20px 20px; }
.fl-row:hover { background-color: #fafafa; }
.fl-row.menu-open { z-index: 3; }
.fl-cell-main { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 12px 0; }
.fl-main-text { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
.fl-title { color: var(--ink); text-decoration: none; font-weight: 600; font-size: 14.5px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fl-title:hover .fl-title-text { text-decoration: underline; }
/* The whole row opens the builder; the menu sits above this link. */
.fl-row-link::after { content: ''; position: absolute; inset: 0; z-index: 0; }
.fl-title-text.is-empty { color: var(--slate); font-weight: 500; }
.fl-empty-note { color: var(--slate); font-weight: 400; }
.fl-subline { font-size: 13px; color: #8e8e93; }
.fl-cell { min-width: 0; font-size: 13.5px; }
.fl-cell-menu { position: relative; z-index: 1; display: flex; justify-content: flex-end; }
.fl-mobile-meta { display: none; }

/* Grid view: cards fill each row (auto-fit), no empty space on the right. */
.fl-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(250px, 100%), 1fr)); gap: 14px; width: 100%; }
.fl-card { position: relative; display: flex; flex-direction: column; min-width: 0; border: none; border-radius: 20px; background: var(--fl-card); box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 1px 2px rgba(16,24,40,.04); transition: box-shadow .2s, transform .2s cubic-bezier(.22,1,.36,1); }
.fl-card:hover { box-shadow: 0 0 0 1px rgba(0,0,0,.07), 0 12px 28px -14px rgba(0,0,0,.28); transform: translateY(-1px); }
.fl-card.menu-open { z-index: 3; }
.fl-card-preview { display: flex; flex-direction: column; justify-content: flex-end; gap: 4px; height: 110px; margin: 6px 6px 0; padding: 14px 16px; border-radius: 16px; text-decoration: none; overflow: hidden; }
.fl-card-preview.is-empty { background: #f4f4f5; color: #a1a1aa; justify-content: center; align-items: center; }
.fl-card-q { font-size: 15px; font-weight: 600; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.fl-card-preview.is-empty .fl-card-q { font-weight: 500; font-size: 13.5px; }
.fl-card-more { font-size: 12px; opacity: .8; }
.fl-card-body { display: flex; flex-direction: column; gap: 8px; padding: 12px 10px 14px 16px; }
.fl-card-top { display: flex; align-items: center; gap: 8px; min-width: 0; }
.fl-card-title { flex: 1; }
.fl-card-stats { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; font-size: 13px; }
.fl-card-stat { display: inline-flex; align-items: center; gap: 4px; }
.fl-card-updated { margin: 0; font-size: 12.5px; color: #8e8e93; }

/* Row menu */
.fl-menu-wrap { position: relative; }
.fl-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; min-width: 210px; padding: 6px; border: none; border-radius: 16px; background: var(--fl-card); box-shadow: 0 16px 40px rgba(0,0,0,.16), 0 0 0 1px rgba(0,0,0,.05); }
.fl-menu-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 12px; border: none; border-radius: 10px; background: none; color: var(--ink); font-size: 14px; font-weight: 500; text-align: left; text-decoration: none; cursor: pointer; font-family: inherit; }
.fl-menu-item svg { color: #71717a; }
.fl-menu-item:hover { background: #f4f4f5; }
.fl-menu-item.is-danger, .fl-menu-item.is-danger svg { color: #dc2626; }
.fl-menu-item.is-danger:hover { background: #fef2f2; }
[data-theme="dark"] .fl-menu-item.is-danger:hover { background: rgba(220,38,38,.12); }
.fl-menu-sep { height: 1px; margin: 5px 8px; background: #f0f0f2; }

/* Empty and loading states */
.fl-empty { width: 100%; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 64px 20px; border: none; border-radius: 20px; background: var(--fl-card); box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 1px 2px rgba(16,24,40,.04); }
.fl-empty.is-small { padding: 40px 20px; }
.fl-empty-art { display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 18px; background: var(--peach, #fff4f1); color: var(--coral); margin-bottom: 16px; }
.fl-empty-title { margin: 0; font-size: 18px; font-weight: 700; color: var(--ink); }
.fl-empty-text { margin: 6px 0 0; font-size: 14px; color: #71717a; line-height: 1.5; }
.fl-empty-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 20px; }
.fl-skel-row { display: flex; align-items: center; gap: 12px; height: 64px; padding: 0 18px; border-bottom: 1px solid var(--fl-line); }
.fl-skel-row:last-child { border-bottom: none; }
.fl-skel { display: block; border-radius: 8px; background: #f4f4f5; animation: flPulse 1.2s ease-in-out infinite; }
.fl-skel-tile { width: 36px; height: 36px; border-radius: 12px; }
.fl-skel-line { height: 12px; width: 40%; }
@keyframes flPulse { 50% { opacity: .5; } }
@media (prefers-reduced-motion: reduce) { .fl-skel { animation: none; } }

/* Phones and narrow tablets: rows fold to tile, title, one meta line, menu. */
@media (max-width: 760px) {
  .fl-list-head { display: none; }
  .fl-row, .fl-list.has-completion .fl-row { grid-template-columns: minmax(0, 1fr) 40px; padding: 0 6px 0 14px; column-gap: 8px; }
  .fl-row > .fl-cell { display: none; }
  .fl-mobile-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; margin-top: 5px; font-size: 12.5px; color: #8e8e93; }
  .fl-subline { display: none; }
  .fl-quiet { margin-left: 0; }
  .fl-search { flex-basis: 100%; }
  .fl-h1 { font-size: 26px; }
}
@media (max-width: 420px) {
  .fl-sort-label { display: none; }
  .fl-head-row .fl-btn { padding: 0 12px; }
}
`

export function FormsListStyles() {
  return <style>{CSS}</style>
}
