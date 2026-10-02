'use client'

import { useId } from 'react'

// Colvy's success / status mark — the Apple-style drawn tick used on every
// "done" moment (bookings, uploads, forms, tickets, payments…). The ring
// draws, the disc blooms, the glyph draws, then a soft ripple + sparkle.
// transform/opacity only; static for reduced-motion users.
//
//   <StatusMark kind="success" size={88} celebrate />
//   <StatusMark kind="success" size={22} />           // inline, no burst

export type MarkKind = 'success' | 'cancelled' | 'pending' | 'neutral' | 'done'

const PALETTE: Record<MarkKind, [string, string, string]> = {
  success: ['#4ade80', '#16a34a', '#22c55e'],
  done: ['#60a5fa', '#2563eb', '#3b82f6'],
  cancelled: ['#f87171', '#dc2626', '#ef4444'],
  pending: ['#fbbf24', '#d97706', '#f59e0b'],
  neutral: ['#d1d5db', '#9ca3af', '#9ca3af'],
}

export function StatusMark({ kind, size = 88, celebrate = false }: { kind: MarkKind; size?: number; celebrate?: boolean }) {
  const [light, dark, ring] = PALETTE[kind]
  const id = `sm-${kind}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const burst = celebrate && (kind === 'success' || kind === 'done')
  return (
    <div className={`sm sm-${kind}${burst ? ' sm-burst' : ''}`} style={{ width: size, height: size, ['--sm-ring' as any]: ring, ['--sz' as any]: `${size}px` }} aria-hidden>
      {/* React hoists + dedupes this, so many marks share one stylesheet. */}
      <style href="colvy-status-mark" precedence="default">{CSS}</style>
      {burst && (
        <>
          <span className="sm-halo" />
          <span className="sm-halo sm-halo2" />
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} className="sm-dot" style={{ ['--a' as any]: `${i * 30}deg`, ['--d' as any]: `${i % 2 ? 0.62 : 0.78}`, background: i % 3 === 0 ? light : i % 3 === 1 ? ring : dark }} />
          ))}
        </>
      )}
      <svg viewBox="0 0 88 88" width={size} height={size}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={light} />
            <stop offset="1" stopColor={dark} />
          </linearGradient>
        </defs>
        <circle className="sm-ringpath" cx="44" cy="44" r="40" fill="none" stroke={ring} strokeWidth="3" pathLength={1} />
        <circle className="sm-fill" cx="44" cy="44" r="40" fill={`url(#${id})`} />
        {(kind === 'success' || kind === 'done') && (
          <path className="sm-glyph" d="M27 45.5 L38.5 57 L61 33" fill="none" stroke="#fff" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
        )}
        {kind === 'cancelled' && (
          <>
            <path className="sm-glyph" d="M31 31 L57 57" fill="none" stroke="#fff" strokeWidth="6.5" strokeLinecap="round" pathLength={1} />
            <path className="sm-glyph sm-glyph2" d="M57 31 L31 57" fill="none" stroke="#fff" strokeWidth="6.5" strokeLinecap="round" pathLength={1} />
          </>
        )}
        {kind === 'pending' && (
          <g className="sm-glyph-fade">
            <circle cx="44" cy="44" r="19" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="5" />
            <circle className="sm-spin" cx="44" cy="44" r="19" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeDasharray="30 120" />
          </g>
        )}
        {kind === 'neutral' && (
          <path className="sm-glyph" d="M30 44 L58 44" fill="none" stroke="#fff" strokeWidth="6.5" strokeLinecap="round" pathLength={1} />
        )}
      </svg>
    </div>
  )
}


const CSS = `.sm{position:relative;display:inline-flex;align-items:center;justify-content:center}
.sm svg{position:relative;z-index:1;overflow:visible}
.sm-ringpath{stroke-dasharray:1;stroke-dashoffset:1;transform:rotate(-90deg);transform-origin:44px 44px;animation:smDraw .55s cubic-bezier(.65,0,.35,1) forwards}
.sm-fill{transform:scale(0);transform-origin:44px 44px;animation:smBloom .5s cubic-bezier(.34,1.56,.64,1) .38s forwards}
.sm-glyph{stroke-dasharray:1;stroke-dashoffset:1;animation:smDraw .42s cubic-bezier(.65,0,.35,1) .72s forwards}
.sm-glyph2{animation-delay:.86s}
.sm-glyph-fade{opacity:0;animation:smFade .3s ease .7s forwards}
.sm-spin{transform-origin:44px 44px;animation:smSpin 1.1s linear infinite}
.sm-burst svg{animation:smPop .5s cubic-bezier(.34,1.56,.64,1) 1.05s both}
.sm-halo{position:absolute;inset:0;border-radius:50%;border:2px solid var(--sm-ring);opacity:0;animation:smHalo 1.1s cubic-bezier(.22,1,.36,1) 1s forwards}
.sm-halo2{animation-delay:1.18s}
.sm-dot{position:absolute;left:50%;top:50%;width:calc(var(--sz) * .08);height:calc(var(--sz) * .08);margin:calc(var(--sz) * -.04);border-radius:50%;opacity:0;transform:rotate(var(--a)) translateY(0) scale(.4);animation:smDot .85s cubic-bezier(.22,1,.36,1) 1.02s forwards}
@keyframes smDraw{to{stroke-dashoffset:0}}
@keyframes smBloom{0%{transform:scale(0)}100%{transform:scale(1)}}
@keyframes smPop{0%{transform:scale(1)}40%{transform:scale(1.09)}100%{transform:scale(1)}}
@keyframes smFade{to{opacity:1}}
@keyframes smSpin{to{transform:rotate(360deg)}}
@keyframes smHalo{0%{opacity:.55;transform:scale(1)}100%{opacity:0;transform:scale(1.9)}}
@keyframes smDot{0%{opacity:0;transform:rotate(var(--a)) translateY(0) scale(.4)}25%{opacity:1}100%{opacity:0;transform:rotate(var(--a)) translateY(calc(var(--d) * var(--sz) * -1)) scale(1)}}
@media (prefers-reduced-motion: reduce){.sm *,.sm svg{animation-duration:.001s!important;animation-delay:0s!important}.sm-halo,.sm-dot{display:none}}
`
