'use client'

// The Polls and Surveys lists: the same full-width, Typeform-style view as
// Forms (components/forms-list), reusing its fl-* styles and icons. Header
// with search, status filter, sort and a list/grid toggle, then one row (or
// card) per poll or survey with a "…" menu. Presentational only: the pages own
// the data and the actions.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { FormsListStyles, Icon } from '@/components/forms-list/FormsListView'
import { relativeTime, type FormsView } from '@/lib/forms-list'
import {
  ENGAGE_SORTS, closeNote, engageCounts, filterEngage, sortEngage,
  type EngageFilter, type EngageKind, type EngageListItem, type EngageSort,
} from '@/lib/engage-core'
import { EngageIcon } from './icons'

export type EngageAction = 'share' | 'copy' | 'sms' | 'duplicate' | 'publish' | 'close' | 'reopen' | 'delete'

export type EngageListViewProps = {
  kind: EngageKind
  items: EngageListItem[]
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  now: number
  view: FormsView
  onView: (v: FormsView) => void
  query: string
  onQuery: (q: string) => void
  sort: EngageSort
  onSort: (s: EngageSort) => void
  status: EngageFilter
  onStatus: (s: EngageFilter) => void
  creating?: boolean
  onCreate: () => void
  onAi: () => void
  onAction: (action: EngageAction, item: EngageListItem) => void
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-AU')} ${n === 1 ? one : many}`
const STATUS_LABEL: Record<EngageFilter, string> = { all: 'All', live: 'Live', closed: 'Closed', draft: 'Draft' }

export function StatusPill({ status }: { status: EngageListItem['status'] }) {
  return <span className={`fl-pill ${status === 'live' ? 'is-live' : status === 'closed' ? 'is-closed' : 'is-draft'}`}>{STATUS_LABEL[status]}</span>
}

function Count({ item, kind }: { item: EngageListItem; kind: EngageKind }) {
  if (item.count === null) return <span className="fl-dim" title="Couldn't count them right now">Not available</span>
  return <span><span className="fl-num">{item.count.toLocaleString('en-AU')}</span><span className="fl-dim"> {kind === 'poll' ? (item.count === 1 ? 'voter' : 'voters') : (item.count === 1 ? 'response' : 'responses')}</span></span>
}

function RowMenu({ item, open, onToggle, onClose, onAction }: {
  item: EngageListItem; open: boolean; onToggle: () => void; onClose: () => void; onAction: (a: EngageAction, i: EngageListItem) => void
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
  const act = (a: EngageAction) => () => { onClose(); onAction(a, item) }
  const base = `/admin/${item.kind === 'poll' ? 'polls' : 'surveys'}/${item.id}`
  return (
    <div className="fl-menu-wrap" ref={ref}>
      <button type="button" className="fl-icon-btn" aria-label={`Actions for ${item.title}`} aria-haspopup="menu" aria-expanded={open} onClick={onToggle}>
        <Icon name="more" size={18} />
      </button>
      {open && (
        <div className="fl-menu" role="menu">
          <Link role="menuitem" className="fl-menu-item" href={base} onClick={onClose}><Icon name="chart" size={15} />Results</Link>
          <Link role="menuitem" className="fl-menu-item" href={`${base}?tab=edit`} onClick={onClose}><Icon name="edit" size={15} />Edit</Link>
          <button role="menuitem" type="button" className="fl-menu-item" onClick={act('share')}><Icon name="share" size={15} />Share, QR or embed</button>
          <button role="menuitem" type="button" className="fl-menu-item" onClick={act('copy')}><Icon name="link" size={15} />Copy link</button>
          <button role="menuitem" type="button" className="fl-menu-item" onClick={act('sms')}><EngageIcon name="sms" size={15} />Send by SMS</button>
          <div className="fl-menu-sep" />
          {item.status === 'draft' && <button role="menuitem" type="button" className="fl-menu-item" onClick={act('publish')}><EngageIcon name="play" size={15} />Publish</button>}
          {item.status === 'live' && <button role="menuitem" type="button" className="fl-menu-item" onClick={act('close')}><EngageIcon name="lock" size={15} />Close now</button>}
          {item.status === 'closed' && <button role="menuitem" type="button" className="fl-menu-item" onClick={act('reopen')}><EngageIcon name="unlock" size={15} />Reopen</button>}
          <button role="menuitem" type="button" className="fl-menu-item" onClick={act('duplicate')}><Icon name="copy" size={15} />Duplicate</button>
          <div className="fl-menu-sep" />
          <button role="menuitem" type="button" className="fl-menu-item is-danger" onClick={act('delete')}><Icon name="trash" size={15} />Delete</button>
        </div>
      )}
    </div>
  )
}

function Tile({ item, size = 36 }: { item: EngageListItem; size?: number }) {
  return (
    <span className={`fl-tile eg-tile is-${item.status}`} style={{ width: size, height: size }} aria-hidden="true">
      <EngageIcon name={item.kind === 'poll' ? 'poll' : 'survey'} size={Math.round(size * 0.5)} />
    </span>
  )
}

export default function EngageListView(p: EngageListViewProps) {
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const closeMenu = useCallback(() => setMenuFor(null), [])
  const noun = p.kind === 'poll' ? 'poll' : 'survey'
  const Noun = p.kind === 'poll' ? 'Poll' : 'Survey'
  const counts = engageCounts(p.items)
  const shown = sortEngage(filterEngage(p.items, { query: p.query, status: p.status }), p.sort)
  const base = `/admin/${p.kind === 'poll' ? 'polls' : 'surveys'}`
  const menu = (i: EngageListItem) => (
    <RowMenu item={i} open={menuFor === i.id} onToggle={() => setMenuFor(m => (m === i.id ? null : i.id))} onClose={closeMenu} onAction={p.onAction} />
  )
  const when = (i: EngageListItem) => (i.updated_at ? relativeTime(i.updated_at, p.now) : '')
  const closes = (i: EngageListItem) => (i.status === 'draft' ? '' : closeNote(i.closes_at, p.now))

  const header = (
    <header className="fl-header">
      <div className="fl-head-row">
        <div className="fl-head-text">
          <h1 className="fl-h1">{Noun}s</h1>
          {!p.loading && p.items.length > 0 && (
            <p className="fl-sub">{plural(counts.all, noun)} · {counts.live} live · {counts.closed} closed · {plural(counts.draft, 'draft')}</p>
          )}
        </div>
        <div className="eg-head-actions">
          <button type="button" className="fl-btn" onClick={p.onAi} aria-label="Draft with Colvy AI" title="Draft with Colvy AI"><Icon name="spark" size={16} stroke={1.9} /><span className="eg-hide-sm">Draft with Colvy AI</span></button>
          <button type="button" className="fl-btn fl-btn-primary" onClick={p.onCreate} disabled={p.creating}>
            <Icon name="plus" size={16} stroke={2.4} />{p.creating ? 'Creating…' : `New ${noun}`}
          </button>
        </div>
      </div>
      {!p.loading && p.items.length > 0 && (
        <div className="fl-toolbar">
          <label className="fl-search">
            <Icon name="search" size={15} />
            <input type="search" value={p.query} onChange={e => p.onQuery(e.target.value)} placeholder={`Search ${noun}s`} aria-label={`Search ${noun}s`} />
            {p.query && <button type="button" className="fl-search-clear" aria-label="Clear search" onClick={() => p.onQuery('')}><Icon name="x" size={14} /></button>}
          </label>
          <div className="fl-seg" role="tablist" aria-label="Show">
            {(['all', 'live', 'closed', 'draft'] as EngageFilter[]).map(k => (
              <button key={k} type="button" role="tab" aria-selected={p.status === k} className={`fl-seg-btn${p.status === k ? ' on' : ''}`} onClick={() => p.onStatus(k)}>
                {STATUS_LABEL[k]} <span className="fl-seg-n">{counts[k]}</span>
              </button>
            ))}
          </div>
          <label className="fl-sort">
            <span className="fl-sort-label">Sort</span>
            <select value={p.sort} onChange={e => p.onSort(e.target.value as EngageSort)} aria-label={`Sort ${noun}s`}>
              {ENGAGE_SORTS.map(s => <option key={s.key} value={s.key}>{s.key === 'count' ? (p.kind === 'poll' ? 'Most votes' : 'Most responses') : s.label}</option>)}
            </select>
          </label>
          <div className="fl-viewtoggle" role="group" aria-label="View">
            <button type="button" className={`fl-icon-btn${p.view === 'list' ? ' on' : ''}`} aria-pressed={p.view === 'list'} aria-label="List view" title="List view" onClick={() => p.onView('list')}><Icon name="list" size={16} /></button>
            <button type="button" className={`fl-icon-btn${p.view === 'grid' ? ' on' : ''}`} aria-pressed={p.view === 'grid'} aria-label="Grid view" title="Grid view" onClick={() => p.onView('grid')}><Icon name="grid" size={16} /></button>
          </div>
        </div>
      )}
    </header>
  )

  let body: ReactNode
  if (p.loading) {
    body = (
      <div className="fl-list" aria-busy="true" aria-label={`Loading ${noun}s`}>
        {[0, 1, 2, 3].map(i => <div key={i} className="fl-skel-row"><span className="fl-skel fl-skel-tile" /><span className="fl-skel fl-skel-line" /></div>)}
      </div>
    )
  } else if (p.error && p.items.length === 0) {
    body = (
      <div className="fl-empty is-small" role="alert">
        <h2 className="fl-empty-title">Your {noun}s didn&apos;t load</h2>
        <p className="fl-empty-text">Check your connection and try again.</p>
        <div className="fl-empty-actions"><button type="button" className="fl-btn" onClick={p.onRetry}>Try again</button></div>
      </div>
    )
  } else if (p.items.length === 0) {
    body = (
      <div className="fl-empty">
        <span className="fl-empty-art" aria-hidden="true"><EngageIcon name={p.kind === 'poll' ? 'poll' : 'survey'} size={30} /></span>
        <h2 className="fl-empty-title">{p.kind === 'poll' ? 'Ask your customers a quick question' : 'Find out how customers feel'}</h2>
        <p className="fl-empty-text">
          {p.kind === 'poll'
            ? 'Which fish to stock next, the best day for a workshop, what to name the new tank. Share the link, a QR code at the counter, or send it by SMS.'
            : 'Net Promoter, satisfaction or open feedback in under a minute. Send it after a visit and see what to fix, with Colvy AI pulling out the themes.'}
        </p>
        <div className="fl-empty-actions">
          <button type="button" className="fl-btn fl-btn-primary" onClick={p.onCreate} disabled={p.creating}><Icon name="plus" size={16} stroke={2.4} />New {noun}</button>
          <button type="button" className="fl-btn" onClick={p.onAi}><Icon name="spark" size={16} stroke={1.9} />Draft with Colvy AI</button>
        </div>
      </div>
    )
  } else if (shown.length === 0) {
    body = (
      <div className="fl-empty is-small">
        <h2 className="fl-empty-title">No {noun}s match</h2>
        <p className="fl-empty-text">
          {p.query.trim() ? `Nothing called “${p.query.trim()}”${p.status !== 'all' ? ` in ${STATUS_LABEL[p.status]}` : ''}.` : `No ${STATUS_LABEL[p.status].toLowerCase()} ${noun}s right now.`}
        </p>
        <div className="fl-empty-actions"><button type="button" className="fl-btn" onClick={() => { p.onQuery(''); p.onStatus('all') }}>Show all {noun}s</button></div>
      </div>
    )
  } else if (p.view === 'grid') {
    body = (
      <div className="fl-grid">
        {shown.map(i => (
          <article key={i.id} className={`fl-card${menuFor === i.id ? ' menu-open' : ''}`}>
            <Link href={`${base}/${i.id}`} className={`fl-card-preview eg-card-preview is-${i.status}`} tabIndex={-1} aria-hidden="true">
              <span className="fl-card-q">{p.kind === 'poll' ? i.title : (i.row.question || i.subtitle)}</span>
              <span className="fl-card-more">{i.subtitle}</span>
            </Link>
            <div className="fl-card-body">
              <div className="fl-card-top">
                <Link href={`${base}/${i.id}`} className="fl-title fl-card-title"><span className="fl-title-text">{i.title}</span></Link>
                {menu(i)}
              </div>
              <div className="fl-card-stats">
                <StatusPill status={i.status} />
                <span className="fl-card-stat"><Count item={i} kind={p.kind} /></span>
                {closes(i) && <span className="fl-card-stat fl-dim">{closes(i)}</span>}
              </div>
              <p className="fl-card-updated">Updated {when(i)}</p>
            </div>
          </article>
        ))}
      </div>
    )
  } else {
    body = (
      <div className="fl-list eg-list" role="table" aria-label={`${Noun}s`}>
        <div className="fl-list-head" role="row">
          <span role="columnheader">{Noun}</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">{p.kind === 'poll' ? 'Votes' : 'Responses'}</span>
          <span role="columnheader">Closes</span>
          <span role="columnheader">Last updated</span>
          <span role="columnheader"><span className="fl-sr">Actions</span></span>
        </div>
        {shown.map(i => (
          <div key={i.id} role="row" className={`fl-row${menuFor === i.id ? ' menu-open' : ''}`}>
            <span role="cell" className="fl-cell-main">
              <Tile item={i} />
              <span className="fl-main-text">
                <Link href={`${base}/${i.id}`} className="fl-title fl-row-link"><span className="fl-title-text">{i.title}</span></Link>
                <span className="fl-subline">{i.subtitle}</span>
                <span className="fl-mobile-meta">
                  <StatusPill status={i.status} />
                  <Count item={i} kind={p.kind} />
                  {closes(i) && <span>{closes(i)}</span>}
                  <span>{when(i)}</span>
                </span>
              </span>
            </span>
            <span role="cell" className="fl-cell"><StatusPill status={i.status} /></span>
            <span role="cell" className="fl-cell"><Count item={i} kind={p.kind} /></span>
            <span role="cell" className="fl-cell fl-dim">{closes(i) || (i.status === 'live' ? 'No end date' : '–')}</span>
            <span role="cell" className="fl-cell fl-dim">{when(i)}</span>
            <span role="cell" className="fl-cell-menu">{menu(i)}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="fl-root">
      <FormsListStyles />
      <EngageListStyles />
      {header}
      {body}
    </div>
  )
}

const CSS = `
.fl-pill.is-closed { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }
[data-theme="dark"] .fl-pill.is-closed { background: rgba(148,163,184,.14); color: #cbd5e1; border-color: transparent; }
.fl-pill.is-draft { border-style: dashed; }
.eg-head-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.eg-tile { background: var(--peach, #fff4f1); color: var(--coral); }
.eg-tile.is-closed { background: var(--fl-soft); color: var(--slate); }
.eg-tile.is-draft { background: transparent; border: 1.5px dashed var(--fl-strong); color: var(--slate); }
.eg-card-preview { background: linear-gradient(135deg, var(--coral) 0%, #ff9f7a 100%); color: #fff; }
.eg-card-preview.is-closed { background: linear-gradient(135deg, #64748b 0%, #94a3b8 100%); }
.eg-card-preview.is-draft { background: var(--fl-soft); color: var(--slate); border-bottom: 1px dashed var(--fl-strong); }
.eg-list .fl-list-head, .eg-list .fl-row { grid-template-columns: minmax(0, 3.2fr) minmax(90px, .9fr) minmax(120px, 1fr) minmax(130px, 1fr) minmax(120px, 1fr) 48px; }
@media (max-width: 760px) {
  .eg-list .fl-row { grid-template-columns: minmax(0, 1fr) 40px; }
  .eg-hide-sm { display: none; }
}
`
export function EngageListStyles() {
  return <style>{CSS}</style>
}
