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

  return (
    <div style={{ position: 'fixed', left: '50%', bottom: 18, transform: 'translateX(-50%)', zIndex: 900, width: 'min(680px, calc(100vw - 24px))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 999, background: '#fff', border: '1px solid var(--border,#e5e7eb)', boxShadow: '0 12px 34px rgba(0,0,0,0.16)' }}>
        <button onClick={toggle} title={playing ? 'Pause' : 'Play'}
          style={{ flexShrink: 0, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'var(--coral,#ff7a6b)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {playing
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}><path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5z"/></svg>}
        </button>

        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, maxWidth: 200, minWidth: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--coral,#ff7a6b)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink,#1a1a1a)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
        </span>

        {/* Seek bar */}
        <div style={{ position: 'relative', flex: 1, height: 18, display: 'flex', alignItems: 'center', minWidth: 60 }}>
          <div style={{ position: 'absolute', left: 0, right: 0, height: 5, borderRadius: 3, background: '#e9ebf0' }} />
          <div style={{ position: 'absolute', left: 0, width: `${pct}%`, height: 5, borderRadius: 3, background: 'var(--coral,#ff7a6b)' }} />
          <input type="range" min={0} max={dur || 0} step={0.1} value={cur}
            onChange={e => { const t = Number(e.target.value); setCur(t); if (el) el.currentTime = t }}
            style={{ position: 'absolute', left: 0, right: 0, width: '100%', margin: 0, appearance: 'none', WebkitAppearance: 'none', background: 'transparent', height: 18, cursor: 'pointer', accentColor: 'var(--coral,#ff7a6b)' }} />
        </div>

        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--slate,#6b7280)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmt(cur)} / {fmt(dur)}</span>

        <button onClick={() => { el.pause(); setVisible(false) }} title="Close" style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--slate,#6b7280)', cursor: 'pointer', display: 'flex', padding: 3 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
  )
}
