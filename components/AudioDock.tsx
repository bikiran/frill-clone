'use client'

import { useEffect, useRef, useState } from 'react'

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

export default function AudioDock() {
  const [el, setEl] = useState<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)
  const [name, setName] = useState('')
  const [visible, setVisible] = useState(false)
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
      setEl(a); setName(resolveName(a)); setDur(a.duration || 0); setCur(a.currentTime); setPlaying(true); setVisible(true)
    }
    document.addEventListener('play', onPlay, true)
    return () => document.removeEventListener('play', onPlay, true)
  }, [])

  useEffect(() => {
    if (!el) return
    const onTime = () => setCur(el.currentTime)
    const onDur = () => setDur(el.duration || 0)
    const onPause = () => setPlaying(false)
    const onPlay = () => setPlaying(true)
    const onEnded = () => { setPlaying(false); setCur(0); hideT.current = setTimeout(() => setVisible(false), 5000) }
    el.addEventListener('timeupdate', onTime); el.addEventListener('durationchange', onDur)
    el.addEventListener('pause', onPause); el.addEventListener('play', onPlay); el.addEventListener('ended', onEnded)
    return () => {
      el.removeEventListener('timeupdate', onTime); el.removeEventListener('durationchange', onDur)
      el.removeEventListener('pause', onPause); el.removeEventListener('play', onPlay); el.removeEventListener('ended', onEnded)
    }
  }, [el])

  if (!visible || !el) return null
  const toggle = () => { if (el.paused) el.play().catch(() => {}); else el.pause() }
  const pct = dur ? (cur / dur) * 100 : 0
  const seek = (t: number) => { setCur(t); if (el) el.currentTime = t }

  return (
    <div ref={boxRef} className="ad-wrap">
      <div className="ad-pill">
        <button onClick={toggle} title={playing ? 'Pause' : 'Play'} aria-label={playing ? 'Pause' : 'Play'} className="ad-play">
          {playing
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}><path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5z"/></svg>}
        </button>

        <span className="ad-meta">
          <span className="ad-name">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--coral,#ff7a6b)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            <span className="ad-title">{name}</span>
          </span>
          {/* Phones: time under the name. */}
          <span className="ad-time ad-time-sm">{fmt(cur)} / {fmt(dur)}</span>
        </span>

        {/* Seek bar: inline on wider screens, a thin line along the bottom on phones. */}
        <div className="ad-seek">
          <div className="ad-track" />
          <div className="ad-fill" style={{ width: `${pct}%` }} />
          <input type="range" min={0} max={dur || 0} step={0.1} value={cur} aria-label="Seek"
            onChange={e => seek(Number(e.target.value))} />
        </div>

        <span className="ad-time ad-time-lg">{fmt(cur)} / {fmt(dur)}</span>

        <button onClick={() => { el.pause(); setVisible(false) }} title="Close" aria-label="Close player" className="ad-close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <style>{CSS}</style>
    </div>
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
.ad-seek input{position:absolute;left:0;right:0;width:100%;margin:0;appearance:none;-webkit-appearance:none;background:transparent;height:18px;cursor:pointer;accent-color:var(--coral,#ff7a6b)}
.ad-close{flex-shrink:0;background:none;border:none;color:var(--slate,#6b7280);cursor:pointer;display:flex;padding:4px;border-radius:50%}
@media (max-width: 560px){
  .ad-pill{gap:10px;padding:9px 8px 11px 9px;border-radius:22px}
  .ad-meta{flex:1 1 auto}
  .ad-time-sm{display:block}
  .ad-time-lg{display:none}
  /* Thin progress line along the bottom edge, still draggable. */
  .ad-seek{position:absolute;left:14px;right:14px;bottom:3px;height:14px;min-width:0}
  .ad-track,.ad-fill{height:3px;bottom:5px}
  .ad-seek input{height:14px}
}
@media (prefers-reduced-motion: reduce){.ad-wrap{animation:none}.ad-fill{transition:none}}
`
