'use client'

import { useEffect, useId, useRef } from 'react'
import type { BuddyShape } from '@/lib/buddy-shapes'

// Colvy AI's face: a soft shape with two eyes that follow the pointer and blink
// now and then. On touch screens (no pointer to follow) it glances around
// instead, and with reduced motion it simply sits still.

export type { BuddyShape } from '@/lib/buddy-shapes'

type Pt = [number, number]
const f = (n: number) => n.toFixed(2)

// A smooth closed curve through the points (Catmull-Rom as cubic Béziers).
function smooth(pts: Pt[]): string {
  const n = pts.length
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n]
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`
  }
  return d + 'Z'
}
const radial = (radii: number[], rot = -90, cx = 50, cy = 52): Pt[] =>
  radii.map((r, i) => { const a = ((rot + (i * 360) / radii.length) * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] })

const SHAPES: Record<BuddyShape, { d: string; eyeY: number }> = {
  star: { d: smooth(radial([47, 33, 47, 33, 47, 33, 47, 33, 47, 33], -90, 50, 54)), eyeY: 53 },
  squircle: { d: smooth(Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); return [50 + 44 * Math.sign(c) * Math.abs(c) ** 0.5, 50 + 44 * Math.sign(s) * Math.abs(s) ** 0.5] as Pt })), eyeY: 50 },
  flower: { d: smooth(radial(Array.from({ length: 16 }, (_, i) => (i % 2 ? 40 : 46)), -90, 50, 50)), eyeY: 50 },
  blob: { d: smooth(radial([45, 41, 46, 39, 44, 42], 12, 50, 50)), eyeY: 50 },
  // A square with its sides pinched in, like a cushion.
  pillow: { d: smooth(radial([56, 39, 56, 39, 56, 39, 56, 39], -135, 50, 50)), eyeY: 50 },
  pill: { d: 'M50 5C67.7 5 82 19.3 82 37V63C82 80.7 67.7 95 50 95C32.3 95 18 80.7 18 63V37C18 19.3 32.3 5 50 5Z', eyeY: 44 },
  ghost: { d: 'M14 46C14 24 30 8 50 8S86 24 86 46V90C80 96 74 96 68 90C62 84 56 84 50 90C44 96 38 96 32 90C26 84 20 84 14 90Z', eyeY: 44 },
  gem: { d: smooth(radial([49, 49, 49, 49], -90, 50, 50)), eyeY: 50 },
  cookie: { d: smooth(radial(Array.from({ length: 24 }, (_, i) => (i % 2 ? 42 : 47)), -90, 50, 50)), eyeY: 50 },
  circle: { d: 'M50 6A44 44 0 1 1 50 94A44 44 0 1 1 50 6Z', eyeY: 50 },
  bubble: { d: 'M52 8C75.2 8 94 25 94 46S75.2 84 52 84C46.2 84 40.7 83 35.7 81.1L14 93L20.6 73.2C13.9 66.3 10 56.6 10 46C10 25 28.8 8 52 8Z', eyeY: 46 },
  splat: { d: smooth(radial([48, 37, 46, 39, 49, 36, 45], 18, 50, 50)), eyeY: 50 },
}

// Lighter or darker version of a #rrggbb colour.
function mix(hex: string, to: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex
  const a = p(hex), b = p(to)
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('')
}

// One pointer listener for every buddy on the page.
type Look = (x: number, y: number) => void
const lookers = new Set<Look>()
let last: { x: number; y: number } | null = null
let frame = 0
function onMove(e: PointerEvent) {
  last = { x: e.clientX, y: e.clientY }
  if (frame) return
  frame = requestAnimationFrame(() => { frame = 0; if (last) lookers.forEach(fn => fn(last!.x, last!.y)) })
}
function watch(fn: Look) {
  if (!lookers.size) window.addEventListener('pointermove', onMove, { passive: true })
  lookers.add(fn)
  return () => { lookers.delete(fn); if (!lookers.size) window.removeEventListener('pointermove', onMove) }
}

export default function AiBuddy({ size = 40, color = '#ff7a6b', shape = 'star', shadow = false, className, style }: {
  size?: number
  color?: string
  shape?: BuddyShape
  /** A soft coloured shadow under it, for when it floats. */
  shadow?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const eyesRef = useRef<SVGGElement | null>(null)
  const id = 'aib' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const { d, eyeY } = SHAPES[shape] || SHAPES.star

  useEffect(() => {
    const svg = svgRef.current, eyes = eyesRef.current
    if (!svg || !eyes || typeof window === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const timers: ReturnType<typeof setTimeout>[] = []
    const later = (fn: () => void, ms: number) => { const t = setTimeout(fn, ms); timers.push(t); return t }
    const look = (ox: number, oy: number, slow = false) => {
      eyes.style.transition = `transform ${slow ? '.6s' : '.16s'} cubic-bezier(.22,1,.36,1)`
      eyes.style.transform = `translate(${ox.toFixed(2)}px, ${oy.toFixed(2)}px)`
    }

    // Blink every few seconds; now and then twice.
    const blink = () => {
      if (!document.hidden) {
        svg.classList.remove('aib-blinking'); void svg.getBoundingClientRect(); svg.classList.add('aib-blinking')
        if (Math.random() < 0.22) later(() => { svg.classList.remove('aib-blinking'); void svg.getBoundingClientRect(); svg.classList.add('aib-blinking') }, 260)
      }
      later(blink, 2400 + Math.random() * 3600)
    }
    later(blink, 900 + Math.random() * 2400)

    // Eyes follow the pointer, drifting back to the middle when it rests.
    let rest: ReturnType<typeof setTimeout> | null = null
    const stop = watch((x, y) => {
      const r = svg.getBoundingClientRect()
      if (!r.width) return
      const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height * (eyeY / 100))
      const dist = Math.hypot(dx, dy) || 1
      const reach = Math.min(1, dist / 160)
      look((dx / dist) * 7 * reach, (dy / dist) * 5.5 * reach)
      if (rest) clearTimeout(rest)
      rest = later(() => look(0, 0, true), 2600)
    })

    // Nothing to follow on a touch screen: glance around instead.
    let glancing = true
    if (window.matchMedia?.('(hover: none)').matches) {
      const glance = () => {
        if (!glancing) return
        const a = Math.random() * Math.PI * 2
        look(Math.cos(a) * 6, Math.sin(a) * 4.5, true)
        later(() => look(0, 0, true), 1100 + Math.random() * 600)
        later(glance, 3200 + Math.random() * 4200)
      }
      later(glance, 1800 + Math.random() * 2400)
    }

    return () => { glancing = false; stop(); timers.forEach(clearTimeout) }
  }, [eyeY])

  return (
    <svg ref={svgRef} className={`aib${className ? ' ' + className : ''}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true"
      style={{ display: 'block', flexShrink: 0, overflow: 'visible', ...(shadow ? { filter: `drop-shadow(0 ${Math.round(size * 0.14)}px ${Math.round(size * 0.18)}px ${mix(color, '#ffffff', 0.1)}88)` } : {}), ...style }}>
      <style>{`.aib-eye{transform-box:fill-box;transform-origin:center}.aib-blinking .aib-eye{animation:aibBlink .17s ease-in-out}@keyframes aibBlink{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.12)}}`}</style>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mix(color, '#ffffff', 0.18)} />
          {/* Coral deepens towards orange; any other colour towards a darker shade of itself. */}
          <stop offset="1" stopColor={/^#ff7a6b$/i.test(color) ? mix(color, '#e2541f', 0.28) : mix(color, '#000000', 0.16)} />
        </linearGradient>
      </defs>
      <path d={d} fill={`url(#${id})`} />
      <g ref={eyesRef}>
        <rect className="aib-eye" x="35.5" y={eyeY - 10} width="10.5" height="20" rx="5.25" fill="#fff" />
        <rect className="aib-eye" x="54" y={eyeY - 10} width="10.5" height="20" rx="5.25" fill="#fff" />
      </g>
    </svg>
  )
}
