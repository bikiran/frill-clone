'use client'

import { useEffect, useState } from 'react'

// Wires the buttons on inline `.rte-voice` cards (which live inside
// contentEditable / dangerouslySetInnerHTML, where React can't mount directly)
// via document-level click delegation: Play (feeds the bottom AudioDock),
// Rename, Download, and a "More options" menu. Mount once per page.
const nameOf = (block: HTMLElement) => block.querySelector('.rte-voice-name')?.textContent?.trim() || 'Voice note'
const audioOf = (block: HTMLElement) => block.querySelector('audio') as HTMLAudioElement | null

function download(block: HTMLElement) {
  const a = audioOf(block); if (!a?.src) return
  const link = document.createElement('a')
  link.href = a.src; link.download = `${nameOf(block)}`.replace(/[^\w.\- ]+/g, '_'); link.target = '_blank'
  document.body.appendChild(link); link.click(); link.remove()
}
function rename(block: HTMLElement) {
  if (!block.closest('.rte-content')) return   // only in an editable note
  const cur = nameOf(block)
  const next = window.prompt('Rename voice note', cur)
  if (next == null) return
  const el = block.querySelector('.rte-voice-name'); if (el) el.textContent = next.trim() || cur
  audioOf(block)?.setAttribute('data-name', next.trim() || cur)
  block.closest('.rte-content')?.dispatchEvent(new Event('input', { bubbles: true }))   // persist
}

export default function VoiceBlocks() {
  const [menu, setMenu] = useState<{ x: number; y: number; block: HTMLElement; editable: boolean } | null>(null)

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
      else if (va === 'rename') rename(block)
      else if (va === 'more') {
        const r = btn.getBoundingClientRect()
        setMenu({ x: Math.min(r.left, window.innerWidth - 210), y: r.bottom + 6, block, editable: !!block.closest('.rte-content') })
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  if (!menu) return null
  const item: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '9px 11px', border: 'none', borderRadius: 8, background: 'transparent', color: 'var(--ink,#1a1a1a)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
  return (
    <>
      <div onClick={() => setMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 950 }} />
      <div style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 951, background: '#fff', border: '1px solid var(--border,#e5e7eb)', borderRadius: 12, boxShadow: '0 14px 34px rgba(0,0,0,0.18)', padding: 6, minWidth: 200 }}>
        <div style={{ padding: '6px 11px 8px', fontSize: 12, color: 'var(--slate,#6b7280)', fontWeight: 700, borderBottom: '1px solid var(--border,#e5e7eb)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameOf(menu.block)}</div>
        <button style={item} onMouseEnter={e => (e.currentTarget.style.background = '#f4f5f7')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          onClick={() => { download(menu.block); setMenu(null) }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download
        </button>
        {menu.editable && (
          <button style={item} onMouseEnter={e => (e.currentTarget.style.background = '#f4f5f7')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => { rename(menu.block); setMenu(null) }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            Rename
          </button>
        )}
      </div>
    </>
  )
}
