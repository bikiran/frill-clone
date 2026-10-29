'use client'

// The customer's mood on a conversation, as a small animated face.
// Picking a mood in the thread's menu sends the face flying in an arc to the
// customer's name, where it lands with a bounce and keeps a gentle idle
// animation of its own: happy hops and twinkles, neutral looks around and
// blinks, upset gives a soft shake with a puff of steam.

import { useLayoutEffect, useRef } from 'react'

export type Mood = 'positive' | 'neutral' | 'negative'

export const MOODS: Mood[] = ['positive', 'neutral', 'negative']
export const MOOD_COLOR: Record<Mood, string> = { positive: '#16a34a', neutral: '#8b8b94', negative: '#e5484d' }
export const MOOD_LABEL: Record<Mood, string> = { positive: 'Happy', neutral: 'Neutral', negative: 'Upset' }

export const isMood = (v: unknown): v is Mood => v === 'positive' || v === 'neutral' || v === 'negative'

/** The face on its own. `idle` keeps its animation going; otherwise it plays on hover of a `.mf-play` parent. */
export function MoodFace({ mood, size = 20, idle = false }: { mood: Mood; size?: number; idle?: boolean }) {
  return (
    <span className={`mf ${mood}${idle ? ' idle' : ''}`} style={{ '--s': `${size}px`, '--mc': MOOD_COLOR[mood] } as React.CSSProperties} aria-hidden>
      <svg viewBox="0 0 24 24">
        <circle className="mf-face" cx="12" cy="12" r="9.6" />
        {mood === 'positive' && (
          <>
            <g className="mf-eyes">
              <path className="ln" d="M7.6 10.6q1.4-1.9 2.8 0" />
              <path className="ln" d="M13.6 10.6q1.4-1.9 2.8 0" />
            </g>
            <path className="ln" d="M7.8 13.8q4.2 4.2 8.4 0" />
            <circle className="mf-cheek" cx="6.9" cy="13.4" r="1.15" />
            <circle className="mf-cheek" cx="17.1" cy="13.4" r="1.15" />
            <path className="mf-spark" d="M21.4 0.6l.55 1.55 1.55.55-1.55.55-.55 1.55-.55-1.55-1.55-.55 1.55-.55z" />
          </>
        )}
        {mood === 'neutral' && (
          <>
            <g className="mf-eyes">
              <circle className="dot" cx="9" cy="10.4" r="1.25" />
              <circle className="dot" cx="15" cy="10.4" r="1.25" />
            </g>
            <path className="ln" d="M8.8 15.4h6.4" />
          </>
        )}
        {mood === 'negative' && (
          <>
            <g className="mf-brows">
              <path className="ln" d="M6.9 7.9l3.3 1.5" />
              <path className="ln" d="M17.1 7.9l-3.3 1.5" />
            </g>
            <circle className="dot" cx="9" cy="11.4" r="1.15" />
            <circle className="dot" cx="15" cy="11.4" r="1.15" />
            <path className="ln" d="M8.6 16.6q3.4-2.6 6.8 0" />
            <circle className="mf-puff a" cx="19.6" cy="3.6" r="1.5" />
            <circle className="mf-puff b" cx="21.8" cy="5.6" r="1.1" />
          </>
        )}
      </svg>
      <style href="colvy-mood-face" precedence="default">{MOOD_CSS}</style>
    </span>
  )
}

// A mood picked in the menu, waiting for its badge to appear by the name.
let pending: { mood: Mood; from: DOMRect; at: number } | null = null

/** Call when a mood is picked, with the element it was picked from; the badge flies from there. */
export function launchMood(mood: Mood, from: Element | null) {
  pending = from ? { mood, from: from.getBoundingClientRect(), at: Date.now() } : null
}

/** The mood next to the customer's name. */
export function MoodBadge({ mood, size = 20 }: { mood: Mood; size?: number }) {
  const ref = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    const p = pending
    if (!el || !p || p.mood !== mood || Date.now() - p.at > 2000) return
    pending = null
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const to = el.getBoundingClientRect()
    if (!to.width) return
    return fly(el, mood, p.from, to, size)
  }, [mood, size])

  return (
    <span ref={ref} className={`mood-badge ${mood}`} title={`${MOOD_LABEL[mood]} customer`} role="img" aria-label={`Mood: ${MOOD_LABEL[mood]}`}
      style={{ '--mc': MOOD_COLOR[mood] } as React.CSSProperties}>
      <MoodFace mood={mood} size={size} idle />
    </span>
  )
}

/** Flies a copy of the badge from `from` to `to` in an arc, then lands it. Returns a cleanup. */
function fly(badge: HTMLElement, mood: Mood, from: DOMRect, to: DOMRect, size: number): () => void {
  const x0 = from.left + from.width / 2, y0 = from.top + from.height / 2
  const x1 = to.left + to.width / 2, y1 = to.top + to.height / 2
  // The arc rises above both ends, more for a longer trip.
  const cx = (x0 + x1) / 2, cy = Math.min(y0, y1) - Math.min(160, 50 + Math.hypot(x1 - x0, y1 - y0) * 0.22)
  const at = (t: number) => {
    const u = 1 - t
    return { x: u * u * x0 + 2 * u * t * cx + t * t * x1, y: u * u * y0 + 2 * u * t * cy + t * t * y1 }
  }
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  const spin = x1 < x0 ? -360 : 360
  const frames = (scaleOf: (t: number) => number, turn: boolean): Keyframe[] => Array.from({ length: 25 }, (_, i) => {
    const t = ease(i / 24)
    const { x, y } = at(t)
    return { transform: `translate(${x - size / 2}px, ${y - size / 2}px) scale(${scaleOf(t)})${turn ? ` rotate(${spin * t}deg)` : ''}`, offset: i / 24 }
  })

  const made: HTMLElement[] = []
  const add = (node: HTMLElement) => { document.body.appendChild(node); made.push(node); return node }
  const base = 'position:fixed;left:0;top:0;z-index:9999;pointer-events:none;will-change:transform,opacity;'

  // The comet tail: small dots following the face.
  for (let i = 1; i <= 5; i++) {
    const dot = add(document.createElement('span'))
    const d = Math.max(3, size * (0.42 - i * 0.05))
    dot.style.cssText = `${base}width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;`
    dot.innerHTML = `<i style="width:${d}px;height:${d}px;border-radius:50%;background:${MOOD_COLOR[mood]};opacity:${0.55 - i * 0.08}"></i>`
    dot.animate(frames(() => 1, false), { duration: 760, delay: i * 38, easing: 'linear', fill: 'both' })
    dot.animate([{ opacity: 1 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: 760, delay: i * 38, fill: 'both' })
  }

  const flyer = add(document.createElement('span'))
  flyer.style.cssText = `${base}width:${size}px;height:${size}px;filter:drop-shadow(0 6px 10px rgba(16,24,40,.22));`
  flyer.innerHTML = badge.innerHTML
  badge.style.visibility = 'hidden'
  const trip = flyer.animate(frames(t => 1.9 - 0.9 * t + Math.sin(Math.PI * t) * 0.35, true), { duration: 760, easing: 'linear', fill: 'both' })

  let done = false
  const finish = () => {
    if (done) return
    done = true
    made.forEach(n => n.remove())
    badge.style.visibility = ''
    badge.classList.remove('landed')
    void badge.offsetWidth   // restart the landing animation
    badge.classList.add('landed')
    if (mood === 'positive') burst(to)
  }
  trip.onfinish = finish
  return () => { trip.onfinish = null; finish() }
}

/** A few sparkles out of the badge when a happy mood lands. */
function burst(at: DOMRect) {
  const x = at.left + at.width / 2, y = at.top + at.height / 2
  const colors = ['#16a34a', '#facc15', '#22c55e', '#f59e0b', '#4ade80', '#fbbf24']
  colors.forEach((c, i) => {
    const a = (Math.PI * 2 * i) / colors.length - Math.PI / 2
    const s = document.createElement('span')
    s.style.cssText = `position:fixed;left:${x - 3}px;top:${y - 3}px;width:6px;height:6px;border-radius:2px;background:${c};z-index:9999;pointer-events:none`
    document.body.appendChild(s)
    const dx = Math.cos(a) * 22, dy = Math.sin(a) * 22
    s.animate([
      { transform: 'translate(0,0) rotate(0) scale(.6)', opacity: 1 },
      { transform: `translate(${dx}px,${dy}px) rotate(140deg) scale(1)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${dx * 1.25}px,${dy * 1.25 + 6}px) rotate(200deg) scale(.4)`, opacity: 0 },
    ], { duration: 620, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = () => s.remove()
  })
}

const MOOD_CSS = `
.mf{display:inline-block;width:var(--s);height:var(--s);flex-shrink:0;line-height:0;transform-origin:50% 85%}
.mf svg{display:block;width:100%;height:100%;overflow:visible}
.mf .mf-face{fill:color-mix(in srgb,var(--mc) 16%,#fff);stroke:var(--mc);stroke-width:1.7}
.mf .ln{fill:none;stroke:var(--mc);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.mf .dot{fill:var(--mc)}
.mf .mf-cheek{fill:#fb7185;opacity:.35}
.mf .mf-spark{fill:#facc15;opacity:0}
.mf .mf-puff{fill:color-mix(in srgb,var(--mc) 30%,#fff);opacity:0}
.mf .mf-eyes,.mf .mf-brows,.mf .mf-spark,.mf .mf-puff{transform-box:fill-box;transform-origin:center}

/* Happy: a little hop with a squash, and a twinkle. */
.mf.idle.positive,.mf-play:hover .mf.positive{animation:mf-hop 2.6s cubic-bezier(.3,.7,.4,1) infinite}
.mf.idle.positive .mf-spark,.mf-play:hover .mf.positive .mf-spark{animation:mf-twinkle 2.6s ease-in-out infinite}
@keyframes mf-hop{0%,56%,100%{transform:none}64%{transform:scale(1.1,.88)}74%{transform:translateY(-24%) scale(.95,1.06) rotate(-7deg)}84%{transform:scale(1.08,.92) rotate(3deg)}92%{transform:scale(.98,1.02)}}
@keyframes mf-twinkle{0%,62%,100%{opacity:0;transform:scale(.2) rotate(0)}76%{opacity:1;transform:scale(1.15) rotate(50deg)}92%{opacity:0;transform:scale(.4) rotate(100deg)}}

/* Neutral: looks one way, then the other, then blinks. */
.mf.idle.neutral,.mf-play:hover .mf.neutral{animation:mf-tilt 5.2s ease-in-out infinite}
.mf.idle.neutral .mf-eyes,.mf-play:hover .mf.neutral .mf-eyes{animation:mf-look 5.2s ease-in-out infinite}
@keyframes mf-tilt{0%,26%,84%,100%{transform:none}36%,48%{transform:rotate(-5deg)}58%,70%{transform:rotate(5deg)}}
@keyframes mf-look{0%,26%,100%{transform:none}36%,48%{transform:translateX(-1.5px)}58%,70%{transform:translateX(1.5px)}80%{transform:none}86%{transform:scaleY(.12)}91%{transform:none}}

/* Upset, softly: a short shake, brows down, a flush and a puff of steam. */
.mf.idle.negative,.mf-play:hover .mf.negative{animation:mf-shake 3.4s ease-in-out infinite}
.mf.idle.negative .mf-face,.mf-play:hover .mf.negative .mf-face{animation:mf-flush 3.4s ease-in-out infinite}
.mf.idle.negative .mf-brows,.mf-play:hover .mf.negative .mf-brows{animation:mf-brow 3.4s ease-in-out infinite}
.mf.idle.negative .mf-puff,.mf-play:hover .mf.negative .mf-puff{animation:mf-puff 3.4s ease-out infinite}
.mf.idle.negative .mf-puff.b,.mf-play:hover .mf.negative .mf-puff.b{animation-delay:.16s}
@keyframes mf-shake{0%,66%,100%{transform:none}70%{transform:translateX(-6%) rotate(-4deg)}74%{transform:translateX(6%) rotate(4deg)}78%{transform:translateX(-4%) rotate(-2deg)}82%{transform:translateX(3%) rotate(1deg)}86%{transform:none}}
@keyframes mf-flush{0%,62%,100%{fill:color-mix(in srgb,var(--mc) 16%,#fff)}76%{fill:color-mix(in srgb,var(--mc) 34%,#fff)}}
@keyframes mf-brow{0%,64%,100%{transform:none}70%,86%{transform:translateY(.9px)}}
@keyframes mf-puff{0%,70%{opacity:0;transform:scale(.3)}78%{opacity:.9;transform:scale(.9)}100%{opacity:0;transform:translate(2px,-6px) scale(1.4)}}

/* Landing next to the name. */
.mood-badge{position:relative;display:inline-flex;align-items:center;flex-shrink:0;line-height:0}
.mood-badge.landed{animation:mf-land .6s cubic-bezier(.3,1.4,.5,1)}
.mood-badge.landed::after{content:"";position:absolute;inset:0;border-radius:50%;box-shadow:0 0 0 2px var(--mc);opacity:0;animation:mf-ring .65s ease-out}
@keyframes mf-land{0%{transform:scale(.5,1.4)}32%{transform:scale(1.4,.68)}58%{transform:scale(.9,1.12)}80%{transform:scale(1.04,.97)}100%{transform:none}}
@keyframes mf-ring{0%{opacity:.85;transform:scale(.7)}100%{opacity:0;transform:scale(2.2)}}

[data-theme="dark"] .mf .mf-face{fill:color-mix(in srgb,var(--mc) 22%,#18181b)}
@media (prefers-reduced-motion:reduce){.mf,.mf *,.mood-badge,.mood-badge::after{animation:none!important}}
`
