'use client'

import { useEffect, useRef, useState } from 'react'
import AiBuddy from '@/components/AiBuddy'
import ChannelGlyph, { CHANNEL_LABEL, type ChannelKey } from './ChannelGlyph'

// "Every channel, one inbox" (Sellio-style): customers write in on their
// channel, the message travels into Colvy, and on to whoever answers it,
// Colvy AI first. A dot runs along the lines for each message, the lines it
// takes light up, the inbox's count ticks, and whoever picks it up pulses.
// Wide screens lay it out left to right; phones top to bottom. Runs only
// while on screen; with reduced motion it's drawn still.

const CHANNELS: ChannelKey[] = ['chat', 'instagram', 'messenger', 'sms', 'email', 'phone']
const CUSTOMERS = [
  { ini: 'PN', c: '#8b5cf6' }, { ini: 'TB', c: '#0ea5e9' }, { ini: 'WC', c: '#f59e0b' },
  { ini: 'AL', c: '#10b981' }, { ini: 'LF', c: '#ec4899' }, { ini: 'OH', c: '#f97316' },
]
const PEOPLE: { name: string; role: string; ini?: string; c?: string; ai?: boolean }[] = [
  { name: 'Colvy AI', role: 'Answers chats and calls', ai: true },
  { name: 'Mia', role: 'Sales', ini: 'MS', c: '#ff6a4d' },
  { name: 'Kai', role: 'Support', ini: 'KO', c: '#2b6bff' },
  { name: 'Sam', role: 'Owner', ini: 'SR', c: '#10b981' },
]

type Layout = {
  w: number; h: number; tall: boolean
  cust: [number, number][]; chan: [number, number][]; hub: [number, number]; team: [number, number][]
  a: (i: number) => string; b: (i: number) => string; c: (j: number) => string
}
const WIDE: Layout = (() => {
  const ys = CHANNELS.map((_, i) => 64 + i * 86)
  const ty = PEOPLE.map((_, j) => 108 + j * 118)
  const hub: [number, number] = [600, 280]
  return {
    w: 1200, h: 560, tall: false,
    cust: ys.map(y => [70, y]), chan: ys.map(y => [230, y]), hub, team: ty.map(y => [960, y]),
    a: i => `M96 ${ys[i]} L202 ${ys[i]}`,
    b: i => `M258 ${ys[i]} C 430 ${ys[i]}, 430 ${hub[1]}, 548 ${hub[1]}`,
    c: j => `M652 ${hub[1]} C 790 ${hub[1]}, 790 ${ty[j]}, 930 ${ty[j]}`,
  }
})()
const TALL: Layout = (() => {
  const xs = CHANNELS.map((_, i) => 34 + i * 66.4)
  const tx = PEOPLE.map((_, j) => 50 + j * 100)
  const hub: [number, number] = [200, 300]
  return {
    w: 400, h: 640, tall: true,
    cust: [], chan: xs.map(x => [x, 60]), hub, team: tx.map(x => [x, 520]),
    a: () => '',
    b: i => `M${xs[i]} 88 C ${xs[i]} 190, ${hub[0]} 170, ${hub[0]} 250`,
    c: j => `M${hub[0]} 350 C ${hub[0]} 430, ${tx[j]} 420, ${tx[j]} 490`,
  }
})()

type Flow = { id: number; ch: number; tm: number; born: number }
const SEG = { a: 420, b: 950, wait: 260, c: 950 }
const TOTAL = SEG.a + SEG.b + SEG.wait + SEG.c

export default function ChannelFlow() {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [L, setL] = useState<Layout>(WIDE)
  const [flows, setFlows] = useState<Flow[]>([])
  const [badge, setBadge] = useState(3)
  const [hot, setHot] = useState<Record<string, number>>({})
  const [got, setGot] = useState<number | null>(null)
  const [pulse, setPulse] = useState(0)
  const [playing, setPlaying] = useState(false)
  const flowsRef = useRef<Flow[]>([])
  flowsRef.current = flows

  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setL(e.contentRect.width < 720 ? TALL : WIDE))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setPlaying(e.isIntersecting), { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // A new message every so often: a random channel, answered by Colvy AI
  // about half the time, else by one of the team.
  useEffect(() => {
    if (!playing) return
    let n = 0
    const spawn = () => {
      const ch = Math.floor(Math.random() * CHANNELS.length)
      const tm = Math.random() < 0.45 ? 0 : 1 + Math.floor(Math.random() * (PEOPLE.length - 1))
      const f: Flow = { id: Date.now() + n++, ch, tm, born: performance.now() }
      setFlows(fs => [...fs, f])
      const mark = (k: string, d: number) => setHot(h => ({ ...h, [k]: Math.max(0, (h[k] || 0) + d) }))
      const ta = L.tall ? 0 : SEG.a
      setTimeout(() => mark(`b${ch}`, 1), ta)
      setTimeout(() => { mark(`b${ch}`, -1); setBadge(b => Math.min(9, b + 1)); setPulse(p => p + 1) }, ta + SEG.b)
      setTimeout(() => mark(`c${tm}`, 1), ta + SEG.b + SEG.wait)
      setTimeout(() => { mark(`c${tm}`, -1); setBadge(b => Math.max(1, b - 1)); setGot(tm); setFlows(fs => fs.filter(x => x.id !== f.id)) }, ta + SEG.b + SEG.wait + SEG.c)
    }
    spawn()
    const t = setInterval(spawn, 1500)
    return () => { clearInterval(t); setFlows([]); setHot({}) }
  }, [playing, L])
  useEffect(() => { if (got === null) return; const t = setTimeout(() => setGot(null), 900); return () => clearTimeout(t) }, [got])

  // Move the dots along their paths.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = (now: number) => {
      const svg = svgRef.current
      if (svg) for (const f of flowsRef.current) {
        const dot = svg.querySelector<SVGCircleElement>(`#d${f.id}`)
        if (!dot) continue
        let t = now - f.born
        if (L.tall) t += SEG.a
        let path: SVGPathElement | null = null, p = 0
        if (t < SEG.a) { path = svg.querySelector(`#pa${f.ch}`); p = t / SEG.a }
        else if (t < SEG.a + SEG.b) { path = svg.querySelector(`#pb${f.ch}`); p = (t - SEG.a) / SEG.b }
        else if (t < SEG.a + SEG.b + SEG.wait) { dot.setAttribute('opacity', '0'); continue }
        else { path = svg.querySelector(`#pc${f.tm}`); p = Math.min(1, (t - SEG.a - SEG.b - SEG.wait) / SEG.c) }
        if (!path) continue
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
        const pt = path.getPointAtLength(e * path.getTotalLength())
        dot.setAttribute('cx', pt.x.toFixed(1)); dot.setAttribute('cy', pt.y.toFixed(1)); dot.setAttribute('opacity', '1')
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, L])

  const pos = ([x, y]: [number, number]) => ({ left: `${(x / L.w) * 100}%`, top: `${(y / L.h) * 100}%` })

  return (
    <div ref={wrapRef} className={`cfl${L.tall ? ' tall' : ''}`} role="img" aria-label="Customers write on any channel, it lands in one Colvy inbox, and Colvy AI or the right person on your team answers">
      <style>{CFL_CSS}</style>
      {!L.tall && (
        <div className="cfl-heads" aria-hidden="true">
          <span style={{ left: `${(70 / L.w) * 100}%` }}>Customers</span>
          <span style={{ left: `${(230 / L.w) * 100}%` }}>Channels</span>
          <span style={{ left: '50%' }}>Colvy inbox</span>
          <span style={{ left: `${(1010 / L.w) * 100}%` }}>Your team</span>
        </div>
      )}
      <div className="cfl-stage" style={{ aspectRatio: `${L.w} / ${L.h}` }} aria-hidden="true">
        <svg ref={svgRef} viewBox={`0 0 ${L.w} ${L.h}`} preserveAspectRatio="none">
          <defs>
            <radialGradient id="cfl-glow"><stop offset="0" stopColor="#ff6a4d" stopOpacity=".22" /><stop offset="1" stopColor="#ff6a4d" stopOpacity="0" /></radialGradient>
          </defs>
          <circle cx={L.hub[0]} cy={L.hub[1]} r={L.tall ? 110 : 170} fill="url(#cfl-glow)" />
          {!L.tall && CHANNELS.map((_, i) => <path key={'a' + i} id={`pa${i}`} d={L.a(i)} className="cfl-dash" />)}
          {CHANNELS.map((_, i) => <path key={'b' + i} id={`pb${i}`} d={L.b(i)} className={`cfl-line${hot[`b${i}`] ? ' hot' : ''}`} />)}
          {PEOPLE.map((_, j) => <path key={'c' + j} id={`pc${j}`} d={L.c(j)} className={`cfl-line${hot[`c${j}`] ? ' hot' : ''}`} />)}
          {flows.map(f => <circle key={f.id} id={`d${f.id}`} r={L.tall ? 5 : 6} className="cfl-dot" opacity="0" />)}
        </svg>

        {!L.tall && CUSTOMERS.map((c, i) => (
          <span key={c.ini} className="cfl-cust" style={{ ...pos(L.cust[i]), background: `color-mix(in srgb, ${c.c} 16%, #fff)`, color: c.c }}>{c.ini}</span>
        ))}
        {CHANNELS.map((ch, i) => (
          <span key={ch} className={`cfl-chan${hot[`b${i}`] ? ' hot' : ''}`} style={pos(L.chan[i])} title={CHANNEL_LABEL[ch]}><ChannelGlyph ch={ch} size={L.tall ? 22 : 28} /></span>
        ))}
        <span className="cfl-hub" style={pos(L.hub)} key={pulse}>
          <img src="/icon-192.png" alt="" />
          <b key={badge}>{badge}</b>
        </span>
        {PEOPLE.map((p, j) => (
          <span key={p.name} className={`cfl-person${got === j ? ' got' : ''}`} style={pos(L.team[j])}>
            <span className="cfl-pav">
              {p.ai ? <AiBuddy size={L.tall ? 40 : 50} /> : <span className="cfl-ini" style={{ background: `color-mix(in srgb, ${p.c} 18%, #fff)`, color: p.c }}>{p.ini}</span>}
              <i />
            </span>
            <span className="cfl-pt"><b>{p.name}</b><small>{p.role}</small></span>
          </span>
        ))}
      </div>
    </div>
  )
}

const CFL_CSS = `
.cfl{position:relative;width:100%;max-width:1200px;margin:0 auto;font-family:inherit}
.cfl-heads{position:relative;height:22px;margin-bottom:14px}
.cfl-heads span{position:absolute;transform:translateX(-50%);font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.45;white-space:nowrap}
.cfl-stage{position:relative;width:100%}
.cfl-stage>svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.cfl-dash{fill:none;stroke:#d4d4d8;stroke-width:1.5;stroke-dasharray:3 5}
.cfl-line{fill:none;stroke:#e4e4e7;stroke-width:1.6;transition:stroke .35s ease,stroke-width .35s ease}
.cfl-line.hot{stroke:#ff8a70;stroke-width:2.2}
.cfl-dot{fill:#ff6a4d;filter:drop-shadow(0 0 6px rgba(255,106,77,.7))}
.cfl-cust,.cfl-chan,.cfl-hub,.cfl-person{position:absolute;transform:translate(-50%,-50%)}
.cfl-cust{display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:50%;font-size:15px;font-weight:800;box-shadow:0 0 0 3px #fff,0 6px 16px -6px rgba(0,0,0,.25)}
.cfl-chan{display:inline-flex;align-items:center;justify-content:center;width:58px;height:58px;border-radius:16px;background:#fff;box-shadow:0 0 0 1px rgba(15,17,25,.07),0 6px 18px -8px rgba(0,0,0,.2);transition:transform .35s cubic-bezier(.2,.9,.3,1.3),box-shadow .35s}
.cfl-chan.hot{transform:translate(-50%,-50%) scale(1.1);box-shadow:0 0 0 2px #ffb4a3,0 10px 24px -8px rgba(255,106,77,.45)}
.cfl-hub{display:inline-flex;width:112px;height:112px;border-radius:30px;padding:8px;background:#fff;box-sizing:border-box;box-shadow:0 0 0 1px rgba(255,106,77,.25),0 24px 60px -14px rgba(255,106,77,.55);animation:cflBeat .5s cubic-bezier(.2,.9,.3,1.3)}
.cfl-hub img{width:100%;height:100%;border-radius:24px}
.cfl-hub b{position:absolute;top:-10px;right:-10px;min-width:30px;height:30px;padding:0 6px;box-sizing:border-box;border-radius:999px;background:#ef4444;color:#fff;font-size:14px;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 0 0 3px #fff;animation:cflPop .4s cubic-bezier(.2,.9,.3,1.4)}
@keyframes cflBeat{40%{transform:translate(-50%,-50%) scale(1.06)}}
@keyframes cflPop{from{transform:scale(.5)}}
.cfl-person{display:flex;align-items:center;gap:14px;transform:translate(-30px,-50%)}
.cfl-pav{position:relative;display:inline-flex}
.cfl-ini{display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:50%;font-size:15px;font-weight:800;box-shadow:0 0 0 3px #fff}
.cfl-pav i{position:absolute;right:0;bottom:0;width:13px;height:13px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 2.5px #fff}
.cfl-person.got .cfl-pav{animation:cflGot .9s ease}
@keyframes cflGot{0%{filter:drop-shadow(0 0 0 rgba(255,106,77,0))}30%{filter:drop-shadow(0 0 12px rgba(255,106,77,.8));transform:scale(1.08)}100%{filter:none}}
.cfl-pt{display:flex;flex-direction:column;white-space:nowrap}
.cfl-pt b{font-size:16px;font-weight:700}
.cfl-pt small{font-size:13.5px;opacity:.6}
.cfl.tall .cfl-chan{width:44px;height:44px;border-radius:13px}
.cfl.tall .cfl-hub{width:92px;height:92px;border-radius:26px}
.cfl.tall .cfl-hub img{border-radius:20px}
.cfl.tall .cfl-person{flex-direction:column;gap:8px;transform:translate(-50%,-26px);text-align:center}
.cfl.tall .cfl-ini{width:42px;height:42px;font-size:13px}
.cfl.tall .cfl-pt b{font-size:13.5px}
.cfl.tall .cfl-pt small{font-size:11px;white-space:normal;max-width:90px}
`
