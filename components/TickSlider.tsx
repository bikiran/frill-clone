'use client'

import { useId, useState } from 'react'

// The app's slider: a row of ticks that rises into a coloured wave around the
// handle (and swells while you drag), a filled track, a white pill handle with
// ‹›, and "Label · value" with a "max" pill that jumps to the top. A real
// <input type="range"> sits over it, so the keyboard, screen readers and touch
// all work as usual; its thumb is the same width as the pill, so a click lands
// exactly where it looks like it should.

const TW = 52 // the handle's width, px

export default function TickSlider({
  label, value, min = 0, max = 100, step = 1, onChange, format = (n: number) => String(n),
  color = 'var(--coral, #ff7a6b)', dark = false, disabled, tabIndex, showMax = true, ticks = 36, id, ariaLabel, className, style,
}: {
  label?: React.ReactNode
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
  color?: string
  /** On a dark background. */
  dark?: boolean
  disabled?: boolean
  tabIndex?: number
  /** The "max" pill on the right, which sets the slider to its top value. */
  showMax?: boolean
  ticks?: number
  id?: string
  ariaLabel?: string
  className?: string
  style?: React.CSSProperties
}) {
  const [active, setActive] = useState(false)
  const autoId = useId()
  const inputId = id || autoId
  const v = Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
  const pct = max > min ? (v - min) / (max - min) : 0
  const reach = active ? 0.17 : 0.12
  const at = (f: number) => `calc(${TW / 2}px + (100% - ${TW}px) * ${f})`

  return (
    <div className={`ts${active ? ' on' : ''}${disabled ? ' off' : ''}${dark ? ' dark' : ''}${className ? ' ' + className : ''}`} style={{ ...({ ['--ts-c' as string]: color } as React.CSSProperties), ...style }}>
      <style>{TS_CSS}</style>
      <div className="ts-ticks" aria-hidden="true">
        {Array.from({ length: ticks }, (_, i) => {
          const f = ticks > 1 ? i / (ticks - 1) : 0
          const near = Math.max(0, 1 - Math.abs(f - pct) / reach)
          return (
            <span key={i} className={near ? 'hot' : ''}
              style={{ left: at(f), height: 6 + Math.pow(near, 1.35) * (active ? 24 : 18), opacity: near ? 0.35 + near * 0.65 : 1 }} />
          )
        })}
      </div>
      <div className="ts-track">
        <input id={inputId} type="range" min={min} max={max} step={step} value={v} disabled={disabled} tabIndex={tabIndex}
          aria-label={ariaLabel || (typeof label === 'string' ? label : undefined)}
          onChange={e => onChange(Number(e.target.value))}
          onPointerDown={() => setActive(true)} onPointerUp={() => setActive(false)} onPointerCancel={() => setActive(false)} onBlur={() => setActive(false)} />
        <div className="ts-rail" />
        <div className="ts-fill" style={{ width: at(pct) }} />
        <div className="ts-thumb" style={{ left: `calc((100% - ${TW}px) * ${pct})` }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 6 3 12 9 18" /><polyline points="15 6 21 12 15 18" /></svg>
        </div>
      </div>
      {(label != null || showMax) && (
        <div className="ts-foot">
          {label != null ? <label htmlFor={inputId} className="ts-label">{label} · <b>{format(v)}</b></label> : <span />}
          {showMax && (
            <button type="button" className="ts-max" onClick={() => onChange(max)} disabled={disabled || v >= max} tabIndex={tabIndex} title="Set to the maximum">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 15 12 9 18 15" /></svg>
              max {format(max)}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const TS_CSS = `
.ts{position:relative;-webkit-user-select:none;user-select:none;touch-action:pan-y}
.ts-ticks{position:relative;height:30px;margin-bottom:8px}
.ts-ticks span{position:absolute;bottom:0;width:3px;margin-left:-1.5px;border-radius:3px;background:#d4d4d8;transition:height .22s cubic-bezier(.22,1,.36,1),opacity .22s ease,background-color .22s ease}
.ts-ticks span.hot{background:var(--ts-c)}
.ts-track{position:relative;height:38px}
.ts-rail,.ts-fill{position:absolute;left:0;top:50%;height:8px;margin-top:-4px;border-radius:999px;pointer-events:none}
.ts-rail{right:0;background:#e4e4e7}
.ts-fill{background:var(--ts-c)}
.ts-thumb{position:absolute;top:1px;width:${TW}px;height:36px;border-radius:999px;background:#fff;color:#18181b;display:flex;align-items:center;justify-content:center;pointer-events:none;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 2px 8px rgba(16,24,40,.14);transition:transform .22s cubic-bezier(.22,1,.36,1),box-shadow .22s ease}
.ts.on .ts-thumb{transform:scale(1.07);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 8px 22px rgba(16,24,40,.2)}
.ts input{position:absolute;inset:0;z-index:2;width:100%;height:100%;margin:0;padding:0;opacity:0;cursor:grab;-webkit-appearance:none;appearance:none;background:transparent}
.ts.on input{cursor:grabbing}
.ts input::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:${TW}px;height:36px}
.ts input::-moz-range-thumb{width:${TW}px;height:36px;border:0}
.ts input:focus-visible ~ .ts-thumb{box-shadow:0 0 0 1px rgba(0,0,0,.06),0 0 0 4px color-mix(in srgb,var(--ts-c) 30%,transparent)}
.ts-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px}
.ts-label{font-size:15px;color:#71717a;cursor:default}
.ts-label b{color:var(--ink,#18181b);font-weight:700;font-variant-numeric:tabular-nums}
.ts-max{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 13px;border:none;border-radius:999px;background:#f4f4f5;color:#52525b;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:background-color .15s ease,color .15s ease}
.ts-max::before{display:none}
.ts-max:hover:not(:disabled){background:#ececef;color:#18181b}
.ts-max:disabled{cursor:default;opacity:.65}
.ts.dark .ts-ticks span:not(.hot){background:rgba(255,255,255,.22)}
.ts.dark .ts-rail{background:rgba(255,255,255,.14)}
.ts.dark .ts-label{color:rgba(244,245,251,.62)}
.ts.dark .ts-label b{color:#f4f5fb}
.ts.dark .ts-max{background:rgba(255,255,255,.1);color:rgba(244,245,251,.8)}
.ts.off{opacity:.5}
.ts.off input{cursor:not-allowed}
@media (prefers-reduced-motion: reduce){.ts-ticks span,.ts-thumb{transition:none}}
`
