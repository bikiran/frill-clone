'use client'

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'

// A "start free" button that feels alive without shouting. While it's on
// screen and idle, it now and then plays one small gesture: the arrow nudges
// forward, a glint runs once around the border, or the label gives a soft
// double beat. Never the same one twice in a row, several seconds apart, and
// never while the pointer is on it. Pressing it gives a quick squeeze.
// Styles live in app/globals.css (.cv-inv); reduced motion turns it all off.

const FX = ['arrow', 'beat', 'ring'] as const

function useInvite<T extends HTMLElement>(on: boolean) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!on || !el || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let visible = false, held = false, last = -1
    let timer: ReturnType<typeof setTimeout> | undefined, clear: ReturnType<typeof setTimeout> | undefined
    const later = (ms: number) => { clearTimeout(timer); timer = setTimeout(play, ms) }
    function play() {
      if (!visible) return
      if (held || document.hidden) return later(2500)
      let k = Math.floor(Math.random() * FX.length)
      if (k === last) k = (k + 1) % FX.length
      last = k
      el!.dataset.invite = FX[k]
      clearTimeout(clear)
      clear = setTimeout(() => { delete el!.dataset.invite }, 1700)
      later(6500 + Math.random() * 3500)
    }
    const io = new IntersectionObserver(([e]) => {
      const was = visible
      visible = e.isIntersecting
      if (visible && !was) later(1400 + Math.random() * 1200)
      if (!visible) clearTimeout(timer)
    }, { threshold: 0.6 })
    io.observe(el)
    const hold = () => { held = true; delete el.dataset.invite }
    const free = () => { held = false }
    el.addEventListener('pointerenter', hold); el.addEventListener('pointerleave', free)
    el.addEventListener('focus', hold); el.addEventListener('blur', free)
    return () => {
      io.disconnect(); clearTimeout(timer); clearTimeout(clear)
      el.removeEventListener('pointerenter', hold); el.removeEventListener('pointerleave', free)
      el.removeEventListener('focus', hold); el.removeEventListener('blur', free)
    }
  }, [on])
  return ref
}

const Arrow = ({ s }: { s: number }) => (
  <svg className="cv-inv-arrow" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
)

export default function InviteCta({ href, onClick, children, style, className = '', arrow = 16, ring, idle = true }: {
  href?: string
  onClick?: () => void
  children: ReactNode
  style?: CSSProperties
  className?: string
  /** Arrow size in px, or 0 for none. */
  arrow?: number
  /** Colour of the glint that runs round the border (white suits a coral button). */
  ring?: string
  /** false keeps the press and hover feel but skips the idle gestures. */
  idle?: boolean
}) {
  const aRef = useInvite<HTMLAnchorElement>(idle && !!href)
  const bRef = useInvite<HTMLButtonElement>(idle && !href)
  const s = { ...style, ...(ring ? { ['--inv-ring' as any]: ring } : null) } as CSSProperties
  const inner = <><span className="cv-inv-label">{children}</span>{arrow > 0 && <Arrow s={arrow} />}</>
  const cls = `cv-inv ${className}`.trim()
  return href
    ? <a ref={aRef} href={href} onClick={onClick} className={cls} style={s}>{inner}</a>
    : <button ref={bRef} type="button" onClick={onClick} className={cls} style={s}>{inner}</button>
}
