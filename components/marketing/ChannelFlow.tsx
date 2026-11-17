'use client'

import { useEffect, useRef, useState } from 'react'
import AiBuddy from '@/components/AiBuddy'
import ChannelGlyph, { CHANNEL_LABEL, type ChannelKey } from './ChannelGlyph'

// "Every channel, one inbox": customers write in on their channel, the
// message travels into Colvy, and on to whoever answers it, Colvy AI first.
//
// Everything moves in one requestAnimationFrame loop, written straight to the
// DOM (no React renders while it plays), so it stays smooth on phones. The
// bounce comes from small springs: the channel jiggles as a message leaves,
// the line fills in behind the dot like a comet's tail, the inbox squashes and
// wobbles when it lands, the count rolls over, and whoever picks it up hops
// with a ring. Wide screens lay it out left to right; phones top to bottom.
// Runs only while on screen; with reduced motion it's drawn still.

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

// One message's trip, in ms: customer → channel, channel → inbox, a beat in
// the inbox, inbox → teammate, then the trail fades.
const T = { a: 520, b: 1050, wait: 320, c: 950, fade: 560 }
const START_COUNT = 3

// A damped spring around 0. Kick it (add to v) and it overshoots and settles
// in about half a second: that's the bounce.
type Spring = { x: number; v: number }
const spring = (): Spring => ({ x: 0, v: 0 })
const stepSpring = (s: Spring, dt: number, k = 430, c = 12.5) => { s.v += (-k * s.x - c * s.v) * dt; s.x += s.v * dt }
const settled = (s: Spring) => Math.abs(s.x) < 1e-4 && Math.abs(s.v) < 1e-3
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)
const NS = 'http://www.w3.org/2000/svg'

export default function ChannelFlow() {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const badgeRef = useRef<HTMLElement | null>(null)
  const [L, setL] = useState<Layout>(WIDE)
  const [playing, setPlaying] = useState(false)

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
  // The count is drawn by hand (it rolls), so React leaves the badge empty.
  useEffect(() => {
    const b = badgeRef.current
    if (b && !b.firstChild) { const s = document.createElement('span'); s.textContent = String(START_COUNT); b.appendChild(s) }
  }, [])

  useEffect(() => {
    if (!playing) return
    const wrap = wrapRef.current, svg = svgRef.current, badge = badgeRef.current
    if (!wrap || !svg || !badge) return
    const all = <E extends Element>(sel: string) => Array.from(wrap.querySelectorAll(sel)) as E[]
    const fx = svg.querySelector('#cfl-fx') as SVGGElement
    const glow = svg.querySelector('#cfl-glowc') as SVGCircleElement
    const glowR = Number(glow.getAttribute('r')) || 150
    const chips = all<HTMLElement>('.cfl-chip')
    const custs = all<HTMLElement>('.cfl-custin')
    const pavs = all<HTMLElement>('.cfl-pav')
    const rings = all<HTMLElement>('.cfl-ring')
    const hubIn = wrap.querySelector('.cfl-hubin') as HTMLElement
    const pathA = CHANNELS.map((_, i) => svg.querySelector(`#pa${i}`) as SVGPathElement | null)
    const pathB = CHANNELS.map((_, i) => svg.querySelector(`#pb${i}`) as SVGPathElement)
    const pathC = PEOPLE.map((_, j) => svg.querySelector(`#pc${j}`) as SVGPathElement)
    const lenB = pathB.map(p => p.getTotalLength()), lenC = pathC.map(p => p.getTotalLength())

    const chipS = chips.map(spring), chipR = chips.map(spring), custS = custs.map(spring), pavS = pavs.map(spring)
    const hubS = spring(), hubQ = spring(), badgeS = spring()

    // The count rolls: the old number slides out one way, the new one springs in.
    let count = START_COUNT
    const setCount = (next: number) => {
      next = Math.max(1, Math.min(9, next))
      if (next === count) return
      const up = next > count
      count = next
      const old = Array.from(badge.children) as HTMLElement[]
      const span = document.createElement('span')
      span.textContent = String(next)
      badge.appendChild(span)
      span.animate([{ transform: `translateY(${up ? 105 : -105}%)` }, { transform: 'translateY(0)' }], { duration: 460, easing: 'cubic-bezier(.34,1.8,.5,1)' })
      for (const o of old) {
        const a = o.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${up ? -105 : 105}%)`, opacity: 0 }], { duration: 300, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' })
        a.onfinish = () => o.remove()
      }
      badgeS.v += 4.2
    }
    const ring = (j: number) => {
      rings[j]?.animate([{ transform: 'scale(.85)', opacity: 0.9 }, { transform: 'scale(1.55)', opacity: 0 }], { duration: 760, easing: 'cubic-bezier(.2,.8,.2,1)' })
    }

    type Flow = { ch: number; tm: number; t: number; dot: SVGGElement; halo: SVGCircleElement; litB: SVGPathElement[]; litC: SVGPathElement[]; done: Set<string> }
    let flows: Flow[] = []
    const lit = (d: string, len: number) => {
      const make = (cls: string) => {
        const p = document.createElementNS(NS, 'path')
        p.setAttribute('d', d); p.setAttribute('class', cls)
        p.style.strokeDasharray = `${len} ${len}`; p.style.strokeDashoffset = String(len)
        fx.appendChild(p)
        return p
      }
      return [make('cfl-litglow'), make('cfl-lit')]
    }
    let lastCh = -1
    const spawn = (now: number) => {
      let ch = Math.floor(Math.random() * CHANNELS.length)
      if (ch === lastCh) ch = (ch + 1 + Math.floor(Math.random() * (CHANNELS.length - 1))) % CHANNELS.length
      lastCh = ch
      const tm = Math.random() < 0.45 ? 0 : 1 + Math.floor(Math.random() * (PEOPLE.length - 1))
      const dot = document.createElementNS(NS, 'g')
      dot.setAttribute('class', 'cfl-dotg'); dot.style.opacity = '0'
      const halo = document.createElementNS(NS, 'circle'); halo.setAttribute('class', 'cfl-halo'); halo.setAttribute('r', '11')
      const core = document.createElementNS(NS, 'circle'); core.setAttribute('class', 'cfl-core'); core.setAttribute('r', L.tall ? '4.5' : '5.5')
      dot.append(halo, core)
      const f: Flow = { ch, tm, t: now, dot, halo, litB: lit(L.b(ch), lenB[ch]), litC: lit(L.c(tm), lenC[tm]), done: new Set() }
      fx.appendChild(dot)
      flows.push(f)
    }
    const once = (f: Flow, k: string, fn: () => void) => { if (!f.done.has(k)) { f.done.add(k); fn() } }
    const place = (f: Flow, path: SVGPathElement, p: number, scale = 1) => {
      const pt = path.getPointAtLength(p * path.getTotalLength())
      f.dot.setAttribute('transform', `translate(${pt.x.toFixed(2)} ${pt.y.toFixed(2)}) scale(${scale.toFixed(3)})`)
      f.dot.style.opacity = '1'
    }
    const fill = (pair: SVGPathElement[], len: number, p: number) => { for (const el of pair) el.style.strokeDashoffset = String(len * (1 - p)) }
    const fade = (pair: SVGPathElement[]) => { for (const el of pair) el.style.opacity = '0' }

    let raf = 0, last = performance.now(), nextSpawn = last + 250
    const tick = (now: number) => {
      // Back from a hidden tab: carry on where it was instead of jumping.
      const gap = now - last
      if (gap > 250) { const shift = gap - 16; flows.forEach(f => { f.t += shift }); nextSpawn += shift }
      const dt = Math.min(0.032, Math.max(0.001, (Math.min(gap, 250)) / 1000))
      last = now

      if (now >= nextSpawn && flows.length < 3) { spawn(now); nextSpawn = now + 1300 + Math.random() * 900 }

      const tA = L.tall ? 0 : T.a
      const tB = tA + T.b, tW = tB + T.wait, tC = tW + T.c
      flows = flows.filter(f => {
        const e = now - f.t
        if (e < tA) {
          once(f, 'start', () => { if (custS[f.ch]) custS[f.ch].v += 2.6 })
          const pa = pathA[f.ch]
          if (pa) place(f, pa, easeInOut(e / tA))
        } else if (e < tB) {
          once(f, 'leave', () => { chipS[f.ch].v += 3.4; chipR[f.ch].v += (Math.random() < 0.5 ? -1 : 1) * 120; chips[f.ch].classList.add('hot') })
          const p = easeInOut((e - tA) / T.b)
          place(f, pathB[f.ch], p)
          fill(f.litB, lenB[f.ch], p)
        } else if (e < tW) {
          once(f, 'land', () => { hubS.v += 1.6; hubQ.v += 3.2; setCount(count + 1); chips[f.ch].classList.remove('hot'); fill(f.litB, lenB[f.ch], 1); fade(f.litB) })
          place(f, pathB[f.ch], 1, Math.max(0, 1 - (e - tB) / 170))
        } else if (e < tC) {
          once(f, 'send', () => { hubS.v += 1.1; hubQ.v -= 1.4; setCount(count - 1) })
          const p = easeInOut((e - tW) / T.c)
          place(f, pathC[f.tm], p, Math.min(1, (e - tW) / 150))
          fill(f.litC, lenC[f.tm], p)
        } else {
          once(f, 'got', () => { pavS[f.tm].v += 3.3; ring(f.tm); fill(f.litC, lenC[f.tm], 1); fade(f.litC); f.dot.style.opacity = '0' })
          if (e > tC + T.fade) { f.dot.remove(); f.litB.forEach(x => x.remove()); f.litC.forEach(x => x.remove()); return false }
        }
        // The halo breathes while the dot travels.
        f.halo.setAttribute('r', (10 + Math.sin((now - f.t) / 140) * 2).toFixed(2))
        return true
      })

      // Springs → transforms (only while something is moving).
      chips.forEach((el, i) => {
        const s = chipS[i], r = chipR[i]
        if (settled(s) && settled(r)) { if (el.style.transform) el.style.transform = ''; return }
        stepSpring(s, dt); stepSpring(r, dt, 360, 9)
        el.style.transform = `scale(${(1 + s.x).toFixed(4)}) rotate(${r.x.toFixed(2)}deg)`
      })
      custs.forEach((el, i) => {
        const s = custS[i]
        if (settled(s)) { if (el.style.transform) el.style.transform = ''; return }
        stepSpring(s, dt); el.style.transform = `scale(${(1 + s.x).toFixed(4)})`
      })
      pavs.forEach((el, j) => {
        const s = pavS[j]
        if (settled(s)) { if (el.style.transform) el.style.transform = ''; return }
        stepSpring(s, dt); el.style.transform = `translateY(${(-s.x * 22).toFixed(2)}px) scale(${(1 + s.x).toFixed(4)})`
      })
      stepSpring(hubS, dt); stepSpring(hubQ, dt, 520, 11); stepSpring(badgeS, dt, 520, 14)
      const float = Math.sin(now / 1100) * 3
      const S = 1 + hubS.x, Q = hubQ.x
      hubIn.style.transform = `translateY(${float.toFixed(2)}px) scale(${(S * (1 + Q)).toFixed(4)}, ${(S * (1 - Q)).toFixed(4)})`
      badge.style.transform = `translateY(${float.toFixed(2)}px) scale(${(1 + badgeS.x).toFixed(4)})`
      glow.setAttribute('r', (glowR * (1 + hubS.x * 1.4)).toFixed(1))

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      while (fx.firstChild) fx.firstChild.remove()
      chips.forEach(el => { el.style.transform = ''; el.classList.remove('hot') })
      ;[...custs, ...pavs, hubIn, badge].forEach(el => { el.style.transform = '' })
      glow.setAttribute('r', String(glowR))
      badge.textContent = ''
      const s = document.createElement('span'); s.textContent = String(START_COUNT); badge.appendChild(s)
    }
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
          <circle id="cfl-glowc" cx={L.hub[0]} cy={L.hub[1]} r={L.tall ? 110 : 170} fill="url(#cfl-glow)" />
          {!L.tall && CHANNELS.map((_, i) => <path key={'a' + i} id={`pa${i}`} d={L.a(i)} className="cfl-dash" />)}
          {CHANNELS.map((_, i) => <path key={'b' + i} id={`pb${i}`} d={L.b(i)} className="cfl-line" />)}
          {PEOPLE.map((_, j) => <path key={'c' + j} id={`pc${j}`} d={L.c(j)} className="cfl-line" />)}
          <g id="cfl-fx" />
        </svg>

        {!L.tall && CUSTOMERS.map((c, i) => (
          <span key={c.ini} className="cfl-cust" style={pos(L.cust[i])}>
            <span className="cfl-custin" style={{ background: `color-mix(in srgb, ${c.c} 16%, #fff)`, color: c.c }}>{c.ini}</span>
          </span>
        ))}
        {CHANNELS.map((ch, i) => (
          <span key={ch} className="cfl-chan" style={pos(L.chan[i])} title={CHANNEL_LABEL[ch]}>
            <span className="cfl-chip"><ChannelGlyph ch={ch} size={L.tall ? 22 : 28} /></span>
          </span>
        ))}
        <span className="cfl-hub" style={pos(L.hub)}>
          <span className="cfl-hubin"><img src="/icon-192.png" alt="" /></span>
          <b className="cfl-badge" ref={badgeRef} />
        </span>
        {PEOPLE.map((p, j) => (
          <span key={p.name} className="cfl-person" style={pos(L.team[j])}>
            <span className="cfl-pav">
              <span className="cfl-ring" />
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
.cfl-dash{fill:none;stroke:#ececf0;stroke-width:1.5}
.cfl-line{fill:none;stroke:#ececf0;stroke-width:1.6}
.cfl-lit,.cfl-litglow{fill:none;stroke:#ff6a4d;stroke-linecap:round;transition:opacity .55s ease}
.cfl-lit{stroke-width:2.4}
.cfl-litglow{stroke-width:10;stroke-opacity:.12}
.cfl-halo{fill:#ff6a4d;fill-opacity:.2}
.cfl-core{fill:#ff6a4d}
.cfl-dotg{transition:opacity .18s ease}
.cfl-cust,.cfl-chan,.cfl-hub,.cfl-person{position:absolute;transform:translate(-50%,-50%)}
.cfl-custin{display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:50%;font-size:15px;font-weight:800;box-shadow:0 0 0 3px #fff,0 6px 16px -6px rgba(0,0,0,.25);will-change:transform}
.cfl-chip{display:inline-flex;align-items:center;justify-content:center;width:58px;height:58px;border-radius:16px;background:#fff;box-shadow:0 0 0 1px rgba(15,17,25,.07),0 6px 18px -8px rgba(0,0,0,.2);transition:box-shadow .3s ease;will-change:transform}
.cfl-chip.hot{box-shadow:0 0 0 2px #ffb4a3,0 12px 26px -8px rgba(255,106,77,.5)}
.cfl-hub{display:inline-flex}
.cfl-hubin{display:inline-flex;width:112px;height:112px;border-radius:30px;padding:8px;background:#fff;box-sizing:border-box;box-shadow:0 0 0 1px rgba(255,106,77,.25),0 24px 60px -14px rgba(255,106,77,.55);will-change:transform}
.cfl-hubin img{width:100%;height:100%;border-radius:24px}
.cfl-badge{position:absolute;top:-10px;right:-10px;min-width:30px;height:30px;border-radius:999px;background:#ef4444;color:#fff;font-size:14px;font-weight:800;overflow:hidden;box-shadow:0 0 0 3px #fff;will-change:transform}
.cfl-badge span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums}
.cfl-person{display:flex;align-items:center;gap:14px;transform:translate(-30px,-50%)}
.cfl-pav{position:relative;display:inline-flex;will-change:transform}
.cfl-ring{position:absolute;inset:-7px;border-radius:50%;border:2px solid #ff8a70;opacity:0;pointer-events:none}
.cfl-ini{display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:50%;font-size:15px;font-weight:800;box-shadow:0 0 0 3px #fff}
.cfl-pav i{position:absolute;right:0;bottom:0;width:13px;height:13px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 2.5px #fff}
.cfl-pt{display:flex;flex-direction:column;white-space:nowrap}
.cfl-pt b{font-size:16px;font-weight:700}
.cfl-pt small{font-size:13.5px;opacity:.6}
.cfl.tall .cfl-chip{width:44px;height:44px;border-radius:13px}
.cfl.tall .cfl-hubin{width:92px;height:92px;border-radius:26px}
.cfl.tall .cfl-hubin img{border-radius:20px}
.cfl.tall .cfl-person{flex-direction:column;gap:8px;transform:translate(-50%,-26px);text-align:center}
.cfl.tall .cfl-ini{width:42px;height:42px;font-size:13px}
.cfl.tall .cfl-pt b{font-size:13.5px}
.cfl.tall .cfl-pt small{font-size:11px;white-space:normal;max-width:90px}
`
