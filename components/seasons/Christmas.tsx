'use client'

// The Christmas theme (lib/seasonal-themes). Behind the app: a snowy
// landscape, a pine forest on the hills, a log cabin with lit windows and
// smoke from the chimney, a decorated tree with twinkling lights and presents,
// and a snowman. At night: stars, a moon and the northern lights. Over it:
// falling snow, fairy lights along the app bar, and a bauble that drops down
// on its ribbon and swings (it spins back up if you go near it). Now and then:
// Santa's sleigh flies past, Santa peeks in with "Ho ho ho!", a present floats
// down on a parachute, a gust of snow blows through, or a star shoots across.
// The Colvy orb wears a Santa hat and the accent turns Christmas red.
//
// Like Halloween: transforms and opacity only, effects pause while the tab is
// hidden, and with reduced motion only the still scene shows.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { rnd, useLater, useSceneFrame, useSceneHidden } from './kit'
import { takePreview } from '@/lib/seasonal-themes'

type Kind = 'sleigh' | 'peek' | 'gift' | 'gust' | 'star'
type Fx =
  | { id: number; kind: 'sleigh'; dir: 'r' | 'l'; y: number }
  | { id: number; kind: 'peek'; side: 'r' | 'l'; y: number }
  | { id: number; kind: 'gift'; x: number; c: number }
  | { id: number; kind: 'gust'; flakes: { y: number; s: number; d: number; dl: number; dy: number }[] }
  | { id: number; kind: 'star'; x: number; y: number }

const WEIGHTS: [Kind, number][] = [['sleigh', 2], ['peek', 2], ['gift', 2], ['gust', 2.4], ['star', 2]]
const BULBS = ['#ff4d4f', '#ffcc33', '#33d17a', '#3ea6ff', '#ff7ad9']
const GIFTS = [['#2f9e5b', '#e03131'], ['#d62839', '#ffd43b'], ['#3b82f6', '#f8f9fa']]

// The night sky's stars, the same every time.
const STARS = (() => {
  let seed = 11
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const a: string[] = [], b: string[] = []
  for (let i = 0; i < 80; i++) (i % 2 ? a : b).push(`${(r() * 100).toFixed(1)}vw ${(r() * 52).toFixed(1)}vh 0 ${r() < 0.15 ? '0.6px' : '0'} rgba(255,255,255,${(0.35 + r() * 0.6).toFixed(2)})`)
  return { a: a.join(','), b: b.join(',') }
})()

const HAT = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 52"><path d="M10 40C12 22 24 8 42 8c8 0 14 4 16 12l2 14c-6-6-12-8-16-6 0-6-4-10-10-8-8 2-14 10-16 20z" fill="#d62839"/><path d="M42 8c8 0 14 4 16 12l2 14c-6-6-12-8-16-6z" fill="#b5172b"/><circle cx="60" cy="38" r="6" fill="#fff"/><rect x="4" y="36" width="40" height="11" rx="5.5" fill="#fff"/></svg>')}")`

// One swag of fairy lights: a sagging wire with four bulbs.
const SWAG = (() => {
  const pts = [0.12, 0.37, 0.63, 0.88].map(t => ({ x: 150 * t, y: 3 * (1 - t) ** 2 + 44 * (1 - t) * t + 3 * t * t }))
  return pts
})()

function Pine({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={`xm-pine ${className}`} style={style} viewBox="0 0 100 160" aria-hidden>
      <rect className="xm-trunk" x="44" y="126" width="12" height="34" />
      <path className="xm-pine-g" d="M50 62 92 130H8zM50 30l32 54H18zM50 0l24 44H26z" />
      <path className="xm-cap" d="M50 0l11 20c-4 3-7-1-11 3-4-4-7 0-11-3zM26 44h48c-3 5-7 1-10 5-3-4-6 0-9-3-3 3-6-1-9 3-3-4-6 0-9-3-2 3-6 1-11-2zM18 84h64c-4 6-8 1-12 6-4-5-7 0-11-4-4 4-7-1-11 4-4-5-7 0-11-4-4 4-8-1-11 4-4-6-7 1-8-6zM8 130h84c-5 6-10 1-14 6-4-5-8 0-12-4-4 4-8-1-12 4-4-5-8 0-12-4-4 4-8-1-12 4-4-5-9 1-10-6z" />
    </svg>
  )
}

function BigTree() {
  const baubles: [number, number, string][] = [[68, 70, '#e03131'], [92, 92, '#ffd43b'], [58, 116, '#3b82f6'], [100, 134, '#e03131'], [70, 160, '#ffd43b'], [44, 168, '#e64980'], [112, 176, '#3b82f6'], [86, 120, '#e64980'], [48, 142, '#ffd43b'], [124, 152, '#ffd43b']]
  const lights: [number, number][] = [[80, 52], [64, 84], [96, 78], [74, 104], [110, 112], [52, 130], [84, 146], [118, 140], [40, 156], [66, 182], [98, 170], [128, 180], [34, 182]]
  return (
    <svg viewBox="0 0 160 240" aria-hidden>
      <rect x="72" y="196" width="16" height="22" fill="#6b4226" />
      <path className="xm-pine-g big" d="M80 96 146 196H14zM80 54l52 82H28zM80 20l38 60H42z" />
      <path className="xm-cap" d="M42 80h76c-4 5-9 1-13 5-4-4-8 0-12-3-4 3-8-1-12 3-4-4-8 0-12-3-4 3-8-1-12 3-4-4-9 1-15-5zM28 136h104c-5 6-10 1-15 6-5-5-9 0-14-4-5 4-9-1-14 4-5-5-9 0-14-4-5 4-9-1-14 4-5-5-10 1-19-6zM14 196h132c-6 6-12 1-18 6-6-5-11 0-16-4-6 4-11-1-17 4-6-5-11 0-16-4-6 4-11-1-17 4-6-5-12 1-31-6z" />
      <path d="M48 74c20 10 44 8 66-4M36 128c30 14 64 12 92-6M24 186c40 14 84 12 116-8" fill="none" stroke="#f2c14e" strokeWidth="2.4" strokeLinecap="round" opacity=".9" />
      {lights.map(([x, y], i) => <circle key={i} className="xm-tl" cx={x} cy={y} r="2.4" fill={BULBS[i % BULBS.length]} style={{ '--i': i } as React.CSSProperties} />)}
      {baubles.map(([x, y, c], i) => <g key={i}><circle cx={x} cy={y} r="5.2" fill={c} /><circle cx={x - 1.6} cy={y - 1.8} r="1.6" fill="#fff" opacity=".7" /></g>)}
      <path className="xm-star" d="m80 2 4.6 9.4 10.4 1.5-7.5 7.3 1.8 10.3L80 25.6l-9.3 4.9 1.8-10.3-7.5-7.3 10.4-1.5z" />
      <g transform="translate(26 200)"><rect width="30" height="24" rx="2" fill="#d62839" /><rect x="13" width="4" height="24" fill="#ffd43b" /><rect y="9" width="30" height="4" fill="#ffd43b" /><path d="M15 0c-6-6-12-2-8 2zM15 0c6-6 12-2 8 2z" fill="#ffd43b" /></g>
      <g transform="translate(96 206)"><rect width="34" height="18" rx="2" fill="#2f9e5b" /><rect x="15" width="4" height="18" fill="#e03131" /><path d="M17 0c-6-5-11-1-7 2zM17 0c6-5 11-1 7 2z" fill="#e03131" /></g>
      <g transform="translate(60 210)"><rect width="22" height="14" rx="2" fill="#3b82f6" /><rect x="9" width="4" height="14" fill="#f8f9fa" /></g>
    </svg>
  )
}

function Cabin() {
  return (
    <svg viewBox="0 0 200 160" aria-hidden>
      <rect x="132" y="34" width="16" height="40" fill="#8a4b36" />
      <path d="M128 34c2-8 22-8 24 0-6 4-18 4-24 0z" className="xm-snowc" />
      <path d="M30 76h140v84H30z" fill="#8b5a3c" />
      <path d="M30 92h140M30 108h140M30 124h140M30 140h140" stroke="#6f452d" strokeWidth="2" />
      <path d="M14 82 100 22l86 60z" fill="#5c3a24" />
      <path className="xm-snowc" d="M8 84c0-6 4-8 8-8L100 16l84 60c4 0 8 2 8 8-8 4-14-2-20 3-6-4-12 2-18-2-6 4-12-2-18 2-6-4-12 2-18-1-6 3-12-3-18 1-6-4-12 2-18-2-6 4-12-2-18 2-6-4-12 2-18-1-6 3-12-3-18 1-6-4-10 2-16-3z" />
      <rect x="88" y="112" width="24" height="48" rx="3" fill="#4a2c1b" />
      <circle cx="100" cy="124" r="8" fill="none" stroke="#2f9e5b" strokeWidth="3.5" /><path d="M96 131l4-3 4 3" fill="none" stroke="#e03131" strokeWidth="2.4" strokeLinecap="round" />
      <rect className="xm-win" x="44" y="100" width="28" height="24" rx="2" /><rect className="xm-win b" x="128" y="100" width="28" height="24" rx="2" />
      <path d="M58 100v24M44 112h28M142 100v24M128 112h28" stroke="#6f452d" strokeWidth="2.4" />
    </svg>
  )
}

function Snowman() {
  return (
    <svg viewBox="0 0 90 130" aria-hidden>
      <defs><radialGradient id="xm-sm" cx=".38" cy=".32" r=".75"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#d6e2f0" /></radialGradient></defs>
      <path className="xm-arm" d="M22 58 4 44M8 48l-6-2M8 48l-2-6" stroke="#7a4a2a" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <path d="M68 58l18-10M82 50l6 0" stroke="#7a4a2a" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <circle cx="45" cy="98" r="30" fill="url(#xm-sm)" />
      <circle cx="45" cy="58" r="21" fill="url(#xm-sm)" />
      <circle cx="45" cy="27" r="15" fill="url(#xm-sm)" />
      <path d="M30 40c10 6 20 6 30 0l2 6c-10 6-24 6-34 0z" fill="#d62839" /><path d="M54 44l6 18-7 1-4-16z" fill="#b5172b" />
      <rect x="31" y="10" width="28" height="4" rx="2" fill="#1f2933" /><rect x="35" y="-6" width="20" height="18" rx="2" fill="#1f2933" /><rect x="35" y="6" width="20" height="4" fill="#d62839" />
      <circle cx="40" cy="24" r="1.8" fill="#1f2933" /><circle cx="50" cy="24" r="1.8" fill="#1f2933" />
      <path d="M45 28l12 3-12 2z" fill="#f08c00" />
      <circle cx="45" cy="56" r="2" fill="#1f2933" /><circle cx="45" cy="66" r="2" fill="#1f2933" /><circle cx="45" cy="92" r="2.2" fill="#1f2933" /><circle cx="45" cy="104" r="2.2" fill="#1f2933" />
    </svg>
  )
}

function Bauble() {
  return (
    <svg className="xm-bauble" viewBox="0 0 40 48" aria-hidden>
      <defs><radialGradient id="xm-bb" cx=".35" cy=".35" r=".8"><stop offset="0" stopColor="#ff6b7d" /><stop offset=".55" stopColor="#d0112b" /><stop offset="1" stopColor="#7d0a1c" /></radialGradient></defs>
      <path d="M17 4a3 3 0 1 1 6 0" fill="none" stroke="#e6b84a" strokeWidth="1.6" />
      <rect x="14" y="5" width="12" height="7" rx="1.5" fill="#e6b84a" />
      <circle cx="20" cy="29" r="17" fill="url(#xm-bb)" />
      <path d="M4.5 26c5 4 10 4 15.5 0s10.5-4 15.5 0" fill="none" stroke="#ffd166" strokeWidth="1.8" />
      <path d="M5 33c5 4 10 4 15 0s10-4 15 0" fill="none" stroke="#ffd166" strokeWidth="1.2" opacity=".8" />
      <ellipse cx="13.5" cy="21" rx="4" ry="2.6" fill="#fff" opacity=".55" transform="rotate(-30 13.5 21)" />
    </svg>
  )
}

function Sleigh() {
  const deer = (ox: number, rudolph: boolean) => (
    <g key={ox}>
      <path d="M0 0" />
      <g className="xm-legs b"><path d={`M${ox - 10} 44l-4 12M${ox - 5} 45l-1 12`} /></g>
      <g className="xm-legs f"><path d={`M${ox + 6} 45l3 12M${ox + 11} 44l5 11`} /></g>
      <ellipse cx={ox} cy="40" rx="15" ry="7.5" fill="#8b5a3c" />
      <path d={`M${ox + 10} 36c4-4 6-8 8-12l5 2c-2 5-5 9-9 13z`} fill="#8b5a3c" />
      <ellipse cx={ox + 21} cy="25" rx="6" ry="4.6" fill="#8b5a3c" />
      <path d={`M${ox + 18} 21l-3-8m1.5 3.5-4-1M${ox + 22} 20.5l2-8m-1 3.5 4-1.6`} stroke="#5a3a22" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <circle cx={ox + 22} cy="24" r="1" fill="#1f2933" />
      <path d={`M${ox - 15} 38l-5-3`} stroke="#8b5a3c" strokeWidth="3" strokeLinecap="round" />
      {rudolph ? <circle className="xm-nose" cx={ox + 27} cy="26" r="2.6" fill="#ff2a2a" /> : <circle cx={ox + 27} cy="26" r="1.6" fill="#3b2416" />}
      <path d={`M${ox - 6} 35c4 3 10 3 14 0`} stroke="#d62839" strokeWidth="2" fill="none" />
    </g>
  )
  return (
    <svg className="xm-sleigh-svg" viewBox="0 -4 250 70" aria-hidden>
      <path d="M66 38c12 2 20 2 32 0s22-2 34 0 22 2 34 0 22-2 34 0" fill="none" stroke="#c9a46a" strokeWidth="1.3" />
      {deer(110, false)}{deer(160, false)}{deer(210, true)}
      <ellipse cx="16" cy="22" rx="9" ry="11" fill="#2f9e5b" /><path d="M12 12c2-4 8-4 9 0" stroke="#ffd43b" strokeWidth="2" fill="none" />
      <circle cx="31" cy="22" r="10" fill="#d62839" />
      <circle cx="35" cy="8" r="5.5" fill="#f5c9a8" />
      <path d="M30 10c0 6 3 10 7 10s6-4 5-9c-2 2-4 2-6 1-2 1-4 0-6-2z" fill="#fff" />
      <path d="M30 6c0-6 6-9 11-6l4 6c-3-1-6-1-8 0z" fill="#d62839" /><circle cx="45" cy="6" r="2.2" fill="#fff" /><rect x="29" y="4" width="13" height="3.4" rx="1.7" fill="#fff" />
      <path d="M6 44c0-14 8-20 20-20h34l6 20c0 8-8 12-18 12H18C10 56 6 50 6 44z" fill="#d62839" />
      <path d="M8 40h56" stroke="#ffd43b" strokeWidth="2" />
      <path d="M2 62h62c8 0 12-4 12-8M16 56v6M50 56v6" stroke="#e6b84a" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </svg>
  )
}

function SantaFace() {
  return (
    <svg className="xm-santa" viewBox="0 0 96 104" aria-hidden>
      <path d="M14 42C16 18 38 4 62 8c14 3 24 14 26 28l-8 4c-4-10-12-16-22-17C40 22 26 30 22 46z" fill="#d62839" />
      <path d="M62 8c14 3 24 14 26 28l-8 4c-2-12-8-20-18-23z" fill="#b5172b" />
      <circle cx="86" cy="42" r="7" fill="#fff" />
      <circle cx="48" cy="56" r="24" fill="#f6cfb1" />
      <rect x="16" y="34" width="62" height="14" rx="7" fill="#fff" />
      <g className="xm-wink"><ellipse cx="39" cy="56" rx="3" ry="3.6" fill="#1f2933" /></g>
      <ellipse cx="57" cy="56" rx="3" ry="3.6" fill="#1f2933" />
      <ellipse cx="33" cy="65" rx="5" ry="3" fill="#ff9aa8" opacity=".8" /><ellipse cx="63" cy="65" rx="5" ry="3" fill="#ff9aa8" opacity=".8" />
      <path d="M22 66c0 22 12 36 26 36s26-14 26-36c-6 6-12 8-18 6-4 4-12 4-16 0-6 2-12 0-18-6z" fill="#fff" />
      <ellipse cx="48" cy="64" rx="4.4" ry="3.8" fill="#e8a089" />
      <path d="M48 70c-6-4-14-4-18 1 6 2 12 2 18-1zM48 70c6-4 14-4 18 1-6 2-12 2-18-1z" fill="#f1f3f5" />
      <path d="M43 78c3 3 7 3 10 0" stroke="#c0392b" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  )
}

function GiftChute({ c }: { c: number }) {
  const [box, ribbon] = GIFTS[c % GIFTS.length]
  return (
    <svg className="xm-chute-svg" viewBox="0 0 70 96" aria-hidden>
      <path d="M4 30C4 12 18 2 35 2s31 10 31 28c-5-4-10-4-15 0-5-4-11-4-16 0-5-4-11-4-16 0-5-4-10-4-15 0z" fill="#fff" stroke="#e03131" strokeWidth="1.5" />
      <path d="M19 30C19 14 26 3 35 2c9 1 16 12 16 28-5-4-11-4-16 0-5-4-11-4-16 0z" fill="#e03131" />
      <path d="M5 30l20 40M65 30 45 70M35 30v40" stroke="#94a3b8" strokeWidth="1" />
      <rect x="20" y="66" width="30" height="26" rx="3" fill={box} />
      <rect x="33" y="66" width="4" height="26" fill={ribbon} /><rect x="20" y="76" width="30" height="4" fill={ribbon} />
      <path d="M35 66c-7-7-13-2-8 2zM35 66c7-7 13-2 8 2z" fill={ribbon} />
    </svg>
  )
}

export default function Christmas({ calm }: { calm: boolean }) {
  const frame = useSceneFrame()
  const sceneHidden = useSceneHidden()
  const later = useLater()
  const [fx, setFx] = useState<Fx[]>([])
  const [orn, setOrn] = useState<'up' | 'down'>('up')
  const [spot] = useState(() => ({ x: rnd(58, 74), drop: rnd(70, 140) }))
  const ids = useRef(0)
  const last = useRef<Kind | null>(null)

  // Falling snow: fewer flakes on a phone. Some are little crystals.
  const flakes = useMemo(() => {
    const n = typeof window !== 'undefined' && window.innerWidth < 700 ? 24 : 48
    return Array.from({ length: n }, (_, i) => {
      const d = rnd(9, 19)
      return { x: rnd(0, 100), s: i % 9 === 0 ? rnd(11, 16) : rnd(3, 8), d, dl: -rnd(0, d), sw: rnd(8, 28), sd: rnd(2.4, 5), o: rnd(0.55, 0.95), crystal: i % 9 === 0 }
    })
  }, [])

  const spawn = useCallback((f: Fx, life: number) => {
    setFx(list => [...list, f])
    later(() => setFx(list => list.filter(x => x.id !== f.id)), life)
  }, [later])

  const play = useCallback((kind: Kind) => {
    last.current = kind
    const id = ++ids.current
    if (kind === 'sleigh') spawn({ id, kind, dir: Math.random() < 0.65 ? 'r' : 'l', y: rnd(2, 14) }, 12500)
    else if (kind === 'peek') spawn({ id, kind, side: Math.random() < 0.5 ? 'r' : 'l', y: rnd(28, 60) }, 5600)
    else if (kind === 'gift') spawn({ id, kind, x: rnd(18, 82), c: Math.floor(rnd(0, 3)) }, 9500)
    else if (kind === 'gust') {
      const flakes = Array.from({ length: window.innerWidth < 700 ? 16 : 30 }, () => ({ y: rnd(4, 80), s: rnd(3, 8), d: rnd(1.4, 2.4), dl: rnd(0, 0.9), dy: rnd(6, 22) }))
      spawn({ id, kind, flakes }, 3800)
    } else spawn({ id, kind, x: rnd(8, 55), y: rnd(2, 18) }, 1800)
  }, [spawn])

  // Something happens every 10 to 20 seconds; the first is Santa's sleigh.
  useEffect(() => {
    if (calm) return
    let alive = true
    const pick = (): Kind => {
      const opts = WEIGHTS.filter(([k]) => k !== last.current)
      let r = Math.random() * opts.reduce((s, [, w]) => s + w, 0)
      for (const [k, w] of opts) { if ((r -= w) <= 0) return k }
      return 'gust'
    }
    const loop = (first: boolean) => later(() => {
      if (!alive) return
      if (!document.hidden) play(first ? 'sleigh' : pick())
      loop(false)
    }, first ? 2400 : rnd(10000, 20000))
    loop(true)
    return () => { alive = false }
  }, [calm, later, play])

  // The bauble drops down on its ribbon, swings, goes back up, and comes back.
  const ornGo = useRef<(to: 'up' | 'down', ms: number) => void>(() => {})
  useEffect(() => {
    if (calm) return
    let t: number | null = null
    const go = (to: 'up' | 'down', ms: number) => {
      if (t) clearTimeout(t)
      t = window.setTimeout(() => {
        if (!document.hidden) setOrn(to)
        go(to === 'down' ? 'up' : 'down', to === 'down' ? rnd(10000, 15000) : rnd(16000, 30000))
      }, ms)
    }
    ornGo.current = go
    go('down', 5500)
    return () => { if (t) clearTimeout(t); ornGo.current = () => {} }
  }, [calm])
  const spin = () => { if (calm) return; setOrn('up'); ornGo.current('down', rnd(18000, 30000)) }

  // Settings → Preview plays a bit of everything.
  useEffect(() => {
    const run = () => {
      play('sleigh')
      later(() => setOrn('down'), 500)
      later(() => play('gust'), 1300)
      later(() => play('peek'), 2600)
      later(() => play('gift'), 3600)
      later(() => play('star'), 5200)
      ornGo.current('up', 13000)
    }
    const onPreview = () => { if (takePreview('christmas')) run() }
    onPreview()
    window.addEventListener('colvy-season-preview', onPreview)
    return () => window.removeEventListener('colvy-season-preview', onPreview)
  }, [later, play])

  const vars = { '--xm-top': `${frame.top}px`, '--xm-left': `${frame.left}px` } as React.CSSProperties
  const swags = Math.ceil(frame.width / 150) + 1

  return (
    <>
      <style data-colvy-dark="">{CSS}</style>
      {!sceneHidden && <div className="xm-scene" style={vars} aria-hidden>
        <div className="xm-stars" style={{ boxShadow: STARS.a }} />
        <div className="xm-stars b" style={{ boxShadow: STARS.b }} />
        <div className="xm-aurora" /><div className="xm-aurora b" />
        <div className="xm-moon" />
        {[[3, 0.8], [13, 0.62], [21, 0.92], [54, 0.7], [61, 1], [68, 0.66], [84, 0.84], [92, 0.6]].map(([x, h], i) => (
          <Pine key={i} className="far" style={{ left: `${x}%`, height: `calc(clamp(44px, 9vh, 86px) * ${h})` }} />
        ))}
        <div className="xm-cabin">
          <Cabin />
          <i className="xm-smoke" /><i className="xm-smoke b" /><i className="xm-smoke c" />
        </div>
        <svg className="xm-hills" viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden>
          <path className="xm-far" d="M0 150c140-30 260-36 400-16 120 18 210-12 360-22 140-10 250 30 390 26 110-4 200-22 290-16v198H0z" />
          <path className="xm-near" d="M0 232c200-22 360-10 540-14s340-22 520-12c160 8 280 16 380 4v110H0z" />
        </svg>
        <Pine className="near" style={{ left: '-1.5%', height: 'clamp(150px, 34vh, 320px)' }} />
        <Pine className="near" style={{ left: '7.5%', height: 'clamp(100px, 22vh, 210px)' }} />
        <Pine className="near" style={{ right: '-2%', height: 'clamp(160px, 36vh, 330px)' }} />
        <Pine className="near" style={{ right: '6.5%', height: 'clamp(96px, 20vh, 190px)' }} />
        <div className="xm-bigtree"><BigTree /></div>
        <div className="xm-snowman"><Snowman /></div>
        <i className="xm-glint" style={{ left: '30%' }} /><i className="xm-glint b" style={{ left: '46%' }} /><i className="xm-glint c" style={{ left: '62%' }} /><i className="xm-glint" style={{ left: '78%', animationDelay: '-2.2s' }} />
      </div>}

      <div className="xm-fx" style={vars} aria-hidden>
        <div className="xm-snow">
          {flakes.map((f, i) => (
            <i key={i} className="xm-flake" style={{ left: `${f.x}%`, animationDuration: `${f.d}s`, animationDelay: `${f.dl}s`, opacity: f.o }}>
              <b style={{ '--sw': `${f.sw}px`, animationDuration: `${f.sd}s` } as React.CSSProperties}>
                {f.crystal
                  ? <svg className="xm-crystal" width={f.s} height={f.s} viewBox="0 0 24 24"><path d="M12 1v22M2.5 6.5l19 11M2.5 17.5l19-11M12 5l-2.5-2.5M12 5l2.5-2.5M12 19l-2.5 2.5M12 19l2.5 2.5" /></svg>
                  : <span className="xm-dot" style={{ width: f.s, height: f.s }} />}
              </b>
            </i>
          ))}
        </div>
        <div className="xm-clip">
          <div className="xm-lights">
            {Array.from({ length: swags }, (_, s) => (
              <svg key={s} viewBox="0 0 150 30" width="150" height="30">
                <path d="M0 3Q75 22 150 3" className="xm-wire" />
                {SWAG.map((p, j) => {
                  const i = s * 4 + j, c = BULBS[i % BULBS.length]
                  return (
                    <g key={j} className="xm-bulb" style={{ '--i': i } as React.CSSProperties}>
                      <circle cx={p.x} cy={p.y + 7} r="7" fill={c} className="xm-glow" />
                      <rect x={p.x - 1.7} y={p.y} width="3.4" height="3.6" rx=".8" fill="#3d4b40" />
                      <ellipse cx={p.x} cy={p.y + 7.4} rx="3.2" ry="4.6" fill={c} />
                      <ellipse cx={p.x - 1} cy={p.y + 6} rx=".9" ry="1.6" fill="#fff" opacity=".6" />
                    </g>
                  )
                })}
              </svg>
            ))}
          </div>
          <div className={`xm-orn ${calm ? 'down' : orn}`} style={{ left: `${spot.x}%`, '--drop': `${spot.drop}px` } as React.CSSProperties}>
            <div className="xm-orn-swing">
              <i className="xm-ribbon" />
              <div className="xm-orn-b" onMouseEnter={spin} onTouchStart={spin}><Bauble /></div>
            </div>
          </div>
          {fx.map(f => {
            if (f.kind === 'sleigh') return (
              <div key={f.id} className={`xm-sleigh ${f.dir}`} style={{ top: `calc(var(--xm-top) + ${f.y}vh)` }}>
                <div className="xm-arc">
                  <span className="xm-trail"><i /><i /><i /><i /><i /><i /></span>
                  <Sleigh />
                </div>
              </div>
            )
            if (f.kind === 'peek') return (
              <div key={f.id} className={`xm-peek ${f.side}`} style={{ top: `${f.y}%` }}>
                <div className="xm-peek-bob"><SantaFace /><span className="xm-ho">Ho ho ho!</span></div>
              </div>
            )
            if (f.kind === 'gift') return (
              <div key={f.id} className="xm-chute" style={{ left: `${f.x}%` }}>
                <div className="xm-chute-sway"><GiftChute c={f.c} /></div>
              </div>
            )
            if (f.kind === 'gust') return (
              <div key={f.id} className="xm-gust">
                {f.flakes.map((g, i) => (
                  <i key={i} style={{ top: `${g.y}%`, width: g.s, height: g.s, animationDuration: `${g.d}s`, animationDelay: `${g.dl}s`, '--dy': `${g.dy}vh` } as React.CSSProperties} />
                ))}
              </div>
            )
            return <i key={f.id} className="xm-shoot" style={{ left: `${f.x}%`, top: `calc(var(--xm-top) + ${f.y}vh)` }} />
          })}
        </div>
      </div>
    </>
  )
}

// Its own colours for light (a snowy day) and dark (a snowy night); DarkTheme skips this sheet.
const CSS = `
html[data-season="christmas"]{--coral:#d62839 !important;--coral-hover:#b91c2c !important;--peach:rgba(214,40,57,.1) !important}
html[data-season="christmas"] .inbox-root{background:transparent !important}
html[data-season="christmas"] .colvy-ai-orb-wrap .cvo::after{content:'';position:absolute;left:50%;top:-38%;width:86%;height:70%;transform:translateX(-52%) rotate(-10deg);background:${HAT} center/contain no-repeat;pointer-events:none;z-index:3;filter:drop-shadow(0 2px 2px rgba(0,0,0,.25))}

.xm-scene{position:fixed;top:0;right:0;bottom:0;left:var(--xm-left);z-index:-1;pointer-events:none;overflow:hidden;contain:strict;
  --H:clamp(170px,32vh,320px);--moon:clamp(70px,8vw,120px);
  --far:#e3ecf7;--near:#f9fbfe;--pine-far:#a3c2b6;--pine:#2f6f53;--trunk:#6b4a33;--cap:#ffffff;--win:#ffc961;--snowc:#ffffff;--smoke:rgba(170,186,206,.55);
  background:radial-gradient(ellipse 50% 40% at 84% 8%,rgba(255,236,200,.55),transparent 70%),linear-gradient(180deg,#e4effa 0%,#eef5fc 40%,#f7fbff 75%,#ffffff 100%)}
html[data-theme="dark"] .xm-scene{--far:#b9c9df;--near:#dbe5f2;--pine-far:#1b4638;--pine:#123a2d;--trunk:#3d2a1d;--cap:#e3ebf6;--snowc:#e3ebf6;--smoke:rgba(200,210,230,.25);
  background:linear-gradient(180deg,#071226 0%,#0e2140 42%,#173159 75%,#21406d 100%)}
.xm-far{fill:var(--far)}.xm-near{fill:var(--near)}
.xm-hills{position:absolute;left:0;bottom:0;width:100%;height:var(--H);filter:drop-shadow(0 -2px 6px rgba(120,150,190,.12))}
.xm-stars{position:absolute;left:0;top:0;width:1.6px;height:1.6px;border-radius:50%;display:none;animation:xm-twinkle 4.5s ease-in-out infinite alternate}
.xm-stars.b{animation-duration:6.5s;animation-delay:-3s}
html[data-theme="dark"] .xm-stars{display:block}
.xm-aurora{position:absolute;left:-10%;top:calc(var(--xm-top) + 2vh);width:120%;height:34vh;display:none;opacity:.55;
  background:radial-gradient(ellipse 30% 40% at 20% 60%,rgba(62,230,165,.55),transparent 70%),radial-gradient(ellipse 26% 50% at 48% 45%,rgba(46,196,182,.45),transparent 70%),radial-gradient(ellipse 30% 40% at 76% 55%,rgba(130,110,255,.35),transparent 70%);
  animation:xm-aurora 26s ease-in-out infinite alternate;transform-origin:50% 100%}
.xm-aurora.b{top:calc(var(--xm-top) + 8vh);opacity:.35;animation-duration:38s;animation-direction:alternate-reverse}
html[data-theme="dark"] .xm-aurora{display:block}
.xm-moon{position:absolute;top:calc(var(--xm-top) + 5vh);right:9vw;width:var(--moon);height:var(--moon);border-radius:50%;
  background:radial-gradient(circle at 40% 38%,#fffdf6,#fff1d6 60%,#ffe2b0);box-shadow:0 0 50px 22px rgba(255,226,170,.35),0 0 140px 60px rgba(255,236,200,.25);opacity:.85}
html[data-theme="dark"] .xm-moon{background:radial-gradient(circle at 36% 34%,rgba(120,140,170,.18) 0 10%,transparent 11%),radial-gradient(circle at 62% 60%,rgba(120,140,170,.16) 0 13%,transparent 14%),radial-gradient(circle at 40% 38%,#ffffff,#eaf0fb 60%,#cfd9ea);box-shadow:0 0 40px 12px rgba(210,225,255,.25),0 0 120px 40px rgba(210,225,255,.1);opacity:1}
.xm-pine{position:absolute;aspect-ratio:100/160}
.xm-pine.far{bottom:calc(var(--H) * .5)}
.xm-pine.far .xm-pine-g{fill:var(--pine-far)}
.xm-pine.far .xm-trunk{fill:var(--pine-far)}
.xm-pine.near{bottom:calc(var(--H) * .14)}
.xm-pine-g{fill:var(--pine)}
.xm-pine-g.big{fill:var(--pine)}
.xm-trunk{fill:var(--trunk)}
.xm-cap{fill:var(--cap)}
.xm-snowc{fill:var(--snowc)}
.xm-cabin{position:absolute;left:12%;bottom:calc(var(--H) * .42);height:clamp(80px,15vh,150px);aspect-ratio:200/160}
.xm-cabin svg{width:100%;height:100%;display:block}
.xm-win{fill:var(--win);animation:xm-glow 4s ease-in-out infinite}
.xm-win.b{animation-delay:-1.6s}
html[data-theme="dark"] .xm-win{filter:drop-shadow(0 0 6px rgba(255,190,90,.9))}
.xm-smoke{position:absolute;left:68%;top:10%;width:16px;height:16px;border-radius:50%;background:var(--smoke);animation:xm-smoke 6s ease-out infinite;opacity:0}
.xm-smoke.b{animation-delay:-2s}.xm-smoke.c{animation-delay:-4s}
.xm-bigtree{position:absolute;right:15%;bottom:calc(var(--H) * .05);height:clamp(150px,31vh,300px);aspect-ratio:160/240}
.xm-bigtree svg{width:100%;height:100%;display:block;overflow:visible}
.xm-tl{animation:xm-twinkle 1.4s ease-in-out infinite alternate;animation-delay:calc(var(--i) * -0.29s)}
.xm-star{fill:#ffd43b;transform-box:fill-box;transform-origin:center;animation:xm-star 2.6s ease-in-out infinite;filter:drop-shadow(0 0 6px rgba(255,212,59,.9))}
.xm-snowman{position:absolute;left:25%;bottom:calc(var(--H) * .05);height:clamp(70px,13vh,130px);aspect-ratio:90/130}
.xm-snowman svg{width:100%;height:100%;display:block;overflow:visible}
.xm-arm{transform-origin:22px 58px;animation:xm-wave 3.2s ease-in-out infinite}
.xm-glint{position:absolute;bottom:calc(var(--H) * .08);width:10px;height:10px;background:radial-gradient(circle,#fff 0 18%,transparent 22%),linear-gradient(90deg,transparent 45%,#fff 50%,transparent 55%),linear-gradient(0deg,transparent 45%,#fff 50%,transparent 55%);opacity:0;animation:xm-glint 4.4s ease-in-out infinite}
.xm-glint.b{animation-delay:-1.4s;bottom:calc(var(--H) * .05)}.xm-glint.c{animation-delay:-3s;bottom:calc(var(--H) * .11)}
html:not([data-theme="dark"]) .xm-glint{filter:drop-shadow(0 0 2px rgba(120,160,210,.9))}

.xm-fx{position:fixed;inset:0;z-index:48;pointer-events:none;overflow:hidden}
.xm-snow{position:absolute;inset:0}
.xm-flake{position:absolute;top:0;animation:xm-fall 12s linear infinite;will-change:transform}
.xm-flake b{display:block;animation:xm-sway 3s ease-in-out infinite alternate}
.xm-dot{display:block;border-radius:50%;background:radial-gradient(circle,#fff 0 42%,rgba(156,184,220,.9) 64%,transparent 72%)}
html[data-theme="dark"] .xm-dot{background:radial-gradient(circle,#fff 0 46%,rgba(255,255,255,.55) 62%,transparent 72%)}
.xm-crystal{display:block;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;filter:drop-shadow(0 0 1.5px rgba(110,145,195,.95));animation:xm-spin 9s linear infinite}
html[data-theme="dark"] .xm-crystal{filter:drop-shadow(0 0 3px rgba(255,255,255,.6))}
.xm-clip{position:absolute;top:0;right:0;bottom:0;left:var(--xm-left);overflow:hidden}
.xm-lights{position:absolute;top:calc(var(--xm-top) - 4px);left:-20px;display:flex;white-space:nowrap}
.xm-lights svg{flex-shrink:0;display:block;overflow:visible}
.xm-wire{fill:none;stroke:#2f3d33;stroke-width:1.4}
html[data-theme="dark"] .xm-wire{stroke:#5b6b60}
.xm-bulb{animation:xm-bulb 1.5s ease-in-out infinite alternate;animation-delay:calc(var(--i) * -0.37s)}
.xm-glow{opacity:.28}
.xm-orn{position:absolute;top:0;width:40px;margin-left:-20px;height:calc(var(--xm-top) + var(--drop));transform:translateY(-100%);transition:transform 1.2s cubic-bezier(.5,0,.75,0)}
.xm-orn.down{transform:translateY(0);transition:transform 2.6s cubic-bezier(.25,1.25,.45,1)}
.xm-orn-swing{position:relative;height:100%;transform-origin:50% 0;animation:xm-swing 3.4s ease-in-out infinite alternate}
.xm-ribbon{position:absolute;left:50%;top:0;bottom:44px;width:2px;margin-left:-1px;background:linear-gradient(#e03131,#c2253a)}
.xm-orn-b{position:absolute;left:0;bottom:0;width:40px;height:48px}
.xm-orn.down .xm-orn-b{pointer-events:auto}
.xm-bauble{display:block;width:40px;height:48px;filter:drop-shadow(0 6px 10px rgba(120,10,30,.35))}
.xm-orn-b:hover .xm-bauble{animation:xm-jingle .5s ease-in-out}
.xm-sleigh{position:absolute;left:0;width:clamp(170px,17vw,250px);animation:xm-fly-r 12s linear both}
.xm-sleigh.l{animation-name:xm-fly-l}
.xm-sleigh.l .xm-arc{transform:scaleX(-1)}
.xm-arc{position:relative;animation:xm-arc 12s ease-in-out both}
.xm-sleigh-svg{display:block;width:100%;height:auto;overflow:visible}
html[data-theme="dark"] .xm-sleigh-svg{filter:drop-shadow(0 0 8px rgba(255,236,200,.35))}
.xm-legs{stroke:#7a4e33;stroke-width:2.4;stroke-linecap:round;fill:none;transform-box:fill-box;transform-origin:50% 0;animation:xm-gallop .32s ease-in-out infinite alternate}
.xm-legs.b{animation-direction:alternate-reverse}
.xm-nose{animation:xm-nose 1s ease-in-out infinite alternate;filter:drop-shadow(0 0 4px #ff2a2a)}
.xm-trail{position:absolute;right:100%;top:46%;display:flex;gap:10px;align-items:center}
.xm-trail i{width:5px;height:5px;border-radius:50%;background:#ffd43b;box-shadow:0 0 6px 2px rgba(255,212,59,.7);animation:xm-sparkle 1s ease-in-out infinite alternate}
.xm-trail i:nth-child(2){animation-delay:-.2s;transform:translateY(6px)}.xm-trail i:nth-child(3){animation-delay:-.4s;transform:translateY(-4px)}.xm-trail i:nth-child(4){animation-delay:-.6s;transform:translateY(8px)}.xm-trail i:nth-child(5){animation-delay:-.8s}.xm-trail i:nth-child(6){animation-delay:-.1s;transform:translateY(-6px)}
.xm-peek{position:absolute;width:clamp(70px,7.5vw,100px)}
.xm-peek.r{right:0;animation:xm-peek-r 5.4s ease-in-out both}
.xm-peek.l{left:0;animation:xm-peek-l 5.4s ease-in-out both}
.xm-peek-bob{position:relative;animation:xm-bob 1.6s ease-in-out infinite alternate}
.xm-santa{display:block;width:100%;height:auto;filter:drop-shadow(0 6px 14px rgba(60,20,20,.25))}
.xm-peek.l .xm-santa{transform:scaleX(-1)}
.xm-wink{transform-box:fill-box;transform-origin:center;animation:xm-wink 5.4s ease-in-out both}
.xm-ho{position:absolute;top:-8px;padding:4px 10px;border-radius:12px 12px 12px 3px;background:#fff;color:#b5172b;font:800 13px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.2);opacity:0;animation:xm-ho 5.4s ease-out both;white-space:nowrap}
.xm-peek.r .xm-ho{right:92%;border-radius:12px 12px 3px 12px}
.xm-peek.l .xm-ho{left:92%}
.xm-chute{position:absolute;top:0;width:clamp(50px,4.6vw,70px);animation:xm-drop 9s linear both}
.xm-chute-sway{transform-origin:50% 0;animation:xm-swing 2.4s ease-in-out infinite alternate}
.xm-chute-svg{display:block;width:100%;height:auto;filter:drop-shadow(0 6px 10px rgba(0,0,0,.18))}
.xm-gust{position:absolute;inset:0}
.xm-gust i{position:absolute;left:0;border-radius:50%;background:radial-gradient(circle,#fff 0 42%,rgba(156,184,220,.85) 64%,transparent 72%);animation:xm-gust 2s linear both}
.xm-shoot{position:absolute;width:150px;height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,rgba(255,220,120,.9));transform-origin:100% 50%;opacity:0;animation:xm-shoot 1.6s ease-out both}
.xm-shoot::after{content:'';position:absolute;right:-3px;top:-3px;width:8px;height:8px;border-radius:50%;background:#fff6d6;box-shadow:0 0 10px 4px rgba(255,214,120,.8)}
html[data-theme="dark"] .xm-shoot{background:linear-gradient(90deg,transparent,rgba(255,255,255,.95))}

@keyframes xm-twinkle{from{opacity:.35}to{opacity:1}}
@keyframes xm-aurora{0%{transform:translateX(-4%) scaleY(1) skewX(-6deg)}50%{transform:translateX(3%) scaleY(1.25) skewX(4deg)}100%{transform:translateX(6%) scaleY(.9) skewX(-2deg)}}
@keyframes xm-glow{0%,100%{opacity:1}45%{opacity:.82}50%{opacity:.95}}
@keyframes xm-smoke{0%{opacity:0;transform:translate(0,0) scale(.5)}15%{opacity:.9}100%{opacity:0;transform:translate(18px,-70px) scale(2.4)}}
@keyframes xm-star{0%,100%{transform:scale(1) rotate(0)}50%{transform:scale(1.15) rotate(8deg)}}
@keyframes xm-wave{0%,60%,100%{transform:rotate(0)}70%{transform:rotate(14deg)}80%{transform:rotate(-4deg)}90%{transform:rotate(12deg)}}
@keyframes xm-glint{0%,70%,100%{opacity:0;transform:scale(.4)}80%{opacity:1;transform:scale(1)}}
@keyframes xm-fall{from{transform:translateY(-6vh)}to{transform:translateY(106vh)}}
@keyframes xm-sway{from{transform:translateX(calc(var(--sw) * -1))}to{transform:translateX(var(--sw))}}
@keyframes xm-spin{to{transform:rotate(360deg)}}
@keyframes xm-bulb{from{opacity:.5}to{opacity:1}}
@keyframes xm-swing{from{transform:rotate(-4deg)}to{transform:rotate(4deg)}}
@keyframes xm-jingle{0%,100%{transform:rotate(0)}25%{transform:rotate(-14deg)}50%{transform:rotate(12deg)}75%{transform:rotate(-8deg)}}
@keyframes xm-fly-r{from{transform:translateX(-280px)}to{transform:translateX(calc(100vw + 60px))}}
@keyframes xm-fly-l{from{transform:translateX(calc(100vw + 60px))}to{transform:translateX(-280px)}}
@keyframes xm-arc{0%{translate:0 34px}50%{translate:0 -20px}100%{translate:0 10px}}
@keyframes xm-gallop{from{transform:rotate(-16deg)}to{transform:rotate(16deg)}}
@keyframes xm-nose{from{opacity:.75}to{opacity:1}}
@keyframes xm-sparkle{from{opacity:.25;scale:.6}to{opacity:1;scale:1}}
@keyframes xm-peek-r{0%{transform:translateX(130%)}16%{transform:translateX(-14px)}22%{transform:translateX(-6px)}80%{transform:translateX(-10px)}100%{transform:translateX(130%)}}
@keyframes xm-peek-l{0%{transform:translateX(-130%)}16%{transform:translateX(14px)}22%{transform:translateX(6px)}80%{transform:translateX(10px)}100%{transform:translateX(-130%)}}
@keyframes xm-bob{from{transform:translateY(-5px)}to{transform:translateY(5px)}}
@keyframes xm-wink{0%,44%,52%,100%{transform:scaleY(1)}47%,49%{transform:scaleY(.12)}}
@keyframes xm-ho{0%,24%{opacity:0;transform:scale(.6)}30%{opacity:1;transform:scale(1.08)}34%,66%{opacity:1;transform:scale(1)}72%,100%{opacity:0;transform:scale(.8)}}
@keyframes xm-drop{0%{transform:translateY(-130px)}100%{transform:translateY(calc(100vh + 20px))}}
@keyframes xm-gust{from{transform:translate(-12vw,0)}to{transform:translate(112vw,var(--dy))}}
@keyframes xm-shoot{0%{opacity:0;transform:translate(0,0) rotate(18deg)}15%{opacity:1}100%{opacity:0;transform:translate(34vw,11vw) rotate(18deg)}}
@media (prefers-reduced-motion:reduce){.xm-scene *,.xm-fx *{animation:none !important;transition:none !important}.xm-snow,.xm-shoot{display:none}}
`
