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

        {/* Seek bar: inline on wider screens, a thin line along the bottom on phones. */}
        {!failed && <div className="ad-seek">
          <div className="ad-track" />
          <div className="ad-fill" style={{ width: `${pct}%` }} />
          <div className="ad-knob" style={{ left: `${pct}%` }} />
          <input type="range" min={0} max={dur || 0} step={0.1} value={cur} aria-label="Seek"
            onChange={e => seek(Number(e.target.value))} />
        </div>}

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
.ad-seek{position:relative;flex:1;height:18px;display:flex;align-items:center;min-width:60px}
.ad-track{position:absolute;left:0;right:0;height:5px;border-radius:3px;background:#e9ebf0}
.ad-fill{position:absolute;left:0;height:5px;border-radius:3px;background:var(--coral,#ff7a6b);transition:width .25s linear}
.ad-knob{position:absolute;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#fff;border:2px solid var(--coral,#ff7a6b);box-shadow:0 1px 3px rgba(0,0,0,.18);pointer-events:none;transition:left .25s linear,transform .15s ease}
.ad-seek:hover .ad-knob,.ad-seek:active .ad-knob{transform:scale(1.2)}
.ad-seek input{position:absolute;left:0;right:0;width:100%;margin:0;appearance:none;-webkit-appearance:none;background:transparent;height:18px;cursor:pointer}
.ad-seek input::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:24px;height:24px;opacity:0;cursor:pointer}
.ad-seek input::-moz-range-thumb{width:24px;height:24px;opacity:0;border:none;cursor:pointer}
.ad-seek input::-webkit-slider-runnable-track{background:transparent}
.ad-seek input::-moz-range-track{background:transparent}
.ad-spin{width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;animation:adSpin .8s linear infinite}
@keyframes adSpin{to{transform:rotate(360deg)}}
.ad-fail{display:block;font-size:11.5px;color:#b45309;margin-top:1px;white-space:normal;line-height:1.35}
.ad-fail button{border:none;background:none;padding:0;color:var(--coral,#ff7a6b);font:inherit;font-weight:700;cursor:pointer;text-decoration:underline}
.ad-close{flex-shrink:0;background:none;border:none;color:var(--slate,#6b7280);cursor:pointer;display:flex;padding:4px;border-radius:50%}
@media (max-width: 560px){
  .ad-pill{gap:10px;padding:9px 8px 17px 9px;border-radius:22px}
  .ad-meta{flex:1 1 auto}
  .ad-time-sm{display:block}
  .ad-time-lg{display:none}
  /* Thin progress line along the bottom edge, still draggable. */
  .ad-seek{position:absolute;left:18px;right:18px;bottom:4px;height:14px;min-width:0}
  .ad-track,.ad-fill{height:3px;border-radius:2px}
  .ad-knob{width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-width:1.5px}
  .ad-seek input{height:22px;top:-4px}
}
@media (prefers-reduced-motion: reduce){.ad-wrap{animation:none}.ad-fill,.ad-knob{transition:none}}
`
