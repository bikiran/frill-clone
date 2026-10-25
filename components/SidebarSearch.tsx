'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'

export type SearchItem = { label: string; href: string; section?: string; keywords?: string; icon?: React.ReactNode }

// Sidebar command palette: a search button (rendered above Dashboard) that opens
// a searchable list of every sidebar destination + settings page, grouped by
// section with each page's icon. Type to filter, ↑/↓ to move, Enter to go;
// also opens with ⌘K / Ctrl+K.
//
// The sheet is portalled to <body>: on phones the sidebar is a sliding drawer
// (a CSS transform), which would otherwise trap a fixed overlay inside the
// drawer's width and clip it.
export default function SidebarSearch({ items, collapsed }: { items: SearchItem[]; collapsed: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])

  // Global ⌘K / Ctrl+K to open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Opening: clear, focus, and stop the page behind from scrolling.
  useEffect(() => {
    if (!open) return
    setQ(''); setActive(0)
    const t = setTimeout(() => inputRef.current?.focus(), 30)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { clearTimeout(t); document.body.style.overflow = prev }
  }, [open])

  // No query: every page by section. A query: best matches first (name
  // starting with it, then containing it, then section or keywords).
  const groups = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) {
      const by = new Map<string, SearchItem[]>()
      for (const it of items) {
        const k = it.section || 'General'
        by.set(k, [...(by.get(k) || []), it])
      }
      return [...by.entries()].map(([title, list]) => ({ title, list }))
    }
    const scored = items
      .map(it => {
        const l = it.label.toLowerCase()
        const score = l.startsWith(s) ? 0 : l.includes(s) ? 1 : (it.section || '').toLowerCase().includes(s) ? 2 : (it.keywords || '').toLowerCase().includes(s) ? 3 : -1
        return { it, score }
      })
      .filter(x => x.score >= 0)
      .sort((a, b) => a.score - b.score)
    return scored.length ? [{ title: 'Results', list: scored.map(x => x.it) }] : []
  }, [q, items])
  const flat = useMemo(() => groups.flatMap(g => g.list), [groups])
  const searching = !!q.trim()

  useEffect(() => { setActive(0) }, [q])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const go = (href: string) => { setOpen(false); router.push(href) }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, flat.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const r = flat[active]; if (r) go(r.href) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  let idx = -1
  const sheet = (
    <div className="ss-overlay" onClick={() => setOpen(false)} role="presentation">
      <style>{`
        .ss-overlay { position: fixed; inset: 0; z-index: 100000; background: rgba(17,17,20,0.32); -webkit-backdrop-filter: blur(10px) saturate(140%); backdrop-filter: blur(10px) saturate(140%); display: flex; align-items: flex-start; justify-content: center; padding: max(8vh, 56px) 12px 12px; animation: ssFade .16s ease-out; }
        .ss-panel { width: 100%; max-width: 560px; max-height: min(72vh, calc(100dvh - max(8vh, 56px) - 24px)); display: flex; flex-direction: column; background: rgba(242,242,247,0.97); border: 1px solid rgba(255,255,255,0.7); border-radius: 22px; box-shadow: 0 30px 80px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.06); overflow: hidden; animation: ssIn .2s cubic-bezier(.2,.8,.2,1); }
        .ss-row { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 10px 12px; min-height: 46px; border: none; border-radius: 12px; background: transparent; cursor: pointer; color: #1c1c1e; font: inherit; }
        .ss-row[data-on="1"] { background: #f2f2f7; }
        .ss-ic { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; color: #636366; flex-shrink: 0; }
        .ss-ic svg { width: 19px; height: 19px; }
        .ss-key { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 24px; padding: 0 7px; border-radius: 7px; background: #fff; border: 1px solid rgba(0,0,0,0.08); box-shadow: 0 1px 0 rgba(0,0,0,0.04); font-size: 12px; font-weight: 600; color: #3a3a3c; }
        .ss-foot { display: flex; align-items: center; gap: 16px; padding: 10px 18px 12px; font-size: 13px; color: #636366; }
        @media (max-width: 640px), (pointer: coarse) { .ss-foot { display: none; } }
        @keyframes ssFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes ssIn { from { opacity: 0; transform: translateY(-8px) scale(.98) } to { opacity: 1; transform: none } }
        @media (prefers-reduced-motion: reduce) { .ss-overlay, .ss-panel { animation: none; } }
      `}</style>
      <div className="ss-panel" role="dialog" aria-modal="true" aria-label="Search pages and settings" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Search or jump to…" aria-label="Search pages and settings" enterKeyHint="go"
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', boxShadow: 'none', fontSize: 17, color: '#1c1c1e', background: 'transparent', fontFamily: 'inherit' }} />
          {q ? (
            <button type="button" onClick={() => { setQ(''); inputRef.current?.focus() }} aria-label="Clear search"
              style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', background: '#c7c7cc', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          ) : (
            <button type="button" onClick={() => setOpen(false)} style={{ border: 'none', background: 'none', color: '#007aff', fontSize: 15, fontWeight: 500, cursor: 'pointer', padding: 0, flexShrink: 0, fontFamily: 'inherit' }}>Cancel</button>
          )}
        </div>
        <div ref={listRef} style={{ margin: '0 8px 8px', background: '#fff', borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', overflowY: 'auto', overscrollBehavior: 'contain', padding: 6, flex: 1, minHeight: 0 }}>
          {flat.length === 0 ? (
            <p style={{ padding: '28px 16px', margin: 0, textAlign: 'center', color: '#8e8e93', fontSize: 15 }}>No results for “{q}”</p>
          ) : groups.map((g, gi) => (
            <div key={g.title}>
              {gi > 0 && <div style={{ height: 1, background: '#e5e5ea', margin: '6px 12px' }} />}
              <p style={{ margin: 0, padding: '10px 12px 4px', fontSize: 13, fontWeight: 600, color: '#8e8e93' }}>{g.title}</p>
              {g.list.map(r => {
                idx++
                const i = idx
                return (
                  <button key={r.href + r.label} type="button" className="ss-row" data-idx={i} data-on={i === active ? '1' : '0'}
                    onMouseMove={() => { if (active !== i) setActive(i) }} onClick={() => go(r.href)}>
                    <span className="ss-ic" aria-hidden="true">{r.icon || <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 15.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                    {searching && r.section && <span style={{ fontSize: 13, color: '#8e8e93', flexShrink: 0 }}>{r.section}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <div className="ss-foot" aria-hidden="true">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span className="ss-key">↑↓</span> to navigate</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span className="ss-key">↵</span> to select</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span className="ss-key">Esc</span> to close</span>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Search (⌘K)"
        className="ss-trigger"
        style={{
          display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 10px',
          borderRadius: 10, fontSize: 13, marginBottom: 6, cursor: 'pointer',
          background: '#f2f2f7', border: '1px solid transparent', color: '#8e8e93',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
        <span className="nav-ic" style={{ display: 'flex', flexShrink: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        </span>
        {!collapsed && <>
          <span style={{ flex: 1, textAlign: 'left' }}>Search…</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#8e8e93', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 6, padding: '1px 6px', background: '#fff' }}>⌘K</span>
        </>}
      </button>
      <style>{`.ss-trigger { transition: background .14s ease; } .ss-trigger:hover { background: #e9e9ee !important; }`}</style>
      {open && mounted && createPortal(sheet, document.body)}
    </>
  )
}
