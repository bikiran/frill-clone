'use client'

// The Halloween theme (lib/seasonal-themes). Behind the app: a moonlit sky with
// stars and drifting clouds, a haunted house on the hill, dead trees (with eyes
// in the hollow), a graveyard, flickering jack-o'-lanterns and low fog. Over
// it, now and then: lightning, a flock of bats, a ghost peeking in, a witch
// flying past; a spider drops down on its thread (and scurries back up if you
// go near it), and cobwebs hang in the corners. The Colvy orb wears a witch hat
// and the accent turns pumpkin orange.
//
// Everything moves with transforms and opacity; the effects pause while the tab
// is hidden, and with reduced motion only the still scene shows. Lightning is
// two soft pulses, well under the three-flashes-a-second limit.

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

type BatSpec = { y: number; size: number; dur: number; delay: number; amp: number; bob: number; flap: number }
type Fx =
  | { id: number; kind: 'bats'; dir: 'r' | 'l'; bats: BatSpec[] }
  | { id: number; kind: 'ghost'; side: 'r' | 'l'; y: number }
  | { id: number; kind: 'witch'; dir: 'r' | 'l'; y: number }
  | { id: number; kind: 'bolt'; x: number; main: string; branch: string }
type Kind = 'lightning' | 'bats' | 'ghost' | 'witch'

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const WEIGHTS: [Kind, number][] = [['lightning', 3], ['bats', 3], ['ghost', 2], ['witch', 1.4]]

/** A jagged bolt (and a fork) in a 120×400 box. */
function boltPoints() {
  const pts: [number, number][] = [[60 + rnd(-12, 12), 0]]
  while (pts[pts.length - 1][1] < 400) {
    const [x, y] = pts[pts.length - 1]
    pts.push([Math.min(110, Math.max(10, x + rnd(-22, 22))), Math.min(400, y + rnd(20, 42))])
  }
  const at = pts[Math.floor(pts.length * rnd(0.3, 0.5))]
  const fork: [number, number][] = [at]
  const lean = Math.random() < 0.5 ? -1 : 1
  for (let i = 0; i < 4; i++) { const [x, y] = fork[fork.length - 1]; fork.push([Math.min(118, Math.max(2, x + lean * rnd(6, 18))), y + rnd(16, 30)]) }
  const s = (p: [number, number][]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return { main: s(pts), branch: s(fork) }
}

// The night sky's stars, the same every time (a small seeded random).
const STARS = (() => {
  let seed = 7
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const a: string[] = [], b: string[] = []
  for (let i = 0; i < 90; i++) {
    const s = `${(r() * 100).toFixed(1)}vw ${(r() * 58).toFixed(1)}vh 0 ${r() < 0.15 ? '0.6px' : '0'} rgba(255,255,255,${(0.35 + r() * 0.6).toFixed(2)})`
    ;(i % 2 ? a : b).push(s)
  }
  return { a: a.join(','), b: b.join(',') }
})()

// A corner cobweb: spokes from the corner and sagging rings between them.
const WEB = (() => {
  const A = [0, 17, 36, 55, 73, 90].map(d => (d * Math.PI) / 180)
  const f = (n: number) => n.toFixed(1)
  let d = ''
  for (const a of A) d += `M0 0L${f(124 * Math.cos(a))} ${f(124 * Math.sin(a))}`
  for (const r of [20, 38, 58, 80, 104]) {
    for (let i = 0; i < A.length - 1; i++) {
      const m = (A[i] + A[i + 1]) / 2
      d += `M${f(r * Math.cos(A[i]))} ${f(r * Math.sin(A[i]))}Q${f(r * 0.8 * Math.cos(m))} ${f(r * 0.8 * Math.sin(m))} ${f(r * Math.cos(A[i + 1]))} ${f(r * Math.sin(A[i + 1]))}`
    }
  }
  return d
})()

const HAT = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 52"><ellipse cx="32" cy="44" rx="30" ry="7" fill="#1f1430"/><path d="M14 44C22 30 26 16 30 4c2-4 6-4 8-2 2 4 4 6 8 7-4 5-4 17 4 35z" fill="#2c1c44"/><path d="M17.5 37.5c10.5 3 22.5 3 30.5 0l1.5 4c-9.5 3.5-23.5 3.5-33.5 0z" fill="#f97316"/><rect x="29" y="37" width="7" height="6" rx="1" fill="none" stroke="#ffd166" stroke-width="1.6"/></svg>')}")`

function Bat({ size, flap, className = '' }: { size: number; flap?: number; className?: string }) {
  return (
    <svg className={`hw-bat ${className}`} width={size} height={size / 2} viewBox="0 0 64 32" style={flap ? ({ '--flap': `${flap}s` } as React.CSSProperties) : undefined}>
      <path className="hw-wl" d="M30 14C24 6 14 4 2 8c4 2 5 5 4 8 4-2 7-1 8 2 3-3 7-2 8 1 2-3 6-3 8-1z" />
      <path className="hw-wr" d="M34 14c6-8 16-10 28-6-4 2-5 5-4 8-4-2-7-1-8 2-3-3-7-2-8 1-2-3-6-3-8-1z" />
      <ellipse cx="32" cy="16" rx="4" ry="6" />
      <circle cx="32" cy="10" r="3.4" />
      <path d="M29.6 8.4 29 4l2.2 3.2zM34.4 8.4 35 4l-2.2 3.2z" />
      <circle className="hw-bat-eye" cx="30.9" cy="9.8" r=".8" /><circle className="hw-bat-eye" cx="33.1" cy="9.8" r=".8" />
    </svg>
  )
}

function Ghost() {
  return (
    <svg className="hw-ghost-svg" viewBox="0 0 84 100">
      <defs><linearGradient id="hw-gg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#e6e3f4" /></linearGradient></defs>
      <path d="M8 52c-6 2-8 8-6 12 4-4 6-4 8-4zM76 52c6 2 8 8 6 12-4-4-6-4-8-4z" fill="url(#hw-gg)" />
      <path d="M42 4C20 4 8 22 8 46v44c5-6 10-6 15 0s10 6 15 0 10-6 15 0 10 6 15 0c4-5 7-5 8-2V46C76 22 64 4 42 4z" fill="url(#hw-gg)" />
      <g className="hw-ghost-eyes"><ellipse cx="32" cy="42" rx="5" ry="7" fill="#1f1b2e" /><ellipse cx="52" cy="42" rx="5" ry="7" fill="#1f1b2e" /><circle cx="33.6" cy="39.4" r="1.6" fill="#fff" /><circle cx="53.6" cy="39.4" r="1.6" fill="#fff" /></g>
      <ellipse cx="42" cy="58" rx="4.5" ry="5.5" fill="#1f1b2e" />
      <ellipse cx="25" cy="53" rx="4" ry="2.4" fill="#ffb3c1" opacity=".75" /><ellipse cx="59" cy="53" rx="4" ry="2.4" fill="#ffb3c1" opacity=".75" />
    </svg>
  )
}

function Witch() {
  return (
    <svg className="hw-witch-svg" viewBox="0 -8 140 88">
      <path className="hw-cape" d="M64 30c-12 4-24 4-36 0 8 8 18 14 32 16z" />
      <path d="M6 58 132 44" className="hw-stick" />
      <path d="M32 53c-10-3-20-7-30-9 6 8 6 16 2 24 10-4 20-6 30-7z" />
      <path d="M30 51.5h6l1 8h-6z" />
      <path d="M58 52c0-12 4-22 12-26 8 4 12 14 14 24z" />
      <path d="M80 50 92 56l4-2 2 3-14 3z" />
      <path d="M74 34c6 6 12 12 22 14" className="hw-arm" />
      <circle cx="72" cy="22" r="5.5" />
      <path d="M77 21.5 82.5 24 77 25z" />
      <path d="M66 22c-4 4-6 8-8 10 4-1 7-3 10-6z" />
      <path d="M59 18.5 87 14.5v2L59 20.5z" />
      <path d="M64 18c2-8 0-16-8-22 10 4 18 12 24 20z" />
    </svg>
  )
}

function Spider() {
  return (
    <svg className="hw-spider-svg" viewBox="0 0 44 44">
      <g className="hw-legs">
        <path d="M18 20c-6-6-10-6-14-2M17 23c-7-2-11-1-15 3M17 26c-6 2-9 5-12 10M18 28c-4 5-6 9-7 14M26 20c6-6 10-6 14-2M27 23c7-2 11-1 15 3M27 26c6 2 9 5 12 10M26 28c4 5 6 9 7 14" />
      </g>
      <ellipse className="hw-sp-body" cx="22" cy="28" rx="8" ry="9" />
      <circle className="hw-sp-body" cx="22" cy="18" r="5" />
      <circle cx="20" cy="17" r="1.8" fill="#fff" /><circle cx="24" cy="17" r="1.8" fill="#fff" />
      <circle cx="20.3" cy="17.4" r=".8" fill="#111" /><circle cx="24.3" cy="17.4" r=".8" fill="#111" />
    </svg>
  )
}

function Pumpkin() {
  return (
    <svg viewBox="0 0 100 90">
      <path d="M50 20c-4-8-2-14 6-17" stroke="#4d5b1f" strokeWidth="5" fill="none" strokeLinecap="round" />
      <ellipse cx="30" cy="55" rx="24" ry="30" fill="#c2410c" />
      <ellipse cx="70" cy="55" rx="24" ry="30" fill="#c2410c" />
      <ellipse cx="50" cy="55" rx="27" ry="33" fill="#f97316" />
      <ellipse cx="40" cy="50" rx="9" ry="24" fill="#fb923c" opacity=".55" />
      <g className="hw-face" fill="#ffd166">
        <path d="M29 47 40 38l2 12zM71 47 60 38l-2 12zM47 57l3-6 3 6z" />
        <path d="M27 64c8 11 38 11 46 0l-6 2-4-4-4 5-6-4-5 4-5-4-4 4z" />
      </g>
    </svg>
  )
}

export default function Halloween({ calm }: { calm: boolean }) {
  const pathname = usePathname()
  const [fx, setFx] = useState<Fx[]>([])
  const [flash, setFlash] = useState<{ n: number; x: number }>({ n: 0, x: 50 })
  const [spider, setSpider] = useState<'up' | 'down'>('up')
  const [frame, setFrame] = useState({ top: 56, left: 0 })
  const [spot] = useState(() => ({ x: rnd(56, 74), drop: rnd(60, 130) }))
  const timers = useRef(new Set<number>())
  const ids = useRef(0)
  const last = useRef<Kind | null>(null)

  const later = useCallback((fn: () => void, ms: number) => {
    const t = window.setTimeout(() => { timers.current.delete(t); fn() }, ms)
    timers.current.add(t)
    return t
  }, [])
  useEffect(() => { const set = timers.current; return () => { set.forEach(clearTimeout); set.clear() } }, [])

  const spawn = useCallback((f: Fx, life: number) => {
    setFx(list => [...list, f])
    later(() => setFx(list => list.filter(x => x.id !== f.id)), life)
  }, [later])

  const flock = useCallback(() => {
    const id = ++ids.current
    const small = window.innerWidth < 700
    const n = small ? 3 : 4 + Math.floor(rnd(0, 3)), base = rnd(14, 46)
    const bats = Array.from({ length: n }, (_, i): BatSpec => ({
      y: base + rnd(-8, 8), size: small ? rnd(18, 28) : rnd(22, 38), dur: rnd(6.5, 9.5),
      delay: i * rnd(0.12, 0.45), amp: rnd(10, 26), bob: rnd(0.7, 1.3), flap: rnd(0.13, 0.19),
    }))
    spawn({ id, kind: 'bats', dir: Math.random() < 0.5 ? 'r' : 'l', bats }, Math.max(...bats.map(b => b.delay + b.dur)) * 1000 + 300)
  }, [spawn])

  const play = useCallback((kind: Kind) => {
    last.current = kind
    const id = ++ids.current
    if (kind === 'lightning') {
      const x = rnd(14, 86)
      setFlash({ n: id, x })
      spawn({ id, kind: 'bolt', x, ...boltPoints() }, 1200)
      // Sometimes the thunder sends the bats flying.
      if (Math.random() < 0.4) later(flock, 700)
    } else if (kind === 'bats') {
      flock()
    } else if (kind === 'ghost') {
      spawn({ id, kind: 'ghost', side: Math.random() < 0.5 ? 'r' : 'l', y: rnd(28, 62) }, 5600)
    } else {
      spawn({ id, kind: 'witch', dir: Math.random() < 0.5 ? 'r' : 'l', y: rnd(2, 16) }, 10500)
    }
  }, [flock, later, spawn])

  // Something happens every 9 to 20 seconds; the first is a lightning strike.
  useEffect(() => {
    if (calm) return
    let alive = true
    const pick = (): Kind => {
      const opts = WEIGHTS.filter(([k]) => k !== last.current)
      let r = Math.random() * opts.reduce((s, [, w]) => s + w, 0)
      for (const [k, w] of opts) { if ((r -= w) <= 0) return k }
      return 'bats'
    }
    const loop = (first: boolean) => later(() => {
      if (!alive) return
      if (!document.hidden) play(first ? 'lightning' : pick())
      loop(false)
    }, first ? 2200 : rnd(9000, 20000))
    loop(true)
    return () => { alive = false }
  }, [calm, later, play])

  // The spider drops down, hangs about, climbs back up, and comes back later.
  // (With reduced motion it just hangs there.)
  const spiderGo = useRef<(to: 'up' | 'down', ms: number) => void>(() => {})
  useEffect(() => {
    if (calm) return
    let t: number | null = null
    const go = (to: 'up' | 'down', ms: number) => {
      if (t) clearTimeout(t)
      t = window.setTimeout(() => {
        if (!document.hidden) setSpider(to)
        go(to === 'down' ? 'up' : 'down', to === 'down' ? rnd(8000, 13000) : rnd(16000, 30000))
      }, ms)
    }
    spiderGo.current = go
    go('down', 5000)
    return () => { if (t) clearTimeout(t); spiderGo.current = () => {} }
  }, [calm])
  const scare = () => { if (calm) return; setSpider('up'); spiderGo.current('down', rnd(18000, 30000)) }

  // Settings → Preview plays a bit of everything.
  useEffect(() => {
    const onPreview = () => {
      play('lightning')
      later(() => setSpider('down'), 500)
      later(() => play('bats'), 1100)
      later(() => play('ghost'), 2600)
      later(() => play('witch'), 3800)
      spiderGo.current('up', 12000)
    }
    window.addEventListener('colvy-season-preview', onPreview)
    return () => window.removeEventListener('colvy-season-preview', onPreview)
  }, [later, play])

  // The scene starts under the app bar and beside the admin rail.
  useEffect(() => {
    const measure = () => {
      const h = document.querySelector('header.cv-app-header')
      const main = document.querySelector('.admin-main')
      const top = Math.round(h ? Math.max(0, h.getBoundingClientRect().bottom) : 0)
      const left = Math.round(main ? Math.max(0, main.getBoundingClientRect().left) : 0)
      setFrame(f => (f.top === top && f.left === left ? f : { top, left }))
    }
    measure()
    const t = later(measure, 900)
    window.addEventListener('resize', measure)
    return () => { clearTimeout(t); window.removeEventListener('resize', measure) }
  }, [pathname, later])

  const vars = { '--hw-top': `${frame.top}px`, '--hw-left': `${frame.left}px` } as React.CSSProperties

  return (
    <>
      <style data-colvy-dark="">{CSS}</style>
      <div className="hw-scene" style={vars} aria-hidden>
        <div className="hw-stars" style={{ boxShadow: STARS.a }} />
        <div className="hw-stars b" style={{ boxShadow: STARS.b }} />
        {flash.n > 0 && <div key={flash.n} className="hw-sky-flash" style={{ '--x': `${flash.x}%` } as React.CSSProperties} />}
        <div className="hw-moon" />
        <div className="hw-orbit"><Bat size={20} className="hw-obat" /></div>
        <div className="hw-orbit b"><Bat size={14} className="hw-obat" /></div>
        <div className="hw-cloud" />
        <div className="hw-cloud b" />
        <svg className="hw-house" viewBox="0 0 240 220">
          <g className="hw-far">
            <path d="M18 220V128H8l44-42 44 42H86v92z" />
            <path d="M44 100l10-4 2 20-10 2z" />
            <path d="M76 220V110H66l54-52 54 52h-10v110z" />
            <path d="M150 220V70h34v150z" />
            <path d="M144 72 167 14l23 58z" />
            <path d="M166 2h2.4v14H166z" />
            <path d="M180 220v-80h-8l34-28 34 28h-8v80z" />
          </g>
          <circle className="hw-win f2" cx="120" cy="96" r="6" />
          <rect className="hw-win f1" x="102" y="124" width="12" height="18" rx="6" />
          <rect className="hw-win-off" x="126" y="124" width="12" height="18" rx="6" />
          <rect className="hw-win f3" x="161" y="86" width="12" height="15" rx="2" />
          <rect className="hw-win-off" x="161" y="120" width="12" height="15" rx="2" />
          <rect className="hw-win f2" x="40" y="150" width="12" height="16" rx="2" />
          <rect className="hw-win f1" x="200" y="160" width="12" height="14" rx="2" />
          <rect className="hw-win-off" x="112" y="176" width="16" height="44" rx="8" />
        </svg>
        <svg className="hw-hills" viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path className="hw-far" d="M0 150c140-32 260-38 400-18 120 18 210-12 360-24 140-10 250 32 390 28 110-4 200-24 290-18v202H0z" />
          <path className="hw-near" d="M0 236c200-22 360-10 540-14s340-22 520-12c160 8 280 16 380 4v106H0z" />
        </svg>
        {(['l', 'r'] as const).map(side => (
          <svg key={side} className={`hw-tree ${side}`} viewBox="0 0 300 480">
            <g className="hw-branches">
              <path d="M150 480c-4-60-10-110-4-160s-8-84-28-120" strokeWidth="30" />
              <path d="M146 330c30-30 60-38 90-68 20-20 26-42 44-56" strokeWidth="14" />
              <path d="M120 206c-24-26-50-36-76-56" strokeWidth="12" />
              <path d="M118 200c4-40-6-72 10-108 8-20 4-40 12-62" strokeWidth="10" />
              <path d="M236 262c12 8 26 6 40 14M206 290c8-28 24-44 30-68M70 168c-10-18-8-38-18-56" strokeWidth="5" />
              <path d="M44 150c-14 0-26 8-38 4M128 92c22-8 32-22 48-26M128 92c-16-12-28-10-40-22" strokeWidth="4" />
              <path d="M140 30c6-10 4-18 10-26M262 220c8-8 6-20 14-28M176 66c10-8 20-6 28-16M88 70c-6-12-4-22-10-32" strokeWidth="3" />
              <path d="M150 470c-20 4-38 6-54 10M152 470c18 4 34 8 52 10" strokeWidth="10" />
            </g>
            <ellipse className="hw-hollow" cx="146" cy="372" rx="10" ry="14" />
            {side === 'r' && <g className="hw-eyes"><ellipse cx="141.5" cy="370" rx="2.6" ry="2.2" /><ellipse cx="150.5" cy="370" rx="2.6" ry="2.2" /></g>}
          </svg>
        ))}
        <svg className="hw-graves" viewBox="0 0 260 110">
          <g className="hw-near">
            <path d="M20 110V58c0-18 14-28 26-28s26 10 26 28v52z" />
            <path d="M108 110V50H96V40h12V24h12v16h12v10h-12v60z" transform="rotate(-6 114 70)" />
            <path d="m160 110 6-44c2-12 14-18 24-16 12 2 18 12 16 24l-6 36z" />
            <path d="M222 110V84c0-8 6-12 14-12s14 4 14 12v26z" />
          </g>
          <text className="hw-rip" x="46" y="70" textAnchor="middle">RIP</text>
        </svg>
        <div className="hw-pkw p1"><Pumpkin /></div>
        <div className="hw-pkw p2"><Pumpkin /></div>
        <div className="hw-pkw p3"><Pumpkin /></div>
        <div className="hw-fog" />
        <div className="hw-fog b" />
      </div>

      <div className="hw-fx" style={vars} aria-hidden>
        {flash.n > 0 && <div key={flash.n} className="hw-flash" />}
        {/* Everything else stays beside the admin rail. */}
        <div className="hw-clip">
        <svg className="hw-web l" viewBox="0 0 124 124"><path d={WEB} /></svg>
        <svg className="hw-web r" viewBox="0 0 124 124"><path d={WEB} /></svg>
        <div className={`hw-spider ${calm ? 'down' : spider}`} style={{ left: `${spot.x}%`, '--drop': `${spot.drop}px` } as React.CSSProperties}>
          <div className="hw-spider-bob" onMouseEnter={scare} onTouchStart={scare}><Spider /></div>
        </div>
        {fx.map(f => {
          if (f.kind === 'bolt') return (
            <svg key={f.id} className="hw-bolt" style={{ left: `${f.x}%` }} viewBox="0 0 120 400" preserveAspectRatio="none">
              <polyline className="g" points={f.main} pathLength={1} />
              <polyline className="g" points={f.branch} pathLength={1} />
              <polyline className="c" points={f.main} pathLength={1} />
              <polyline className="c thin" points={f.branch} pathLength={1} />
            </svg>
          )
          if (f.kind === 'bats') return (
            <div key={f.id} className={`hw-flock ${f.dir}`}>
              {f.bats.map((b, i) => (
                <div key={i} className="hw-bat-path" style={{ top: `${b.y}%`, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }}>
                  <div className="hw-bat-bob" style={{ '--amp': `${b.amp}px`, animationDuration: `${b.bob}s` } as React.CSSProperties}>
                    <Bat size={b.size} flap={b.flap} />
                  </div>
                </div>
              ))}
            </div>
          )
          if (f.kind === 'ghost') return (
            <div key={f.id} className={`hw-ghost ${f.side}`} style={{ top: `${f.y}%` }}>
              <div className="hw-ghost-bob"><Ghost /><span className="hw-boo">Boo!</span></div>
            </div>
          )
          return (
            <div key={f.id} className={`hw-witch ${f.dir}`} style={{ top: `calc(var(--hw-top) + ${f.y}vh)` }}>
              <div className="hw-witch-arc"><Witch /></div>
            </div>
          )
        })}
        </div>
      </div>
    </>
  )
}

// Its own colours for light and dark (this sheet is skipped by components/DarkTheme).
const CSS = `
html[data-season="halloween"]{--coral:#f97316 !important;--coral-hover:#ea580c !important;--peach:rgba(249,115,22,.12) !important}
html[data-season="halloween"] .inbox-root{background:transparent !important}
html[data-season="halloween"] .colvy-ai-orb-wrap .cvo::after{content:'';position:absolute;left:50%;top:-40%;width:82%;height:68%;transform:translateX(-46%) rotate(-14deg);background:${HAT} center/contain no-repeat;pointer-events:none;z-index:3;filter:drop-shadow(0 2px 2px rgba(0,0,0,.3))}

.hw-scene{position:fixed;top:0;right:0;bottom:0;left:var(--hw-left);z-index:-1;pointer-events:none;overflow:hidden;contain:strict;
  --H:clamp(170px,32vh,320px);--moon:clamp(84px,10vw,150px);
  --far:#ddcdee;--near:#cab4e0;--win:#ffad42;--win-off:#cdb9e0;--rip:#e7dcf2;--hollow:#a88bc4;--eye:#7c3aed;
  --fog:rgba(255,255,255,.62);--glow1:rgba(255,186,140,.5);--glow2:rgba(255,186,140,.2);--cloud:rgba(255,255,255,.8);--pk:rgba(255,150,60,.35);
  background:linear-gradient(180deg,#f8f3fd 0%,#f1e7f8 42%,#f6e3d8 78%,#f8d9c2 100%)}
html[data-theme="dark"] .hw-scene{--far:#1d1431;--near:#0c0816;--win-off:#251b3a;--rip:#1e1630;--hollow:#040208;--eye:#ffd34d;
  --fog:rgba(196,186,236,.11);--glow1:rgba(255,236,190,.32);--glow2:rgba(255,236,190,.1);--cloud:rgba(140,120,196,.3);--pk:rgba(255,140,40,.5);
  background:radial-gradient(ellipse 70% 55% at 85% 10%,rgba(124,92,196,.28),transparent 70%),linear-gradient(180deg,#0a0816 0%,#150f2a 38%,#24153d 72%,#34183c 100%)}
.hw-far{fill:var(--far)}.hw-near{fill:var(--near)}
.hw-stars{position:absolute;left:0;top:0;width:1.6px;height:1.6px;border-radius:50%;display:none;animation:hw-twinkle 4.5s ease-in-out infinite alternate}
.hw-stars.b{animation-duration:6.5s;animation-delay:-3s}
html[data-theme="dark"] .hw-stars{display:block}
.hw-sky-flash{position:absolute;inset:0;background:radial-gradient(ellipse 75% 65% at var(--x) 0%,rgba(226,232,255,.95),rgba(160,168,255,.3) 50%,transparent 78%);opacity:0;animation:hw-flash-sky 1.1s ease-out both}
.hw-moon{position:absolute;top:calc(var(--hw-top) + 5vh);right:8vw;width:var(--moon);height:var(--moon);border-radius:50%;
  background:radial-gradient(circle at 30% 34%,rgba(90,70,40,.08) 0 9%,transparent 10%),radial-gradient(circle at 63% 58%,rgba(90,70,40,.09) 0 13%,transparent 14%),radial-gradient(circle at 44% 73%,rgba(90,70,40,.07) 0 6%,transparent 7%),radial-gradient(circle at 71% 30%,rgba(90,70,40,.06) 0 5%,transparent 6%),radial-gradient(circle at 38% 36%,#fffdf4,#f6ecd2 60%,#e6d6ad);
  box-shadow:0 0 40px 12px var(--glow1),0 0 130px 50px var(--glow2)}
.hw-orbit{position:absolute;top:calc(var(--hw-top) + 5vh + var(--moon) / 2);right:calc(8vw + var(--moon) / 2);width:0;height:0;animation:hw-spin 15s linear infinite}
.hw-orbit.b{animation-duration:22s;animation-delay:-9s}
.hw-orbit .hw-obat{position:absolute;left:calc(var(--moon) * .78);top:-10px}
.hw-orbit.b .hw-obat{left:calc(var(--moon) * .98)}
.hw-cloud{position:absolute;top:calc(var(--hw-top) + 8vh);left:0;width:360px;height:56px;border-radius:50%;
  background:radial-gradient(ellipse 50% 50% at 30% 60%,var(--cloud),transparent 70%),radial-gradient(ellipse 40% 60% at 62% 45%,var(--cloud),transparent 70%),radial-gradient(ellipse 35% 45% at 85% 65%,var(--cloud),transparent 70%);
  animation:hw-cloud 150s linear infinite;animation-delay:-60s}
.hw-cloud.b{top:calc(var(--hw-top) + 17vh);width:260px;height:44px;animation-duration:210s;animation-delay:-150s;opacity:.8}
.hw-house{position:absolute;left:5%;bottom:calc(var(--H) * .42);height:clamp(110px,21vh,210px);aspect-ratio:240/220}
.hw-win{fill:var(--win);filter:drop-shadow(0 0 4px rgba(255,170,60,.8))}
.hw-win.f1{animation:hw-candle 3.4s infinite}.hw-win.f2{animation:hw-candle 4.6s infinite -1.3s}.hw-win.f3{animation:hw-candle 2.8s infinite -2s}
.hw-win-off{fill:var(--win-off)}
.hw-hills{position:absolute;left:0;bottom:0;width:100%;height:var(--H)}
.hw-tree{position:absolute;bottom:calc(var(--H) * .16);height:clamp(230px,54vh,500px);aspect-ratio:300/480}
.hw-tree.l{left:-3%}
.hw-tree.r{right:-4%;height:clamp(210px,47vh,440px);transform:scaleX(-1)}
.hw-branches{fill:none;stroke:var(--near);stroke-linecap:round}
.hw-hollow{fill:var(--hollow)}
.hw-eyes{fill:var(--eye);transform-box:fill-box;transform-origin:center;animation:hw-blink 5s infinite}
.hw-graves{position:absolute;left:31%;bottom:calc(var(--H) * .1);height:clamp(44px,8vh,80px);aspect-ratio:260/110}
.hw-rip{fill:var(--rip);font:700 12px -apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:.5px}
.hw-pkw{position:absolute;aspect-ratio:100/90}
.hw-pkw svg{position:relative;width:100%;height:100%;display:block}
.hw-pkw::before{content:'';position:absolute;inset:-55%;border-radius:50%;background:radial-gradient(circle,var(--pk),transparent 62%);animation:hw-candle 3s infinite}
.hw-pkw.p1{left:19%;bottom:calc(var(--H) * .05);height:clamp(44px,7.5vh,74px)}
.hw-pkw.p2{right:21%;bottom:calc(var(--H) * .08);height:clamp(38px,6vh,60px)}
.hw-pkw.p2::before{animation-delay:-1.1s}
.hw-pkw.p3{right:26.5%;bottom:calc(var(--H) * .035);height:clamp(28px,4.4vh,44px)}
.hw-pkw.p3::before{animation-delay:-2.2s}
.hw-face{animation:hw-candle 2.6s infinite}
.hw-fog{position:absolute;left:0;bottom:-3vh;width:200%;height:26vh;background-repeat:repeat-x;background-size:50% 100%;
  background-image:radial-gradient(ellipse 22% 55% at 12% 75%,var(--fog),transparent 70%),radial-gradient(ellipse 30% 45% at 46% 85%,var(--fog),transparent 70%),radial-gradient(ellipse 20% 60% at 80% 72%,var(--fog),transparent 70%);
  animation:hw-drift 80s linear infinite}
.hw-fog.b{bottom:-6vh;height:20vh;opacity:.8;animation-duration:125s;animation-direction:reverse;
  background-image:radial-gradient(ellipse 26% 50% at 28% 70%,var(--fog),transparent 70%),radial-gradient(ellipse 18% 60% at 64% 80%,var(--fog),transparent 70%),radial-gradient(ellipse 24% 50% at 92% 76%,var(--fog),transparent 70%)}

.hw-fx{position:fixed;inset:0;z-index:48;pointer-events:none;overflow:hidden;
  --bat:#2a1d38;--bat-glow:none;--silk:rgba(90,80,110,.45);--webc:rgba(110,100,130,.42);--spider:#241a30;--witch:#2a1d38;--witch-glow:none}
html[data-theme="dark"] .hw-fx{--bat:#120c1a;--bat-glow:drop-shadow(0 0 5px rgba(255,160,80,.55));--silk:rgba(255,255,255,.3);--webc:rgba(255,255,255,.2);--spider:#17111f;--witch:#0c0812;--witch-glow:drop-shadow(0 0 9px rgba(255,236,190,.55))}
.hw-flash{position:absolute;inset:0;background:#2b1d4a;opacity:0;animation:hw-flash-dim 1.1s ease-out both}
html[data-theme="dark"] .hw-flash{background:#dfe6ff;animation-name:hw-flash}
.hw-bolt{position:absolute;top:var(--hw-top);width:110px;height:46vh;margin-left:-55px;overflow:visible;opacity:0;animation:hw-bolt 1s ease-out both;
  filter:drop-shadow(0 0 5px rgba(120,100,230,.9)) drop-shadow(0 0 16px rgba(110,90,230,.55))}
html[data-theme="dark"] .hw-bolt{filter:drop-shadow(0 0 6px rgba(180,196,255,.95)) drop-shadow(0 0 20px rgba(130,150,255,.6))}
.hw-bolt polyline{fill:none;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke;stroke-dasharray:1;stroke-dashoffset:1;animation:hw-draw .13s linear forwards}
.hw-bolt .g{stroke:rgba(190,200,255,.55);stroke-width:7}
.hw-bolt .c{stroke:#fff;stroke-width:2.4}
.hw-bolt .c.thin{stroke-width:1.5}
.hw-web{position:absolute;top:var(--hw-top);width:clamp(64px,8vw,118px);height:clamp(64px,8vw,118px);fill:none;stroke:var(--webc);stroke-width:.9}
.hw-web path{vector-effect:non-scaling-stroke}
@media (max-width:700px){.hw-web{width:46px;height:46px;opacity:.7}}
.hw-clip{position:absolute;top:0;right:0;bottom:0;left:var(--hw-left);overflow:hidden}
.hw-web.l{left:0}
.hw-web.r{right:0;transform:scaleX(-1)}
.hw-spider{position:absolute;top:0;width:34px;margin-left:-17px;transform:translateY(-80px);transition:transform 1.1s cubic-bezier(.5,0,.75,0)}
.hw-spider.down{transform:translateY(calc(var(--hw-top) + var(--drop)));transition:transform 2.6s cubic-bezier(.25,1.3,.45,1)}
.hw-spider::before{content:'';position:absolute;left:50%;bottom:calc(100% - 13px);width:1px;height:100vh;background:var(--silk)}
.hw-spider-bob{animation:hw-bob-s 2.6s ease-in-out infinite alternate}
.hw-spider.down .hw-spider-bob{pointer-events:auto}
.hw-spider-svg{display:block;width:34px;height:34px;filter:var(--bat-glow)}
.hw-legs{fill:none;stroke:var(--spider);stroke-width:2;stroke-linecap:round;transform-box:fill-box;transform-origin:center;animation:hw-legs .5s ease-in-out infinite alternate}
.hw-sp-body{fill:var(--spider)}
.hw-flock{position:absolute;inset:0}
.hw-bat-path{position:absolute;left:0;animation:hw-fly-r 8s linear both}
.hw-flock.l .hw-bat-path{animation-name:hw-fly-l}
.hw-flock.l .hw-bat{transform:scaleX(-1)}
.hw-bat-bob{animation:hw-bob 1s ease-in-out infinite alternate}
.hw-bat{display:block;fill:var(--bat);filter:var(--bat-glow);overflow:visible}
.hw-wl,.hw-wr{animation:hw-flap var(--flap,.16s) ease-in-out infinite alternate}
.hw-wl{transform-origin:31px 15px}.hw-wr{transform-origin:33px 15px;animation-name:hw-flap-r}
.hw-bat-eye{fill:#ffb347}
.hw-ghost{position:absolute;width:clamp(64px,7vw,96px)}
.hw-ghost.r{right:0;animation:hw-ghost-r 5.4s ease-in-out both}
.hw-ghost.l{left:0;animation:hw-ghost-l 5.4s ease-in-out both}
.hw-ghost-bob{position:relative;animation:hw-bob 1.6s ease-in-out infinite alternate;--amp:6px}
.hw-ghost-svg{display:block;width:100%;height:auto;opacity:.96;filter:drop-shadow(0 6px 14px rgba(40,20,80,.25))}
html[data-theme="dark"] .hw-ghost-svg{filter:drop-shadow(0 0 14px rgba(200,210,255,.5))}
.hw-ghost.l .hw-ghost-svg{transform:scaleX(-1)}
.hw-ghost-eyes{transform-box:fill-box;transform-origin:center;animation:hw-blink 2.7s infinite .9s}
.hw-boo{position:absolute;top:-6px;padding:4px 10px;border-radius:12px 12px 12px 3px;background:#fff;color:#1f1b2e;font:800 13px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.2);opacity:0;animation:hw-boo 5.4s ease-out both;white-space:nowrap}
.hw-ghost.r .hw-boo{right:92%;border-radius:12px 12px 3px 12px}
.hw-ghost.l .hw-boo{left:92%}
.hw-witch{position:absolute;left:0;width:clamp(90px,9vw,130px);animation:hw-witch-r 10s linear both}
.hw-witch.l{animation-name:hw-witch-l}
.hw-witch.l .hw-witch-svg{transform:scaleX(-1)}
.hw-witch-arc{animation:hw-arc 10s ease-in-out both}
.hw-witch-svg{display:block;width:100%;height:auto;fill:var(--witch);filter:var(--witch-glow);overflow:visible}
.hw-stick,.hw-arm{fill:none;stroke:var(--witch);stroke-linecap:round}
.hw-stick{stroke-width:3.2}.hw-arm{stroke-width:4}
.hw-cape{transform-box:fill-box;transform-origin:right center;animation:hw-cape .5s ease-in-out infinite alternate}

@keyframes hw-twinkle{from{opacity:.35}to{opacity:1}}
@keyframes hw-spin{to{transform:rotate(360deg)}}
@keyframes hw-cloud{from{transform:translateX(105vw)}to{transform:translateX(-420px)}}
@keyframes hw-drift{to{transform:translateX(-50%)}}
@keyframes hw-candle{0%,100%{opacity:1}18%{opacity:.82}20%{opacity:1}48%{opacity:.9}50%{opacity:.68}53%{opacity:1}78%{opacity:.86}}
@keyframes hw-blink{0%,44%,50%,100%{transform:scaleY(1)}47%{transform:scaleY(.1)}}
@keyframes hw-flash{0%{opacity:0}5%{opacity:.17}12%{opacity:.04}20%{opacity:.13}48%,100%{opacity:0}}
@keyframes hw-flash-dim{0%{opacity:0}5%{opacity:.13}12%{opacity:.03}20%{opacity:.1}48%,100%{opacity:0}}
@keyframes hw-flash-sky{0%{opacity:0}5%{opacity:1}12%{opacity:.3}20%{opacity:.85}60%,100%{opacity:0}}
@keyframes hw-bolt{0%{opacity:0}4%{opacity:1}10%{opacity:.35}16%{opacity:1}55%{opacity:.75}100%{opacity:0}}
@keyframes hw-draw{to{stroke-dashoffset:0}}
@keyframes hw-bob-s{from{transform:translateY(-3px)}to{transform:translateY(3px)}}
@keyframes hw-legs{from{transform:rotate(-4deg)}to{transform:rotate(4deg)}}
@keyframes hw-fly-r{from{transform:translateX(-14vw)}to{transform:translateX(112vw)}}
@keyframes hw-fly-l{from{transform:translateX(112vw)}to{transform:translateX(-14vw)}}
@keyframes hw-bob{from{transform:translateY(calc(var(--amp) * -1))}to{transform:translateY(var(--amp))}}
@keyframes hw-flap{from{transform:rotate(14deg)}to{transform:rotate(-30deg) scaleY(.75)}}
@keyframes hw-flap-r{from{transform:rotate(-14deg)}to{transform:rotate(30deg) scaleY(.75)}}
@keyframes hw-ghost-r{0%{transform:translateX(130%)}16%{transform:translateX(-18px)}22%{transform:translateX(-8px)}80%{transform:translateX(-12px)}100%{transform:translateX(130%)}}
@keyframes hw-ghost-l{0%{transform:translateX(-130%)}16%{transform:translateX(18px)}22%{transform:translateX(8px)}80%{transform:translateX(12px)}100%{transform:translateX(-130%)}}
@keyframes hw-boo{0%,24%{opacity:0;transform:scale(.6)}30%{opacity:1;transform:scale(1.08)}34%,66%{opacity:1;transform:scale(1)}72%,100%{opacity:0;transform:scale(.8)}}
@keyframes hw-witch-r{from{transform:translateX(-180px) rotate(-4deg)}to{transform:translateX(calc(100vw + 40px)) rotate(-4deg)}}
@keyframes hw-witch-l{from{transform:translateX(calc(100vw + 40px)) rotate(4deg)}to{transform:translateX(-180px) rotate(4deg)}}
@keyframes hw-arc{0%{transform:translateY(30px)}50%{transform:translateY(-24px)}100%{transform:translateY(16px)}}
@keyframes hw-cape{from{transform:scaleY(1)}to{transform:scaleY(.8) skewX(-6deg)}}
@media (prefers-reduced-motion:reduce){.hw-scene *,.hw-fx *{animation:none !important;transition:none !important}.hw-flash,.hw-sky-flash,.hw-bolt{display:none}}
`
