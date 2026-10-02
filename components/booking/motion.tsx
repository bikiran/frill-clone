'use client'

import { useEffect, useRef } from 'react'

// Motion + brand bits for the public booking pages: the animated status mark
// (Apple-style drawn check), the parallax backdrop, and calendar app icons.
// Everything animates transform / opacity only (GPU-friendly) and switches off
// for people who ask their device for reduced motion.

export { StatusMark } from '@/components/StatusMark'

// ── Parallax backdrop ────────────────────────────────────────────────────────

// Soft colour fields behind the card that drift with scroll (and the pointer
// on desktop) at different depths. Radial gradients rather than CSS blur — far
// cheaper on phones.
export function ParallaxBackdrop({ accent }: { accent: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0, mx = 0, my = 0
    const apply = () => {
      raf = 0
      el.style.setProperty('--sy', String(window.scrollY))
      el.style.setProperty('--mx', mx.toFixed(3))
      el.style.setProperty('--my', my.toFixed(3))
    }
    const queue = () => { if (!raf) raf = requestAnimationFrame(apply) }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      mx = e.clientX / window.innerWidth - 0.5
      my = e.clientY / window.innerHeight - 0.5
      queue()
    }
    window.addEventListener('scroll', queue, { passive: true })
    window.addEventListener('pointermove', onMove, { passive: true })
    apply()
    return () => { window.removeEventListener('scroll', queue); window.removeEventListener('pointermove', onMove); if (raf) cancelAnimationFrame(raf) }
  }, [])
  return (
    <div ref={ref} className="bk-backdrop" aria-hidden>
      <div className="bk-blob" style={{ ['--depth' as any]: 0.35, top: '-12%', left: '-8%', width: '58vmax', height: '58vmax', ['--c' as any]: `color-mix(in srgb, ${accent} 30%, transparent)` }}><i /></div>
      <div className="bk-blob" style={{ ['--depth' as any]: 0.6, top: '28%', right: '-14%', width: '46vmax', height: '46vmax', ['--c' as any]: `color-mix(in srgb, ${accent} 18%, #c4b5fd 22%)` }}><i style={{ animationDelay: '-6s' }} /></div>
      <div className="bk-blob" style={{ ['--depth' as any]: 0.9, bottom: '-20%', left: '18%', width: '40vmax', height: '40vmax', ['--c' as any]: `color-mix(in srgb, ${accent} 14%, #fde68a 24%)` }}><i style={{ animationDelay: '-12s' }} /></div>
      <div className="bk-grain" />
    </div>
  )
}

// ── Calendar app icons ──────────────────────────────────────────────────────

export function GoogleCalendarIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="3" fill="#fff" stroke="#e5e7eb" />
      <path d="M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v2H3z" fill="#4285F4" />
      <path d="M21 16v2a3 3 0 0 1-3 3h-2l5-5z" fill="#EA4335" />
      <rect x="3" y="18" width="13" height="3" fill="#34A853" rx="0" />
      <path d="M3 18h13v3H6a3 3 0 0 1-3-3z" fill="#34A853" />
      <path d="M16 21v-5h5z" fill="#FBBC04" />
      <text x="11.2" y="15.6" textAnchor="middle" fontSize="7.4" fontWeight="800" fill="#4285F4" fontFamily="Arial, Helvetica, sans-serif">31</text>
    </svg>
  )
}

export function AppleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path fill="#111" d="M16.37 12.73c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.77-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.97.9-3.76 2.28-1.61 2.79-.41 6.91 1.15 9.17.77 1.1 1.68 2.34 2.87 2.3 1.15-.05 1.59-.75 2.98-.75 1.39 0 1.78.75 3 .72 1.24-.02 2.03-1.12 2.78-2.23.88-1.28 1.24-2.53 1.26-2.59-.03-.01-2.42-.93-2.44-3.68zM14.1 5.98c.63-.77 1.06-1.83.94-2.9-.91.04-2.02.61-2.67 1.37-.58.67-1.1 1.76-.96 2.8 1.02.08 2.06-.52 2.69-1.27z" />
    </svg>
  )
}

export function OutlookIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="8" y="4" width="13" height="16" rx="2" fill="#28A8EA" />
      <path d="M8 9h13v9a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z" fill="#0078D4" />
      <path d="M8 12l6.5 4L21 12v6a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z" fill="#50D9FF" opacity=".55" />
      <rect x="2.5" y="6.5" width="11" height="11" rx="2" fill="#0364B8" />
      <ellipse cx="8" cy="12" rx="2.9" ry="3.4" fill="none" stroke="#fff" strokeWidth="1.7" />
    </svg>
  )
}

// ── Shared stylesheet (status mark, backdrop, entrance helpers) ─────────────

export const MOTION_CSS = `
.bk-backdrop{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;--sy:0;--mx:0;--my:0}
.bk-blob{position:absolute;will-change:transform;transition:transform .45s cubic-bezier(.22,1,.36,1);transform:translate3d(calc(var(--mx) * var(--depth) * 60px),calc(var(--sy) * var(--depth) * -0.35px + var(--my) * var(--depth) * 60px),0)}
.bk-blob i{display:block;width:100%;height:100%;border-radius:50%;background:radial-gradient(closest-side,var(--c),transparent);animation:bkFloat 22s ease-in-out infinite}
.bk-grain{position:absolute;inset:0;background:linear-gradient(180deg,rgba(246,246,247,0) 0%,rgba(246,246,247,.55) 100%)}
@keyframes bkFloat{0%,100%{transform:translate3d(0,0,0) scale(1)}33%{transform:translate3d(3%,-4%,0) scale(1.06)}66%{transform:translate3d(-4%,3%,0) scale(.96)}}

.bk-rise{animation:bkRise .55s cubic-bezier(.22,1,.36,1) backwards}
@keyframes bkRise{from{opacity:0;transform:translate3d(0,14px,0)}to{opacity:1;transform:none}}
.bk-step-f{animation:bkStepF .45s cubic-bezier(.22,1,.36,1) backwards}
.bk-step-b{animation:bkStepB .45s cubic-bezier(.22,1,.36,1) backwards}
@keyframes bkStepF{from{opacity:0;transform:translate3d(28px,0,0)}to{opacity:1;transform:none}}
@keyframes bkStepB{from{opacity:0;transform:translate3d(-28px,0,0)}to{opacity:1;transform:none}}
.bk-card-in{animation:bkCardIn .7s cubic-bezier(.22,1,.36,1) backwards}
@keyframes bkCardIn{from{opacity:0;transform:translate3d(0,24px,0) scale(.985)}to{opacity:1;transform:none}}
.bk-skel{background:linear-gradient(90deg,#f1f1f3 25%,#e9e9ec 50%,#f1f1f3 75%);background-size:600px 100%;animation:bkShimmer 1.3s linear infinite;border-radius:10px}
@keyframes bkShimmer{from{background-position:-300px 0}to{background-position:300px 0}}

@media (prefers-reduced-motion: reduce){
  .bk-rise,.bk-step-f,.bk-step-b,.bk-card-in,.bk-blob i{animation-duration:.001s!important;animation-delay:0s!important}
}
`
