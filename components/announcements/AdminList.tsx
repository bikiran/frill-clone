'use client'

// The Announcements list: header, numbers, search and filters, then a row (or
// card) per post with its status, when it goes or went live, views, reactions
// and who was told. Presentational: app/admin/announcements/page.tsx owns the
// data and the actions. Full width of the admin content area at every size.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  CATEGORIES, categoryOf, doneChannels, filterAnnouncements, formatDate, relative, statusCounts, statusOf, STATUS_LABEL, totalReactions,
  type AdminFilter, type CategoryKey,
} from '@/lib/announcements'
import { excerpt } from '@/lib/safe-html'
import { AnnIcon } from './icons'
import { ADMIN_CSS } from './styles'

export type RowAction = 'edit' | 'view' | 'publish' | 'unpublish' | 'pin' | 'duplicate' | 'copy' | 'notify' | 'sms' | 'delete'

export type AdminListProps = {
  items: any[]
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  now: number
  schemaReady: boolean
  boardUrl: string
  outlets: { id: string; label?: string | null; suburb?: string | null }[]
  onAction: (a: RowAction, item: any) => void
  view: 'list' | 'grid'
  onView: (v: 'list' | 'grid') => void
}

const FILTERS: { key: AdminFilter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'published', label: 'Published' }, { key: 'scheduled', label: 'Scheduled' },
  { key: 'draft', label: 'Drafts' }, { key: 'expired', label: 'Ended' }, { key: 'pinned', label: 'Pinned' },
]

const excerptOf = (a: any) => excerpt(a.description ?? a.content ?? '', 140)

function whenText(a: any, now: number): string {
  const s = statusOf(a, now)
  if (s === 'scheduled') return a.publish_at ? `Goes live ${formatDate(a.publish_at, true)}` : 'No time set'
  if (s === 'draft') return `Edited ${relative(a.updated_at || a.created_at, now)}`
  if (s === 'expired') return `Ended ${formatDate(a.expires_at)}`
  const live = `Live ${relative(a.publish_at || a.created_at, now)}`
  return a.expires_at ? `${live} · ends ${formatDate(a.expires_at)}` : live
}

function audienceText(a: any, outlets: AdminListProps['outlets']): string | null {
  const seg = String(a.segmentation || '').startsWith('segment:') ? String(a.segmentation).slice(8) : ''
  if (seg) return seg
  const ids: string[] = Array.isArray(a.location_ids) ? a.location_ids : []
  if (!ids.length) return null
  if (ids.length === 1) { const o = outlets.find(x => x.id === ids[0]); return o?.label || o?.suburb || '1 outlet' }
  return `${ids.length} outlets`
}

function Thumb({ a, size = 'row' }: { a: any; size?: 'row' }) {
  const cat = categoryOf(a.tag)
  if (a.cover_image) return <img className="an-thumb" src={a.cover_image} alt="" loading="lazy" />
  return <span className="an-thumb an-thumb-ph" style={{ background: cat.bg, color: cat.color, borderColor: 'transparent' }} aria-hidden="true"><AnnIcon name="megaphone" size={20} /></span>
}

function Sent({ a }: { a: any }) {
  const st = a.notify_stats && typeof a.notify_stats === 'object' ? a.notify_stats : null
  if (!a.notified_at) return <span className="an-dim" style={{ fontSize: 12.5 }}>Not sent</span>
  return (
    <div className="an-sent">
      {st && typeof st.board === 'number' && <span><AnnIcon name="bell" size={13} /> {st.board}</span>}
      {st && typeof st.email === 'number' && <span><AnnIcon name="mail" size={13} /> {st.email}</span>}
      {!st && <span><AnnIcon name="check" size={13} /> Sent {formatDate(a.notified_at)}</span>}
    </div>
  )
}

function RowMenu({ a, now, open, onToggle, onClose, onAction }: { a: any; now: number; open: boolean; onToggle: () => void; onClose: () => void; onAction: (x: RowAction, a: any) => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open, onClose])
  const s = statusOf(a, now)
  const act = (x: RowAction) => () => { onClose(); onAction(x, a) }
  return (
    <div className="an-menu-wrap" ref={ref}>
      <button type="button" className="an-icon-btn" aria-label={`Actions for ${a.title || 'announcement'}`} aria-haspopup="menu" aria-expanded={open} onClick={onToggle}>
        <AnnIcon name="more" size={18} />
      </button>
      {open && (
        <div className="an-menu" role="menu">
          <button role="menuitem" type="button" className="an-menu-item" onClick={act('edit')}><AnnIcon name="edit" size={15} />Edit</button>
          {s === 'published' && <button role="menuitem" type="button" className="an-menu-item" onClick={act('view')}><AnnIcon name="external" size={15} />View on updates page</button>}
          {(s === 'draft' || s === 'scheduled') && <button role="menuitem" type="button" className="an-menu-item" onClick={act('publish')}><AnnIcon name="send" size={15} />Publish now</button>}
          {(s === 'published' || s === 'scheduled' || s === 'expired') && <button role="menuitem" type="button" className="an-menu-item" onClick={act('unpublish')}><AnnIcon name="archive" size={15} />Move to drafts</button>}
          {s === 'published' && <button role="menuitem" type="button" className="an-menu-item" onClick={act('notify')}><AnnIcon name="bell" size={15} />{doneChannels(a).board && doneChannels(a).email ? 'Text customers' : 'Tell people'}</button>}
          <button role="menuitem" type="button" className="an-menu-item" onClick={act('pin')}><AnnIcon name="pin" size={15} />{a.is_pinned ? 'Unpin' : 'Pin to top'}</button>
          <div className="an-menu-sep" />
          <button role="menuitem" type="button" className="an-menu-item" onClick={act('duplicate')}><AnnIcon name="copy" size={15} />Duplicate</button>
          <button role="menuitem" type="button" className="an-menu-item" onClick={act('copy')}><AnnIcon name="link" size={15} />Copy link</button>
          <button role="menuitem" type="button" className="an-menu-item" onClick={act('sms')}><AnnIcon name="sms" size={15} />Make an SMS campaign</button>
          <div className="an-menu-sep" />
          <button role="menuitem" type="button" className="an-menu-item is-danger" onClick={act('delete')}><AnnIcon name="trash" size={15} />Delete</button>
        </div>
      )}
    </div>
  )
}

export default function AdminList({ items, loading, error, onRetry, now, schemaReady, boardUrl, outlets, onAction, view, onView }: AdminListProps) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<AdminFilter>('all')
  const [category, setCategory] = useState<CategoryKey | 'all'>('all')
  const [menu, setMenu] = useState<string | null>(null)
  const counts = statusCounts(items, now)
  const shown = filterAnnouncements(items, { status, category, query }, now)
  const views = items.reduce((n, a) => n + (Number(a.views) || 0), 0)
  const reacts = items.reduce((n, a) => n + totalReactions(a.reactions), 0)
  const next = items.filter(a => statusOf(a, now) === 'scheduled' && a.publish_at).sort((a, b) => +new Date(a.publish_at) - +new Date(b.publish_at))[0]

  const header = (
    <>
      <header className="an-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="an-h1">Announcements</h1>
          <p className="an-sub">News, new arrivals, events and sales for your customers: on your updates page, in your chat widget, by email and text.</p>
        </div>
        <div className="an-head-actions">
          {boardUrl && <a className="an-btn" href={`${boardUrl}/announcements`} target="_blank" rel="noopener noreferrer"><AnnIcon name="external" size={15} />Updates page</a>}
          <Link className="an-btn an-btn-primary" href="/admin/announcements/new"><AnnIcon name="plus" size={16} />New announcement</Link>
        </div>
      </header>
      {!schemaReady && !loading && (
        <div className="an-notice" role="status">
          <AnnIcon name="warning" size={16} />
          <span>A database update (V387) is waiting to be run. Until then, scheduling, cover pictures, end dates, chat widget banners and idea links can’t be saved. Everything else works.</span>
        </div>
      )}
      {!loading && items.length > 0 && (
        <div className="an-kpis">
          <div className="an-kpi"><div className="an-kpi-label"><AnnIcon name="globe" size={14} />Live now</div><div className="an-kpi-num">{counts.published}</div><div className="an-kpi-hint">{counts.pinned ? `${counts.pinned} pinned` : 'On your updates page'}</div></div>
          <div className="an-kpi"><div className="an-kpi-label"><AnnIcon name="clock" size={14} />Scheduled</div><div className="an-kpi-num">{counts.scheduled}</div><div className="an-kpi-hint">{next ? `Next ${formatDate(next.publish_at, true)}` : 'Nothing queued'}</div></div>
          <div className="an-kpi"><div className="an-kpi-label"><AnnIcon name="edit" size={14} />Drafts</div><div className="an-kpi-num">{counts.draft}</div><div className="an-kpi-hint">Only your team sees these</div></div>
          <div className="an-kpi"><div className="an-kpi-label"><AnnIcon name="eye" size={14} />Views</div><div className="an-kpi-num">{views.toLocaleString('en-AU')}</div><div className="an-kpi-hint">{reacts.toLocaleString('en-AU')} reactions</div></div>
        </div>
      )}
      {(loading || items.length > 0) && (
        <div className="an-toolbar">
          <label className="an-search">
            <AnnIcon name="search" size={15} />
            <span className="an-sr">Search announcements</span>
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search announcements" />
            {query && <button type="button" className="an-icon-btn" style={{ width: 26, height: 26 }} aria-label="Clear search" onClick={() => setQuery('')}><AnnIcon name="x" size={14} /></button>}
          </label>
          <div className="an-seg" role="tablist" aria-label="Status">
            {FILTERS.map(f => (
              <button key={f.key} type="button" role="tab" aria-selected={status === f.key} className={`an-seg-btn${status === f.key ? ' on' : ''}`} onClick={() => setStatus(f.key)}>
                {f.label}<span className="an-seg-n">{counts[f.key]}</span>
              </button>
            ))}
          </div>
          <select className="an-select" value={category} onChange={e => setCategory(e.target.value as any)} aria-label="Category">
            <option value="all">All categories</option>
            {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <div className="an-seg" aria-label="Layout">
            <button type="button" className={`an-seg-btn${view === 'list' ? ' on' : ''}`} aria-label="List" aria-pressed={view === 'list'} onClick={() => onView('list')}><AnnIcon name="list" size={15} /></button>
            <button type="button" className={`an-seg-btn${view === 'grid' ? ' on' : ''}`} aria-label="Cards" aria-pressed={view === 'grid'} onClick={() => onView('grid')}><AnnIcon name="grid" size={15} /></button>
          </div>
        </div>
      )}
    </>
  )

  let body: React.ReactNode
  if (loading) {
    body = <div className="an-list">{[0, 1, 2, 3].map(i => <div key={i} className="an-skel-row"><span className="an-skel" style={{ width: 64, height: 48 }} /><span className="an-skel" style={{ height: 12, width: '38%' }} /></div>)}</div>
  } else if (error) {
    body = (
      <div className="an-empty">
        <span className="an-empty-art"><AnnIcon name="warning" size={28} /></span>
        <p className="an-empty-title">Announcements didn’t load</p>
        <p className="an-empty-text">{error}</p>
        <div className="an-empty-actions"><button type="button" className="an-btn" onClick={onRetry}>Try again</button></div>
      </div>
    )
  } else if (!items.length) {
    body = (
      <div className="an-empty" style={{ marginTop: 18 }}>
        <span className="an-empty-art"><AnnIcon name="megaphone" size={28} /></span>
        <p className="an-empty-title">Share your first announcement</p>
        <p className="an-empty-text">New fish in stock, a workshop on Saturday, a weekend sale: post it once and it shows on your updates page and chat widget, and you can email or text customers who opted in.</p>
        <div className="an-empty-actions">
          <Link className="an-btn an-btn-primary" href="/admin/announcements/new"><AnnIcon name="plus" size={16} />New announcement</Link>
          <Link className="an-btn an-btn-ai" href="/admin/announcements/new?ai=1"><AnnIcon name="spark" size={15} />Write with Colvy AI</Link>
        </div>
      </div>
    )
  } else if (!shown.length) {
    body = (
      <div className="an-empty">
        <p className="an-empty-title">Nothing matches</p>
        <p className="an-empty-text">Try another word, status or category.</p>
        <div className="an-empty-actions"><button type="button" className="an-btn" onClick={() => { setQuery(''); setStatus('all'); setCategory('all') }}>Show everything</button></div>
      </div>
    )
  } else if (view === 'grid') {
    body = (
      <div className="an-grid">
        {shown.map(a => {
          const s = statusOf(a, now); const cat = categoryOf(a.tag)
          return (
            <div key={a.id} className={`an-card${menu === a.id ? ' menu-open' : ''}`}>
              <Link href={`/admin/announcements/new?edit=${a.id}`} className={`an-card-cover${a.cover_image ? '' : ' ph'}`} style={a.cover_image ? undefined : { background: cat.bg, color: cat.color }} aria-hidden="true" tabIndex={-1}>
                {a.cover_image ? <img src={a.cover_image} alt="" loading="lazy" /> : <AnnIcon name="megaphone" size={30} stroke={1.6} />}
              </Link>
              <div className="an-card-body">
                <div className="an-card-top">
                  <Link href={`/admin/announcements/new?edit=${a.id}`} className="an-card-title">{a.title || 'Untitled'}</Link>
                  <RowMenu a={a} now={now} open={menu === a.id} onToggle={() => setMenu(m => (m === a.id ? null : a.id))} onClose={() => setMenu(null)} onAction={onAction} />
                </div>
                <div className="an-chips">
                  <span className={`an-pill s-${s}`}>{STATUS_LABEL[s]}</span>
                  <span className="an-cat" style={{ background: cat.bg, color: cat.color }}>{cat.label}</span>
                  {a.is_pinned && <span className="an-tag"><AnnIcon name="pin" size={11} />Pinned</span>}
                </div>
                <div className="an-when-text">{whenText(a, now)}</div>
                <div className="an-card-stats">
                  <span><AnnIcon name="eye" size={13} />{(Number(a.views) || 0).toLocaleString('en-AU')}</span>
                  <span><AnnIcon name="heart" size={13} />{totalReactions(a.reactions)}</span>
                  {a.notified_at && <span><AnnIcon name="bell" size={13} />Sent</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  } else {
    body = (
      <div className="an-list" role="table" aria-label="Announcements">
        <div className="an-list-head" role="row">
          <span role="columnheader">Announcement</span><span role="columnheader">Status</span><span role="columnheader">Views</span><span role="columnheader">Reactions</span><span role="columnheader">Told</span><span role="columnheader"><span className="an-sr">Actions</span></span>
        </div>
        {shown.map(a => {
          const s = statusOf(a, now); const cat = categoryOf(a.tag); const aud = audienceText(a, outlets)
          return (
            <div key={a.id} role="row" className={`an-row${menu === a.id ? ' menu-open' : ''}`}>
              <div className="an-main" role="cell">
                <Thumb a={a} />
                <div className="an-main-text">
                  <Link href={`/admin/announcements/new?edit=${a.id}`} className="an-title an-row-link">{a.title || 'Untitled'}</Link>
                  <span className="an-excerpt">{excerptOf(a) || 'No text yet'}</span>
                  <div className="an-chips">
                    <span className="an-cat" style={{ background: cat.bg, color: cat.color }}>{cat.label}</span>
                    {a.is_pinned && <span className="an-tag"><AnnIcon name="pin" size={11} />Pinned</span>}
                    {aud && <span className="an-tag"><AnnIcon name={String(a.segmentation || '').startsWith('segment:') ? 'users' : 'store'} size={11} />{aud}</span>}
                    {a.boost_enabled && <span className="an-tag"><AnnIcon name="widget" size={11} />Widget {a.boost_type === 'popup' ? 'popup' : 'banner'}</span>}
                  </div>
                  <div className="an-mobile-meta"><span className={`an-pill s-${s}`}>{STATUS_LABEL[s]}</span><span>{whenText(a, now)}</span><span>{(Number(a.views) || 0)} views</span></div>
                </div>
              </div>
              <div className="an-cell an-when" role="cell"><span className={`an-pill s-${s}`}>{STATUS_LABEL[s]}</span><span className="an-when-text" title={whenText(a, now)}>{whenText(a, now)}</span></div>
              <div className="an-cell" role="cell"><span className="an-num">{(Number(a.views) || 0).toLocaleString('en-AU')}</span></div>
              <div className="an-cell" role="cell"><span className="an-num">{totalReactions(a.reactions).toLocaleString('en-AU')}</span></div>
              <div className="an-cell" role="cell">
                {s === 'published' && !(doneChannels(a).board && doneChannels(a).email) && !a.notified_at && Date.now() - new Date(a.publish_at || a.created_at).getTime() < 7 * 86400_000
                  ? <button type="button" className="an-btn an-btn-sm an-send-btn" onClick={() => onAction('notify', a)}><AnnIcon name="send" size={13} />Tell people</button>
                  : <Sent a={a} />}
              </div>
              <div className="an-cell-menu" role="cell">
                <RowMenu a={a} now={now} open={menu === a.id} onToggle={() => setMenu(m => (m === a.id ? null : a.id))} onClose={() => setMenu(null)} onAction={onAction} />
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="an-root">
      <style>{ADMIN_CSS}</style>
      {header}
      {body}
    </div>
  )
}
