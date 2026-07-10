'use client'

import { useEffect, useCallback } from 'react'

export type MediaItem = { url: string; name?: string; kind?: string }

// Fullscreen gallery/lightbox. Opens over the current screen (not a new tab),
// supports left/right navigation, a clickable thumbnail strip, and a close (✕)
// button. Keyboard: ← → to navigate, Esc to close.
export default function MediaGallery({ items, index, onClose, onIndex }: {
  items: MediaItem[]
  index: number
  onClose: () => void
  onIndex: (i: number) => void
}) {
  const count = items.length
  const go = useCallback((delta: number) => {
    if (count === 0) return
    onIndex((index + delta + count) % count)
  }, [index, count, onIndex])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  if (count === 0 || !items[index]) return null
  const current = items[index]

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 100000,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
      {/* Close */}
      <button onClick={(e) => { e.stopPropagation(); onClose() }} aria-label="Close"
        style={{ position: 'absolute', top: 16, right: 18, width: 42, height: 42, borderRadius: 21, background: 'rgba(255,255,255,0.14)', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
        ✕
      </button>

      {/* Counter */}
      <div style={{ position: 'absolute', top: 22, left: 22, color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600 }}>
        {index + 1} / {count}
      </div>

      {/* Prev */}
      {count > 1 && (
        <button onClick={(e) => { e.stopPropagation(); go(-1) }} aria-label="Previous"
          style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 48, height: 48, borderRadius: 24, background: 'rgba(255,255,255,0.14)', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}>
          ‹
        </button>
      )}

      {/* Main media */}
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '74vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {current.kind === 'video' ? (
          <video src={current.url} controls autoPlay style={{ maxWidth: '90vw', maxHeight: '74vh', borderRadius: 8 }} />
        ) : (
          <img src={current.url} alt={current.name || ''} style={{ maxWidth: '90vw', maxHeight: '74vh', borderRadius: 8, objectFit: 'contain' }} />
        )}
      </div>

      {/* Next */}
      {count > 1 && (
        <button onClick={(e) => { e.stopPropagation(); go(1) }} aria-label="Next"
          style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', width: 48, height: 48, borderRadius: 24, background: 'rgba(255,255,255,0.14)', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}>
          ›
        </button>
      )}

      {/* Thumbnail strip */}
      {count > 1 && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', bottom: 16, left: 0, right: 0, display: 'flex', gap: 8, justifyContent: 'center', padding: '0 16px', overflowX: 'auto' }}>
          {items.map((it, i) => (
            <button key={i} onClick={() => onIndex(i)}
              style={{ flexShrink: 0, width: 56, height: 56, borderRadius: 8, overflow: 'hidden', border: i === index ? '2px solid #fff' : '2px solid transparent', background: '#000', cursor: 'pointer', padding: 0, opacity: i === index ? 1 : 0.55 }}>
              {it.kind === 'video' ? (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#222', color: '#fff', fontSize: 18 }}>▶</div>
              ) : (
                <img src={it.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
