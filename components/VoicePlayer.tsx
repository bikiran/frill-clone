'use client'

import { useEffect, useRef, useState } from 'react'
import { fallbackPeaks, loadPeaks } from '@/lib/audio-peaks'

// The inline voice player used everywhere a recording shows on the web: call
// recordings, voicemails, voice notes, inbox voice messages. Same look as the
// mobile app's AudioWave — coral play button, waveform you tap or drag to jump,
// a 1× / 1.5× / 2× chip once it's playing, and the time. It plays in place (no
// popup dock), and only one recording plays at a time across the page.

const RATES = [1, 1.5, 2]
// Decoded once at a fine resolution, then grouped down to however many bars
// fit (a 3px bar every 5px, like the mobile app), so any width looks right.
const FINE = 192
const BAR_PITCH = 5
function resample(fine: number[], n: number): number[] {
  if (!fine.length || n <= 0) return []
  return Array.from({ length: n }, (_, i) => {
    const a = Math.floor(i * fine.length / n), b = Math.max(a + 1, Math.floor((i + 1) * fine.length / n))
    let m = 0; for (let j = a; j < b; j++) m = Math.max(m, fine[j] || 0)
    return m
  })
}
const fmt = (s: number) => { if (!isFinite(s) || s < 0) s = 0; const m = Math.floor(s / 60), x = Math.floor(s % 60); return `${m}:${String(x).padStart(2, '0')}` }

export default function VoicePlayer({ src, name, durationSec, bare, onPlayStart, style }: {
  src: string
  name?: string
  /** Known length, shown before the file's metadata loads. */
  durationSec?: number
  /** No box of its own — for use inside a card that already has one. */
  bare?: boolean
  onPlayStart?: () => void
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLAudioElement | null>(null)
  const waveRef = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)
  const [fine, setFine] = useState<number[]>(() => fallbackPeaks(src, FINE))
  const [bars, setBars] = useState(36)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [started, setStarted] = useState(false)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(durationSec || 0)
  const [rate, setRate] = useState(1)

  // The file's metadata can load before React attaches onLoadedMetadata (the
  // <audio> is server-rendered), so read the real length once mounted too.
  useEffect(() => {
    const a = ref.current
    if (a && a.readyState >= 1 && isFinite(a.duration) && a.duration > 0) setDur(a.duration)
  }, [src])

  useEffect(() => {
    let live = true
    setFine(fallbackPeaks(src, FINE))
    loadPeaks(src, FINE).then(p => { if (live) setFine(p) })
    return () => { live = false }
  }, [src])

  useEffect(() => {
    const el = waveRef.current; if (!el) return
    const fit = () => setBars(Math.max(12, Math.min(96, Math.floor(el.clientWidth / BAR_PITCH))))
    fit()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])

  const toggle = () => {
    const a = ref.current; if (!a) return
    if (!a.paused) { a.pause(); return }
    // Solo playback: pause every other recording on the page.
    document.querySelectorAll('audio').forEach(o => { if (o !== a && !(o as HTMLAudioElement).paused) (o as HTMLAudioElement).pause() })
    if (!started) { setStarted(true); onPlayStart?.() }
    setFailed(false); setLoading(true)
    a.playbackRate = rate
    const p = a.play()
    if (p && typeof p.catch === 'function') p.catch(err => { if (err?.name !== 'AbortError') { setLoading(false); setFailed(true) } })
  }
  const seekAt = (clientX: number) => {
    const a = ref.current, box = waveRef.current?.getBoundingClientRect()
    if (!a || !box || !dur) return
    const t = Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * dur
    a.currentTime = t; setCur(t)
    if (!started) setStarted(true)
  }
  const cycleRate = () => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length]
    setRate(next); if (ref.current) ref.current.playbackRate = next
  }
  const onKey = (e: React.KeyboardEvent) => {
    const a = ref.current; if (!a || !dur) return
    if (e.key === 'ArrowRight') { e.preventDefault(); a.currentTime = Math.min(dur, a.currentTime + 5) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); a.currentTime = Math.max(0, a.currentTime - 5) }
  }

  const pct = dur ? cur / dur : 0
  const peaks = resample(fine, bars)
  return (
    <div className={`vp${bare ? ' vp-bare' : ''}`} style={style}>
      <audio ref={ref} src={src} preload="metadata" data-inline="" data-name={name || undefined}
        onLoadedMetadata={e => { if (isFinite(e.currentTarget.duration)) setDur(e.currentTarget.duration) }}
        onDurationChange={e => { if (isFinite(e.currentTarget.duration)) setDur(e.currentTarget.duration) }}
        onTimeUpdate={e => { setCur(e.currentTarget.currentTime) }}
        onPlaying={() => { setLoading(false); setPlaying(true) }}
        onPlay={() => setPlaying(true)}
        onPause={() => { setPlaying(false); setLoading(false) }}
        onEnded={() => { setPlaying(false); setCur(0) }}
        onError={e => { if (e.currentTarget.error && started) { setLoading(false); setFailed(true) } }} />
      <button type="button" className="vp-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}>
        {loading && !failed
          ? <span className="vp-spin" />
          : playing
          ? <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>
          : <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}><path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5z"/></svg>}
      </button>
      {failed ? (
        <span className="vp-fail">This browser can’t play this recording. <a href={src} target="_blank" rel="noopener" download={name || true}>Download it</a></span>
      ) : (
        <div ref={waveRef} className="vp-wave" role="slider" tabIndex={0} aria-label={name ? `Seek ${name}` : 'Seek'}
          aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(cur)} aria-valuetext={`${fmt(cur)} of ${fmt(dur)}`}
          onKeyDown={onKey}
          onPointerDown={e => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); seekAt(e.clientX) }}
          onPointerMove={e => { if (dragging.current) seekAt(e.clientX) }}
          onPointerUp={e => { dragging.current = false; try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {} }}
          onPointerCancel={() => { dragging.current = false }}>
          {peaks.map((h, i) => (
            <span key={i} className={`vp-bar${(i + 0.5) / peaks.length <= pct ? ' on' : ''}`} style={{ height: `${Math.round(18 + h * 82)}%` }} />
          ))}
        </div>
      )}
      {started && !failed && (
        <button type="button" className="vp-rate" onClick={cycleRate} title="Playback speed" aria-label={`Playback speed ${rate}×`}>{rate}×</button>
      )}
      {!failed && <span className="vp-time">{started ? `${fmt(cur)} / ${fmt(dur)}` : fmt(dur)}</span>}
      <style>{CSS}</style>
    </div>
  )
}

const CSS = `
.vp{display:flex;align-items:center;gap:10px;min-width:0;background:var(--canvas,#fafafa);border:1px solid var(--border,#f0f0f0);border-radius:12px;padding:8px 10px}
.vp.vp-bare{background:none;border:none;padding:0}
.vp-play{flex-shrink:0;width:34px;height:34px;border-radius:50%;border:none;background:var(--coral,#ff7a6b);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .15s cubic-bezier(.32,.72,0,1)}
.vp-play:active{transform:scale(.92)}
.vp-wave{flex:1;min-width:48px;height:30px;display:flex;align-items:center;justify-content:space-between;gap:2px;overflow:hidden;cursor:pointer;touch-action:none;outline:none;border-radius:6px}
.vp-wave:focus-visible{box-shadow:0 0 0 2px color-mix(in srgb,var(--coral,#ff7a6b) 35%,transparent)}
.vp-bar{flex:0 0 3px;border-radius:2px;background:#d2d2d6;transition:background-color .18s ease}
.vp-bar.on{background:var(--coral,#ff7a6b)}
.vp-rate{flex-shrink:0;border:none;background:var(--peach,#fff4f1);color:var(--coral,#ff7a6b);border-radius:9px;padding:3px 7px;min-width:32px;font-size:11px;font-weight:800;cursor:pointer;font-variant-numeric:tabular-nums}
.vp-time{flex-shrink:0;font-size:12px;font-weight:700;color:var(--slate,#6b6b70);font-variant-numeric:tabular-nums;white-space:nowrap;min-width:34px;text-align:right}
.vp-spin{width:15px;height:15px;border-radius:50%;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;animation:vpSpin .8s linear infinite}
@keyframes vpSpin{to{transform:rotate(360deg)}}
.vp-fail{flex:1;min-width:0;font-size:12px;color:#b45309;line-height:1.35}
.vp-fail a{color:var(--coral,#ff7a6b);font-weight:700}
@media (prefers-reduced-motion: reduce){.vp-bar{transition:none}}
`
