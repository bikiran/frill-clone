'use client'

// The floor plan drawing, shared by the live view and the layout editor
// (app/admin/reservations/floor). Tables sit on a grid of squares (x, y, w, h
// in squares, saved on restaurant_tables); the square size follows the space
// available, so the same plan fits a laptop and a phone (which scrolls it
// sideways inside its own box). In the editor, tables drag and resize with a
// mouse, a finger or the arrow keys, snapping to half squares.

import { useEffect, useRef, useState } from 'react'

export type FTable = {
  id: string; area_id: string | null; label: string; min_party: number; max_party: number
  x: number; y: number; w: number; h: number; shape: 'rect' | 'round'; rotation?: number
  combinable: boolean; online: boolean; unavailable_until: string | null; unavailable_note?: string | null
}

const SNAP = 0.5
const snap = (n: number) => Math.round(n / SNAP) * SNAP

/** Chairs around a table: for a round one evenly round it, for a long one along the long sides. */
function chairs(t: FTable): { left: string; top: string }[] {
  const n = Math.min(12, Math.max(1, t.max_party))
  const out: { left: string; top: string }[] = []
  if (t.shape === 'round') {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2
      out.push({ left: `${50 + Math.cos(a) * 62}%`, top: `${50 + Math.sin(a) * 62}%` })
    }
    return out
  }
  const wide = t.w >= t.h
  if (n <= 2 && !wide) { out.push({ left: '50%', top: '-12%' }, { left: '50%', top: '112%' }); return out.slice(0, n) }
  if (n <= 2) { out.push({ left: '-12%', top: '50%' }, { left: '112%', top: '50%' }); return out.slice(0, n) }
  const a = Math.ceil(n / 2), b = n - a
  for (let i = 0; i < a; i++) {
    const p = `${((i + 0.5) / a) * 100}%`
    out.push(wide ? { left: p, top: '-14%' } : { left: '-14%', top: p })
  }
  for (let i = 0; i < b; i++) {
    const p = `${((i + 0.5) / b) * 100}%`
    out.push(wide ? { left: p, top: '114%' } : { left: '114%', top: p })
  }
  return out
}

export default function FloorCanvas({ tables, edit, selected, highlight, onTap, onMove, onResize, render, tone, minCols = 20, minRows = 12, label }: {
  tables: FTable[]
  edit?: boolean
  selected?: string[]
  /** Tables to ring (free for the booking being placed, or in the hovered combination). */
  highlight?: string[]
  onTap?: (t: FTable, e: { shift: boolean }) => void
  onMove?: (id: string, x: number, y: number) => void
  onResize?: (id: string, w: number, h: number) => void
  /** What's written on the table (the live view: who's there, who's next). */
  render?: (t: FTable) => React.ReactNode
  /** A class for the table's state (free, seated, booked, late, out). */
  tone?: (t: FTable) => string
  minCols?: number; minRows?: number
  label: string
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 800))
    ro.observe(el)
    setWidth(el.clientWidth || 800)
    return () => ro.disconnect()
  }, [])
  const extentX = Math.max(0, ...tables.map(t => t.x + t.w))
  const extentY = Math.max(0, ...tables.map(t => t.y + t.h))
  const cols = Math.max(minCols, Math.ceil(extentX) + (edit ? 4 : 1))
  const rows = Math.max(minRows, Math.ceil(extentY) + (edit ? 3 : 1))
  // A square is 22–44px: the plan fills the width, and a phone scrolls a bigger plan sideways.
  const cell = Math.max(22, Math.min(44, Math.floor((width - 2) / cols)))

  // Dragging: where the pointer started and the table's place then.
  const drag = useRef<{ id: string; kind: 'move' | 'size'; px: number; py: number; x: number; y: number; w: number; h: number; moved: boolean } | null>(null)
  const down = (e: React.PointerEvent, t: FTable, kind: 'move' | 'size') => {
    if (!edit) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    drag.current = { id: t.id, kind, px: e.clientX, py: e.clientY, x: t.x, y: t.y, w: t.w, h: t.h, moved: false }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.px) / cell, dy = (e.clientY - d.py) / cell
    if (!d.moved && Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15) return
    d.moved = true
    if (d.kind === 'move') onMove?.(d.id, Math.max(0, snap(d.x + dx)), Math.max(0, snap(d.y + dy)))
    else onResize?.(d.id, Math.min(12, Math.max(1, snap(d.w + dx))), Math.min(12, Math.max(1, snap(d.h + dy))))
  }
  const up = (e: React.PointerEvent, t: FTable) => {
    const d = drag.current
    drag.current = null
    if (!d || !d.moved) onTap?.(t, { shift: e.shiftKey || e.metaKey || e.ctrlKey })
  }
  const key = (e: React.KeyboardEvent, t: FTable) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap?.(t, { shift: e.shiftKey }); return }
    if (!edit) return
    const step = e.shiftKey ? 2 : SNAP
    const k = e.key
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault()
      if (e.altKey) onResize?.(t.id, Math.min(12, Math.max(1, t.w + (k === 'ArrowRight' ? step : k === 'ArrowLeft' ? -step : 0))), Math.min(12, Math.max(1, t.h + (k === 'ArrowDown' ? step : k === 'ArrowUp' ? -step : 0))))
      else onMove?.(t.id, Math.max(0, t.x + (k === 'ArrowRight' ? step : k === 'ArrowLeft' ? -step : 0)), Math.max(0, t.y + (k === 'ArrowDown' ? step : k === 'ArrowUp' ? -step : 0)))
    }
  }

  return (
    <div className="fc-wrap" ref={wrap}>
      <style>{FC_CSS}</style>
      <div className={`fc${edit ? ' edit' : ''}`} role="group" aria-label={label}
        style={{ width: cols * cell, height: rows * cell, backgroundSize: `${cell}px ${cell}px`, ['--cell' as any]: `${cell}px` }}
        onPointerMove={move}>
        {tables.map(t => {
          const on = !!selected?.includes(t.id)
          const ring = !!highlight?.includes(t.id)
          return (
            <div key={t.id} className={`fc-t ${t.shape}${on ? ' on' : ''}${ring ? ' ring' : ''} ${tone ? tone(t) : ''}`}
              style={{ left: t.x * cell, top: t.y * cell, width: t.w * cell, height: t.h * cell }}
              role="button" tabIndex={0} aria-pressed={on}
              aria-label={`Table ${t.label}, ${t.min_party === t.max_party ? t.max_party : `${t.min_party} to ${t.max_party}`} guests`}
              onPointerDown={e => down(e, t, 'move')} onPointerUp={e => up(e, t)} onKeyDown={e => key(e, t)}>
              {chairs(t).map((c, i) => <i key={i} className="fc-ch" style={c} aria-hidden />)}
              <div className="fc-in">{render ? render(t) : <><b>{t.label}</b><small>{t.min_party === t.max_party ? t.max_party : `${t.min_party}–${t.max_party}`}</small></>}</div>
              {edit && on && <span className="fc-size" onPointerDown={e => down(e, t, 'size')} onPointerUp={e => { e.stopPropagation(); drag.current = null }} aria-hidden />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const FC_CSS = `
.fc-wrap{position:relative;width:100%;overflow:auto;border-radius:22px;background:var(--f);scrollbar-width:thin;-webkit-overflow-scrolling:touch}
.fc{position:relative;margin:0 auto;background-image:radial-gradient(circle at 1px 1px,color-mix(in srgb,var(--ink) 13%,transparent) 1px,transparent 1.4px);touch-action:pan-x pan-y}
.fc.edit{touch-action:none}
.fc-t{position:absolute;display:flex;align-items:center;justify-content:center;padding:4px;box-sizing:border-box;border-radius:12px;background:var(--card,#fff);box-shadow:0 0 0 1.5px color-mix(in srgb,var(--ink) 12%,transparent),0 2px 6px rgba(0,0,0,.06);color:var(--ink);cursor:pointer;user-select:none;-webkit-user-select:none;transition:box-shadow .15s,background .2s,transform .12s;outline:none}
.fc-t.round{border-radius:50%}
.fc.edit .fc-t{cursor:grab}
.fc.edit .fc-t:active{cursor:grabbing}
.fc-t:focus-visible{box-shadow:0 0 0 3px var(--coral,#ff7a6b)}
.fc-t.on{box-shadow:0 0 0 2.5px var(--ink),0 8px 22px rgba(0,0,0,.14);z-index:2}
.fc-t.ring{box-shadow:0 0 0 2.5px #16a34a,0 0 0 7px color-mix(in srgb,#16a34a 18%,transparent);animation:fcPulse 1.6s ease-in-out infinite}
@keyframes fcPulse{50%{box-shadow:0 0 0 2.5px #16a34a,0 0 0 11px color-mix(in srgb,#16a34a 8%,transparent)}}
.fc-ch{position:absolute;width:calc(var(--cell) * .34);height:calc(var(--cell) * .34);margin:calc(var(--cell) * -.17) 0 0 calc(var(--cell) * -.17);border-radius:40%;background:color-mix(in srgb,var(--ink) 16%,var(--card,#fff));pointer-events:none}
.fc-in{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;min-width:0;max-width:100%;text-align:center;line-height:1.15;pointer-events:none}
.fc-in b{font-size:clamp(11px,calc(var(--cell) * .42),17px);font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.fc-in small{font-size:clamp(9px,calc(var(--cell) * .3),12px);font-weight:600;color:var(--soft);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fc-size{position:absolute;right:-7px;bottom:-7px;width:16px;height:16px;border-radius:6px;background:var(--ink);box-shadow:0 0 0 2px var(--card,#fff);cursor:nwse-resize;touch-action:none}
.fc-t.free{background:var(--card,#fff)}
.fc-t.soon{background:color-mix(in srgb,#3b82f6 10%,var(--card,#fff))}
.fc-t.booked{background:color-mix(in srgb,#3b82f6 20%,var(--card,#fff))}
.fc-t.booked .fc-in small,.fc-t.soon .fc-in small{color:color-mix(in srgb,#1d4ed8 80%,var(--ink))}
.fc-t.seated{background:color-mix(in srgb,#16a34a 22%,var(--card,#fff))}
.fc-t.seated .fc-in small{color:color-mix(in srgb,#15803d 85%,var(--ink))}
.fc-t.late{background:color-mix(in srgb,#ef4444 18%,var(--card,#fff))}
.fc-t.here{background:color-mix(in srgb,#16a34a 12%,var(--card,#fff));box-shadow:0 0 0 2px #16a34a,0 0 0 6px color-mix(in srgb,#16a34a 16%,transparent);animation:fcHere 2s ease-in-out infinite}
.fc-t.here .fc-in small{color:color-mix(in srgb,#15803d 85%,var(--ink))}
@keyframes fcHere{50%{box-shadow:0 0 0 2px #16a34a,0 0 0 10px color-mix(in srgb,#16a34a 6%,transparent)}}
.fc-t.late .fc-in small{color:color-mix(in srgb,#b91c1c 85%,var(--ink))}
.fc-t.out{background:repeating-linear-gradient(135deg,var(--f) 0 6px,var(--card,#fff) 6px 12px);color:var(--soft)}
.fc-t.dim{opacity:.38}
@media (prefers-reduced-motion:reduce){.fc-t.ring,.fc-t.here{animation:none}}
`
