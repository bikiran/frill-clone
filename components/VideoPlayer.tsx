'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

// An Apple-style video player: a big centred play/pause with ∓10s skips, a
// smooth draggable scrubber, and a live thumbnail preview while scrubbing.
// Self-contained — no dependency, works anywhere a video URL is shown.

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}
const ratio = (n: number, d: number) => `${Math.max(0, Math.min(100, d ? (n / d) * 100 : 0))}%`

const circle = (size: number): React.CSSProperties => ({
  width: size, height: size, borderRadius: '50%', border: 'none',
  background: 'rgba(20,20,20,0.42)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
  color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto',
})

function Skip({ dir }: { dir: -1 | 1 }) {
  // Circular arrow with "10". dir -1 = rewind, 1 = forward (mirrored).
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <g transform={dir === 1 ? 'translate(24,0) scale(-1,1)' : undefined} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9a8.5 8.5 0 1 0 2-3.5" />
        <polyline points="3 3 4.6 9 10.5 7.6" />
      </g>
      <text x="12" y="15.5" fontSize="7.5" fontWeight="800" fill="currentColor" textAnchor="middle" fontFamily="-apple-system,system-ui,sans-serif">10</text>
    </svg>
  )
}

export default function VideoPlayer({ src, style, autoPlay = true, poster, ambient = false }: { src: string; style?: React.CSSProperties; autoPlay?: boolean; poster?: string; ambient?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const vRef = useRef<HTMLVideoElement>(null)
  const previewRef = useRef<HTMLVideoElement>(null)
  const bgRef = useRef<HTMLVideoElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<any>(null)

  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [scrubbing, setScrubbing] = useState(false)
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null)
  const [visible, setVisible] = useState(true)
  const [isFs, setIsFs] = useState(false)

  // Track fullscreen so we can fill + centre the video; an inline-flex wrapper
  // otherwise pins a portrait clip to the top-left corner of a black screen.
  useEffect(() => {
    const onFs = () => setIsFs(document.fullscreenElement === wrapRef.current)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  useEffect(() => {
    const v = vRef.current; if (!v) return
    const syncBg = () => { const b = bgRef.current; if (b && Math.abs(b.currentTime - v.currentTime) > 0.3) { try { b.currentTime = v.currentTime } catch {} } }
    const onTime = () => { if (!scrubbing) setCur(v.currentTime); syncBg() }
    const onMeta = () => setDur(v.duration || 0)
    const onPlay = () => { setPlaying(true); const b = bgRef.current; if (b) b.play().catch(() => {}) }
    const onPause = () => { setPlaying(false); const b = bgRef.current; if (b) b.pause() }
    const onProg = () => { try { if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1)) } catch {} }
    v.addEventListener('timeupdate', onTime); v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('durationchange', onMeta); v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause); v.addEventListener('progress', onProg)
    return () => {
      v.removeEventListener('timeupdate', onTime); v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('durationchange', onMeta); v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause); v.removeEventListener('progress', onProg)
    }
  }, [scrubbing])

  const seekTo = useCallback((t: number) => {
    const v = vRef.current; if (!v) return
    const nt = Math.max(0, Math.min(dur || v.duration || 0, t))
    // fastSeek gives a smooth, approximate scrub in Safari/Firefox; fall back
    // to currentTime elsewhere.
    try { if ((v as any).fastSeek) (v as any).fastSeek(nt); else v.currentTime = nt } catch { try { v.currentTime = nt } catch {} }
    setCur(nt)
  }, [dur])

  const toggle = () => { const v = vRef.current; if (!v) return; if (v.paused) v.play().catch(() => {}); else v.pause() }
  const skip = (d: number) => { const v = vRef.current; if (!v) return; seekTo((v.currentTime || 0) + d) }
  const toggleMute = () => {
    const v = vRef.current; if (!v) return
    if (v.muted || v.volume === 0) { v.muted = false; if (v.volume === 0) { v.volume = volume > 0 ? volume : 1; setVolume(v.volume) }; setMuted(false) }
    else { v.muted = true; setMuted(true) }
  }
  const changeVolume = (val: number) => {
    const v = vRef.current; if (!v) return
    v.volume = val; v.muted = val === 0
    setVolume(val); setMuted(val === 0)
  }
  const fullscreen = () => { const el = wrapRef.current as any; if (!el) return; if (document.fullscreenElement) document.exitFullscreen?.(); else el.requestFullscreen?.() }

  const updatePreview = (t: number) => { const pv = previewRef.current; if (!pv) return; try { if ((pv as any).fastSeek) (pv as any).fastSeek(t); else pv.currentTime = t } catch {} }

  const barTimeFromEvent = (clientX: number) => {
    const r = barRef.current!.getBoundingClientRect()
    const p = Math.max(0, Math.min(1, (r.width ? (clientX - r.left) / r.width : 0)))
    const x = Math.max(78, Math.min(r.width - 78, p * r.width))
    return { p, t: p * (dur || 0), x }
  }
  const onBarMove = (e: React.PointerEvent) => {
    if (!barRef.current) return
    const { t, x } = barTimeFromEvent(e.clientX)
    setHover({ x, t }); updatePreview(t)
    if (scrubbing) { setCur(t); seekTo(t) }
  }
  const onBarDown = (e: React.PointerEvent) => {
    if (!barRef.current) return
    setScrubbing(true); try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch {}
    const { t, x } = barTimeFromEvent(e.clientX)
    setCur(t); seekTo(t); updatePreview(t); setHover({ x, t })
  }
  const onBarUp = () => { if (scrubbing) { setScrubbing(false); seekTo(cur) } }
  const onBarLeave = () => { if (!scrubbing) setHover(null) }

  // Auto-hide the chrome a couple seconds after activity while playing.
  const wake = useCallback(() => {
    setVisible(true); clearTimeout(hideTimer.current)
    if (playing) hideTimer.current = setTimeout(() => { if (!scrubbing) setVisible(false) }, 2600)
  }, [playing, scrubbing])
  useEffect(() => { wake(); return () => clearTimeout(hideTimer.current) }, [wake])

  const chromeOn = visible || !playing || scrubbing

  return (
    <div ref={wrapRef} onMouseMove={wake} onMouseLeave={() => { if (playing && !scrubbing) setVisible(false) }}
      style={{ position: 'relative', display: isFs ? 'flex' : 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#000', borderRadius: isFs ? 0 : 8, overflow: 'hidden', cursor: chromeOn ? 'default' : 'none', ...style, ...(isFs ? { width: '100vw', height: '100vh' } : null) }}>
      {/* Ambient backing: a blurred, scaled copy of the video fills the frame so
          letterbox areas glow with the clip's own colours instead of black. */}
      {ambient && (
        <video ref={bgRef} src={src} muted playsInline preload="auto" tabIndex={-1} aria-hidden
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(34px) saturate(1.5)', transform: 'scale(1.25)', zIndex: 0, pointerEvents: 'none' }} />
      )}
      <video ref={vRef} src={src} playsInline autoPlay={autoPlay} poster={poster} onClick={toggle}
        style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', position: 'relative', zIndex: 1, ...style, ...(isFs ? { width: '100%', height: '100%', objectFit: 'contain' } : null) }} />

      {/* Centre transport: rewind 10 · play/pause · forward 10 */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 30, pointerEvents: 'none', opacity: chromeOn ? 1 : 0, transition: 'opacity .25s ease' }}>
        <button title="Back 10 seconds" onClick={() => skip(-10)} style={circle(52)}><Skip dir={-1} /></button>
        <button title={playing ? 'Pause' : 'Play'} onClick={toggle} style={circle(72)}>
          {playing
            ? <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.3" /><rect x="14" y="5" width="4" height="14" rx="1.3" /></svg>
            : <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 3 }}><path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5z" /></svg>}
        </button>
        <button title="Forward 10 seconds" onClick={() => skip(10)} style={circle(52)}><Skip dir={1} /></button>
      </div>

      {/* Bottom chrome: scrubber + controls */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2, padding: '26px 14px 12px', background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent)', opacity: chromeOn ? 1 : 0, transition: 'opacity .25s ease', pointerEvents: chromeOn ? 'auto' : 'none' }}>
        {/* Scrubber */}
        <div style={{ position: 'relative' }}>
          {hover && (
            <div style={{ position: 'absolute', bottom: 22, left: hover.x, transform: 'translateX(-50%)', pointerEvents: 'none', textAlign: 'center' }}>
              <div style={{ width: 152, height: 86, borderRadius: 8, overflow: 'hidden', border: '2px solid rgba(255,255,255,0.85)', background: '#000', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <video ref={previewRef} src={src} muted preload="auto" playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ marginTop: 4, fontSize: 11.5, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.8)', fontVariantNumeric: 'tabular-nums' }}>{fmt(hover.t)}</div>
            </div>
          )}
          <div ref={barRef} onPointerDown={onBarDown} onPointerMove={onBarMove} onPointerUp={onBarUp} onPointerLeave={onBarLeave}
            style={{ position: 'relative', height: 18, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none' }}>
            <div style={{ position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 3, background: 'rgba(255,255,255,0.28)' }} />
            <div style={{ position: 'absolute', left: 0, width: ratio(buffered, dur), height: 4, borderRadius: 3, background: 'rgba(255,255,255,0.45)' }} />
            <div style={{ position: 'absolute', left: 0, width: ratio(cur, dur), height: 4, borderRadius: 3, background: '#fff' }} />
            <div style={{ position: 'absolute', left: ratio(cur, dur), top: '50%', transform: 'translate(-50%,-50%)', width: scrubbing ? 15 : 12, height: scrubbing ? 15 : 12, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 5px rgba(0,0,0,0.55)', transition: 'width .1s, height .1s' }} />
          </div>
        </div>

        {/* Control row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, color: '#fff' }}>
          <button title={playing ? 'Pause' : 'Play'} onClick={toggle} style={barBtn}>
            {playing
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5z" /></svg>}
          </button>
          <button title="Back 10 seconds" onClick={() => skip(-10)} style={barBtn}><Skip dir={-1} /></button>
          <button title="Forward 10 seconds" onClick={() => skip(10)} style={barBtn}><Skip dir={1} /></button>
          <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', opacity: 0.95 }}>{fmt(cur)} / {fmt(dur)}</span>
          <span style={{ flex: 1 }} />
          {/* Volume: mute toggle + a slider (revealed on hover) */}
          <div className="vp-vol" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button title={muted ? 'Unmute' : 'Mute'} onClick={toggleMute} style={barBtn}>
              {muted || volume === 0
                ? <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
                : volume < 0.5
                  ? <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                  : <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>}
            </button>
            <input type="range" min={0} max={1} step={0.02} value={muted ? 0 : volume}
              onChange={e => changeVolume(Number(e.target.value))}
              aria-label="Volume" title="Volume"
              style={{ width: 68, accentColor: '#fff', cursor: 'pointer' }} />
          </div>
          <button title="Fullscreen" onClick={fullscreen} style={barBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}

const barBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }
