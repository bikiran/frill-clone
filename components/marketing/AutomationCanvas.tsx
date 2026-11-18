'use client'

import { useEffect, useRef, useState } from 'react'
import AiBuddy from '@/components/AiBuddy'

// "Set it up once": a small automation on a dotted canvas that people can
// play with. Each step is a card you can drag (mouse or finger); it lifts,
// tilts with the drag and settles with a bounce, and the curved links follow
// it. Every few seconds a pulse runs through the flow: the message comes in,
// the branch picks a side, and the step it reaches pops. "Tidy up" springs
// everything back. Wide screens lay it out left to right; phones as a zigzag
// down the page. One requestAnimationFrame loop, written straight to the DOM,
// and only while on screen. With reduced motion nothing moves by itself, and
// dragging still works.
//
// The steps are ones Colvy runs today (keyword replies, Colvy AI answers,
// assigning a teammate, tasks); the visual builder itself is on its way.

type NodeId = 'trigger' | 'branch' | 'assign' | 'task' | 'ai'
const NODES: NodeId[] = ['trigger', 'branch', 'assign', 'task', 'ai']
const EDGES = [
  { id: 'e1', from: 'trigger.out', to: 'branch.in' },
  { id: 'e2', from: 'branch.yes', to: 'assign.in' },
  { id: 'e3', from: 'assign.out', to: 'task.in' },
  { id: 'e4', from: 'branch.else', to: 'ai.in' },
] as const
type EdgeId = typeof EDGES[number]['id']
const RUNS: EdgeId[][] = [['e1', 'e2', 'e3'], ['e1', 'e4']]
const HOP_MS = 620

type Spring = { x: number; v: number; to: number }
const sp = (x = 0): Spring => ({ x, v: 0, to: x })
const step = (s: Spring, dt: number, k: number, c: number) => { s.v += (-k * (s.x - s.to) - c * s.v) * dt; s.x += s.v * dt }
const still = (s: Spring) => Math.abs(s.x - s.to) < 0.01 && Math.abs(s.v) < 0.01
const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

const Ico = ({ d, s = 14 }: { d: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)
const ICON = {
  bolt: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
  split: 'M6 3v6a6 6 0 0 0 6 6h0a6 6 0 0 1 6 6v0 M6 21v-6 M18 3v4 M15 6l3-3 3 3',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  check: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  hand: 'M18 11V6a2 2 0 0 0-4 0v5 M14 10V4a2 2 0 0 0-4 0v6 M10 10.5V6a2 2 0 0 0-4 0v8 M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
}

export default function AutomationCanvas({ dark = false, text, muted }: { dark?: boolean; text: string; muted: string }) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [moved, setMoved] = useState(false)
  const tidyRef = useRef<() => void>(() => {})
  const movedRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current, svg = svgRef.current
    if (!canvas || !svg) return
    const reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const els = Object.fromEntries(NODES.map(id => [id, canvas.querySelector(`[data-node="${id}"]`) as HTMLElement])) as Record<NodeId, HTMLElement>
    const port = (id: string) => canvas.querySelector(`[data-port="${id}"]`) as HTMLElement
    const base = Object.fromEntries(EDGES.map(e => [e.id, svg.querySelector(`#ac-${e.id}`) as SVGPathElement])) as Record<EdgeId, SVGPathElement>
    const lit = Object.fromEntries(EDGES.map(e => [e.id, svg.querySelector(`#ac-lit-${e.id}`) as SVGPathElement])) as Record<EdgeId, SVGPathElement>
    const dot = svg.querySelector('#ac-dot') as SVGGElement

    type N = { x: Spring; y: Spring; r: Spring; s: Spring; drag: boolean; ox: number; oy: number; lastMove: number; lastX: number; lastT: number }
    const st = Object.fromEntries(NODES.map(id => [id, { x: sp(), y: sp(), r: sp(), s: sp(1), drag: false, ox: 0, oy: 0, lastMove: 0, lastX: 0, lastT: 0 }])) as Record<NodeId, N>
    let tall = false, W = 0, H = 0, z = 3

    // Where each step sits for this width. Wide: a left-to-right flow.
    // Narrow: two columns, each step below the one it follows.
    const home = (): Record<NodeId, [number, number]> => {
      const hgt = (id: NodeId) => els[id].offsetHeight
      if (!tall) return {
        trigger: [24, 40], branch: [W * 0.27, 168], assign: [W * 0.56, 26],
        task: [W - els.task.offsetWidth - 24, 186], ai: [W * 0.56, 330],
      }
      const nw = els.trigger.offsetWidth, R = W - nw - 14
      const ty = 18, by = ty + hgt('trigger') + 30, ay = by + hgt('branch') + 34, iy = by + hgt('branch') + 64
      return { trigger: [14, ty], branch: [R, by], assign: [14, ay], ai: [R, iy], task: [14, ay + hgt('assign') + 34] }
    }
    const fitHeight = () => {
      if (!tall) { H = 480; canvas.style.height = `${H}px`; return }
      const h = home()
      H = Math.max(...NODES.map(id => h[id][1] + els[id].offsetHeight)) + 44
      canvas.style.height = `${H}px`
    }
    const place = (snap: boolean) => {
      const h = home()
      for (const id of NODES) {
        const n = st[id]
        n.x.to = h[id][0]; n.y.to = h[id][1]
        if (snap) { n.x.x = n.x.to; n.y.x = n.y.to; n.x.v = n.y.v = 0 }
      }
    }
    // Lay out again on resize, unless someone has moved the steps around (then
    // keep their arrangement, until the layout itself changes shape).
    const measure = (first: boolean) => {
      const w = canvas.clientWidth
      if (!first && Math.abs(w - W) < 2) return
      W = w
      const nowTall = W < 860, flipped = nowTall !== tall
      if (flipped) { tall = nowTall; canvas.classList.toggle('tall', tall) }
      fitHeight()
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
      if (first || flipped || !movedRef.current) place(true)
    }
    measure(true)
    const ro = new ResizeObserver(() => measure(false))
    ro.observe(canvas)

    tidyRef.current = () => {
      place(false)
      for (const id of NODES) { st[id].s.v += 1.2; st[id].r.v += (Math.random() - 0.5) * 60 }
      movedRef.current = false; setMoved(false)
    }

    // Dragging.
    const local = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
    const down = (id: NodeId) => (e: PointerEvent) => {
      if (e.button !== 0) return
      const n = st[id], [px, py] = local(e)
      n.drag = true; n.ox = px - n.x.x; n.oy = py - n.y.x; n.lastX = n.x.x; n.lastT = performance.now()
      n.s.to = 1.05; els[id].style.zIndex = String(++z); els[id].classList.add('lifted')
      els[id].setPointerCapture(e.pointerId)
      e.preventDefault()
    }
    const move = (id: NodeId) => (e: PointerEvent) => {
      const n = st[id]
      if (!n.drag) return
      const [px, py] = local(e), el = els[id], now = performance.now()
      const nx = clamp(px - n.ox, -el.offsetWidth * 0.3, W - el.offsetWidth * 0.7)
      const ny = clamp(py - n.oy, -10, H - el.offsetHeight * 0.6)
      const vx = (nx - n.lastX) / Math.max(1, now - n.lastT) * 1000
      n.r.to = reduce ? 0 : clamp(vx * 0.012, -10, 10)
      n.x.x = n.x.to = nx; n.y.x = n.y.to = ny; n.x.v = n.y.v = 0
      n.lastX = nx; n.lastT = now; n.lastMove = now
      if (!movedRef.current) { movedRef.current = true; setMoved(true) }
    }
    const up = (id: NodeId) => () => {
      const n = st[id]
      if (!n.drag) return
      n.drag = false; n.s.to = 1; n.s.v -= reduce ? 0 : 1.4; n.r.to = 0
      els[id].classList.remove('lifted')
    }
    const off: (() => void)[] = []
    for (const id of NODES) {
      const el = els[id], d = down(id), m = move(id), u = up(id)
      el.addEventListener('pointerdown', d); el.addEventListener('pointermove', m)
      el.addEventListener('pointerup', u); el.addEventListener('pointercancel', u)
      off.push(() => { el.removeEventListener('pointerdown', d); el.removeEventListener('pointermove', m); el.removeEventListener('pointerup', u); el.removeEventListener('pointercancel', u) })
    }

    // Links: a soft S-curve from one step's port to the next.
    const center = (el: HTMLElement, cr: DOMRect): [number, number] => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2 - cr.left, r.top + r.height / 2 - cr.top] }
    const curve = ([x1, y1]: [number, number], [x2, y2]: [number, number]) => {
      if (tall) { const d = Math.max(36, Math.abs(y2 - y1) * 0.5); return `M${x1.toFixed(1)} ${y1.toFixed(1)} C ${x1.toFixed(1)} ${(y1 + d).toFixed(1)}, ${x2.toFixed(1)} ${(y2 - d).toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}` }
      const d = Math.max(40, Math.abs(x2 - x1) * 0.5)
      return `M${x1.toFixed(1)} ${y1.toFixed(1)} C ${(x1 + d).toFixed(1)} ${y1.toFixed(1)}, ${(x2 - d).toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`
    }

    // The pulse that runs through the flow.
    let run: { edges: EdgeId[]; i: number; t0: number } | null = null
    let runIx = 0, nextRun = performance.now() + 900
    const target = (e: EdgeId) => EDGES.find(x => x.id === e)!.to.split('.')[0] as NodeId
    const flash = (id: NodeId) => {
      st[id].s.v += 2.8
      const el = els[id]; el.classList.remove('ran'); void el.offsetWidth; el.classList.add('ran')
    }
    const pick = (row: 'yes' | 'else' | null) => {
      for (const r of canvas.querySelectorAll('[data-row]')) r.classList.toggle('pick', (r as HTMLElement).dataset.row === row)
    }

    let raf = 0, last = performance.now(), visible = false
    const tick = (now: number) => {
      const dt = Math.min(0.032, Math.max(0.001, (now - last) / 1000)); last = now
      // Steps: springs → transform.
      for (const id of NODES) {
        const n = st[id]
        if (n.drag && now - n.lastMove > 90) n.r.to = 0
        if (!n.drag) { step(n.x, dt, 170, 15); step(n.y, dt, 170, 15) }
        step(n.r, dt, 320, 13); step(n.s, dt, 420, 14)
        els[id].style.transform = `translate(${n.x.x.toFixed(2)}px, ${n.y.x.toFixed(2)}px) rotate(${n.r.x.toFixed(2)}deg) scale(${n.s.x.toFixed(4)})`
      }
      // Links follow the ports.
      const cr = canvas.getBoundingClientRect()
      for (const e of EDGES) {
        const d = curve(center(port(e.from), cr), center(port(e.to), cr))
        base[e.id].setAttribute('d', d); lit[e.id].setAttribute('d', d)
      }
      // The pulse.
      if (!reduce) {
        if (!run && now >= nextRun) { run = { edges: RUNS[runIx++ % RUNS.length], i: 0, t0: now }; for (const e of EDGES) { lit[e.id].style.opacity = '0' } }
        if (run) {
          const eid = run.edges[run.i], path = base[eid]
          const p = Math.min(1, (now - run.t0) / HOP_MS), len = path.getTotalLength()
          const pt = path.getPointAtLength(ease(p) * len)
          dot.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`); dot.style.opacity = '1'
          const l = lit[eid]; l.style.opacity = '1'; l.style.strokeDasharray = `${len} ${len}`; l.style.strokeDashoffset = String(len * (1 - ease(p)))
          if (p >= 1) {
            const to = target(eid)
            flash(to)
            if (to === 'branch') pick(run.edges[1] === 'e2' ? 'yes' : 'else')
            run.i++; run.t0 = now
            if (run.i >= run.edges.length) {
              run = null; nextRun = now + 1700; dot.style.opacity = '0'
              setTimeout(() => { for (const e of EDGES) lit[e.id].style.opacity = '0'; pick(null) }, 900)
            }
          }
        }
      }
      if (visible) raf = requestAnimationFrame(tick)
    }
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      cancelAnimationFrame(raf)
      if (visible) { last = performance.now(); nextRun = Math.max(nextRun, last + 600); raf = requestAnimationFrame(tick) }
    }, { threshold: 0.05 })
    io.observe(canvas)
    // Draw once even before it scrolls into view, so the links are there.
    requestAnimationFrame(t => { const v = visible; visible = false; tick(t); visible = v })

    return () => { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); off.forEach(f => f()) }
  }, [])

  return (
    <section className={`ac${dark ? ' dark' : ''}`} style={{ color: text }}>
      <style>{AC_CSS}</style>
      <div className="ac-head">
        <span className="ac-eyebrow">Automations · New</span>
        <h2>Draw it once. Colvy runs it every time.</h2>
        <p style={{ color: muted }}>A drag-and-drop builder for what happens when a customer writes in or a call is missed: Colvy sorts it, answers it or hands it to the right person. Grab a step and move it around.</p>
        <a className="ac-more" href="/product/automation">See the automation builder <Ico d={ICON.arrow} s={15} /></a>
      </div>

      <div ref={canvasRef} className="ac-canvas">
        <svg ref={svgRef} className="ac-links" aria-hidden="true">
          {EDGES.map(e => <path key={e.id} id={`ac-${e.id}`} className="ac-link" />)}
          {EDGES.map(e => <path key={'l' + e.id} id={`ac-lit-${e.id}`} className="ac-lit" />)}
          <g id="ac-dot" style={{ opacity: 0 }}><circle r="11" className="ac-halo" /><circle r="5" className="ac-core" /></g>
        </svg>

        <div className="ac-node" data-node="trigger" style={{ ['--nc' as string]: '#ff6a4d' }}>
          <div className="ac-nh"><span className="ac-ni"><Ico d={ICON.bolt} /></span>Trigger</div>
          <p>A customer sends a message</p>
          <div className="ac-chips"><span>Website chat</span><span>Instagram</span><span>SMS</span></div>
          <span className="ac-port out" data-port="trigger.out" />
        </div>

        <div className="ac-node" data-node="branch" style={{ ['--nc' as string]: '#e11d74' }}>
          <span className="ac-port in" data-port="branch.in" />
          <div className="ac-nh"><span className="ac-ni"><Ico d={ICON.split} /></span>Branch</div>
          <p>If the message mentions “refund”</p>
          <div className="ac-row" data-row="yes">Yes<span className="ac-port out yes" data-port="branch.yes" /></div>
          <div className="ac-row" data-row="else">Everything else<span className="ac-port out else" data-port="branch.else" /></div>
        </div>

        <div className="ac-node" data-node="assign" style={{ ['--nc' as string]: '#2b6bff' }}>
          <span className="ac-port in" data-port="assign.in" />
          <div className="ac-nh"><span className="ac-ni"><Ico d={ICON.user} /></span>Assign</div>
          <div className="ac-who"><span className="ac-av">KO</span><span><b>Kai</b><small>Support</small></span></div>
          <span className="ac-port out" data-port="assign.out" />
        </div>

        <div className="ac-node" data-node="task" style={{ ['--nc' as string]: '#d97706' }}>
          <span className="ac-port in" data-port="task.in" />
          <div className="ac-nh"><span className="ac-ni"><Ico d={ICON.check} /></span>Task</div>
          <p>Check the refund today</p>
        </div>

        <div className="ac-node" data-node="ai" style={{ ['--nc' as string]: '#ff6a4d' }}>
          <span className="ac-port in" data-port="ai.in" />
          <div className="ac-nh"><span className="ac-ni ai"><AiBuddy size={18} /></span>Colvy AI answers</div>
          <p>From your help articles, orders and bookings</p>
        </div>

        {!moved
          ? <span className="ac-hint" aria-hidden="true"><Ico d={ICON.hand} s={15} />Drag a step</span>
          : <button type="button" className="ac-tidy" onClick={() => tidyRef.current()}>Tidy up</button>}
      </div>
      <p className="ac-foot" style={{ color: muted }}>Build flows like this in Colvy: Settings → Automations. Replies, assigning, tags, tasks, waits and Colvy AI, joined however you like.</p>
    </section>
  )
}

const AC_CSS = `
.ac{--bg:#f6f6f8;--dot:#d6d7de;--card:#fff;--line:rgba(15,17,25,.08);--ink:#18181b;--mut:#6b6b76;--link:#b9bac4;padding:clamp(56px,8vw,104px) 16px}
.ac.dark{--bg:#14151c;--dot:#2b2d38;--card:#1c1e27;--line:rgba(255,255,255,.08);--ink:#f4f4f6;--mut:#a3a3ad;--link:#4a4c5a}
.ac-head{max-width:720px;margin:0 auto clamp(28px,4vw,48px);text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px}
.ac-eyebrow{display:inline-flex;padding:6px 14px;border-radius:999px;background:color-mix(in srgb,#ff6a4d 12%,transparent);color:#ff6a4d;font-size:13px;font-weight:700;letter-spacing:.02em}
.ac-head h2{margin:0;font-size:clamp(30px,4.6vw,52px);font-weight:900;letter-spacing:-.03em;line-height:1.05;text-wrap:balance}
.ac-head p{margin:0;font-size:clamp(16px,1.6vw,18.5px);line-height:1.6;max-width:600px}
.ac-more{display:inline-flex;align-items:center;gap:7px;margin-top:2px;padding:10px 18px;border-radius:999px;background:var(--ink);color:var(--card);font-size:14.5px;font-weight:700;text-decoration:none;transition:transform .2s cubic-bezier(.34,1.6,.5,1),box-shadow .2s}
.ac-more:hover{transform:translateY(-2px);box-shadow:0 10px 24px -10px rgba(0,0,0,.4)}
.ac-more svg{transition:transform .2s}
.ac-more:hover svg{transform:translateX(3px)}
.ac-canvas{position:relative;max-width:1100px;height:480px;margin:0 auto;border-radius:28px;overflow:hidden;background-color:var(--bg);background-image:radial-gradient(var(--dot) 1.2px,transparent 1.3px);background-size:22px 22px;box-shadow:inset 0 0 0 1px var(--line);touch-action:pan-y}
.ac-links{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.ac-link{fill:none;stroke:var(--link);stroke-width:1.6}
.ac-lit{fill:none;stroke:#ff6a4d;stroke-width:2.4;stroke-linecap:round;opacity:0;transition:opacity .5s ease}
.ac-halo{fill:#ff6a4d;fill-opacity:.2}
.ac-core{fill:#ff6a4d}
#ac-dot{transition:opacity .2s ease}
.ac-node{position:absolute;left:0;top:0;width:232px;padding:10px 12px 12px;border-radius:18px;background:var(--card);color:var(--ink);box-shadow:0 0 0 1px var(--line),0 10px 24px -14px rgba(15,17,25,.35);cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;will-change:transform;transform-origin:50% 40%;z-index:2;transition:box-shadow .25s ease}
.ac-node.lifted{cursor:grabbing;box-shadow:0 0 0 1px color-mix(in srgb,var(--nc) 35%,transparent),0 26px 44px -18px rgba(15,17,25,.45)}
.ac-node.ran{animation:acRan .9s ease}
@keyframes acRan{0%{box-shadow:0 0 0 1px var(--line),0 10px 24px -14px rgba(15,17,25,.35)}25%{box-shadow:0 0 0 3px color-mix(in srgb,var(--nc) 45%,transparent),0 16px 34px -14px color-mix(in srgb,var(--nc) 60%,transparent)}100%{box-shadow:0 0 0 1px var(--line),0 10px 24px -14px rgba(15,17,25,.35)}}
.ac-nh{display:flex;align-items:center;gap:8px;margin:0 0 8px;padding:6px 8px;border-radius:11px;background:color-mix(in srgb,var(--nc) 12%,transparent);color:var(--nc);font-size:13px;font-weight:700}
.ac-ni{width:22px;height:22px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:var(--nc);color:#fff}
.ac-ni.ai{background:transparent}
.ac-node p{margin:0 2px;font-size:13.5px;line-height:1.4}
.ac-chips{display:flex;flex-wrap:wrap;gap:5px;margin:9px 2px 0}
.ac-chips span{padding:3px 8px;border-radius:999px;background:color-mix(in srgb,var(--ink) 6%,transparent);font-size:11.5px;font-weight:600;color:var(--mut)}
.ac-row{position:relative;margin:7px 0 0;padding:7px 10px;border-radius:10px;background:color-mix(in srgb,var(--ink) 4%,transparent);font-size:12.5px;font-weight:600;color:var(--mut);transition:background .3s ease,color .3s ease}
.ac-row+.ac-row{margin-top:5px}
.ac-row.pick{background:color-mix(in srgb,var(--nc) 14%,transparent);color:var(--nc)}
.ac-who{display:flex;align-items:center;gap:10px;margin:0 2px}
.ac-av{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:color-mix(in srgb,#2b6bff 16%,var(--card));color:#2b6bff;font-size:12px;font-weight:800}
.ac-who b{display:block;font-size:13.5px}
.ac-who small{display:block;font-size:12px;color:var(--mut)}
.ac-port{position:absolute;width:10px;height:10px;border-radius:50%;background:var(--card);box-shadow:0 0 0 2px var(--link);pointer-events:none}
.ac-port.in{left:-5px;top:24px}
.ac-port.out{right:-5px;top:50%;margin-top:-5px}
.ac-row .ac-port.out{right:-17px}
.ac-hint,.ac-tidy{position:absolute;left:16px;bottom:14px;z-index:1;display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--mut)}
.ac-hint svg{animation:acWave 2.2s ease-in-out infinite;transform-origin:50% 90%}
@keyframes acWave{0%,60%,100%{transform:none}70%{transform:rotate(-14deg)}80%{transform:rotate(10deg)}90%{transform:rotate(-6deg)}}
.ac-tidy{padding:7px 13px;border:0;border-radius:999px;background:var(--card);color:var(--ink);box-shadow:0 0 0 1px var(--line),0 6px 14px -8px rgba(0,0,0,.3);cursor:pointer;font:inherit;font-size:12.5px;font-weight:700;animation:acIn .45s cubic-bezier(.34,1.7,.5,1)}
.ac-tidy::before{display:none!important}
.ac-tidy:focus-visible{outline:2px solid #ff6a4d;outline-offset:2px}
@keyframes acIn{from{opacity:0;transform:scale(.6)}}
.ac-foot{max-width:720px;margin:14px auto 0;text-align:center;font-size:13px}
.ac-canvas.tall .ac-node{width:calc(50% - 21px);min-width:150px;padding:9px 10px 11px}
.ac-canvas.tall .ac-node p{font-size:12.5px}
.ac-canvas.tall .ac-port.in{left:50%;top:-5px;margin-left:-5px}
.ac-canvas.tall .ac-port.out{left:50%;right:auto;top:auto;bottom:-5px;margin:0 0 0 -5px}
.ac-canvas.tall .ac-row{position:static}
.ac-canvas.tall .ac-port.out.yes{left:28%}
.ac-canvas.tall .ac-port.out.else{left:72%}
@media (prefers-reduced-motion:reduce){.ac-hint svg,.ac-node.ran,.ac-tidy{animation:none}}
`
