'use client'

// The automation builder (/admin/automations/[id]): a full-screen canvas.
//
//  - Drag steps from the palette onto the canvas, or tap one to add it after
//    the selected step (joined up for you).
//  - Drag from a step's dot on the right to another step to join them; let go
//    on empty canvas to pick a new step right there. Tap a line to remove it.
//  - Drag steps around; drag the background (or two fingers) to pan; pinch,
//    ctrl/⌘ + scroll or the buttons to zoom.
//  - Tap a step to edit it (a side panel, a bottom sheet on phones).
//  - Saves as you go. Undo / redo (⌘Z / ⇧⌘Z). Delete removes the selection.
//  - Try it: a made-up message walks the flow, the path lights up, nothing is sent.
//  - Runs: what really happened, step by step.
//  - Live: only once nothing is left to fix (the server checks again).
//
// The flow model, checks and dry run are lib/automations/graph (shared with
// the server), so what Try it shows is what the engine does.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiRaw } from '@/components/jobs/shared'
import {
  KINDS, NODE_KINDS, CHANNELS, LIMITS, problems as findProblems, simulate, defaultConfig, nextOf, fill, waitLabel,
  type Graph, type GNode, type GEdge, type NodeKind, type Port, type Facts, type Step,
} from '@/lib/automations/graph'
import { Ic, kindIcon, summary, detail, GROUP_LABEL, AB_TOKENS, hoursLabel, NODE_W as W, NODE_H as H } from './kit'

const portY = (p: Port) => (p === 'yes' ? H * 0.36 : p === 'no' ? H * 0.72 : H / 2)
const uid = () => Math.random().toString(36).slice(2, 9)
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
type View = { x: number; y: number; k: number }
type Sel = { type: 'node'; id: string } | { type: 'edge'; id: string } | null
type Member = { id: string; name: string }
type Run = { id: string; status: string; conversationId: string | null; customer: string; steps: any[]; error: string | null; createdAt: string; resumeAt: string | null }
type Flow = { id: string; name: string; enabled: boolean; runCount: number; lastRunAt: string | null }

function curve(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(48, Math.abs(x2 - x1) / 2)
  return { d: `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`, mx: (x1 + 3 * (x1 + dx) + 3 * (x2 - dx) + x2) / 8, my: (y1 + y2) / 2 }
}
function reaches(edges: GEdge[], from: string, target: string): boolean {
  const stack = [from], seen = new Set<string>()
  while (stack.length) {
    const n = stack.pop()!
    if (n === target) return true
    if (seen.has(n)) continue
    seen.add(n)
    for (const e of edges) if (e.from === n) stack.push(e.to)
  }
  return false
}
function ago(iso: string | null) {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
function useNarrow() {
  const [n, setN] = useState(false)
  useEffect(() => {
    const m = window.matchMedia('(max-width: 760px)')
    const on = () => setN(m.matches)
    on(); m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return n
}

export default function Builder({ id, companyId }: { id: string; companyId: string }) {
  const router = useRouter()
  const narrow = useNarrow()
  const [err, setErr] = useState('')
  const [flow, setFlow] = useState<Flow | null>(null)
  const [graph, setGraph] = useState<Graph>({ nodes: [], edges: [] })
  const [name, setName] = useState('')
  const [team, setTeam] = useState<Member[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [business, setBusiness] = useState<string | null>(null)
  const [planLocked, setPlanLocked] = useState<string | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [sel, setSel] = useState<Sel>(null)
  const [view, setView] = useState<View>({ x: 40, y: 40, k: 1 })
  const [animView, setAnimView] = useState(false)
  const [save, setSave] = useState<'saved' | 'pending' | 'saving' | 'error'>('saved')
  const [panel, setPanel] = useState<'try' | 'runs' | null>(null)
  const [sheet, setSheet] = useState(false)              // phone: the add-a-step sheet
  const [toast, setToast] = useState<{ text: string; tone?: 'bad' | 'good' } | null>(null)
  const [showProblems, setShowProblems] = useState(false)
  const [connect, setConnect] = useState<{ from: string; port: Port; x: number; y: number } | null>(null)
  const [quick, setQuick] = useState<{ sx: number; sy: number; wx: number; wy: number; from?: string; port?: Port } | null>(null)
  const [ghost, setGhost] = useState<{ kind: NodeKind; x: number; y: number } | null>(null)
  const [trace, setTrace] = useState<Step[]>([])
  const [traceN, setTraceN] = useState(0)
  const [dragId, setDragId] = useState<string | null>(null)
  const [, setHistTick] = useState(0)

  const canvasRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef(view); viewRef.current = view
  const graphRef = useRef(graph); graphRef.current = graph
  const nameRef = useRef(name); nameRef.current = name
  const past = useRef<Graph[]>([]), future = useRef<Graph[]>([])
  const lastHist = useRef(0)
  const savedJson = useRef('')
  const loaded = useRef(false)
  const toastTimer = useRef<any>(null)
  const showSideRef = useRef(false)

  const say = useCallback((text: string, tone?: 'bad' | 'good') => {
    setToast({ text, tone }); clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), tone === 'bad' ? 5200 : 2600)
  }, [])

  // ── Loading ────────────────────────────────────────────────────────────────
  const load = useCallback(async (first = false) => {
    const r = await apiRaw(`/api/automations/${id}?companyId=${companyId}`)
    if (!r.ok) { setErr(r.data?.error || 'Couldn’t open this automation.'); return }
    const a = r.data.automation
    setFlow({ id: a.id, name: a.name, enabled: a.enabled, runCount: a.runCount, lastRunAt: a.lastRunAt })
    setTeam(r.data.team || []); setTags(r.data.tags || []); setBusiness(r.data.business || null)
    setPlanLocked(r.data.planOk ? null : (r.data.planLocked || 'Automations aren’t on your plan.'))
    setRuns(r.data.runs || [])
    if (first) {
      setGraph(a.graph); setName(a.name)
      savedJson.current = JSON.stringify({ name: a.name, graph: a.graph })
      loaded.current = true
      requestAnimationFrame(() => fitTo(a.graph, false))
    }
  }, [id, companyId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(true) }, [load])

  // ── Saving as you go ───────────────────────────────────────────────────────
  const persist = useCallback(async (extra: Record<string, any> = {}) => {
    const body = { name: nameRef.current.trim() || 'Untitled automation', graph: graphRef.current }
    const json = JSON.stringify(body)
    setSave('saving')
    const r = await apiRaw(`/api/automations/${id}`, { method: 'PATCH', json: { companyId, ...body, ...extra } })
    if (!r.ok) {
      setSave('error')
      say(r.data?.error || 'Couldn’t save. Check your connection and try again.', 'bad')
      return null
    }
    savedJson.current = json
    const a = r.data.automation
    setFlow(f => f ? { ...f, enabled: a.enabled, name: a.name } : f)
    setSave(JSON.stringify({ name: nameRef.current.trim() || 'Untitled automation', graph: graphRef.current }) === json ? 'saved' : 'pending')
    if (r.data.switchedOff) say(r.data.switchedOff, 'bad')
    return r.data
  }, [id, companyId, say])

  useEffect(() => {
    if (!loaded.current || dragId) return
    const json = JSON.stringify({ name: name.trim() || 'Untitled automation', graph })
    if (json === savedJson.current) return
    setSave('pending')
    const t = setTimeout(() => { void persist() }, 700)
    return () => clearTimeout(t)
  }, [graph, name, dragId, persist])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (save !== 'saved') { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [save])

  const leave = async () => {
    if (JSON.stringify({ name: name.trim() || 'Untitled automation', graph }) !== savedJson.current) await persist()
    router.push('/admin/crm-settings/automations')
  }

  // ── Changing the flow (with undo) ──────────────────────────────────────────
  const remember = (force = false) => {
    const now = Date.now()
    if (!force && now - lastHist.current < 1200) return
    lastHist.current = now
    past.current = [...past.current.slice(-49), graphRef.current]
    future.current = []
    setHistTick(t => t + 1)
  }
  const change = (next: Graph | ((g: Graph) => Graph), history: 'step' | 'typing' | 'none' = 'step') => {
    if (history !== 'none') remember(history === 'step')
    setGraph(g => typeof next === 'function' ? next(g) : next)
  }
  const undo = () => {
    const prev = past.current.pop(); if (!prev) return
    future.current.push(graphRef.current); setGraph(prev); setHistTick(t => t + 1); lastHist.current = 0
  }
  const redo = () => {
    const nxt = future.current.pop(); if (!nxt) return
    past.current.push(graphRef.current); setGraph(nxt); setHistTick(t => t + 1); lastHist.current = 0
  }

  const trigger = graph.nodes.find(n => n.kind === 'trigger') || null
  const isCall = trigger?.config.type === 'missed_call'
  const issues = useMemo(() => findProblems(graph), [graph])
  const badNodes = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of issues) if (p.nodeId && !m.has(p.nodeId)) m.set(p.nodeId, p.message)
    return m
  }, [issues])

  const setConfig = (nodeId: string, patch: Record<string, any>) => change(g => ({ ...g, nodes: g.nodes.map(n => n.id === nodeId ? { ...n, config: { ...n.config, ...patch } } : n) }), 'typing')

  const addNode = (kind: NodeKind, x: number, y: number, link?: { from: string; port: Port }) => {
    if (graphRef.current.nodes.length >= LIMITS.nodes) { say(`An automation can have up to ${LIMITS.nodes} steps.`, 'bad'); return null }
    const node: GNode = { id: `${kind.replace(/^if_/, '')}_${uid()}`, kind, x: Math.round(x / 4) * 4, y: Math.round(y / 4) * 4, config: defaultConfig(kind) }
    change(g => {
      let edges = g.edges
      if (link) {
        edges = edges.filter(e => !(e.from === link.from && e.port === link.port))
        edges = [...edges, { id: `e_${uid()}`, from: link.from, port: link.port, to: node.id }]
      }
      return { nodes: [...g.nodes, node], edges }
    })
    setSel({ type: 'node', id: node.id })
    setTrace([])
    return node
  }

  /** Tap-to-add: after the selected step (or the end of the flow), joined to its first free way out. */
  const addAfter = (kind: NodeKind) => {
    const g = graphRef.current
    let anchor = sel?.type === 'node' ? g.nodes.find(n => n.id === sel.id) : null
    if (!anchor) {
      // The last step on the main path.
      let cur = g.nodes.find(n => n.kind === 'trigger') || null
      const seen = new Set<string>()
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id)
        const ports = KINDS[cur.kind].ports
        const nx = ports.map(p => nextOf(g, cur!.id, p)).find(Boolean)
        const n2 = nx ? g.nodes.find(n => n.id === nx) : null
        if (!n2) break
        cur = n2
      }
      anchor = cur
    }
    const free = anchor ? KINDS[anchor.kind].ports.find(p => !nextOf(g, anchor!.id, p)) : undefined
    let x = anchor ? anchor.x + W + 72 : 80, y = anchor ? anchor.y + (free === 'no' ? 130 : 0) : 120
    while (g.nodes.some(n => Math.abs(n.x - x) < W * 0.8 && Math.abs(n.y - y) < H * 0.9)) y += H + 28
    const node = addNode(kind, x, y, anchor && free ? { from: anchor.id, port: free } : undefined)
    if (node) reveal(node)
    setSheet(false)
  }

  const removeSel = () => {
    if (!sel) return
    if (sel.type === 'edge') { change(g => ({ ...g, edges: g.edges.filter(e => e.id !== sel.id) })); setSel(null); return }
    const n = graphRef.current.nodes.find(x => x.id === sel.id)
    if (!n) return
    if (n.kind === 'trigger') { say('The trigger starts the automation, so it stays. Change what it listens for instead.'); return }
    change(g => ({ nodes: g.nodes.filter(x => x.id !== n.id), edges: g.edges.filter(e => e.from !== n.id && e.to !== n.id) }))
    setSel(null); setTrace([])
    say(`${KINDS[n.kind].label} removed. Undo brings it back.`)
  }

  const linkTo = (from: string, port: Port, to: string) => {
    const g = graphRef.current
    if (from === to) return
    const target = g.nodes.find(n => n.id === to)
    if (!target || target.kind === 'trigger') { say('Nothing can lead into the trigger.'); return }
    const others = g.edges.filter(e => !(e.from === from && e.port === port))
    if (reaches(others, to, from)) { say('That would make a loop, so it isn’t joined.', 'bad'); return }
    change({ ...g, edges: [...others, { id: `e_${uid()}`, from, port, to }] })
    setTrace([])
  }

  // ── The view: pan, zoom, fit ───────────────────────────────────────────────
  const rect = () => canvasRef.current?.getBoundingClientRect() || new DOMRect(0, 0, 800, 600)
  const toWorld = (cx: number, cy: number) => { const r = rect(), v = viewRef.current; return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k } }
  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    const r = rect()
    const px = cx ?? r.left + r.width / 2, py = cy ?? r.top + r.height / 2
    setView(v => {
      const k = clamp(v.k * factor, 0.3, 1.8)
      const wx = (px - r.left - v.x) / v.k, wy = (py - r.top - v.y) / v.k
      return { k, x: px - r.left - wx * k, y: py - r.top - wy * k }
    })
  }
  const glide = (v: View) => { setAnimView(true); setView(v); setTimeout(() => setAnimView(false), 380) }
  function fitTo(g: Graph, animate = true) {
    const r = rect()
    if (!g.nodes.length) return
    const minX = Math.min(...g.nodes.map(n => n.x)), minY = Math.min(...g.nodes.map(n => n.y))
    const maxX = Math.max(...g.nodes.map(n => n.x + W)), maxY = Math.max(...g.nodes.map(n => n.y + H))
    const phone = window.matchMedia('(max-width: 760px)').matches
    const pad = phone ? 20 : 72
    const k = clamp(Math.min((r.width - pad * 2) / (maxX - minX), (r.height - pad * 2) / (maxY - minY)), 0.35, 1.1)
    let v = { k, x: (r.width - (maxX - minX) * k) / 2 - minX * k, y: (r.height - (maxY - minY) * k) / 2 - minY * k }
    // Too small to read on a phone: start at the trigger instead, readable, and pan from there.
    if (phone && k < 0.6) {
      const t = g.nodes.find(n => n.kind === 'trigger') || g.nodes[0]
      v = { k: 0.6, x: pad - minX * 0.6, y: r.height * 0.42 - (t.y + H / 2) * 0.6 }
    }
    if (animate) glide(v); else setView(v)
  }
  /** Pan (never scroll) so a step is in view, clear of the panel that opens with it. */
  const reveal = (n: GNode, panelOpens = true) => {
    const r = rect(), v = viewRef.current
    const phone = window.matchMedia('(max-width: 760px)').matches
    const sx = n.x * v.k + v.x, sy = n.y * v.k + v.y
    const m = phone ? 16 : 40
    const right = !phone && panelOpens && !showSideRef.current ? r.width - 340 : r.width
    const bottom = phone && panelOpens ? r.height * 0.28 : r.height
    if (sx < m || sy < m || sx + W * v.k > right - m || sy + H * v.k > bottom - m) {
      glide({ ...v, x: right / 2 - (n.x + W / 2) * v.k, y: Math.max(m, bottom / 2 - H * v.k / 2) - n.y * v.k })
    }
  }

  // Wheel: scroll pans, pinch / ctrl+scroll zooms. Needs a non-passive listener.
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY)
      else setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pointer: drag steps, pan, pinch, join steps ────────────────────────────
  const gesture = useRef<any>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const t = e.target as HTMLElement
    if (t.closest('button, input, textarea, select, a, [data-ui]')) return
    setQuick(null); setShowProblems(false)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    canvasRef.current?.setPointerCapture(e.pointerId)
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values())
      gesture.current = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, v: viewRef.current }
      setDragId(null)
      return
    }
    const port = t.closest('[data-port]') as HTMLElement | null
    if (port) {
      const w = toWorld(e.clientX, e.clientY)
      gesture.current = { kind: 'connect', from: port.dataset.from, port: port.dataset.port }
      setConnect({ from: port.dataset.from!, port: port.dataset.port as Port, x: w.x, y: w.y })
      return
    }
    const edge = t.closest('[data-edge]') as HTMLElement | null
    if (edge) { setSel({ type: 'edge', id: edge.dataset.edge! }); gesture.current = null; return }
    const nodeEl = t.closest('[data-node]') as HTMLElement | null
    if (nodeEl) {
      const n = graphRef.current.nodes.find(x => x.id === nodeEl.dataset.node)
      if (!n) return
      gesture.current = { kind: 'node', id: n.id, sx: e.clientX, sy: e.clientY, nx: n.x, ny: n.y, moved: false }
      return
    }
    gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, v: viewRef.current, moved: false }
  }
  const onMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values())
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2
      const r = rect(), v0 = g.v
      const k = clamp(v0.k * d / g.d, 0.3, 1.8)
      const wx = (g.cx - r.left - v0.x) / v0.k, wy = (g.cy - r.top - v0.y) / v0.k
      setView({ k, x: cx - r.left - wx * k, y: cy - r.top - wy * k })
      return
    }
    if (g.kind === 'pan') {
      if (Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy) > 3) g.moved = true
      setView({ ...g.v, x: g.v.x + e.clientX - g.sx, y: g.v.y + e.clientY - g.sy })
      return
    }
    if (g.kind === 'node') {
      const dx = (e.clientX - g.sx) / viewRef.current.k, dy = (e.clientY - g.sy) / viewRef.current.k
      if (!g.moved && Math.abs(dx) + Math.abs(dy) < 4 / viewRef.current.k) return
      if (!g.moved) { g.moved = true; remember(true); setDragId(g.id) }
      const x = Math.round((g.nx + dx) / 4) * 4, y = Math.round((g.ny + dy) / 4) * 4
      setGraph(gr => ({ ...gr, nodes: gr.nodes.map(n => n.id === g.id ? { ...n, x: clamp(x, -4900, 4900), y: clamp(y, -4900, 4900) } : n) }))
      return
    }
    if (g.kind === 'connect') {
      const w = toWorld(e.clientX, e.clientY)
      setConnect(c => c ? { ...c, x: w.x, y: w.y } : c)
    }
  }
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    if (g?.kind === 'pinch') { if (pointers.current.size < 2) gesture.current = null; return }
    gesture.current = null
    if (!g) return
    if (g.kind === 'pan' && !g.moved) { setSel(null); if (narrow) setPanel(null) }
    if (g.kind === 'node') {
      setDragId(null)
      if (!g.moved) {
        setSel({ type: 'node', id: g.id }); setPanel(null)
        const n = graphRef.current.nodes.find(x => x.id === g.id)
        if (n) reveal(n)
      }
    }
    if (g.kind === 'connect') {
      setConnect(null)
      const over = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      const target = over?.closest('[data-node]') as HTMLElement | null
      if (target?.dataset.node) { if (target.dataset.node !== g.from) linkTo(g.from, g.port, target.dataset.node) }
      else if (over && canvasRef.current?.contains(over)) {
        const w = toWorld(e.clientX, e.clientY), r = rect()
        setQuick({ sx: clamp(e.clientX - r.left, 8, r.width - 248), sy: clamp(e.clientY - r.top, 8, r.height - 300), wx: w.x + 24, wy: w.y - H / 2, from: g.from, port: g.port })
      }
    }
  }

  // Dragging a step in from the palette.
  const palDown = (kind: NodeKind) => (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const sx = e.clientX, sy = e.clientY
    let moved = false
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 6) moved = true
      if (moved) setGhost({ kind, x: ev.clientX, y: ev.clientY })
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up)
      setGhost(null)
      if (!moved) { addAfter(kind); return }
      const r = rect()
      if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
        const w = toWorld(ev.clientX, ev.clientY)
        addNode(kind, w.x - W / 2, w.y - H / 2)
      }
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
  }

  // Keys: Delete, ⌘Z / ⇧⌘Z, Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.closest('input, textarea, select, [contenteditable="true"]'))) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removeSel() }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
      else if (e.key === 'Escape') { setSel(null); setQuick(null); setPanel(null); setSheet(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── Live ───────────────────────────────────────────────────────────────────
  const setLive = async (on: boolean) => {
    if (on && issues.length) {
      const p = issues[0]
      say(`Fix this first: ${p.message}`, 'bad')
      if (p.nodeId) { setSel({ type: 'node', id: p.nodeId }); const n = graph.nodes.find(x => x.id === p.nodeId); if (n) reveal(n) }
      return
    }
    if (on && planLocked) { say(planLocked, 'bad'); return }
    const r = await persist({ enabled: on })
    if (r) say(on ? 'Live. It runs on the next message that fits.' : 'Switched off. Nothing runs until you switch it back on.', on ? 'good' : undefined)
  }

  // ── Try it ─────────────────────────────────────────────────────────────────
  const [tryText, setTryText] = useState('Hi, can I get a refund for my order?')
  const [tryChannel, setTryChannel] = useState('chat')
  const [tryOpen, setTryOpen] = useState(false)
  const [tryNew, setTryNew] = useState(false)
  const [tryWaiting, setTryWaiting] = useState(true)
  const [tryTags, setTryTags] = useState('')
  const runTry = () => {
    const facts: Facts = {
      trigger: isCall ? 'missed_call' : 'message', text: isCall ? '' : tryText, channel: isCall ? 'phone' : tryChannel, openNow: tryOpen,
      tags: tryTags.split(',').map(s => s.trim()).filter(Boolean), isNew: tryNew, unanswered: tryWaiting,
    }
    const steps = simulate(graph, facts)
    setTrace(steps); setTraceN(0)
  }
  useEffect(() => {
    if (!trace.length || traceN >= trace.length) return
    const t = setTimeout(() => setTraceN(n => n + 1), traceN === 0 ? 60 : 420)
    return () => clearTimeout(t)
  }, [trace, traceN])
  const litNodes = useMemo(() => new Set(trace.slice(0, traceN).map(s => s.nodeId)), [trace, traceN])
  const litEdges = useMemo(() => {
    const s = new Set<string>()
    for (let i = 0; i < Math.min(traceN, trace.length) - 1; i++) {
      const a = trace[i], b = trace[i + 1]
      const port: Port = a.result || 'out'
      const e = graph.edges.find(x => x.from === a.nodeId && x.port === port && x.to === b.nodeId)
      if (e) s.add(e.id)
    }
    return s
  }, [trace, traceN, graph.edges])

  const refreshRuns = async () => { await load(false) }
  useEffect(() => { if (panel !== 'try') setTrace([]) }, [panel])

  // ── Rendering ──────────────────────────────────────────────────────────────
  if (err) return (
    <div className="ab-tok ab-full ab-center" style={{ position: 'fixed' }}>
      <style>{AB_TOKENS + CSS}</style>
      <div className="ab-empty"><Ic name="warn" size={22} /><p>{err}</p><button className="ab-btn" onClick={() => router.push('/admin/crm-settings/automations')}>Back to automations</button></div>
    </div>
  )

  const selNode = sel?.type === 'node' ? graph.nodes.find(n => n.id === sel.id) || null : null
  const selEdge = sel?.type === 'edge' ? graph.edges.find(e => e.id === sel.id) || null : null
  const byId = new Map(graph.nodes.map(n => [n.id, n]))
  const showSide = !!(selNode || panel)
  showSideRef.current = showSide
  const onlyTrigger = graph.nodes.length === 1 && trigger && !graph.edges.length

  return (
    <div className={`ab-tok ab-full${narrow ? ' narrow' : ''}`} style={{ position: 'fixed' }}>
      <style>{AB_TOKENS + CSS}</style>

      {/* Top bar */}
      <header className="ab-top">
        <button className="ab-ib" onClick={leave} aria-label="Back to automations" title="Back to automations"><Ic name="back" size={18} stroke={2.4} /></button>
        <div className="ab-title">
          <input value={name} onChange={e => setName(e.target.value.slice(0, 80))} onBlur={() => { if (!name.trim()) setName(flow?.name || 'Untitled automation') }} aria-label="Automation name" placeholder="Name this automation" />
          <span className={`ab-save s-${save}`}>{save === 'saved' ? 'Saved' : save === 'saving' ? 'Saving…' : save === 'pending' ? 'Unsaved changes' : 'Not saved'}</span>
        </div>
        <div className="ab-acts">
          {!narrow && <>
            <button className="ab-ib" onClick={undo} disabled={!past.current.length} title="Undo (⌘Z)" aria-label="Undo"><Ic name="undo" /></button>
            <button className="ab-ib" onClick={redo} disabled={!future.current.length} title="Redo (⇧⌘Z)" aria-label="Redo"><Ic name="redo" /></button>
          </>}
          {issues.length > 0 && (
            <div className="ab-pwrap">
              <button className="ab-pill warn" onClick={() => setShowProblems(s => !s)}><Ic name="warn" size={14} /> {issues.length} to fix</button>
              {showProblems && (
                <div className="ab-pop" data-ui>
                  {issues.map((p, i) => (
                    <button key={i} className="ab-prob" onClick={() => { setShowProblems(false); if (p.nodeId) { setSel({ type: 'node', id: p.nodeId }); setPanel(null); const n = byId.get(p.nodeId); if (n) reveal(n) } }}>
                      {p.nodeId && byId.get(p.nodeId) ? <span className="ab-dot" style={{ background: KINDS[byId.get(p.nodeId)!.kind].color }} /> : null}
                      <span>{p.message}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button className={`ab-pill${panel === 'try' ? ' on' : ''}`} onClick={() => { setPanel(p => p === 'try' ? null : 'try'); setSel(null) }}><Ic name="play" size={13} /> Try it</button>
          <button className={`ab-pill${panel === 'runs' ? ' on' : ''}`} onClick={() => { setPanel(p => p === 'runs' ? null : 'runs'); setSel(null); void refreshRuns() }}><Ic name="list" size={14} /> Runs{flow?.runCount ? <em>{flow.runCount}</em> : null}</button>
          <button className={`ab-live${flow?.enabled ? ' on' : ''}`} onClick={() => setLive(!flow?.enabled)} role="switch" aria-checked={!!flow?.enabled}>
            <span className="ab-sw"><i /></span>{flow?.enabled ? 'Live' : 'Off'}
          </button>
        </div>
      </header>
      {planLocked && <div className="ab-banner"><Ic name="warn" size={15} /> {planLocked} You can still build and try it.</div>}

      <div className="ab-body">
        {/* Palette */}
        {!narrow && (
          <aside className="ab-pal" aria-label="Steps">
            <Palette onDown={palDown} isCall={!!isCall} />
          </aside>
        )}

        {/* Canvas */}
        <div ref={canvasRef} data-no-press className={`ab-canvas${connect ? ' connecting' : ''}${dragId ? ' dragging' : ''}`}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          onScroll={e => { const el = e.currentTarget; if (el.scrollTop || el.scrollLeft) { el.scrollTop = 0; el.scrollLeft = 0 } }}
          style={{ backgroundSize: `${22 * view.k}px ${22 * view.k}px`, backgroundPosition: `${view.x}px ${view.y}px` }}>
          <div className={`ab-world${animView ? ' glide' : ''}`} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
            <svg className="ab-edges" aria-hidden><g transform="translate(5000 5000)">
              {graph.edges.map(e => {
                const a = byId.get(e.from), b = byId.get(e.to)
                if (!a || !b) return null
                const c = curve(a.x + W, a.y + portY(e.port), b.x, b.y + H / 2)
                return (
                  <g key={e.id} data-edge={e.id} className={`ab-edge p-${e.port}${selEdge?.id === e.id ? ' sel' : ''}${litEdges.has(e.id) ? ' lit' : ''}`}>
                    <path className="hit" d={c.d} />
                    <path className="ln" d={c.d} />
                  </g>
                )
              })}
              {connect && (() => {
                const a = byId.get(connect.from)
                if (!a) return null
                const c = curve(a.x + W, a.y + portY(connect.port), connect.x, connect.y)
                return <path className={`ab-temp p-${connect.port}`} d={c.d} />
              })()}
            </g></svg>
            {selEdge && (() => {
              const a = byId.get(selEdge.from), b = byId.get(selEdge.to)
              if (!a || !b) return null
              const c = curve(a.x + W, a.y + portY(selEdge.port), b.x, b.y + H / 2)
              return <button className="ab-edgex" style={{ left: c.mx, top: c.my }} onClick={removeSel} aria-label="Remove this link" title="Remove this link"><Ic name="x" size={12} stroke={2.6} /></button>
            })()}
            {graph.nodes.map(n => {
              const def = KINDS[n.kind]
              const bad = badNodes.get(n.id)
              return (
                <div key={n.id} data-node={n.id} role="button" tabIndex={0} aria-label={summary(n) === def.label ? def.label : `${def.label}: ${summary(n)}`}
                  onKeyDown={e => { if (e.key === 'Enter') { setSel({ type: 'node', id: n.id }); setPanel(null) } }}
                  onFocus={e => { if (e.currentTarget.matches(':focus-visible')) reveal(n, false) }}
                  className={`ab-node g-${def.group}${selNode?.id === n.id ? ' sel' : ''}${bad ? ' bad' : ''}${litNodes.has(n.id) ? ' lit' : ''}${dragId === n.id ? ' lift' : ''}${trace.length && !litNodes.has(n.id) && traceN >= trace.length ? ' dim' : ''}`}
                  style={{ left: n.x, top: n.y, '--c': def.color } as React.CSSProperties}>
                  {n.kind !== 'trigger' && <span className="ab-in" aria-hidden />}
                  <span className="ab-ic"><Ic name={kindIcon(n.kind)} size={18} /></span>
                  <span className="ab-txt">
                    <small>{n.kind === 'trigger' ? 'When' : GROUP_LABEL[def.group]}</small>
                    <b>{summary(n)}</b>
                    <em>{detail(n)}</em>
                  </span>
                  {bad && <span className="ab-badge" title={bad}>!</span>}
                  {def.ports.map(p => (
                    <span key={p} className={`ab-out p-${p}${nextOf(graph, n.id, p) ? ' on' : ''}${n.kind === 'trigger' && onlyTrigger ? ' hint' : ''}`} data-port={p} data-from={n.id} style={{ top: portY(p) }} title={p === 'out' ? 'Drag to the next step' : `Drag to the step for “${p}”`}>
                      {p !== 'out' && <i>{p === 'yes' ? 'Yes' : 'No'}</i>}
                    </span>
                  ))}
                </div>
              )
            })}
          </div>

          {onlyTrigger && (
            <div className="ab-coach" data-ui>
              <b>Add the first step</b>
              <span>{narrow ? 'Tap + below, or drag from the trigger’s dot.' : 'Drag a step from the left, tap one to add it, or drag from the trigger’s dot.'}</span>
            </div>
          )}

          {quick && (
            <div className="ab-quick" style={{ left: quick.sx, top: quick.sy }} data-ui>
              <div className="ab-quick-h">Add a step here <button className="ab-ib sm" onClick={() => setQuick(null)} aria-label="Close"><Ic name="x" size={12} /></button></div>
              <div className="ab-quick-l">
                {NODE_KINDS.filter(k => k !== 'trigger' && !(isCall && (k === 'if_keyword' || k === 'if_channel'))).map(k => (
                  <button key={k} onClick={() => { const node = addNode(k, quick.wx, quick.wy, quick.from && quick.port ? { from: quick.from, port: quick.port } : undefined); setQuick(null); if (node) reveal(node) }}>
                    <span className="ab-mi" style={{ '--c': KINDS[k].color } as React.CSSProperties}><Ic name={kindIcon(k)} size={13} /></span>{KINDS[k].label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="ab-zoom" data-ui>
            <button onClick={() => zoomAt(1 / 1.2)} aria-label="Zoom out"><Ic name="minus" size={14} /></button>
            <span>{Math.round(view.k * 100)}%</span>
            <button onClick={() => zoomAt(1.2)} aria-label="Zoom in"><Ic name="plus" size={14} /></button>
            <button onClick={() => fitTo(graph)} aria-label="Fit the flow on screen" title="Fit on screen"><Ic name="fit" size={14} /></button>
            {narrow && <>
              <button onClick={undo} disabled={!past.current.length} aria-label="Undo"><Ic name="undo" size={14} /></button>
            </>}
          </div>

          {narrow && !showSide && (
            <button className="ab-fab" onClick={() => setSheet(true)} data-ui><Ic name="plus" size={18} stroke={2.6} /> Add step</button>
          )}
        </div>

        {/* Side panel / bottom sheet */}
        {showSide && (
          <aside className={`ab-side${narrow ? ' sheet' : ''}`} data-ui>
            {selNode && !panel && (
              <Inspector key={selNode.id} node={selNode} graph={graph} team={team} tags={tags} business={business} isCall={!!isCall}
                bad={badNodes.get(selNode.id) || null}
                onConfig={patch => setConfig(selNode.id, patch)}
                onDelete={removeSel} onClose={() => setSel(null)} />
            )}
            {panel === 'try' && (
              <div className="ab-panel">
                <div className="ab-ph"><div><h3>Try it</h3><p>Walk a made-up {isCall ? 'missed call' : 'message'} through the flow. Nothing is sent.</p></div><button className="ab-ib sm" onClick={() => { setPanel(null); setTrace([]) }} aria-label="Close"><Ic name="x" size={14} /></button></div>
                <div className="ab-form">
                  {!isCall && <>
                    <label className="ab-f"><span>The customer writes</span><textarea rows={3} value={tryText} onChange={e => setTryText(e.target.value)} /></label>
                    <label className="ab-f"><span>On</span>
                      <select value={tryChannel} onChange={e => setTryChannel(e.target.value)}>{CHANNELS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
                    </label>
                  </>}
                  <Check on={tryOpen} set={setTryOpen} label="You’re open right now" />
                  <Check on={tryNew} set={setTryNew} label="It’s their first conversation with you" />
                  <Check on={tryWaiting} set={setTryWaiting} label="Nobody has replied yet" />
                  <label className="ab-f"><span>Their tags <small>(comma between)</small></span><input value={tryTags} onChange={e => setTryTags(e.target.value)} placeholder="VIP, Wholesale" /></label>
                  <button className="ab-btn" onClick={runTry} disabled={!trigger}><Ic name="play" size={13} /> Run the test</button>
                </div>
                {trace.length > 0 && (
                  <ol className="ab-trace">
                    {trace.slice(0, traceN).map((s, i) => {
                      const n = byId.get(s.nodeId)
                      return (
                        <li key={i} style={{ '--c': n ? KINDS[n.kind].color : '#999' } as React.CSSProperties}>
                          <span className="ab-mi"><Ic name={n ? kindIcon(n.kind) : 'bolt'} size={12} /></span>
                          <div><b>{n ? summary(n) : s.kind}</b>{s.result ? <em className={`r-${s.result}`}>{s.result === 'yes' ? 'Yes' : 'No'}</em> : null}{s.kind === 'wait' && <small>The real run pauses here, then carries on.</small>}</div>
                        </li>
                      )
                    })}
                    {traceN >= trace.length && <li className="end"><span>{trace.length <= 1 ? 'Nothing happens: the trigger isn’t joined to a step yet.' : (() => { const last = trace[trace.length - 1]; return last.result ? `Stops here: nothing is joined to “${last.result}”.` : 'Done.' })()}</span></li>}
                  </ol>
                )}
              </div>
            )}
            {panel === 'runs' && (
              <div className="ab-panel">
                <div className="ab-ph"><div><h3>Runs</h3><p>{flow?.runCount ? `Ran ${flow.runCount} ${flow.runCount === 1 ? 'time' : 'times'}${flow.lastRunAt ? `, last ${ago(flow.lastRunAt)}` : ''}.` : 'Nothing has run yet.'}</p></div><button className="ab-ib sm" onClick={() => setPanel(null)} aria-label="Close"><Ic name="x" size={14} /></button></div>
                {!runs.length ? (
                  <div className="ab-none">
                    <Ic name="flow" size={22} />
                    <p>{flow?.enabled ? 'It’s live. Runs show up here as customers write in.' : 'Switch it on (Live, top right) and runs show up here.'}</p>
                  </div>
                ) : (
                  <ul className="ab-runs">
                    {runs.map(r => <RunRow key={r.id} run={r} byId={byId} />)}
                  </ul>
                )}
                <button className="ab-btn ghost" onClick={refreshRuns}>Refresh</button>
              </div>
            )}
          </aside>
        )}

        {narrow && sheet && (
          <div className="ab-scrim" onClick={() => setSheet(false)} data-ui>
            <div className="ab-side sheet" onClick={e => e.stopPropagation()}>
              <div className="ab-ph"><div><h3>Add a step</h3><p>{selNode ? `After “${summary(selNode)}”` : 'At the end of the flow'}</p></div><button className="ab-ib sm" onClick={() => setSheet(false)} aria-label="Close"><Ic name="x" size={14} /></button></div>
              <Palette onDown={palDown} isCall={!!isCall} />
            </div>
          </div>
        )}
      </div>

      {ghost && (
        <div className="ab-ghost" style={{ left: ghost.x, top: ghost.y, '--c': KINDS[ghost.kind].color } as React.CSSProperties}>
          <span className="ab-mi"><Ic name={kindIcon(ghost.kind)} size={14} /></span>{KINDS[ghost.kind].label}
        </div>
      )}
      {toast && <div className={`ab-toast${toast.tone ? ` t-${toast.tone}` : ''}`} role="status">{toast.text}</div>}
    </div>
  )
}

// ── Palette ──────────────────────────────────────────────────────────────────
function Palette({ onDown, isCall }: { onDown: (k: NodeKind) => (e: React.PointerEvent) => void; isCall: boolean }) {
  const groups: { title: string; group: string }[] = [{ title: 'Checks', group: 'check' }, { title: 'Actions', group: 'action' }, { title: 'Timing', group: 'timing' }]
  return (
    <div className="ab-palin">
      {groups.map(g => (
        <section key={g.group}>
          <h4>{g.title}</h4>
          {NODE_KINDS.filter(k => KINDS[k].group === g.group).map(k => {
            const off = isCall && (k === 'if_keyword' || k === 'if_channel')
            return (
              <button key={k} className="ab-pi" disabled={off} onPointerDown={off ? undefined : onDown(k)} title={off ? 'A missed call has no message or channel to check.' : KINDS[k].hint} style={{ '--c': KINDS[k].color } as React.CSSProperties}>
                <span className="ab-mi"><Ic name={kindIcon(k)} size={14} /></span>
                <span>{KINDS[k].label}</span>
              </button>
            )
          })}
        </section>
      ))}
      <p className="ab-palhint">Drag onto the canvas, or tap to add after the selected step.</p>
    </div>
  )
}

function Check({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <button type="button" className={`ab-check${on ? ' on' : ''}`} onClick={() => set(!on)} role="checkbox" aria-checked={on}>
      <span className="ab-box">{on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>}</span>{label}
    </button>
  )
}

function RunRow({ run, byId }: { run: Run; byId: Map<string, GNode> }) {
  const [open, setOpen] = useState(false)
  const label: Record<string, string> = { done: 'Done', waiting: 'Waiting', failed: 'Problem', skipped: 'Stopped', running: 'Running' }
  return (
    <li className={`ab-run s-${run.status}`}>
      <button className="ab-runh" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="ab-st">{label[run.status] || run.status}</span>
        <b>{run.customer}</b>
        <small>{ago(run.createdAt)}</small>
      </button>
      {open && (
        <div className="ab-rund">
          {run.status === 'waiting' && run.resumeAt && <p className="ab-note">Carries on {new Date(run.resumeAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.</p>}
          <ol>
            {run.steps.map((s: any, i: number) => {
              const n = byId.get(s.node)
              const kind = (n?.kind || s.kind) as NodeKind
              return (
                <li key={i} className={s.ok === false ? 'bad' : ''}>
                  <span className="ab-mi" style={{ '--c': KINDS[kind]?.color || '#94a3b8' } as React.CSSProperties}><Ic name={KINDS[kind] ? kindIcon(kind) : 'warn'} size={11} /></span>
                  <span>{s.result ? `${n ? summary(n) : KINDS[kind]?.label || 'Check'}: ${s.result === 'yes' ? 'yes' : 'no'}` : s.note || (n ? summary(n) : s.kind)}</span>
                </li>
              )
            })}
          </ol>
          {run.conversationId && <a className="ab-link" href={`/admin/inbox?conversation=${run.conversationId}`}><Ic name="chat" size={13} /> Open the conversation</a>}
        </div>
      )}
    </li>
  )
}

// ── Inspector: editing one step ──────────────────────────────────────────────
function Inspector({ node, graph, team, tags, business, isCall, bad, onConfig, onDelete, onClose }: {
  node: GNode; graph: Graph; team: Member[]; tags: string[]; business: string | null; isCall: boolean; bad: string | null
  onConfig: (patch: Record<string, any>) => void; onDelete: () => void; onClose: () => void
}) {
  const def = KINDS[node.kind]
  const c = node.config
  const replyRef = useRef<HTMLTextAreaElement>(null)
  const insert = (token: string) => {
    const el = replyRef.current
    const text = String(c.text || '')
    const at = el ? el.selectionStart ?? text.length : text.length
    const next = text.slice(0, at) + token + text.slice(el?.selectionEnd ?? at)
    onConfig({ text: next.slice(0, LIMITS.replyChars) })
    requestAnimationFrame(() => { if (el) { el.focus(); el.selectionStart = el.selectionEnd = at + token.length } })
  }
  const toggle = (list: string[] = [], v: string) => list.includes(v) ? list.filter(x => x !== v) : [...list, v]
  const COOL = [0, 1, 12, 24, 72, 168]
  const DUE = [{ v: -1, l: 'No due date' }, { v: 0, l: 'Today' }, { v: 1, l: 'Tomorrow' }, { v: 2, l: 'In 2 days' }, { v: 7, l: 'In a week' }]
  const wait = Number(c.minutes) || 15
  const unit = wait % 1440 === 0 ? 1440 : wait % 60 === 0 ? 60 : 1

  return (
    <div className="ab-panel">
      <div className="ab-ph">
        <div className="ab-phi">
          <span className="ab-tile" style={{ '--c': def.color } as React.CSSProperties}><Ic name={kindIcon(node.kind)} size={18} /></span>
          <div><h3>{def.label}</h3><p>{def.hint}</p></div>
        </div>
        <button className="ab-ib sm" onClick={onClose} aria-label="Close"><Ic name="x" size={14} /></button>
      </div>
      {bad && <div className="ab-warn"><Ic name="warn" size={14} /> {bad}</div>}

      <div className="ab-form">
        {node.kind === 'trigger' && <>
          <div className="ab-f"><span>Start when</span>
            <div className="ab-seg">
              <button className={c.type !== 'missed_call' ? 'on' : ''} onClick={() => onConfig({ type: 'message' })}><Ic name="chat" size={14} /> A customer sends a message</button>
              <button className={c.type === 'missed_call' ? 'on' : ''} onClick={() => onConfig({ type: 'missed_call' })}><Ic name="phone" size={14} /> A call is missed</button>
            </div>
          </div>
          {c.type !== 'missed_call' && <>
            <div className="ab-f"><span>On these channels <small>({c.channels?.length ? 'only these' : 'all of them'})</small></span>
              <div className="ab-chips">{CHANNELS.map(ch => <button key={ch.id} className={c.channels?.includes(ch.id) ? 'on' : ''} onClick={() => onConfig({ channels: toggle(c.channels, ch.id) })}>{ch.label}</button>)}</div>
            </div>
            <Check on={!!c.firstOnly} set={v => onConfig({ firstOnly: v })} label="Only the first message of a conversation" />
          </>}
          <label className="ab-f"><span>{c.type === 'missed_call' ? 'For the same caller, run again after' : 'For the same conversation, run again after'}</span>
            <select value={Number(c.cooldownHours ?? 12)} onChange={e => onConfig({ cooldownHours: Number(e.target.value) })}>
              {COOL.map(h => <option key={h} value={h}>{h === 0 ? (c.type === 'missed_call' ? 'Every missed call' : 'Every message (no wait)') : hoursLabel(h)}</option>)}
            </select>
          </label>
          {c.type === 'missed_call' && <p className="ab-hint">Your missed-call text (Time savers) still goes as usual. This runs as well.</p>}
        </>}

        {node.kind === 'if_keyword' && <>
          <Words label="Words or phrases" words={c.words || []} onChange={words => onConfig({ words })} placeholder="refund, money back" />
          <p className="ab-hint">Yes when the message has any of these as whole words. Plurals count; capitals and accents don’t matter.</p>
        </>}
        {node.kind === 'if_channel' && (
          <div className="ab-f"><span>Yes when it came in on</span>
            <div className="ab-chips">{CHANNELS.map(ch => <button key={ch.id} className={c.channels?.includes(ch.id) ? 'on' : ''} onClick={() => onConfig({ channels: toggle(c.channels, ch.id) })}>{ch.label}</button>)}</div>
          </div>
        )}
        {node.kind === 'if_hours' && <>
          <div className="ab-f"><span>Yes when you’re</span>
            <div className="ab-seg">
              <button className={c.when !== 'open' ? 'on' : ''} onClick={() => onConfig({ when: 'closed' })}>Closed</button>
              <button className={c.when === 'open' ? 'on' : ''} onClick={() => onConfig({ when: 'open' })}>Open</button>
            </div>
          </div>
          <p className="ab-hint">Uses your opening hours in Business settings. If they aren’t set, Colvy counts you as closed.</p>
        </>}
        {(node.kind === 'if_tag' || node.kind === 'tag') && <>
          <label className="ab-f"><span>Tag</span><input list="ab-tags" value={c.tag || ''} maxLength={40} onChange={e => onConfig({ tag: e.target.value })} placeholder="VIP" /></label>
          <datalist id="ab-tags">{tags.map(t => <option key={t} value={t} />)}</datalist>
          {tags.length > 0 && <div className="ab-chips sm">{tags.slice(0, 8).map(t => <button key={t} className={c.tag === t ? 'on' : ''} onClick={() => onConfig({ tag: t })}>{t}</button>)}</div>}
        </>}
        {(node.kind === 'if_new' || node.kind === 'if_unanswered' || node.kind === 'ai' || node.kind === 'pause_ai' || node.kind === 'close') && (
          <p className="ab-hint big">{node.kind === 'if_unanswered' ? 'Replies from your team or Colvy AI count. Quick automatic replies (like this automation’s) don’t.' : node.kind === 'if_new' ? 'Yes when this customer has never had another conversation with you.' : node.kind === 'ai' ? 'Use it on one path of a check, so the other path can go to a person.' : node.kind === 'pause_ai' ? 'Someone can switch Colvy AI back on from the conversation.' : 'If the customer writes again, the conversation opens again.'}</p>
        )}

        {node.kind === 'reply' && <>
          <label className="ab-f"><span>Reply</span>
            <textarea ref={replyRef} rows={5} value={c.text || ''} maxLength={LIMITS.replyChars} onChange={e => onConfig({ text: e.target.value })} placeholder="Hi {first_name}, thanks for your message! …" />
          </label>
          <div className="ab-tokens">
            <span>Insert</span>
            <button onClick={() => insert('{first_name}')}>First name</button>
            <button onClick={() => insert('{business_name}')}>Business name</button>
            <small>{String(c.text || '').length}/{LIMITS.replyChars}</small>
          </div>
          {String(c.text || '').trim() && (
            <div className="ab-bubble"><small>The customer sees</small><p>{fill(c.text, { firstName: 'Jordan', name: 'Jordan Lee', business: business || 'your business' })}</p></div>
          )}
          <p className="ab-hint">Sent on the channel they wrote on. Not sent to anyone who opted out of texts. At most one automatic reply per message.</p>
        </>}
        {node.kind === 'note' && (
          <label className="ab-f"><span>Note for the team</span><textarea rows={4} value={c.text || ''} maxLength={1000} onChange={e => onConfig({ text: e.target.value })} placeholder="Check their last order before replying." /></label>
        )}
        {node.kind === 'assign' && (
          <label className="ab-f"><span>Assign to</span>
            <select value={c.userId || ''} onChange={e => { const m = team.find(t => t.id === e.target.value); onConfig({ userId: m?.id || '', name: m?.name || '' }) }}>
              <option value="">Pick someone…</option>
              {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        )}
        {node.kind === 'task' && <>
          <label className="ab-f"><span>Task</span><input value={c.title || ''} maxLength={200} onChange={e => onConfig({ title: e.target.value })} placeholder="Call {first_name} back" /></label>
          <label className="ab-f"><span>For</span>
            <select value={c.assigneeId || ''} onChange={e => { const m = team.find(t => t.id === e.target.value); onConfig({ assigneeId: m?.id || '', assigneeName: m?.name || '' }) }}>
              <option value="">Anyone</option>
              {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="ab-f"><span>Due</span>
            <select value={Number(c.dueDays ?? -1)} onChange={e => onConfig({ dueDays: Number(e.target.value) })}>{DUE.map(d => <option key={d.v} value={d.v}>{d.l}</option>)}</select>
          </label>
          <p className="ab-hint">If a task like it is already open for this customer, it’s added to that one instead.</p>
        </>}
        {node.kind === 'notify' && <>
          <div className="ab-f"><span>Who <small>({c.userIds?.length ? 'just these' : 'everyone'})</small></span>
            <div className="ab-chips">{team.map(m => <button key={m.id} className={c.userIds?.includes(m.id) ? 'on' : ''} onClick={() => onConfig({ userIds: toggle(c.userIds, m.id) })}>{m.name}</button>)}</div>
          </div>
          <label className="ab-f"><span>Message</span><input value={c.text || ''} maxLength={200} onChange={e => onConfig({ text: e.target.value })} placeholder="A customer has been waiting 15 minutes" /></label>
        </>}
        {node.kind === 'wait' && <>
          <div className="ab-f"><span>Wait for</span>
            <div className="ab-row">
              <input type="number" min={1} value={Math.round(wait / unit)} onChange={e => onConfig({ minutes: clamp(Math.round(Number(e.target.value) || 1) * unit, 1, LIMITS.waitMinutes) })} />
              <select value={unit} onChange={e => onConfig({ minutes: clamp(Math.round(wait / unit) * Number(e.target.value), 1, LIMITS.waitMinutes) })}>
                <option value={1}>minutes</option><option value={60}>hours</option><option value={1440}>days</option>
              </select>
            </div>
          </div>
          <div className="ab-chips sm">{[5, 15, 60, 240, 1440].map(m => <button key={m} className={wait === m ? 'on' : ''} onClick={() => onConfig({ minutes: m })}>{waitLabel(m)}</button>)}</div>
          <p className="ab-hint">Up to 7 days. Switching the automation off stops runs that are waiting.</p>
        </>}
        {isCall && (node.kind === 'reply') && <p className="ab-hint">For a missed call, the reply goes by text to the number that called.</p>}
      </div>

      {node.kind !== 'trigger' && <button className="ab-del" onClick={onDelete}><Ic name="trash" size={14} /> Remove this step</button>}
      {node.kind === 'trigger' && graph.nodes.length > 1 && <p className="ab-hint">The trigger always stays. Everything else hangs off it.</p>}
    </div>
  )
}

function Words({ label, words, onChange, placeholder }: { label: string; words: string[]; onChange: (w: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('')
  const add = (raw: string) => {
    const parts = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    if (!parts.length) return
    onChange(Array.from(new Set([...words, ...parts])).slice(0, 20))
    setDraft('')
  }
  return (
    <div className="ab-f"><span>{label}</span>
      <div className="ab-words">
        {words.map(w => <span key={w} className="ab-word">{w}<button onClick={() => onChange(words.filter(x => x !== w))} aria-label={`Remove ${w}`}><Ic name="x" size={10} stroke={2.6} /></button></span>)}
        <input value={draft} maxLength={40} onChange={e => { if (e.target.value.includes(',')) add(e.target.value); else setDraft(e.target.value) }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(draft) } else if (e.key === 'Backspace' && !draft && words.length) onChange(words.slice(0, -1)) }}
          onBlur={() => add(draft)} placeholder={words.length ? 'Add another' : placeholder} />
      </div>
    </div>
  )
}

const CSS = `
.ab-full{position:fixed;inset:0;z-index:80;display:flex;flex-direction:column;background:var(--ab-bg);color:var(--ab-ink);font-family:inherit;-webkit-font-smoothing:antialiased}
.ab-center{align-items:center;justify-content:center}
.ab-empty{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;color:var(--ab-mut);max-width:360px}
.ab-empty p{margin:0;color:var(--ab-ink);font-weight:600}
.ab-top{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--ab-card);border-bottom:1px solid var(--ab-line);min-height:60px;box-sizing:border-box}
.ab-title{flex:1;min-width:0;display:flex;align-items:center;gap:12px}
.ab-title input{min-width:0;flex:0 1 420px;font:inherit;font-family:var(--font-display),inherit;font-size:19px;font-weight:700;letter-spacing:-.02em;color:var(--ab-ink);background:transparent;border:1.5px solid transparent;border-radius:10px;padding:6px 10px;outline:none;transition:border-color .15s,background .15s}
.ab-title input:hover{background:var(--ab-soft)}
.ab-title input:focus{border-color:var(--ab-coral);background:var(--ab-card)}
.ab-save{font-size:12.5px;color:var(--ab-mut);white-space:nowrap}
.ab-save.s-error{color:#dc2626;font-weight:600}
.ab-save.s-saved::before{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:#22a06b;margin-right:6px;vertical-align:1px}
.ab-acts{display:flex;align-items:center;gap:8px}
.ab-ib{width:36px;height:36px;border-radius:50%;border:1.5px solid var(--ab-line);background:var(--ab-card);color:var(--ab-ink);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:background .15s,transform .15s}
.ab-ib:hover:not(:disabled){background:var(--ab-soft)}
.ab-ib:active:not(:disabled){transform:scale(.94)}
.ab-ib:disabled{opacity:.35;cursor:default}
.ab-ib.sm{width:30px;height:30px}
.ab-pill{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 15px;border-radius:999px;border:1.5px solid var(--ab-line);background:var(--ab-card);color:var(--ab-ink);font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s,transform .15s}
.ab-pill:hover{background:var(--ab-soft)}
.ab-pill:active{transform:scale(.97)}
.ab-pill.on{border-color:var(--ab-ink);background:var(--ab-ink);color:var(--ab-card)}
.ab-pill em{font-style:normal;font-size:11.5px;font-weight:700;padding:1px 7px;border-radius:999px;background:var(--ab-soft);color:var(--ab-mut)}
.ab-pill.on em{background:rgba(255,255,255,.18);color:inherit}
.ab-pill.warn{border-color:#fcd34d;background:#fffbeb;color:#92400e}
[data-theme="dark"] .ab-pill.warn{background:rgba(245,158,11,.12);border-color:rgba(245,158,11,.4);color:#fbbf24}
.ab-pwrap{position:relative}
.ab-pop{position:absolute;top:44px;right:0;width:300px;background:var(--ab-card);border:1px solid var(--ab-line);border-radius:16px;box-shadow:var(--ab-shadow);padding:6px;z-index:5;animation:abIn .18s cubic-bezier(.2,.9,.3,1.2)}
.ab-prob{display:flex;gap:10px;align-items:flex-start;width:100%;text-align:left;padding:10px;border:none;background:none;border-radius:10px;font:inherit;font-size:13.5px;color:var(--ab-ink);cursor:pointer;line-height:1.4}
.ab-prob:hover{background:var(--ab-soft)}
.ab-dot{width:9px;height:9px;border-radius:3px;flex-shrink:0;margin-top:5px}
.ab-live{display:inline-flex;align-items:center;gap:9px;height:36px;padding:0 15px 0 8px;border-radius:999px;border:1.5px solid var(--ab-line);background:var(--ab-card);color:var(--ab-ink);font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;transition:all .2s}
.ab-sw{width:34px;height:20px;border-radius:999px;background:#d4d4d8;position:relative;transition:background .2s}
.ab-sw i{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .32s cubic-bezier(.3,1.5,.5,1)}
.ab-live.on{border-color:rgba(34,160,107,.45);background:rgba(34,160,107,.08);color:#15803d;box-shadow:0 0 0 4px rgba(34,160,107,.08)}
[data-theme="dark"] .ab-live.on{color:#4ade80}
.ab-live.on .ab-sw{background:#22a06b}
.ab-live.on .ab-sw i{transform:translateX(14px)}
.ab-banner{display:flex;align-items:center;gap:8px;padding:9px 16px;font-size:13.5px;background:#fffbeb;color:#92400e;border-bottom:1px solid #fde68a}
[data-theme="dark"] .ab-banner{background:rgba(245,158,11,.1);color:#fbbf24;border-color:rgba(245,158,11,.25)}
.ab-body{flex:1;min-height:0;display:flex;position:relative}
.ab-pal{width:236px;flex-shrink:0;border-right:1px solid var(--ab-line);background:var(--ab-card);overflow-y:auto}
.ab-palin{padding:14px 12px 18px}
.ab-palin section+section{margin-top:14px}
.ab-palin h4{margin:0 0 6px 6px;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ab-mut)}
.ab-pi{display:flex;align-items:center;gap:10px;width:100%;padding:8px 8px;border:none;border-radius:12px;background:none;font:inherit;font-size:13.5px;font-weight:550;color:var(--ab-ink);text-align:left;cursor:grab;touch-action:none;user-select:none;transition:background .15s,transform .15s}
.ab-pi:hover:not(:disabled){background:var(--ab-soft)}
.ab-pi:active:not(:disabled){transform:scale(.97);cursor:grabbing}
.ab-pi:disabled{opacity:.4;cursor:not-allowed}
.ab-mi{width:26px;height:26px;border-radius:8px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;color:#fff;background:var(--c)}
.ab-palhint{margin:16px 6px 0;font-size:12px;line-height:1.5;color:var(--ab-mut)}
.ab-canvas{flex:1;min-width:0;position:relative;overflow:hidden;overflow:clip;touch-action:none;cursor:grab;background-color:var(--ab-bg);background-image:radial-gradient(circle,var(--ab-dot) 1.2px,transparent 1.3px)}
.ab-canvas:active{cursor:grabbing}
.ab-canvas.connecting{cursor:crosshair}
.ab-world{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}
.ab-world.glide{transition:transform .38s cubic-bezier(.2,.8,.2,1)}
.ab-edges{position:absolute;left:-5000px;top:-5000px;width:10000px;height:10000px;overflow:visible;pointer-events:none}
.ab-edge{pointer-events:visibleStroke;cursor:pointer}
.ab-edge .hit{fill:none;stroke:transparent;stroke-width:18}
.ab-edge .ln{fill:none;stroke:color-mix(in srgb,var(--ab-ink) 30%,transparent);stroke-width:2.2;transition:stroke .2s,stroke-width .2s}
.ab-edge.p-yes .ln{stroke:#22a06b}
.ab-edge.p-no .ln{stroke:#a1a1aa}
.ab-edge:hover .ln{stroke-width:3.2}
.ab-edge.sel .ln{stroke:var(--ab-coral);stroke-width:3.2}
.ab-edge.lit .ln{stroke:var(--ab-coral);stroke-width:3.4;stroke-dasharray:9 7;animation:abFlow .55s linear infinite}
.ab-temp{fill:none;stroke:var(--ab-coral);stroke-width:2.6;stroke-dasharray:7 6;animation:abFlow .5s linear infinite}
.ab-temp.p-yes{stroke:#22a06b}
.ab-edgex{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:none;background:var(--ab-coral);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 12px -2px rgba(255,106,77,.6);animation:abPop .28s cubic-bezier(.3,1.6,.5,1)}
.ab-node{position:absolute;width:${W}px;height:${H}px;box-sizing:border-box;display:flex;align-items:center;gap:12px;padding:0 18px 0 16px;border-radius:18px;background:var(--ab-card);border:1.5px solid var(--ab-line);box-shadow:var(--ab-shadow);cursor:pointer;user-select:none;touch-action:none;outline:none;animation:abPop .34s cubic-bezier(.3,1.5,.5,1);transition:box-shadow .2s,border-color .2s,opacity .3s}
.ab-node::before{content:'';position:absolute;inset:-1.5px;border-radius:19px;border:2px solid transparent;pointer-events:none;transition:border-color .2s,box-shadow .25s}
.ab-node:hover{border-color:color-mix(in srgb,var(--c) 35%,var(--ab-line))}
.ab-node:focus-visible::before,.ab-node.sel::before{border-color:var(--c);box-shadow:0 0 0 5px color-mix(in srgb,var(--c) 16%,transparent)}
.ab-node.lift{box-shadow:0 18px 40px -14px rgba(16,24,40,.35);z-index:3;cursor:grabbing}
.ab-node.lift .ab-ic{transform:rotate(-6deg) scale(1.06)}
.ab-node.bad{border-color:#fca5a5}
.ab-node.lit::before{border-color:var(--ab-coral);box-shadow:0 0 0 6px color-mix(in srgb,var(--ab-coral) 20%,transparent);animation:abRing .5s ease-out}
.ab-node.dim{opacity:.42}
.ab-node.g-trigger{background:linear-gradient(180deg,color-mix(in srgb,var(--c) 7%,var(--ab-card)),var(--ab-card))}
.ab-ic{width:40px;height:40px;border-radius:12px;background:var(--c);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.25),0 4px 10px -4px var(--c);transition:transform .3s cubic-bezier(.3,1.5,.5,1)}
.ab-txt{min-width:0;display:flex;flex-direction:column;gap:2px;padding-right:6px}
.ab-node.g-check .ab-txt{padding-right:26px}
.ab-txt small{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--c)}
.ab-txt b{font-size:13.5px;font-weight:650;line-height:1.25;color:var(--ab-ink);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.ab-txt em{font-style:normal;font-size:11.5px;color:var(--ab-mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ab-badge{position:absolute;top:-8px;right:-8px;width:20px;height:20px;border-radius:50%;background:#ef4444;color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 3px var(--ab-bg)}
.ab-in{position:absolute;left:-7px;top:${H / 2 - 6}px;width:12px;height:12px;border-radius:50%;background:var(--ab-card);border:2.5px solid color-mix(in srgb,var(--ab-ink) 30%,transparent);box-sizing:border-box}
.ab-out{position:absolute;right:-11px;width:22px;height:22px;margin-top:-11px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:crosshair;touch-action:none;z-index:2}
.ab-out::after{content:'';width:12px;height:12px;border-radius:50%;background:var(--ab-card);border:2.5px solid color-mix(in srgb,var(--ab-ink) 35%,transparent);box-sizing:border-box;transition:transform .2s cubic-bezier(.3,1.6,.5,1),background .2s}
.ab-out.p-yes::after{border-color:#22a06b}
.ab-out.p-no::after{border-color:#a1a1aa}
.ab-out.on::after{background:currentColor}
.ab-out.p-out{color:color-mix(in srgb,var(--ab-ink) 35%,transparent)}
.ab-out.p-yes{color:#22a06b}
.ab-out.p-no{color:#a1a1aa}
.ab-out:hover::after{transform:scale(1.45)}
.ab-out.hint::before{content:'';position:absolute;inset:-4px;border-radius:50%;border:2px solid var(--ab-coral);animation:abPulse 1.6s ease-out infinite}
.ab-out i{position:absolute;right:20px;font-style:normal;font-size:10.5px;font-weight:700;color:currentColor;pointer-events:none}
.ab-coach{position:absolute;left:50%;bottom:76px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:2px;padding:12px 18px;border-radius:16px;background:var(--ab-card);border:1px solid var(--ab-line);box-shadow:var(--ab-shadow);text-align:center;font-size:13px;color:var(--ab-mut);max-width:min(420px,calc(100% - 32px));animation:abIn .4s cubic-bezier(.2,.9,.3,1.2) .3s both}
.ab-coach b{color:var(--ab-ink);font-size:14px}
.ab-quick{position:absolute;width:240px;max-height:300px;display:flex;flex-direction:column;background:var(--ab-card);border:1px solid var(--ab-line);border-radius:16px;box-shadow:var(--ab-shadow);z-index:6;animation:abIn .18s cubic-bezier(.2,.9,.3,1.2);overflow:hidden}
.ab-quick-h{display:flex;align-items:center;justify-content:space-between;padding:8px 8px 6px 14px;font-size:12.5px;font-weight:700;color:var(--ab-mut)}
.ab-quick-l{overflow-y:auto;padding:0 6px 6px}
.ab-quick-l button{display:flex;align-items:center;gap:9px;width:100%;padding:7px 8px;border:none;background:none;border-radius:10px;font:inherit;font-size:13px;color:var(--ab-ink);cursor:pointer;text-align:left}
.ab-quick-l button:hover{background:var(--ab-soft)}
.ab-quick-l .ab-mi{width:22px;height:22px;border-radius:7px}
.ab-zoom{position:absolute;left:14px;bottom:14px;display:flex;align-items:center;gap:2px;padding:4px;background:var(--ab-card);border:1px solid var(--ab-line);border-radius:999px;box-shadow:var(--ab-shadow)}
.ab-zoom button{width:30px;height:30px;border-radius:50%;border:none;background:none;color:var(--ab-ink);display:flex;align-items:center;justify-content:center;cursor:pointer}
.ab-zoom button:hover:not(:disabled){background:var(--ab-soft)}
.ab-zoom button:disabled{opacity:.35}
.ab-zoom span{min-width:42px;text-align:center;font-size:12px;font-weight:600;color:var(--ab-mut);font-variant-numeric:tabular-nums}
.ab-fab{position:absolute;right:14px;bottom:14px;display:inline-flex;align-items:center;gap:8px;height:46px;padding:0 20px;border-radius:999px;border:none;background:var(--ab-coral);color:#fff;font:inherit;font-size:15px;font-weight:700;box-shadow:0 10px 24px -8px rgba(255,106,77,.7);cursor:pointer}
.ab-side{width:340px;flex-shrink:0;border-left:1px solid var(--ab-line);background:var(--ab-card);overflow-y:auto;animation:abSlide .26s cubic-bezier(.2,.9,.3,1)}
.ab-side.sheet{position:absolute;left:0;right:0;bottom:0;width:auto;max-height:72%;border-left:none;border-top:1px solid var(--ab-line);border-radius:22px 22px 0 0;box-shadow:0 -12px 40px -12px rgba(16,24,40,.3);z-index:10;animation:abUp .3s cubic-bezier(.2,.9,.3,1)}
.ab-scrim{position:absolute;inset:0;background:rgba(15,15,20,.28);z-index:9;animation:abFade .2s}
.ab-panel{padding:16px 16px 22px;display:flex;flex-direction:column;gap:14px}
.ab-ph{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.ab-phi{display:flex;gap:12px;align-items:flex-start;min-width:0}
.ab-ph h3{margin:0;font-family:var(--font-display),inherit;font-size:17px;font-weight:700;letter-spacing:-.02em;color:var(--ab-ink)}
.ab-ph p{margin:3px 0 0;font-size:13px;line-height:1.45;color:var(--ab-mut)}
.ab-tile{width:38px;height:38px;border-radius:11px;background:var(--c);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.ab-warn{display:flex;gap:8px;align-items:center;padding:9px 12px;border-radius:12px;background:#fef2f2;color:#b91c1c;font-size:13px;font-weight:550}
[data-theme="dark"] .ab-warn{background:rgba(239,68,68,.12);color:#fca5a5}
.ab-form{display:flex;flex-direction:column;gap:12px}
.ab-f{display:flex;flex-direction:column;gap:7px;font-size:13px;font-weight:650;color:var(--ab-ink)}
.ab-f small{font-weight:500;color:var(--ab-mut)}
.ab-f input,.ab-f select,.ab-f textarea,.ab-row input,.ab-row select{font:inherit;font-size:14px;font-weight:450;color:var(--ab-ink);background:var(--ab-field);border:1.5px solid transparent;border-radius:12px;padding:10px 12px;outline:none;width:100%;box-sizing:border-box;transition:border-color .15s,background .15s}
.ab-f textarea{resize:vertical;line-height:1.45}
.ab-f input:focus,.ab-f select:focus,.ab-f textarea:focus,.ab-row input:focus,.ab-row select:focus{border-color:var(--ab-coral);background:var(--ab-card)}
.ab-row{display:flex;gap:8px}
.ab-row input{width:90px;flex-shrink:0}
.ab-hint{margin:0;font-size:12.5px;line-height:1.5;color:var(--ab-mut)}
.ab-hint.big{font-size:13.5px}
.ab-seg{display:flex;flex-direction:column;gap:6px}
.ab-seg button,.ab-chips button,.ab-tokens button{font:inherit;cursor:pointer;transition:all .16s}
.ab-seg button{display:flex;align-items:center;gap:9px;padding:10px 12px;border-radius:12px;border:1.5px solid var(--ab-line);background:var(--ab-card);color:var(--ab-ink);font-size:13.5px;font-weight:600;text-align:left}
.ab-seg button.on{border-color:var(--ab-coral);background:color-mix(in srgb,var(--ab-coral) 9%,var(--ab-card))}
.ab-chips{display:flex;flex-wrap:wrap;gap:6px}
.ab-chips button{padding:7px 12px;border-radius:999px;border:1.5px solid var(--ab-line);background:var(--ab-card);color:var(--ab-ink);font-size:13px;font-weight:550}
.ab-chips button.on{border-color:var(--ab-ink);background:var(--ab-ink);color:var(--ab-card)}
.ab-chips.sm button{padding:5px 10px;font-size:12.5px}
.ab-check{display:flex;align-items:center;gap:10px;padding:2px 0;border:none;background:none;font:inherit;font-size:13.5px;font-weight:550;color:var(--ab-ink);cursor:pointer;text-align:left}
.ab-box{width:20px;height:20px;border-radius:6px;border:1.8px solid #c4c4cc;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .18s;color:#fff}
.ab-check.on .ab-box{background:var(--ab-coral);border-color:var(--ab-coral);animation:abPop .3s cubic-bezier(.3,1.6,.5,1)}
.ab-tokens{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;color:var(--ab-mut);margin-top:-4px}
.ab-tokens button{padding:4px 10px;border-radius:999px;border:1.5px solid var(--ab-line);background:var(--ab-card);color:var(--ab-ink);font-size:12px;font-weight:600}
.ab-tokens button:hover{border-color:var(--ab-coral)}
.ab-tokens small{margin-left:auto;font-variant-numeric:tabular-nums}
.ab-bubble{padding:10px 12px;border-radius:14px;background:var(--ab-soft)}
.ab-bubble small{display:block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--ab-mut);margin-bottom:6px}
.ab-bubble p{margin:0;padding:9px 12px;border-radius:16px 16px 16px 5px;background:var(--ab-card);border:1px solid var(--ab-line);font-size:13.5px;line-height:1.45;white-space:pre-wrap;word-break:break-word;color:var(--ab-ink);display:inline-block;max-width:100%;box-sizing:border-box}
.ab-words{display:flex;flex-wrap:wrap;gap:6px;padding:7px;border-radius:12px;background:var(--ab-field);border:1.5px solid transparent}
.ab-words:focus-within{border-color:var(--ab-coral);background:var(--ab-card)}
.ab-words input{flex:1;min-width:110px;border:none !important;background:none !important;padding:5px !important;font-size:14px}
.ab-word{display:inline-flex;align-items:center;gap:4px;padding:4px 6px 4px 10px;border-radius:999px;background:var(--ab-card);border:1px solid var(--ab-line);font-size:13px;font-weight:600;animation:abPop .26s cubic-bezier(.3,1.6,.5,1)}
.ab-word button{width:18px;height:18px;border-radius:50%;border:none;background:var(--ab-soft);color:var(--ab-mut);display:flex;align-items:center;justify-content:center;cursor:pointer}
.ab-del{align-self:flex-start;display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border-radius:999px;border:1.5px solid #fecaca;background:var(--ab-card);color:#dc2626;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.ab-del:hover{background:#fef2f2}
[data-theme="dark"] .ab-del{border-color:rgba(239,68,68,.35)}
[data-theme="dark"] .ab-del:hover{background:rgba(239,68,68,.1)}
.ab-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 18px;border-radius:999px;border:none;background:var(--ab-coral);color:#fff;font:inherit;font-size:14px;font-weight:650;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 1px 2px rgba(16,24,40,.12);transition:transform .15s,filter .15s}
.ab-btn:hover{filter:brightness(.97)}
.ab-btn:active{transform:scale(.97)}
.ab-btn:disabled{opacity:.5}
.ab-btn.ghost{background:var(--ab-card);color:var(--ab-ink);border:1.5px solid var(--ab-line);box-shadow:none;align-self:flex-start;height:36px}
.ab-trace{list-style:none;margin:0;padding:12px;border-radius:16px;background:var(--ab-soft);display:flex;flex-direction:column;gap:2px}
.ab-trace li{display:flex;gap:10px;align-items:flex-start;padding:6px 4px;font-size:13px;line-height:1.4;animation:abIn .3s cubic-bezier(.2,.9,.3,1.2)}
.ab-trace li .ab-mi{width:22px;height:22px;border-radius:7px}
.ab-trace li b{font-weight:600}
.ab-trace li em{font-style:normal;margin-left:8px;font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:999px}
.ab-trace .r-yes{background:rgba(34,160,107,.14);color:#15803d}
.ab-trace .r-no{background:rgba(161,161,170,.18);color:var(--ab-mut)}
[data-theme="dark"] .ab-trace .r-yes{color:#4ade80}
.ab-trace li small{display:block;color:var(--ab-mut);font-size:12px}
.ab-trace li.end{color:var(--ab-mut);font-weight:600;padding-left:36px}
.ab-none{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;padding:26px 12px;border-radius:16px;background:var(--ab-soft);color:var(--ab-mut);font-size:13.5px;line-height:1.5}
.ab-none p{margin:0}
.ab-runs{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.ab-run{border:1px solid var(--ab-line);border-radius:14px;overflow:hidden}
.ab-runh{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border:none;background:var(--ab-card);font:inherit;color:var(--ab-ink);cursor:pointer;text-align:left}
.ab-runh b{flex:1;min-width:0;font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ab-runh small{font-size:12px;color:var(--ab-mut);white-space:nowrap}
.ab-st{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;background:var(--ab-soft);color:var(--ab-mut);white-space:nowrap}
.ab-run.s-done .ab-st{background:rgba(34,160,107,.13);color:#15803d}
.ab-run.s-waiting .ab-st{background:rgba(168,85,247,.13);color:#7e22ce}
.ab-run.s-failed .ab-st{background:rgba(239,68,68,.12);color:#b91c1c}
[data-theme="dark"] .ab-run.s-done .ab-st{color:#4ade80}
[data-theme="dark"] .ab-run.s-waiting .ab-st{color:#d8b4fe}
[data-theme="dark"] .ab-run.s-failed .ab-st{color:#fca5a5}
.ab-rund{padding:4px 12px 12px;background:var(--ab-card);animation:abIn .2s}
.ab-rund ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.ab-rund li{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;line-height:1.4;color:var(--ab-ink)}
.ab-rund li.bad{color:#b91c1c}
[data-theme="dark"] .ab-rund li.bad{color:#fca5a5}
.ab-rund .ab-mi{width:18px;height:18px;border-radius:6px}
.ab-note{margin:0 0 8px;font-size:12.5px;color:#7e22ce}
.ab-link{display:inline-flex;align-items:center;gap:6px;margin-top:10px;font-size:12.5px;font-weight:650;color:var(--ab-coral);text-decoration:none}
.ab-ghost{position:fixed;z-index:100;transform:translate(-50%,-50%) rotate(-2deg);display:flex;align-items:center;gap:9px;padding:9px 14px 9px 9px;border-radius:14px;background:var(--ab-card);border:1.5px solid var(--c);box-shadow:0 16px 36px -12px rgba(16,24,40,.4);font-size:13.5px;font-weight:650;color:var(--ab-ink);pointer-events:none;white-space:nowrap}
.ab-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:101;max-width:min(520px,calc(100% - 32px));padding:11px 18px;border-radius:14px;background:#18181b;color:#fff;font-size:13.5px;font-weight:550;line-height:1.4;box-shadow:0 12px 30px -10px rgba(0,0,0,.45);animation:abToast .34s cubic-bezier(.3,1.4,.5,1)}
.ab-toast.t-bad{background:#b91c1c}
.ab-toast.t-good{background:#15803d}
.narrow .ab-top{padding:8px 10px;gap:6px;flex-wrap:wrap}
.narrow .ab-title{order:0;flex:1 1 calc(100% - 50px)}
.narrow .ab-title input{font-size:17px;flex:1}
.narrow .ab-save{display:none}
.narrow .ab-acts{order:1;width:100%;justify-content:flex-end;flex-wrap:wrap}
.narrow .ab-pill{height:34px;padding:0 12px;font-size:13px}
.narrow .ab-live{height:34px}
.narrow .ab-pop{right:auto;left:0;width:min(300px,calc(100vw - 24px))}
.narrow .ab-zoom{bottom:14px}
.narrow .ab-side.sheet .ab-palin{padding-top:0}
@keyframes abFlow{to{stroke-dashoffset:-16}}
@keyframes abPop{from{opacity:0;transform:scale(.86)}}
@keyframes abIn{from{opacity:0;transform:translateY(6px) scale(.97)}}
@keyframes abSlide{from{opacity:0;transform:translateX(16px)}}
@keyframes abUp{from{transform:translateY(100%)}}
@keyframes abFade{from{opacity:0}}
@keyframes abRing{from{box-shadow:0 0 0 0 color-mix(in srgb,var(--ab-coral) 50%,transparent)}}
@keyframes abPulse{from{transform:scale(.8);opacity:1}to{transform:scale(1.9);opacity:0}}
@keyframes abToast{from{opacity:0;transform:translate(-50%,14px) scale(.96)}}
@media (prefers-reduced-motion: reduce){.ab-full *{animation:none !important;transition:none !important}}
`
