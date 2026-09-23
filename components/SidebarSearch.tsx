'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export type SearchItem = { label: string; href: string; section?: string; keywords?: string }

// Sidebar command palette: a search button (rendered above Dashboard) that opens
// a searchable list of every sidebar destination + settings page. Type to
// filter, ↑/↓ to move, Enter to go. Also opens with ⌘K / Ctrl+K.
export default function SidebarSearch({ items, collapsed }: { items: SearchItem[]; collapsed: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Global ⌘K / Ctrl+K to open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { if (open) { setQ(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 20) } }, [open])

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return items
    return items.filter(it =>
      it.label.toLowerCase().includes(s) ||
      (it.section || '').toLowerCase().includes(s) ||
      (it.keywords || '').toLowerCase().includes(s)
    )
  }, [q, items])

  useEffect(() => { setActive(0) }, [q])

  const go = (href: string) => { setOpen(false); router.push(href) }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const r = results[active]; if (r) go(r.href) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Search (⌘K)"
        className="nav-item"
        style={{
          display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 10px',
          borderRadius: 8, fontSize: 13, marginBottom: 6, cursor: 'pointer',
          background: '#f4f5f7', border: '1px solid var(--border)', color: 'var(--slate)',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
        <span className="nav-ic" style={{ display: 'flex', flexShrink: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        </span>
        {!collapsed && <>
          <span style={{ flex: 1, textAlign: 'left' }}>Search…</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', border: '1px solid var(--border)', borderRadius: 6, padding: '1px 6px', background: '#fff' }}>⌘K</span>
        </>}
      </button>

      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,17,25,0.4)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 520, margin: '0 16px', background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '70vh' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKeyDown}
                placeholder="Search pages & settings…"
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 16, color: 'var(--ink)', background: 'transparent' }} />
              <span style={{ fontSize: 11, color: '#9ca3af' }}>Esc</span>
            </div>
            <div style={{ overflowY: 'auto', padding: 6 }}>
              {results.length === 0 ? (
                <p style={{ padding: 24, textAlign: 'center', color: 'var(--slate)', fontSize: 14 }}>No matches for “{q}”.</p>
              ) : results.map((r, i) => (
                <button key={r.href + r.label} type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r.href)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', background: i === active ? 'var(--peach)' : 'transparent' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: i === active ? 'var(--coral)' : 'var(--ink)' }}>{r.label}</span>
                  {r.section && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#9ca3af' }}>{r.section}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
