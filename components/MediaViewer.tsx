'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

// Full-screen viewer for photos, videos and PDFs — Photos-app feel:
//   • opens by growing out of the tapped thumbnail (and shrinks back on close)
//   • swipe / arrow keys between items, swipe down (or Esc) to close
//   • double-tap a photo to zoom, drag to pan while zoomed
// Transform + opacity only, driven by pointer events — smooth on phones.

export type ViewerItem = {
  src: string                       // full file (blob: or https:)
  kind: 'image' | 'video' | 'pdf' | 'audio' | 'file'
  name?: string
  poster?: string | null            // thumbnail / first PDF page
  pages?: number
}

const EASE = 'cubic-bezier(.22,1,.36,1)'
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function MediaViewer({ items, index, onIndex, onClose, originRect }: {
  items: ViewerItem[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
  originRect?: (i: number) => DOMRect | null
}) {
  const [shown, setShown] = useState(false)          // backdrop fade
  const [closing, setClosing] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const mediaRef = useRef<HTMLElement | null>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; t: number; axis: '' | 'x' | 'y'; dx: number; dy: number; id: number } | null>(null)
  const [zoom, setZoom] = useState<{ s: number; x: number; y: number }>({ s: 1, x: 0, y: 0 })
  const lastTap = useRef(0)
  const item = items[index]

  // Lock page scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Open: fade the backdrop in and grow the media out of its thumbnail.
  useLayoutEffect(() => {
    const el = mediaRef.current
    const from = originRect?.(index)
    requestAnimationFrame(() => setShown(true))
    if (!el || !from || reduced()) return
    const grow = () => {
      const to = el.getBoundingClientRect()
      if (!to.width || !to.height) { el.style.opacity = '1'; return }
      const s = Math.min(from.width / to.width, from.height / to.height)
      el.style.transition = 'none'
      el.style.transform = `translate3d(${from.left + from.width / 2 - (to.left + to.width / 2)}px, ${from.top + from.height / 2 - (to.top + to.height / 2)}px, 0) scale(${s})`
      el.style.opacity = '0.85'
      void el.offsetWidth
      el.style.transition = `transform .46s ${EASE}, opacity .3s ease`
      el.style.transform = 'none'
      el.style.opacity = '1'
    }
    // A photo has no size until it has decoded — wait for it (hidden) first.
    const img = el.tagName === 'IMG' ? (el as HTMLImageElement) : el.querySelector('img')
    if (img && !(img.complete && img.naturalWidth)) {
      el.style.opacity = '0'
      const done = () => requestAnimationFrame(grow)
      img.addEventListener('load', done, { once: true })
      img.addEventListener('error', () => { el.style.opacity = '1' }, { once: true })
    } else grow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = useCallback(() => {
    if (closing) return
    setClosing(true)
    const el = mediaRef.current
    const to = originRect?.(index)
    if (el && to && !reduced()) {
      const r = el.getBoundingClientRect()
      const s = Math.min(to.width / r.width, to.height / r.height)
      const cur = el.style.transform && el.style.transform !== 'none' ? el.style.transform + ' ' : ''
      el.style.transition = `transform .36s ${EASE}, opacity .3s ease`
      el.style.transform = `${cur}translate3d(${to.left + to.width / 2 - (r.left + r.width / 2)}px, ${to.top + to.height / 2 - (r.top + r.height / 2)}px, 0) scale(${s})`
      el.style.opacity = '0.6'
    }
    setShown(false)
    setTimeout(onClose, reduced() ? 0 : 340)
  }, [closing, index, onClose, originRect])

  const go = useCallback((dir: -1 | 1) => {
    const next = index + dir
    if (next < 0 || next >= items.length) { settle(); return }
    const t = trackRef.current
    setZoom({ s: 1, x: 0, y: 0 })
    if (t && !reduced()) {
      t.style.transition = `transform .38s ${EASE}`
      t.style.transform = `translate3d(${-dir * 100}%, 0, 0)`
      setTimeout(() => {
        t.style.transition = 'none'
        t.style.transform = 'translate3d(0,0,0)'
        onIndex(next)
      }, 380)
    } else onIndex(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, items.length, onIndex])

  // Spring the track / media back into place after a short drag.
  const settle = () => {
    const t = trackRef.current, b = backdropRef.current
    if (t) { t.style.transition = `transform .34s ${EASE}`; t.style.transform = 'translate3d(0,0,0)' }
    if (b) { b.style.transition = 'opacity .3s ease'; b.style.opacity = '' }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, go])

  // ── Gestures ──
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('video, button, a, iframe')) return
    drag.current = { x: e.clientX, y: e.clientY, t: Date.now(), axis: '', dx: 0, dy: 0, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    d.dx = e.clientX - d.x; d.dy = e.clientY - d.y
    if (zoom.s > 1) { setZoom(z => ({ ...z, x: z.x + e.movementX, y: z.y + e.movementY })); return }
    if (!d.axis && Math.hypot(d.dx, d.dy) > 8) d.axis = Math.abs(d.dx) > Math.abs(d.dy) ? 'x' : 'y'
    const t = trackRef.current, b = backdropRef.current
    if (d.axis === 'x' && t) {
      const edge = (index === 0 && d.dx > 0) || (index === items.length - 1 && d.dx < 0)
      t.style.transition = 'none'
      t.style.transform = `translate3d(${edge ? d.dx * 0.3 : d.dx}px, 0, 0)`
    } else if (d.axis === 'y' && d.dy > 0 && mediaRef.current) {
      const p = Math.min(1, d.dy / 400)
      mediaRef.current.style.transition = 'none'
      mediaRef.current.style.transform = `translate3d(${d.dx * 0.5}px, ${d.dy}px, 0) scale(${1 - p * 0.25})`
      if (b) { b.style.transition = 'none'; b.style.opacity = String(1 - p * 0.9) }
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const dt = Math.max(1, Date.now() - d.t)
    if (zoom.s > 1) return
    if (d.axis === 'x') {
      const v = d.dx / dt
      if (d.dx < -80 || v < -0.5) go(1)
      else if (d.dx > 80 || v > 0.5) go(-1)
      else settle()
    } else if (d.axis === 'y') {
      if (d.dy > 120 || d.dy / dt > 0.6) close()
      else if (mediaRef.current) {
        mediaRef.current.style.transition = `transform .34s ${EASE}`
        mediaRef.current.style.transform = 'none'
        settle()
      }
    } else if (!d.axis && item?.kind === 'image') {
      // Double-tap to zoom in on that spot / back out.
      const now = Date.now()
      if (now - lastTap.current < 300) {
        lastTap.current = 0
        const r = mediaRef.current?.getBoundingClientRect()
        if (zoom.s > 1 || !r) setZoom({ s: 1, x: 0, y: 0 })
        else setZoom({ s: 2.4, x: (r.left + r.width / 2 - e.clientX) * 1.4, y: (r.top + r.height / 2 - e.clientY) * 1.4 })
      } else lastTap.current = now
    } else if (!d.axis && (e.target as HTMLElement).dataset?.lbBackdrop) close()
  }

  const slide = (i: number, pos: -1 | 0 | 1) => {
    const it = items[i]
    if (!it) return null
    const isCur = pos === 0
    const refFn = isCur ? (el: HTMLElement | null) => { mediaRef.current = el } : undefined
    return (
      <div key={`${i}`} className="lb-slide" style={{ transform: `translate3d(${pos * 100}%,0,0)` }} data-lb-backdrop="1">
        {it.kind === 'image' && (
          <img ref={refFn as any} src={it.src} alt={it.name || ''} draggable={false} className="lb-media"
            style={isCur && zoom.s > 1 ? { transform: `translate3d(${zoom.x}px, ${zoom.y}px, 0) scale(${zoom.s})`, transition: drag.current ? 'none' : `transform .38s ${EASE}`, cursor: 'grab' } : undefined} />
        )}
        {it.kind === 'video' && (
          isCur
            ? <video ref={refFn as any} src={it.src} poster={it.poster || undefined} controls autoPlay playsInline className="lb-media" style={{ background: '#000', borderRadius: 12 }} />
            : it.poster ? <img src={it.poster} alt="" className="lb-media" draggable={false} /> : null
        )}
        {it.kind === 'pdf' && (
          <div ref={refFn as any} className="lb-media lb-pdf">
            {it.poster
              ? <img src={it.poster} alt={it.name || 'PDF'} draggable={false} style={{ display: 'block', maxWidth: '100%', maxHeight: 'calc(100dvh - 190px)', borderRadius: 10, boxShadow: '0 20px 60px -20px rgba(0,0,0,.6)', background: '#fff' }} />
              : <div style={{ width: 'min(70vw, 320px)', aspectRatio: '0.75', borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626', fontWeight: 900, fontSize: 28 }}>PDF</div>}
            {isCur && (
              <a href={it.src} target="_blank" rel="noreferrer" className="lb-open">Open full PDF{it.pages && it.pages > 1 ? ` · ${it.pages} pages` : ''} ↗</a>
            )}
          </div>
        )}
        {(it.kind === 'audio') && isCur && <audio ref={refFn as any} src={it.src} controls autoPlay className="lb-media" />}
        {it.kind === 'file' && isCur && (
          <div ref={refFn as any} className="lb-media lb-pdf"><a href={it.src} target="_blank" rel="noreferrer" className="lb-open">Open {it.name || 'file'} ↗</a></div>
        )}
      </div>
    )
  }

  return (
    <div className="lb-root" role="dialog" aria-modal="true" aria-label={item?.name || 'Preview'}>
      <style>{`
        .lb-root{position:fixed;inset:0;z-index:2000;touch-action:none;user-select:none;-webkit-user-select:none}
        .lb-backdrop{position:absolute;inset:0;background:rgba(10,10,12,.94);opacity:0;transition:opacity .32s ease}
        .lb-backdrop.on{opacity:1}
        .lb-stage{position:absolute;inset:0;overflow:hidden}
        .lb-track{position:absolute;inset:0;will-change:transform}
        .lb-slide{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:64px 12px calc(56px + env(safe-area-inset-bottom))}
        .lb-media{max-width:100%;max-height:100%;object-fit:contain;will-change:transform;-webkit-user-drag:none}
        img.lb-media{border-radius:6px}
        .lb-pdf{display:flex;flex-direction:column;align-items:center;gap:14px}
        .lb-open{display:inline-flex;align-items:center;gap:6px;padding:11px 18px;border-radius:999px;background:#fff;color:#111;font-weight:700;font-size:14px;text-decoration:none;box-shadow:0 8px 24px -8px rgba(0,0,0,.5);transition:transform .2s ${EASE}}
        .lb-open:active{transform:scale(.96)}
        .lb-top{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;gap:10px;padding:calc(12px + env(safe-area-inset-top)) 14px 12px;color:#fff;background:linear-gradient(rgba(0,0,0,.45),transparent);opacity:0;transform:translate3d(0,-8px,0);transition:opacity .3s ease,transform .3s ${EASE}}
        .lb-top.on{opacity:1;transform:none}
        .lb-btn{width:42px;height:42px;border-radius:50%;border:none;background:rgba(255,255,255,.14);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);transition:background .2s,transform .2s ${EASE};flex-shrink:0}
        .lb-btn:hover{background:rgba(255,255,255,.24)}
        .lb-btn:active{transform:scale(.92)}
        .lb-nav{position:absolute;top:50%;margin-top:-21px}
        @media(max-width:640px){.lb-nav{display:none}}
        .lb-dots{position:absolute;left:0;right:0;bottom:calc(18px + env(safe-area-inset-bottom));display:flex;justify-content:center;gap:6px}
        .lb-dot{width:6px;height:6px;border-radius:999px;background:rgba(255,255,255,.35);transition:width .3s ${EASE},background .3s}
        .lb-dot.on{width:18px;background:#fff}
      `}</style>
      <div ref={backdropRef} className={`lb-backdrop${shown ? ' on' : ''}`} />
      <div className="lb-stage" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <div ref={trackRef} className="lb-track">
          {slide(index - 1, -1)}
          {slide(index, 0)}
          {slide(index + 1, 1)}
        </div>
      </div>
      <div className={`lb-top${shown ? ' on' : ''}`}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item?.name || ''}</div>
          {items.length > 1 && <div style={{ fontSize: 12, opacity: 0.7 }}>{index + 1} of {items.length}</div>}
        </div>
        <a className="lb-btn" href={item?.src} download={item?.name || true} target="_blank" rel="noreferrer" aria-label="Download" onClick={e => e.stopPropagation()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
        </a>
        <button className="lb-btn" onClick={close} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      {shown && index > 0 && <button className="lb-btn lb-nav" style={{ left: 16 }} onClick={() => go(-1)} aria-label="Previous"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg></button>}
      {shown && index < items.length - 1 && <button className="lb-btn lb-nav" style={{ right: 16 }} onClick={() => go(1)} aria-label="Next"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg></button>}
      {items.length > 1 && items.length <= 20 && (
        <div className="lb-dots">{items.map((_, i) => <span key={i} className={`lb-dot${i === index ? ' on' : ''}`} />)}</div>
      )}
    </div>
  )
}
