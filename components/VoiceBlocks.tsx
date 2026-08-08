'use client'

import { useEffect, useState } from 'react'

// Wires the buttons on inline `.rte-voice` cards (which live inside
// contentEditable / dangerouslySetInnerHTML, where React can't mount directly)
// via document-level click delegation: Play (feeds the bottom AudioDock),
// Rename (in-app modal), Download, Delete, and a "More options" menu. Mount
// once per page.
const nameOf = (block: HTMLElement) => block.querySelector('.rte-voice-name')?.textContent?.trim() || 'Voice note'
const audioOf = (block: HTMLElement) => block.querySelector('audio') as HTMLAudioElement | null
const editableRoot = (block: HTMLElement) => block.closest('.rte-content') as HTMLElement | null

function download(block: HTMLElement) {
  const a = audioOf(block); if (!a?.src) return
  const link = document.createElement('a')
  link.href = a.src; link.download = `${nameOf(block)}`.replace(/[^\w.\- ]+/g, '_'); link.target = '_blank'
  document.body.appendChild(link); link.click(); link.remove()
}
function applyName(block: HTMLElement, next: string) {
  const root = editableRoot(block); if (!root) return
  const clean = next.trim() || nameOf(block)
  const el = block.querySelector('.rte-voice-name'); if (el) el.textContent = clean
  audioOf(block)?.setAttribute('data-name', clean)
  root.dispatchEvent(new Event('input', { bubbles: true }))   // persist
}
function remove(block: HTMLElement) {
  const root = editableRoot(block); if (!root) return
  block.remove()
  root.dispatchEvent(new Event('input', { bubbles: true }))   // persist
}

export default function VoiceBlocks() {
  const [menu, setMenu] = useState<{ x: number; y: number; block: HTMLElement; editable: boolean } | null>(null)
  const [renaming, setRenaming] = useState<{ block: HTMLElement; value: string } | null>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('.rte-voice-play, .rte-voice-btn') as HTMLElement | null
      if (!btn) return
      const block = btn.closest('.rte-voice') as HTMLElement | null
      if (!block) return
      e.preventDefault(); e.stopPropagation()
      if (btn.classList.contains('rte-voice-play')) { audioOf(block)?.play().catch(() => {}); return }
      const va = btn.getAttribute('data-va')
      if (va === 'download') download(block)
      else if (va === 'rename') { if (editableRoot(block)) setRenaming({ block, value: nameOf(block) }) }
      else if (va === 'more') {
        const r = btn.getBoundingClientRect()
        setMenu({ x: Math.min(r.left, window.innerWidth - 220), y: r.bottom + 6, block, editable: !!editableRoot(block) })
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  const item: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '9px 11px', border: 'none', borderRadius: 8, background: 'transparent', color: 'var(--ink,#1a1a1a)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
  const hov = (on: boolean) => (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = on ? '#f4f5f7' : 'transparent' }

  return (
    <>
      {menu && (
        <>
          <div onClick={() => setMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 950 }} />
          <div style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 951, background: '#fff', border: '1px solid var(--border,#e5e7eb)', borderRadius: 12, boxShadow: '0 14px 34px rgba(0,0,0,0.18)', padding: 6, minWidth: 210 }}>
            <div style={{ padding: '6px 11px 8px', fontSize: 12, color: 'var(--slate,#6b7280)', fontWeight: 700, borderBottom: '1px solid var(--border,#e5e7eb)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameOf(menu.block)}</div>
            <button style={item} onMouseEnter={hov(true)} onMouseLeave={hov(false)} onClick={() => { download(menu.block); setMenu(null) }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download
            </button>
            {menu.editable && (
              <button style={item} onMouseEnter={hov(true)} onMouseLeave={hov(false)} onClick={() => { const b = menu.block; setMenu(null); setRenaming({ block: b, value: nameOf(b) }) }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                Rename
              </button>
            )}
            {menu.editable && (
              <button style={{ ...item, color: '#dc2626' }} onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                onClick={() => { remove(menu.block); setMenu(null) }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                Delete
              </button>
            )}
          </div>
        </>
      )}

      {renaming && (
        <div onMouseDown={e => { if (e.target === e.currentTarget) setRenaming(null) }}
          style={{ position: 'fixed', inset: 0, zIndex: 100200, background: 'rgba(17,17,17,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: 'min(440px, 100%)', background: '#fff', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.28)', padding: 22 }}>
            <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: 'var(--ink,#1a1a1a)' }}>Rename voice note</p>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--slate,#6b7280)' }}>Give this recording a clear name.</p>
            <input autoFocus value={renaming.value}
              onChange={e => setRenaming(r => r && { ...r, value: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') { applyName(renaming.block, renaming.value); setRenaming(null) } else if (e.key === 'Escape') setRenaming(null) }}
              style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: '1.5px solid var(--border,#e5e7eb)', fontSize: 14.5, fontWeight: 600, color: 'var(--ink,#1a1a1a)', outline: 'none' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button onClick={() => setRenaming(null)}
                style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border,#e5e7eb)', background: '#fff', color: 'var(--slate,#6b7280)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => { applyName(renaming.block, renaming.value); setRenaming(null) }}
                style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: 'var(--coral,#ff7a6b)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
