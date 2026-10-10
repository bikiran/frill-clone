'use client'

// Trim a gallery video: drag the two handles (or use the arrow keys on them) to
// choose the part to keep, preview it, and save. Saving makes a trimmed COPY on
// the server (/api/media/trim → the transcode pipeline); the original is kept.

import { useCallback, useEffect, useRef, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { playbackUrl } from '@/lib/mediaPlayback'

const MIN_CLIP = 0.5
const FRAMES = 8

const fmt = (t: number) => {
  if (!Number.isFinite(t) || t < 0) t = 0
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`
}

export default function VideoTrimmer({ item, companyId, onClose, onSaved }: {
  item: any
  companyId: string
  onClose: () => void
  onSaved: (copy: any) => void
}) {
  const src = playbackUrl(item)
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const [duration, setDuration] = useState(0)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [strip, setStrip] = useState(false)
  const drag = useRef<null | 'start' | 'end'>(null)
  const range = useRef({ start: 0, end: 0 })
  range.current = { start, end }

  // Length known → select the whole video.
  const onMeta = () => {
    const d = videoRef.current?.duration || 0
    if (!Number.isFinite(d) || d <= 0) { setError('Couldn’t read this video’s length.'); return }
    setDuration(d); setStart(0); setEnd(d)
  }

  // Filmstrip: a hidden copy of the video seeks to a few points and paints
  // each frame onto a canvas. Purely decorative — any failure leaves the plain
  // track.
  useEffect(() => {
    if (!duration) return
    let cancelled = false
    const v = document.createElement('video')
    v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = src
    const times = Array.from({ length: FRAMES }, (_, i) => (duration * (i + 0.5)) / FRAMES)
    let i = 0
    const paint = () => {
      if (cancelled) return
      const c = canvasRefs.current[i]
      try {
        const ctx = c?.getContext('2d')
        if (c && ctx && v.videoWidth) {
          const scale = Math.max(c.width / v.videoWidth, c.height / v.videoHeight)
          const w = v.videoWidth * scale, h = v.videoHeight * scale
          ctx.drawImage(v, (c.width - w) / 2, (c.height - h) / 2, w, h)
          setStrip(true)
        }
      } catch {}
      i++
      if (i < times.length) v.currentTime = times[i]
    }
    v.addEventListener('seeked', paint)
    v.addEventListener('loadeddata', () => { if (!cancelled) v.currentTime = times[0] }, { once: true })
    return () => { cancelled = true; v.removeEventListener('seeked', paint); v.removeAttribute('src'); v.load() }
  }, [duration, src])

  // Playhead: smooth while playing, and the preview loops inside the selection.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => {
      const v = videoRef.current
      if (v) {
        if (v.currentTime >= range.current.end - 0.02) v.currentTime = range.current.start
        setTime(v.currentTime)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const seek = (t: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.min(Math.max(t, 0), duration)
    setTime(v.currentTime)
  }

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (playing) { v.pause(); setPlaying(false); return }
    if (v.currentTime < start || v.currentTime >= end - 0.05) v.currentTime = start
    v.play().then(() => setPlaying(true)).catch(() => {})
  }

  const timeAt = useCallback((clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect()
    if (!r || !duration) return 0
    return Math.min(Math.max((clientX - r.left) / r.width, 0), 1) * duration
  }, [duration])

  const setHandle = (which: 'start' | 'end', t: number) => {
    if (which === 'start') { const v = Math.min(Math.max(t, 0), range.current.end - MIN_CLIP); setStart(v); seek(v) }
    else { const v = Math.max(Math.min(t, duration), range.current.start + MIN_CLIP); setEnd(v); seek(v) }
  }

  const onPointerDown = (which: 'start' | 'end') => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    drag.current = which
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    if (playing) { videoRef.current?.pause(); setPlaying(false) }
  }
  const onPointerMove = (e: React.PointerEvent) => { if (drag.current) setHandle(drag.current, timeAt(e.clientX)) }
  const onPointerUp = () => { drag.current = null }

  const onKey = (which: 'start' | 'end') => (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 1 : 0.1
    const cur = which === 'start' ? start : end
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); setHandle(which, cur - step) }
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); setHandle(which, cur + step) }
    if (e.key === 'Home') { e.preventDefault(); setHandle(which, which === 'start' ? 0 : start + MIN_CLIP) }
    if (e.key === 'End') { e.preventDefault(); setHandle(which, which === 'end' ? duration : end - MIN_CLIP) }
  }

  // Esc closes (unless saving).
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose, saving])

  const whole = duration > 0 && start <= 0.05 && end >= duration - 0.05
  const save = async () => {
    if (saving || !duration || whole) return
    setSaving(true); setError('')
    try {
      const res = await authFetch('/api/media/trim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, itemId: item.id, start: +start.toFixed(2), end: +end.toFixed(2) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.item) throw new Error(d.error || 'Could not trim this video')
      onSaved(d.item)
    } catch (e: any) { setError(e.message); setSaving(false) }
  }

  const pct = (t: number) => (duration ? (t / duration) * 100 : 0)

  return (
    <div role="dialog" aria-modal="true" aria-label="Trim video" className="vt-backdrop"
      onClick={e => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <style>{`
        .vt-backdrop { position: fixed; inset: 0; z-index: 1000; background: rgba(10,10,14,0.72); display: flex; align-items: center; justify-content: center; padding: 16px; }
        .vt-card { width: 100%; max-width: 760px; max-height: calc(100vh - 32px); overflow: auto; background: #fff; border-radius: 18px; box-shadow: 0 24px 60px rgba(0,0,0,0.35); }
        .vt-video { display: block; width: 100%; max-height: 52vh; background: #000; }
        .vt-track { position: relative; height: 56px; margin: 0 10px; border-radius: 10px; background: linear-gradient(90deg,#2b2b33,#3a3a44); touch-action: none; cursor: pointer; user-select: none; }
        .vt-strip { position: absolute; inset: 0; border-radius: 10px; overflow: hidden; display: grid; grid-template-columns: repeat(${FRAMES}, 1fr); opacity: 0; transition: opacity .3s ease; }
        .vt-strip[data-on="1"] { opacity: 1; }
        .vt-strip canvas { width: 100%; height: 100%; display: block; }
        .vt-shade { position: absolute; top: 0; bottom: 0; background: rgba(10,10,14,0.62); pointer-events: none; }
        .vt-shade.l { border-radius: 10px 0 0 10px; } .vt-shade.r { border-radius: 0 10px 10px 0; }
        .vt-sel { position: absolute; top: 0; bottom: 0; border-top: 3px solid var(--coral, #ff7a6b); border-bottom: 3px solid var(--coral, #ff7a6b); pointer-events: none; }
        .vt-handle { position: absolute; top: 0; bottom: 0; width: 18px; margin-left: -9px; background: var(--coral, #ff7a6b); border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: ew-resize; touch-action: none; border: none; padding: 0; }
        .vt-handle:focus-visible { outline: 3px solid #1f6feb; outline-offset: 1px; }
        .vt-handle span { width: 2px; height: 18px; border-radius: 2px; background: rgba(255,255,255,0.9); }
        .vt-head { position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,0.25); pointer-events: none; }
        .vt-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .vt-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 10px 16px; border-radius: 11px; font-size: 13px; font-weight: 700; cursor: pointer; border: 1px solid var(--border, #ececf1); background: #fff; color: var(--ink, #111); }
        .vt-btn.primary { background: var(--coral, #ff7a6b); border-color: var(--coral, #ff7a6b); color: #fff; }
        .vt-btn:disabled { opacity: .55; cursor: default; }
        @media (max-width: 560px) { .vt-actions { width: 100%; } .vt-actions .vt-btn { flex: 1; } }
        @media (prefers-reduced-motion: reduce) { .vt-strip { transition: none; } }
      `}</style>
      <div className="vt-card">
        <div className="vt-row" style={{ padding: '14px 16px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Trim video</div>
            <div style={{ fontSize: 12, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title || 'Video'}</div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="vt-btn" style={{ padding: 8, borderRadius: 10 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <video ref={videoRef} src={src} className="vt-video" playsInline preload="metadata"
          onLoadedMetadata={onMeta}
          onPause={() => setPlaying(false)}
          onSeeked={() => setTime(videoRef.current?.currentTime || 0)}
          onClick={togglePlay} />

        <div style={{ padding: 16 }}>
          <div ref={trackRef} className="vt-track"
            onPointerDown={e => { if (!drag.current && duration) seek(Math.min(Math.max(timeAt(e.clientX), start), end)) }}
            onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            <div className="vt-strip" data-on={strip ? '1' : '0'} aria-hidden="true">
              {Array.from({ length: FRAMES }, (_, i) => (
                <canvas key={i} width={96} height={56} ref={el => { canvasRefs.current[i] = el }} />
              ))}
            </div>
            {duration > 0 && (<>
              <div className="vt-shade l" style={{ left: 0, width: `${pct(start)}%` }} />
              <div className="vt-shade r" style={{ left: `${pct(end)}%`, right: 0 }} />
              <div className="vt-sel" style={{ left: `${pct(start)}%`, width: `${pct(end - start)}%` }} />
              <div className="vt-head" style={{ left: `${pct(time)}%` }} />
              <button type="button" className="vt-handle" style={{ left: `${pct(start)}%` }}
                role="slider" aria-label="Start of the part to keep" aria-valuemin={0} aria-valuemax={+duration.toFixed(1)} aria-valuenow={+start.toFixed(1)} aria-valuetext={fmt(start)}
                onPointerDown={onPointerDown('start')} onKeyDown={onKey('start')}><span /></button>
              <button type="button" className="vt-handle" style={{ left: `${pct(end)}%` }}
                role="slider" aria-label="End of the part to keep" aria-valuemin={0} aria-valuemax={+duration.toFixed(1)} aria-valuenow={+end.toFixed(1)} aria-valuetext={fmt(end)}
                onPointerDown={onPointerDown('end')} onKeyDown={onKey('end')}><span /></button>
            </>)}
          </div>

          <div className="vt-row" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button type="button" onClick={togglePlay} disabled={!duration} className="vt-btn" style={{ padding: '8px 12px' }} aria-label={playing ? 'Pause' : 'Play the selection'}>
                {playing
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>}
                {playing ? 'Pause' : 'Play'}
              </button>
              <span style={{ fontSize: 13, color: 'var(--slate)', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(start)} – {fmt(end)} · <strong style={{ color: 'var(--ink)' }}>{(end - start).toFixed(1)}s</strong>
              </span>
            </div>
            {!whole && duration > 0 && (
              <button type="button" onClick={() => { setStart(0); setEnd(duration) }} className="vt-btn" style={{ padding: '8px 12px' }}>Reset</button>
            )}
          </div>

          {error && <p role="alert" style={{ margin: '12px 0 0', fontSize: 13, color: '#b42318' }}>{error}</p>}

          <div className="vt-row" style={{ marginTop: 16 }}>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)' }}>Saves a new video. The original stays as it is.</p>
            <div className="vt-actions" style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={onClose} disabled={saving} className="vt-btn">Cancel</button>
              <button type="button" onClick={save} disabled={saving || !duration || whole} className="vt-btn primary">
                {saving ? 'Saving…' : 'Save trimmed copy'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
