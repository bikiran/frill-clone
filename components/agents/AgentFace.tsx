'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import AiBuddy from '@/components/AiBuddy'
import { authFetch } from '@/lib/auth-fetch'
import { BUDDY_SHAPES, BUDDY_SHAPE_LABEL } from '@/lib/buddy-shapes'
import { hexToHue, hueToHex, type AgentFace as Face } from '@/lib/agent-faces'

// An AI agent's face (lib/agent-faces): its photo if it has one, else Colvy
// AI's mascot in the agent's shape and colour.
export default function AgentFace({ face, size = 40 }: { face: Face; size?: number }) {
  if (face.photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={face.photo} alt="" width={size} height={size} draggable={false}
        style={{ width: size, height: size, borderRadius: '32%', objectFit: 'cover', display: 'block', flexShrink: 0, boxShadow: `0 0 0 2px #fff, 0 0 0 ${size > 30 ? 4 : 3}px ${face.color}` }} />
    )
  }
  return <AiBuddy size={size} color={face.color} shape={face.shape} />
}

/**
 * The face picker (Sellio-style): pick a shape, slide the colour, or upload a
 * photo. Opens under the button that opened it (a sheet from the bottom on
 * phones). Every change is handed to onChange straight away; the page saves.
 */
export function FacePicker({ name, face, anchor, companyId, onChange, onReset, onClose }: {
  name: string
  face: Face
  anchor: HTMLElement | null
  companyId: string | null
  onChange: (face: Face) => void
  /** Back to the agent's own shape and colour. */
  onReset: () => void
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [sheet, setSheet] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)

  // Under the face, kept on screen; a bottom sheet on narrow screens.
  useLayoutEffect(() => {
    const place = () => {
      const narrow = window.innerWidth < 560
      setSheet(narrow)
      if (narrow || !anchor || !panel.current) return
      const r = anchor.getBoundingClientRect(), w = panel.current.offsetWidth, h = panel.current.offsetHeight
      const left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12))
      let top = r.bottom + 10
      if (top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - 10)
      setPos({ top, left })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchor])

  // Closes on Escape, a click outside, or the page scrolling away from it.
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); anchor?.focus() } }
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (panel.current?.contains(t) || anchor?.contains(t)) return
      onClose()
    }
    const scroll = (e: Event) => { if (!sheet && !panel.current?.contains(e.target as Node)) onClose() }
    document.addEventListener('keydown', key)
    document.addEventListener('pointerdown', down)
    window.addEventListener('scroll', scroll, true)
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', down); window.removeEventListener('scroll', scroll, true) }
  }, [anchor, onClose, sheet])

  // Focus the chosen shape when it opens.
  useEffect(() => { panel.current?.querySelector<HTMLButtonElement>('.fp-shape.on')?.focus() }, [])

  const upload = async (file: File | undefined) => {
    if (!file || !companyId) return
    if (!file.type.startsWith('image/')) { setErr('Pick a picture (JPG, PNG or WebP).'); return }
    setUploading(true); setErr('')
    try {
      const { compressImage } = await import('@/lib/upload-attachment')
      const fd = new FormData()
      fd.append('file', await compressImage(file))
      fd.append('prefix', `media-gallery/${companyId}/agents`)
      const r = await authFetch('/api/storage/put', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j?.url) throw new Error(j?.error || 'That picture couldn’t be uploaded.')
      onChange({ ...face, photo: j.url })
    } catch (e: any) { setErr(e?.message || 'That picture couldn’t be uploaded.') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  return (
    <>
      <style>{FP_CSS}</style>
      {sheet && <div className="fp-scrim" onClick={onClose} aria-hidden="true" />}
      <div ref={panel} className={`fp${sheet ? ' sheet' : ''}`} role="dialog" aria-label={`${name}’s look`}
        style={sheet ? undefined : pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }}>
        <div className="fp-head">
          <span className="fp-preview"><AgentFace face={face} size={44} /></span>
          <div className="fp-who"><b>{name}</b><span>Shape, colour or a photo</span></div>
          <button type="button" className="fp-x" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <p className="fp-label">Shape</p>
        <div className="fp-shapes" role="radiogroup" aria-label="Shape">
          {BUDDY_SHAPES.map(s => {
            const on = !face.photo && face.shape === s
            return (
              <button key={s} type="button" role="radio" aria-checked={on} aria-label={BUDDY_SHAPE_LABEL[s]} className={`fp-shape${on ? ' on' : ''}`}
                onClick={() => onChange({ shape: s, color: face.color, photo: null })}>
                <AiBuddy size={40} color={face.color} shape={s} />
              </button>
            )
          })}
        </div>

        <p className="fp-label">Colour</p>
        <HueSlider value={hexToHue(face.color)} onChange={h => onChange({ ...face, color: hueToHex(h) })} />

        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => upload(e.target.files?.[0])} />
        <div className="fp-actions">
          <button type="button" className="fp-btn" onClick={() => fileRef.current?.click()} disabled={uploading || !companyId}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5" /><path d="M5 15v3a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-3" /></svg>
            {uploading ? 'Uploading…' : face.photo ? 'Change photo' : 'Upload photo'}
          </button>
          {face.photo && <button type="button" className="fp-btn ghost" onClick={() => onChange({ shape: face.shape, color: face.color, photo: null })}>Remove photo</button>}
        </div>
        {err && <p className="fp-err" role="alert">{err}</p>}
        <p className="fp-note">Changes save right away. <button type="button" onClick={onReset}>Reset to default</button></p>
      </div>
    </>
  )
}

// A rainbow track with a round white thumb. Drag, tap, or use the arrow keys.
function HueSlider({ value, onChange }: { value: number; onChange: (hue: number) => void }) {
  const track = useRef<HTMLDivElement | null>(null)
  const drag = useRef(false)
  const at = (clientX: number) => {
    const r = track.current!.getBoundingClientRect()
    return Math.round(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * 359)
  }
  return (
    <div ref={track} className="fp-hue" role="slider" tabIndex={0} aria-label="Colour" aria-valuemin={0} aria-valuemax={359} aria-valuenow={value}
      onPointerDown={e => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); onChange(at(e.clientX)) }}
      onPointerMove={e => { if (drag.current) onChange(at(e.clientX)) }}
      onPointerUp={() => { drag.current = false }}
      onPointerCancel={() => { drag.current = false }}
      onKeyDown={e => {
        const step = e.shiftKey ? 30 : 6
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onChange((value + step) % 360) }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onChange((value - step + 360) % 360) }
      }}>
      <span className="fp-thumb" style={{ left: `${(value / 359) * 100}%`, background: hueToHex(value) }} />
    </div>
  )
}

const FP_CSS = `
.fp{position:fixed;z-index:1200;width:348px;max-width:calc(100vw - 24px);background:#fff;border-radius:22px;padding:16px 18px 14px;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 24px 60px -12px rgba(16,24,40,.28);animation:fpIn .22s cubic-bezier(.22,1,.36,1) both}
.fp.sheet{left:0;right:0;bottom:0;top:auto;width:auto;max-width:none;border-radius:24px 24px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom));animation:fpUp .3s cubic-bezier(.22,1,.36,1) both}
.fp-scrim{position:fixed;inset:0;z-index:1199;background:rgba(15,15,20,.32);animation:fpFade .2s ease both}
.fp button::before{display:none!important}
.fp-head{display:flex;align-items:center;gap:12px;margin-bottom:6px}
.fp-preview{display:inline-flex}
.fp-who{display:flex;flex-direction:column;min-width:0;flex:1;line-height:1.25}
.fp-who b{font-size:15px;color:#111;letter-spacing:-.01em}
.fp-who span{font-size:12.5px;color:#8e8e93}
.fp-x{width:30px;height:30px;border-radius:50%;border:none;background:#f4f4f5;color:#52525b;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0}
.fp-x:hover{background:#ececef}
.fp-label{margin:14px 0 8px;font-size:13.5px;font-weight:650;color:#111}
.fp-shapes{display:grid;grid-template-columns:repeat(6,1fr);gap:4px}
.fp-shape{aspect-ratio:1;border-radius:14px;border:none;background:transparent;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;transition:background .15s,box-shadow .15s,transform .2s cubic-bezier(.34,1.56,.64,1)}
.fp-shape:hover{background:#f4f4f5;transform:scale(1.06)}
.fp-shape.on{box-shadow:inset 0 0 0 2px #a1a1aa;background:#fafafa}
.fp-shape:focus-visible{outline:none;box-shadow:inset 0 0 0 2px #ff6a4d}
.fp-shape .aib{width:82%!important;height:82%!important}
.fp-hue{position:relative;height:30px;border-radius:999px;cursor:pointer;touch-action:none;background:linear-gradient(90deg,hsl(0,82%,56%),hsl(60,82%,56%),hsl(120,82%,56%),hsl(180,82%,56%),hsl(240,82%,56%),hsl(300,82%,56%),hsl(359,82%,56%));box-shadow:inset 0 0 0 1px rgba(0,0,0,.06)}
.fp-hue:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(255,106,77,.35)}
.fp-thumb{position:absolute;top:50%;width:30px;height:30px;border-radius:50%;transform:translate(-50%,-50%);border:4px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.25);pointer-events:none}
.fp-actions{display:flex;gap:8px;margin-top:16px}
.fp-btn{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:8px;height:42px;border-radius:999px;border:1.5px solid #e4e4e7;background:#fff;color:#111;font-size:14px;font-weight:600;cursor:pointer}
.fp-btn:hover{background:#fafafa}
.fp-btn.ghost{flex:0 0 auto;padding:0 14px;color:#b42318;border-color:#fde2e0}
.fp-btn:disabled{opacity:.6;cursor:default}
.fp-err{margin:8px 0 0;font-size:12.5px;color:#b42318}
.fp-note{margin:12px 0 0;text-align:center;font-size:12.5px;color:#8e8e93}
.fp-note button{border:none;background:none;padding:0;color:#52525b;font:inherit;font-weight:600;text-decoration:underline;cursor:pointer}
@keyframes fpIn{from{opacity:0;transform:translateY(-6px) scale(.97)}to{opacity:1;transform:none}}
@keyframes fpUp{from{transform:translateY(100%)}to{transform:none}}
@keyframes fpFade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.fp,.fp.sheet,.fp-scrim{animation:none}.fp-shape{transition:none}}
`
