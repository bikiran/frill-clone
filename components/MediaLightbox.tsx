'use client'

import { useEffect, useState } from 'react'
import VideoPlayer from '@/components/VideoPlayer'

export type LightItem = { url: string; name?: string; type?: string; kind?: string }

const isImg = (a: LightItem) => a.kind === 'image' || (a.type || '').startsWith('image/')
const isVid = (a: LightItem) => a.kind === 'video' || (a.type || '').startsWith('video/')

// Full-screen media viewer: big preview, arrow/keyboard navigation, and a
// thumbnail strip along the bottom. Used wherever attachments are shown.
export default function MediaLightbox({
  items, index, onIndex, onClose, onRename,
}: {
  items: LightItem[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
  onRename?: (index: number, name: string) => void
}) {
  const n = items.length
  const go = (d: number) => onIndex((index + d + n) % n)
  // Inline rename of the current item's name.
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  useEffect(() => { setEditing(false) }, [index])
  const startRename = () => { setDraft(items[index]?.name || ''); setEditing(true) }
  const commitRename = () => { const nm = draft.trim(); if (nm && nm !== items[index]?.name) onRename?.(index, nm); setEditing(false) }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing) { if (e.key === 'Escape') setEditing(false); return }
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, n, editing])

  if (!n || index < 0 || index >= n) return null
  const cur = items[index]
  const arrow: React.CSSProperties = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', color: '#fff' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {editing ? (
            <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitRename() } }}
              onBlur={commitRename}
              style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 7, padding: '5px 9px', outline: 'none', width: 260, maxWidth: '60vw' }} />
          ) : (
            <>
              <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cur.name || 'Untitled'}</span>
              {onRename && (
                <button onClick={startRename} title="Rename" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', opacity: 0.7, display: 'flex', padding: 2, flexShrink: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              )}
            </>
          )}
          <span style={{ opacity: 0.6, flexShrink: 0 }}>{index + 1} / {n}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <a href={cur.url} target="_blank" rel="noopener" title="Open original" style={{ color: '#fff', opacity: 0.85, display: 'flex' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
          <button onClick={onClose} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', padding: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      {/* Stage */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, padding: '0 12px' }} onClick={e => e.stopPropagation()}>
        {n > 1 && <button onClick={() => go(-1)} title="Previous" style={{ ...arrow, left: 12 }}>‹</button>}
        {isImg(cur) ? (
          <img src={cur.url} alt={cur.name || ''} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 6 }} />
        ) : isVid(cur) ? (
          <VideoPlayer key={cur.url} src={cur.url} poster={(cur as any).thumbnail_url || (cur as any).poster} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 6 }} />
        ) : (
          <a href={cur.url} target="_blank" rel="noopener" style={{ color: '#fff', fontSize: 15, textDecoration: 'underline' }}>Open file: {cur.name || cur.url}</a>
        )}
        {n > 1 && <button onClick={() => go(1)} title="Next" style={{ ...arrow, right: 12 }}>›</button>}
      </div>

      {/* Thumbnail strip */}
      {n > 1 && (
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', overflowX: 'auto', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
          {items.map((a, i) => (
            <button key={i} onClick={() => onIndex(i)}
              style={{ width: 56, height: 56, flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: i === index ? '2px solid #fff' : '2px solid transparent', background: '#111', cursor: 'pointer', padding: 0, opacity: i === index ? 1 : 0.55, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isImg(a) ? <img src={a.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: '#fff', fontSize: 18 }}>{isVid(a) ? '▶' : '📄'}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
