'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// A single, fancy "now playing" dock pinned to the bottom of the screen. It
// hooks EVERY <audio> on the page (capture-phase play event), so it works for
// inline voice notes in a note body, the Voice-notes section, and the public
// shared note — without hydrating contentEditable. Playing one pauses the rest.
const fmt = (s: number) => { if (!isFinite(s) || s < 0) s = 0; const m = Math.floor(s / 60), x = Math.floor(s % 60); return `${m}:${String(x).padStart(2, '0')}` }

function resolveName(a: HTMLAudioElement): string {
  const dn = a.getAttribute('data-name'); if (dn) return dn
  const lbl = (a.closest('.rte-voice') as HTMLElement | null)?.querySelector('.rte-voice-lbl')?.textContent?.trim()
  if (lbl) return lbl
  try { const f = decodeURIComponent(new URL(a.src).pathname.split('/').pop() || ''); return f.replace(/^\d{10,}-/, '') || 'Audio' } catch { return 'Audio' }
}

// Waveform bars for the dock, decoded from the recording itself (cached per
// URL). If the file can't be fetched or decoded here, a steady pseudo-wave
// seeded from the URL stands in, so the dock always has a waveform to scrub.
const BARS = 56
const peaksCache = new Map<string, Promise<number[]>>()
function fallbackPeaks(src: string): number[] {
  let h = 2166136261
  for (let i = 0; i < src.length; i++) h = Math.imul(h ^ src.charCodeAt(i), 16777619)
  return Array.from({ length: BARS }, (_, i) => {
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    const r = ((h >>> 0) % 1000) / 1000
    return 0.25 + 0.55 * Math.abs(Math.sin(i * 0.45)) * (0.55 + 0.45 * r)
  })
}
function loadPeaks(src: string): Promise<number[]> {
  if (!src) return Promise.resolve(fallbackPeaks('x'))
  const hit = peaksCache.get(src); if (hit) return hit
  const job = (async () => {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AC) throw new Error('no audio context')
    const buf = await (await fetch(src)).arrayBuffer()
    const ctx = new AC()
    try {
      const audio: AudioBuffer = await new Promise((res, rej) => { const p = ctx.decodeAudioData(buf, res, rej); if (p?.then) p.then(res, rej) })
      const data = audio.getChannelData(0)
      const step = Math.max(1, Math.floor(data.length / BARS))
      const out: number[] = []
      for (let b = 0; b < BARS; b++) {
        let sum = 0, n = 0
        for (let i = b * step; i < Math.min(data.length, (b + 1) * step); i += 16) { sum += data[i] * data[i]; n++ }
        out.push(Math.sqrt(sum / Math.max(1, n)))
      }
      const max = Math.max(...out, 1e-4)
      return out.map(v => 0.14 + 0.86 * Math.min(1, v / max))
    } finally { try { ctx.close() } catch {} }
  })().catch(() => fallbackPeaks(src))
  peaksCache.set(src, job)
  return job
}

/**
 * Play a voice note through the dock. The dock opens straight away (with a
 * spinner while it loads) and, if this browser can't play the recording,
 * says so and offers the download instead of silently doing nothing.
 */
export function playAudio(a: HTMLAudioElement | null | undefined) {
  if (!a) return
  document.dispatchEvent(new CustomEvent('colvy-audio-request', { detail: a }))
  a.play().catch(err => {
    if (err?.name === 'AbortError') return  // paused/replaced before it started
    document.dispatchEvent(new CustomEvent('colvy-audio-failed', { detail: a }))
  })
}

export default function AudioDock() {
  const [el, setEl] = useState<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)
  const [name, setName] = useState('')
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [peaks, setPeaks] = useState<number[]>([])
  const waveRef = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)
  const hideT = useRef<any>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)

  // While the dock is up, publish its height so floating buttons (the chat
  // bubble) can sit above it instead of on top of it.
  useEffect(() => {
    const root = document.documentElement
    if (!visible || !boxRef.current) { root.style.removeProperty('--audio-dock-h'); return }
    const node = boxRef.current
    const set = () => root.style.setProperty('--audio-dock-h', `${Math.ceil(node.getBoundingClientRect().height) + 14}px`)
    set()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null
    ro?.observe(node)
    return () => { ro?.disconnect(); root.style.removeProperty('--audio-dock-h') }
  }, [visible, el])

  useEffect(() => {
    const onPlay = (e: Event) => {
      const a = e.target as HTMLAudioElement
      if (!(a instanceof HTMLAudioElement)) return
      // Solo playback — pause any other audio.
      document.querySelectorAll('audio').forEach(o => { if (o !== a && !(o as HTMLAudioElement).paused) (o as HTMLAudioElement).pause() })
      clearTimeout(hideT.current)
      setEl(a); setName(resolveName(a)); setDur(a.duration || 0); setCur(a.currentTime); setPlaying(true); setVisible(true); setFailed(false)
    }
    // Open the dock the moment Play is pressed, before the audio has loaded.
    const onRequest = (e: Event) => {
      const a = (e as CustomEvent).detail as HTMLAudioElement
      if (!(a instanceof HTMLAudioElement)) return
      clearTimeout(hideT.current)
      setEl(a); setName(resolveName(a)); setDur(a.duration || 0); setCur(a.currentTime); setVisible(true); setFailed(false); setLoading(true)
    }
    const onFailed = (e: Event) => {
      const a = (e as CustomEvent).detail as HTMLAudioElement
      if (!(a instanceof HTMLAudioElement)) return
      setEl(a); setName(resolveName(a)); setVisible(true); setLoading(false); setPlaying(false); setFailed(true)
    }
    document.addEventListener('play', onPlay, true)
    document.addEventListener('colvy-audio-request', onRequest)
    document.addEventListener('colvy-audio-failed', onFailed)
    return () => {
      document.removeEventListener('play', onPlay, true)
      document.removeEventListener('colvy-audio-request', onRequest)
      document.removeEventListener('colvy-audio-failed', onFailed)
    }
  }, [])

  useEffect(() => {
    if (!el) return
    const src = el.currentSrc || el.src
    let live = true
    setPeaks(fallbackPeaks(src))
    loadPeaks(src).then(p => { if (live) setPeaks(p) })
    return () => { live = false }
  }, [el])

  useEffect(() => {
    if (!el) return
    const onTime = () => { setCur(el.currentTime); if (el.currentTime > 0) setLoading(false) }
    const onDur = () => setDur(el.duration || 0)
    const onPause = () => setPlaying(false)
    const onPlay = () => setPlaying(true)
    const onPlaying = () => { setLoading(false); setFailed(false) }
    const onErr = () => { if (el.error) { setLoading(false); setPlaying(false); setFailed(true) } }
    const onEnded = () => { setPlaying(false); setCur(0); hideT.current = setTimeout(() => setVisible(false), 5000) }
    el.addEventListener('timeupdate', onTime); el.addEventListener('durationchange', onDur)
    el.addEventListener('pause', onPause); el.addEventListener('play', onPlay); el.addEventListener('ended', onEnded)
    el.addEventListener('playing', onPlaying); el.addEventListener('error', onErr)
    if (!el.paused && (el.readyState >= 3 || el.currentTime > 0)) setLoading(false)
    return () => {
      el.removeEventListener('playing', onPlaying); el.removeEventListener('error', onErr)
      el.removeEventListener('timeupdate', onTime); el.removeEventListener('durationchange', onDur)
      el.removeEventListener('pause', onPause); el.removeEventListener('play', onPlay); el.removeEventListener('ended', onEnded)
    }
  }, [el])

  if (!visible || !el || !mounted) return null
  const toggle = () => { if (el.paused) playAudio(el); else el.pause() }
  const download = () => {
    const link = document.createElement('a')
    link.href = el.currentSrc || el.src; link.download = name.replace(/[^\w.\- ]+/g, '_'); link.target = '_blank'
    document.body.appendChild(link); link.click(); link.remove()
  }
  const pct = dur ? (cur / dur) * 100 : 0
  const seek = (t: number) => { setCur(t); if (el) el.currentTime = t }
  const seekAt = (clientX: number) => {
    const box = waveRef.current?.getBoundingClientRect(); if (!box || !dur) return
    seek(Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * dur)
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); seek(Math.min(dur, cur + 5)) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(Math.max(0, cur - 5)) }
  }

  // Rendered on <body>: inside an animated/transformed page wrapper a
  // position:fixed element is pinned to that wrapper instead of the screen,
  // which left the dock off-screen on the web admin.
  return createPortal(
    <div ref={boxRef} className="ad-wrap">
      <div className="ad-pill">
        <button onClick={toggle} title={playing ? 'Pause' : 'Play'} aria-label={playing ? 'Pause' : 'Play'} className="ad-play">
          {loading && !failed
            ? <span className="ad-spin" />
            : playing
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}><path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5z"/></svg>}
        </button>

        <span className="ad-meta">
          <span className="ad-name">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--coral,#ff7a6b)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            <span className="ad-title">{name}</span>
          </span>
          {failed
            ? <span className="ad-fail">This browser can’t play this recording. <button type="button" onClick={download}>Download it</button></span>
            : <span className="ad-time ad-time-sm">{fmt(cur)} / {fmt(dur)}</span>}
        </span>

        {/* Waveform — tap or drag anywhere on it to jump. Inline on wider
            screens, its own full-width row on phones. */}
        {!failed && (
          <div ref={waveRef} className="ad-wave" role="slider" tabIndex={0} aria-label="Seek"
            aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(cur)} aria-valuetext={`${fmt(cur)} of ${fmt(dur)}`}
            onKeyDown={onKey}
            onPointerDown={e => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); seekAt(e.clientX) }}
            onPointerMove={e => { if (dragging.current) seekAt(e.clientX) }}
            onPointerUp={e => { dragging.current = false; try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {} }}
            onPointerCancel={() => { dragging.current = false }}>
            {peaks.map((h, i) => (
              <span key={i} className={`ad-bar${(i + 0.5) / peaks.length * 100 <= pct ? ' on' : ''}`}
                style={{ height: `${Math.round(h * 100)}%` }} />
            ))}
          </div>
        )}

        {!failed && <span className="ad-time ad-time-lg">{fmt(cur)} / {fmt(dur)}</span>}

        <button onClick={() => { el.pause(); setVisible(false) }} title="Close" aria-label="Close player" className="ad-close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <style>{CSS}</style>
    </div>,
    document.body,
  )
}

const CSS = `
.ad-wrap{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:900;width:min(680px,calc(100vw - 24px));animation:adIn .42s cubic-bezier(.32,.72,0,1) both}
@keyframes adIn{from{opacity:0;transform:translate(-50%,18px)}to{opacity:1;transform:translate(-50%,0)}}
.ad-pill{position:relative;display:flex;align-items:center;gap:12px;padding:10px 12px 10px 10px;border-radius:999px;background:rgba(255,255,255,.92);backdrop-filter:saturate(180%) blur(18px);-webkit-backdrop-filter:saturate(180%) blur(18px);border:1px solid var(--border,#e5e7eb);box-shadow:0 12px 34px rgba(0,0,0,.16);overflow:hidden}
.ad-play{flex-shrink:0;width:38px;height:38px;border-radius:50%;border:none;background:var(--coral,#ff7a6b);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .15s cubic-bezier(.32,.72,0,1)}
.ad-play:active{transform:scale(.92)}
.ad-meta{display:flex;flex-direction:column;justify-content:center;min-width:0;flex:0 1 220px}
.ad-name{display:inline-flex;align-items:center;gap:6px;min-width:0}
.ad-title{font-size:12.5px;font-weight:700;color:var(--ink,#1a1a1a);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.ad-time{font-size:11.5px;font-weight:600;color:var(--slate,#6b7280);font-variant-numeric:tabular-nums;flex-shrink:0;white-space:nowrap}
.ad-time-sm{display:none;margin-top:1px;font-size:11px}
.ad-wave{position:relative;flex:1;height:30px;min-width:80px;display:flex;align-items:center;gap:2px;cursor:pointer;touch-action:none;outline:none;border-radius:6px}
.ad-wave:focus-visible{box-shadow:0 0 0 2px color-mix(in srgb,var(--coral,#ff7a6b) 35%,transparent)}
.ad-bar{flex:1;min-width:2px;max-width:4px;border-radius:2px;background:#d9dce3;transition:background-color .2s ease,transform .2s cubic-bezier(.32,.72,0,1);transform-origin:center}
.ad-bar.on{background:var(--coral,#ff7a6b)}
@media (hover:hover){.ad-wave:hover .ad-bar{transform:scaleY(1.08)}}
.ad-spin{width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;animation:adSpin .8s linear infinite}
@keyframes adSpin{to{transform:rotate(360deg)}}
.ad-fail{display:block;font-size:11.5px;color:#b45309;margin-top:1px;white-space:normal;line-height:1.35}
.ad-fail button{border:none;background:none;padding:0;color:var(--coral,#ff7a6b);font:inherit;font-weight:700;cursor:pointer;text-decoration:underline}
.ad-close{flex-shrink:0;background:none;border:none;color:var(--slate,#6b7280);cursor:pointer;display:flex;padding:4px;border-radius:50%}
@media (max-width: 560px){
  .ad-pill{gap:10px;border-radius:22px}
  .ad-meta{flex:1 1 auto}
  .ad-time-sm{display:block}
  .ad-time-lg{display:none}
  /* Waveform gets its own full-width row under the controls. */
  .ad-pill{flex-wrap:wrap;row-gap:6px;padding:9px 10px 10px 9px}
  .ad-wave{order:5;flex:1 1 100%;height:26px;min-width:0;padding:0 4px}
}
@media (prefers-reduced-motion: reduce){.ad-wrap{animation:none}.ad-bar{transition:none}}
`
