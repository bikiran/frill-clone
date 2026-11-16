'use client'

import { useEffect, useRef, useState } from 'react'

// "Back to top", on the marketing footer's top edge (components/MarketingFooter).
// It waits tucked away until the footer comes into view, then pops out: a
// spin and a springy overshoot, a ring rippling out and a burst of confetti
// dots. The arrow hops now and then. Pressed, the button squashes and the
// arrow shoots off the top and comes back up from below while the page
// scrolls up. Once it's off screen it tucks away, to pop again next time.
//
// It sits in a zero-height row just above the <footer>, not inside it, so a
// page that skips painting the footer until it's near (content-visibility)
// doesn't clip its top half.

const CORAL = '#ff6a4d'
// Confetti: angle, distance, colour.
const DOTS: [number, number, string][] = [
  [-90, 40, CORAL], [-40, 36, '#facc15'], [10, 40, '#7c5cff'], [60, 34, '#22c55e'],
  [110, 38, CORAL], [160, 36, '#38bdf8'], [210, 40, '#facc15'], [250, 34, '#ec4899'],
]

export default function BackToTop({ dark = false }: { dark?: boolean }) {
  const row = useRef<HTMLDivElement>(null)
  const out = useRef(false)
  const [pop, setPop] = useState(0)        // > 0 once it's out; bumps to replay the pop
  const [go, setGo] = useState(false)      // the launch, for a moment after each press
  const goTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const el = row.current
    if (!el) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setPop(1); return }
    // Pops when its row comes up past the bottom tenth of the screen; tucks
    // away once it's fully off screen either way, so it pops again next time.
    // (Two observers: one alone only reports crossings of one margin.)
    const enter = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !out.current) { out.current = true; setPop(p => p + 1) }
    }, { rootMargin: '0px 0px -10% 0px' })
    const leave = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting && out.current) { out.current = false; setPop(0) }
    }, { rootMargin: '40px 0px 40px 0px' })
    enter.observe(el); leave.observe(el)
    return () => { enter.disconnect(); leave.disconnect(); if (goTimer.current) clearTimeout(goTimer.current) }
  }, [])

  const toTop = () => {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    setGo(true)
    if (goTimer.current) clearTimeout(goTimer.current)
    goTimer.current = setTimeout(() => setGo(false), 650)
    window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' })
  }

  return (
    <div ref={row} className={`btt-row${pop ? ' in' : ''}`}>
      <style>{CSS}</style>
      <button type="button" className={`btt${dark ? ' dk' : ''}${go ? ' go' : ''}`}
        aria-label="Back to top" title="Back to top" onClick={toTop}>
        {pop > 0 && <span key={'r' + pop} className="btt-ring" aria-hidden />}
        {pop > 0 && DOTS.map(([a, d, c], i) => (
          <i key={`d${pop}-${i}`} className="btt-dot" aria-hidden
            style={{ ['--a' as string]: `${a}deg`, ['--d' as string]: `${d}px`, ['--c' as string]: c, animationDelay: `${0.26 + (i % 3) * 0.03}s` } as React.CSSProperties} />
        ))}
        <span className="btt-ic" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>
        </span>
      </button>
    </div>
  )
}

const CSS = `
.btt-row{position:relative;z-index:3;max-width:1280px;height:0;margin:0 auto}
.btt{position:absolute;right:24px;top:0;width:54px;height:54px;margin-top:-27px;padding:0;border:none;border-radius:50%;background:#fff;color:#0b0c14;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;
  box-shadow:0 0 0 1px rgba(15,17,25,.08),0 14px 30px -10px rgba(15,17,25,.35);
  opacity:0;transform:scale(0) rotate(-140deg);pointer-events:none;
  transition:background .2s,color .2s,box-shadow .2s,translate .25s cubic-bezier(.22,1,.36,1)}
.btt::before{display:none}
.btt-row.in .btt{pointer-events:auto;animation:bttPop .85s cubic-bezier(.2,1.3,.4,1) forwards}
.btt-row.in .btt.go{animation:bttPop .85s cubic-bezier(.2,1.3,.4,1) forwards,bttSquash .55s cubic-bezier(.3,1.5,.5,1)}
.btt:hover{background:${CORAL};color:#fff;translate:0 -3px;box-shadow:0 16px 34px -10px rgba(255,106,77,.6)}
.btt:focus-visible{outline:2px solid ${CORAL};outline-offset:3px}
.btt.dk{background:#1a1b26;color:#fff;box-shadow:0 0 0 1px rgba(255,255,255,.14),0 14px 30px -10px rgba(0,0,0,.7)}
.btt.dk:hover{background:${CORAL}}
.btt-ic{display:inline-flex;line-height:0}
.btt-row.in .btt-ic{animation:bttHop 3.2s 1.4s ease-in-out infinite}
.btt-row.in .btt.go .btt-ic{animation:bttLaunch .6s cubic-bezier(.5,0,.2,1)}
.btt-ring{position:absolute;inset:0;border-radius:50%;box-shadow:0 0 0 2.5px ${CORAL};opacity:0;pointer-events:none;animation:bttRing .9s .22s ease-out}
.btt-dot{position:absolute;left:50%;top:50%;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;background:var(--c);opacity:0;pointer-events:none;animation:bttDot .8s cubic-bezier(.15,.75,.3,1) both}
@keyframes bttPop{0%{opacity:0;transform:scale(0) rotate(-140deg)}55%{opacity:1;transform:scale(1.24) rotate(14deg)}75%{transform:scale(.9) rotate(-5deg)}90%{transform:scale(1.04) rotate(1deg)}100%{opacity:1;transform:scale(1) rotate(0)}}
@keyframes bttSquash{0%{scale:1}25%{scale:1.12 .82}55%{scale:.92 1.1}100%{scale:1}}
@keyframes bttRing{0%{opacity:.85;transform:scale(1)}100%{opacity:0;transform:scale(2.2)}}
@keyframes bttDot{0%{opacity:1;transform:rotate(var(--a)) translateX(10px) scale(.4)}70%{opacity:1}100%{opacity:0;transform:rotate(var(--a)) translateX(var(--d)) scale(1)}}
@keyframes bttHop{0%,62%,100%{transform:none}70%{transform:translateY(-5px)}78%{transform:none}84%{transform:translateY(-2px)}90%{transform:none}}
@keyframes bttLaunch{0%{transform:none;opacity:1}38%{transform:translateY(-34px);opacity:0}39%{transform:translateY(26px);opacity:0}100%{transform:none;opacity:1}}
@media (max-width:760px){.btt{right:20px;width:50px;height:50px;margin-top:-25px}}
@media (prefers-reduced-motion:reduce){.btt,.btt-row.in .btt,.btt-row.in .btt.go{opacity:1;transform:none;pointer-events:auto;animation:none!important;transition:none}.btt *{animation:none!important}}
`
