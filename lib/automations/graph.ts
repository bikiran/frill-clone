// Colvy Automations: the flow a business draws on the canvas, as data. Pure
// (no database), shared by the builder, the API, the engine and
// scripts/automations.test.mjs. docs/plans/automations.md has the plan.
//
// A flow is one trigger and the steps after it. Each step has ports: most
// have one way out ("out"); a check has two ("yes" and "no"). Every port leads
// to at most one next step, and there are no loops, so a run is always a
// single path from the trigger to a step with nothing after it.

export type TriggerType = 'message' | 'missed_call'
export type Port = 'out' | 'yes' | 'no'
export type NodeKind =
  | 'trigger'
  | 'if_keyword' | 'if_channel' | 'if_hours' | 'if_tag' | 'if_new' | 'if_unanswered'
  | 'reply' | 'assign' | 'tag' | 'task' | 'note' | 'notify' | 'ai' | 'pause_ai' | 'close'
  | 'wait'
export type GNode = { id: string; kind: NodeKind; x: number; y: number; config: Record<string, any> }
export type GEdge = { id: string; from: string; port: Port; to: string }
export type Graph = { nodes: GNode[]; edges: GEdge[] }

export type Group = 'trigger' | 'check' | 'action' | 'timing'
export type KindDef = { group: Group; label: string; short: string; hint: string; ports: Port[]; color: string; icon: string }

export const KINDS: Record<NodeKind, KindDef> = {
  trigger: { group: 'trigger', label: 'When', short: 'Trigger', hint: 'What starts this automation.', ports: ['out'], color: '#ff6a4d', icon: 'bolt' },
  if_keyword: { group: 'check', label: 'Message mentions…', short: 'Mentions', hint: 'Yes when the customer’s message contains any of these words.', ports: ['yes', 'no'], color: '#e11d74', icon: 'search' },
  if_channel: { group: 'check', label: 'Came in on…', short: 'Channel', hint: 'Yes when it came in on one of these channels.', ports: ['yes', 'no'], color: '#e11d74', icon: 'radio' },
  if_hours: { group: 'check', label: 'Open or closed', short: 'Hours', hint: 'Checks your opening hours (Business settings) right now.', ports: ['yes', 'no'], color: '#e11d74', icon: 'clock' },
  if_tag: { group: 'check', label: 'Customer has tag', short: 'Tag', hint: 'Yes when the customer has this tag.', ports: ['yes', 'no'], color: '#e11d74', icon: 'tag' },
  if_new: { group: 'check', label: 'New customer', short: 'New', hint: 'Yes when this is the customer’s first conversation with you.', ports: ['yes', 'no'], color: '#e11d74', icon: 'sparkle' },
  if_unanswered: { group: 'check', label: 'Still waiting for a reply', short: 'Waiting', hint: 'Yes when nobody on the team has replied since the customer wrote. Best after a Wait.', ports: ['yes', 'no'], color: '#e11d74', icon: 'hourglass' },
  reply: { group: 'action', label: 'Send a reply', short: 'Reply', hint: 'Replies on the channel the customer used. Colvy AI won’t answer the same message again.', ports: ['out'], color: '#ff6a4d', icon: 'reply' },
  assign: { group: 'action', label: 'Assign to', short: 'Assign', hint: 'Gives the conversation to a teammate and lets them know.', ports: ['out'], color: '#2b6bff', icon: 'user' },
  tag: { group: 'action', label: 'Tag the customer', short: 'Tag', hint: 'Adds a tag to the customer’s profile.', ports: ['out'], color: '#7c5cff', icon: 'tag' },
  task: { group: 'action', label: 'Create a task', short: 'Task', hint: 'A task on this conversation. If one like it is already open, it’s added to that instead.', ports: ['out'], color: '#d97706', icon: 'check' },
  note: { group: 'action', label: 'Add a note', short: 'Note', hint: 'An internal note on the conversation. The customer never sees it.', ports: ['out'], color: '#64748b', icon: 'note' },
  notify: { group: 'action', label: 'Notify the team', short: 'Notify', hint: 'A bell notification for the people you pick (everyone if you pick nobody).', ports: ['out'], color: '#0ea5e9', icon: 'bell' },
  ai: { group: 'action', label: 'Hand to Colvy AI', short: 'Colvy AI', hint: 'Colvy AI answers the customer (when it’s switched on for this channel), even if this automation already sent a quick reply. After a Wait, it answers their latest message then.', ports: ['out'], color: '#9b5cff', icon: 'sparkle' },
  pause_ai: { group: 'action', label: 'Pause Colvy AI here', short: 'Pause AI', hint: 'Colvy AI stops answering this conversation; your team takes it.', ports: ['out'], color: '#475569', icon: 'pause' },
  close: { group: 'action', label: 'Close the conversation', short: 'Close', hint: 'Marks it closed. It reopens if the customer writes again.', ports: ['out'], color: '#16a34a', icon: 'done' },
  wait: { group: 'timing', label: 'Wait', short: 'Wait', hint: 'Pauses before the next step (checked every minute).', ports: ['out'], color: '#a855f7', icon: 'hourglass' },
}
export const NODE_KINDS = Object.keys(KINDS) as NodeKind[]
export const isCheck = (k: NodeKind) => KINDS[k].group === 'check'

export const CHANNELS: { id: string; label: string }[] = [
  { id: 'chat', label: 'Website chat' }, { id: 'sms', label: 'SMS' }, { id: 'email', label: 'Email' },
  { id: 'facebook', label: 'Messenger' }, { id: 'instagram', label: 'Instagram' }, { id: 'whatsapp', label: 'WhatsApp' },
]
const CHANNEL_IDS = CHANNELS.map(c => c.id)
/** A conversation's channel, in the builder's words ("widget" is website chat). */
export const normChannel = (c: any) => { const s = String(c || '').toLowerCase(); return s === 'widget' || s === 'live_chat' || s === '' ? 'chat' : s === 'messenger' ? 'facebook' : s }

export const LIMITS = { nodes: 40, waitsOnPath: 5, steps: 40, replyChars: 1000, waitMinutes: 7 * 24 * 60 }

// ── Defaults and clean-up ────────────────────────────────────────────────────
export function defaultConfig(kind: NodeKind): Record<string, any> {
  switch (kind) {
    case 'trigger': return { type: 'message', channels: [], firstOnly: false, cooldownHours: 12 }
    case 'if_keyword': return { words: [] }
    case 'if_channel': return { channels: [] }
    case 'if_hours': return { when: 'closed' }
    case 'if_tag': return { tag: '' }
    case 'reply': return { text: '' }
    case 'assign': return { userId: '', name: '' }
    case 'tag': return { tag: '' }
    case 'task': return { title: '', assigneeId: '', assigneeName: '', dueDays: -1 }
    case 'note': return { text: '' }
    case 'notify': return { userIds: [], text: '' }
    case 'wait': return { minutes: 15 }
    default: return {}
  }
}

const str = (v: any, n: number) => (v == null ? '' : String(v)).replace(/\r/g, '').slice(0, n)
const line = (v: any, n: number) => str(v, n).replace(/\s+/g, ' ').trim()
const int = (v: any, lo: number, hi: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ID = /^[a-z0-9_-]{1,40}$/i
const words = (v: any): string[] => {
  const list = Array.isArray(v) ? v : String(v || '').split(',')
  return Array.from(new Set(list.map((w: any) => line(w, 40).toLowerCase()).filter(Boolean))).slice(0, 20)
}

export function cleanConfig(kind: NodeKind, raw: any): Record<string, any> {
  const c = raw && typeof raw === 'object' ? raw : {}
  switch (kind) {
    case 'trigger': return {
      type: c.type === 'missed_call' ? 'missed_call' : 'message',
      channels: (Array.isArray(c.channels) ? c.channels : []).map(normChannel).filter((x: string) => CHANNEL_IDS.includes(x)).filter((x: string, i: number, a: string[]) => a.indexOf(x) === i),
      firstOnly: !!c.firstOnly,
      cooldownHours: int(c.cooldownHours, 0, 168, 12),
    }
    case 'if_keyword': return { words: words(c.words) }
    case 'if_channel': return { channels: (Array.isArray(c.channels) ? c.channels : []).map(normChannel).filter((x: string) => CHANNEL_IDS.includes(x)).filter((x: string, i: number, a: string[]) => a.indexOf(x) === i) }
    case 'if_hours': return { when: c.when === 'open' ? 'open' : 'closed' }
    case 'if_tag': case 'tag': return { tag: line(c.tag, 40) }
    case 'reply': return { text: str(c.text, LIMITS.replyChars).trim() }
    case 'note': return { text: str(c.text, 1000).trim() }
    case 'assign': return { userId: UUID.test(String(c.userId || '')) ? String(c.userId) : '', name: line(c.name, 80) }
    case 'task': return { title: line(c.title, 200), assigneeId: UUID.test(String(c.assigneeId || '')) ? String(c.assigneeId) : '', assigneeName: line(c.assigneeName, 80), dueDays: int(c.dueDays, -1, 30, -1) }
    case 'notify': return { userIds: (Array.isArray(c.userIds) ? c.userIds : []).filter((x: any) => UUID.test(String(x))).slice(0, 20), text: line(c.text, 200) }
    case 'wait': return { minutes: int(c.minutes, 1, LIMITS.waitMinutes, 15) }
    default: return {}
  }
}

/** A saved or posted flow, kept in bounds: known steps only, valid links, one trigger. */
export function cleanGraph(raw: any): Graph {
  const src = raw && typeof raw === 'object' ? raw : {}
  const nodes: GNode[] = []
  const seen = new Set<string>()
  for (const n of Array.isArray(src.nodes) ? src.nodes : []) {
    if (nodes.length >= LIMITS.nodes) break
    const id = String(n?.id || '')
    const kind = String(n?.kind || '') as NodeKind
    if (!ID.test(id) || seen.has(id) || !KINDS[kind]) continue
    if (kind === 'trigger' && nodes.some(x => x.kind === 'trigger')) continue
    seen.add(id)
    nodes.push({ id, kind, x: int(n.x, -5000, 5000, 0), y: int(n.y, -5000, 5000, 0), config: cleanConfig(kind, n.config) })
  }
  const byId = new Map(nodes.map(n => [n.id, n]))
  const edges: GEdge[] = []
  const used = new Set<string>()
  for (const e of Array.isArray(src.edges) ? src.edges : []) {
    const from = byId.get(String(e?.from || '')), to = byId.get(String(e?.to || ''))
    const port = String(e?.port || 'out') as Port
    if (!from || !to || from.id === to.id || to.kind === 'trigger') continue
    if (!KINDS[from.kind].ports.includes(port)) continue
    const key = `${from.id}:${port}`
    if (used.has(key)) continue      // one next step per port
    used.add(key)
    edges.push({ id: ID.test(String(e?.id || '')) ? String(e.id) : `e_${from.id}_${port}`, from: from.id, port, to: to.id })
  }
  // Drop any link that would close a loop (keeps the earlier ones).
  const out: GEdge[] = []
  for (const e of edges) { if (!reaches([...out, e], e.to, e.from)) out.push(e) }
  return { nodes, edges: out }
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

export const triggerOf = (g: Graph) => g.nodes.find(n => n.kind === 'trigger') || null
export const nextOf = (g: Graph, nodeId: string, port: Port) => g.edges.find(e => e.from === nodeId && e.port === port)?.to || null

// ── Checking a flow before it goes live ──────────────────────────────────────
export type Problem = { nodeId?: string; message: string }
export function problems(g: Graph): Problem[] {
  const out: Problem[] = []
  const t = triggerOf(g)
  if (!t) return [{ message: 'Add a trigger: what starts this automation.' }]
  if (!nextOf(g, t.id, 'out')) out.push({ nodeId: t.id, message: 'Connect the trigger to a first step.' })
  const reach = new Set<string>()
  const walk = (id: string, waits: number) => {
    reach.add(id)
    const n = g.nodes.find(x => x.id === id)!
    const w = waits + (n.kind === 'wait' ? 1 : 0)
    if (w > LIMITS.waitsOnPath) out.push({ nodeId: id, message: `At most ${LIMITS.waitsOnPath} waits in a row.` })
    for (const e of g.edges) if (e.from === id) walk(e.to, w)
  }
  walk(t.id, 0)
  for (const n of g.nodes) {
    const c = n.config, need = (ok: any, message: string) => { if (!ok) out.push({ nodeId: n.id, message }) }
    if (!reach.has(n.id)) { out.push({ nodeId: n.id, message: 'Not connected: nothing leads to this step.' }); continue }
    if (t.config.type === 'missed_call' && ['if_keyword', 'if_channel'].includes(n.kind)) out.push({ nodeId: n.id, message: 'A missed call has no message or channel to check.' })
    switch (n.kind) {
      case 'if_keyword': need(c.words?.length, 'Add at least one word to look for.'); break
      case 'if_channel': need(c.channels?.length, 'Pick at least one channel.'); break
      case 'if_tag': case 'tag': need(c.tag, 'Type the tag.'); break
      case 'reply': need(c.text, 'Write the reply.'); break
      case 'note': need(c.text, 'Write the note.'); break
      case 'assign': need(c.userId, 'Pick who to assign it to.'); break
      case 'task': need(c.title, 'Give the task a title.'); break
    }
    if (isCheck(n.kind) && !nextOf(g, n.id, 'yes') && !nextOf(g, n.id, 'no')) out.push({ nodeId: n.id, message: 'Connect “yes” or “no” to a next step.' })
  }
  return out
}

// ── Running the checks ───────────────────────────────────────────────────────
export type Facts = {
  trigger: TriggerType
  text: string
  channel: string           // normChannel
  openNow: boolean | null   // null: hours unknown
  tags: string[]
  isNew: boolean
  unanswered: boolean
}

/** Whole words, any of them, ignoring case and accents ("refund" matches "Refunds?" but not "prefund"). */
export function mentions(text: string, list: string[]): boolean {
  const norm = (s: string) => ` ${s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ')} `
  const body = norm(text)
  return list.some(w => {
    const n = norm(w).trim()
    if (!n) return false
    return body.includes(` ${n} `) || body.includes(` ${n}s `) || body.includes(` ${n}es `)
  })
}

export function check(n: GNode, f: Facts): boolean {
  const c = n.config
  switch (n.kind) {
    case 'if_keyword': return mentions(f.text, c.words || [])
    case 'if_channel': return (c.channels || []).includes(normChannel(f.channel))
    case 'if_hours': return f.openNow === null ? c.when === 'closed' : (c.when === 'open' ? f.openNow : !f.openNow)
    case 'if_tag': return f.tags.some(t => t.toLowerCase() === String(c.tag || '').toLowerCase())
    case 'if_new': return f.isNew
    case 'if_unanswered': return f.unanswered
    default: return false
  }
}

/** Does this trigger fire for this event (before cool-down, which needs the database)? */
export function triggerFires(t: GNode, ev: { type: TriggerType; channel: string; firstMessage: boolean }): string | null {
  const c = t.config
  if (c.type !== ev.type) return 'different trigger'
  if (ev.type === 'message' && c.channels?.length && !c.channels.includes(normChannel(ev.channel))) return 'channel not chosen'
  if (ev.type === 'message' && c.firstOnly && !ev.firstMessage) return 'not the first message'
  return null
}

/** {first_name}, {name}, {business_name}: filled in, with sensible words when unknown. */
export function fill(text: string, v: { firstName?: string | null; name?: string | null; business?: string | null }): string {
  return String(text || '')
    .replace(/\{\s*first_name\s*\}/gi, v.firstName || 'there')
    .replace(/\{\s*name\s*\}/gi, v.name || v.firstName || 'there')
    .replace(/\{\s*business_name\s*\}/gi, v.business || 'us')
}

// ── A dry run: the path a flow takes for some facts, no side effects ────────
export type Step = { nodeId: string; kind: NodeKind; result?: 'yes' | 'no'; does?: string }
export function simulate(g: Graph, f: Facts): Step[] {
  const steps: Step[] = []
  const t = triggerOf(g)
  if (!t) return steps
  let id: string | null = t.id
  const seen = new Set<string>()
  while (id && !seen.has(id) && steps.length < LIMITS.steps) {
    seen.add(id)
    const n = g.nodes.find(x => x.id === id)
    if (!n) break
    if (isCheck(n.kind)) {
      const yes = check(n, f)
      steps.push({ nodeId: n.id, kind: n.kind, result: yes ? 'yes' : 'no' })
      id = nextOf(g, n.id, yes ? 'yes' : 'no')
      continue
    }
    steps.push({ nodeId: n.id, kind: n.kind, does: describe(n) })
    id = nextOf(g, n.id, 'out')
  }
  return steps
}

/** One line for what a step does, for the dry run and the run log. */
export function describe(n: GNode): string {
  const c = n.config
  switch (n.kind) {
    case 'trigger': return c.type === 'missed_call' ? 'A call is missed' : `A customer sends a message${c.channels?.length ? ` (${c.channels.map((x: string) => CHANNELS.find(y => y.id === x)?.label || x).join(', ')})` : ''}`
    case 'reply': return `Reply: “${String(c.text || '').slice(0, 80)}${String(c.text || '').length > 80 ? '…' : ''}”`
    case 'assign': return `Assign to ${c.name || 'a teammate'}`
    case 'tag': return `Tag the customer “${c.tag}”`
    case 'task': return `Task: ${c.title}${c.assigneeName ? ` (${c.assigneeName})` : ''}`
    case 'note': return 'Add an internal note'
    case 'notify': return c.userIds?.length ? `Notify ${c.userIds.length} ${c.userIds.length === 1 ? 'person' : 'people'}` : 'Notify the team'
    case 'ai': return 'Hand to Colvy AI'
    case 'pause_ai': return 'Pause Colvy AI here'
    case 'close': return 'Close the conversation'
    case 'wait': return `Wait ${waitLabel(c.minutes)}`
    default: return KINDS[n.kind].label
  }
}
export function waitLabel(min: number) {
  const m = Math.max(1, Math.round(min || 0))
  if (m % 1440 === 0) return `${m / 1440} ${m === 1440 ? 'day' : 'days'}`
  if (m % 60 === 0) return `${m / 60} ${m === 60 ? 'hour' : 'hours'}`
  return `${m} min`
}

// ── Starting points ──────────────────────────────────────────────────────────
type Tpl = { id: string; name: string; about: string; graph: Graph }
const n = (id: string, kind: NodeKind, x: number, y: number, config: Record<string, any> = {}): GNode => ({ id, kind, x, y, config: cleanConfig(kind, { ...defaultConfig(kind), ...config }) })
const e = (from: string, port: Port, to: string): GEdge => ({ id: `e_${from}_${port}`, from, port, to })
export const TEMPLATES: Tpl[] = [
  {
    id: 'blank', name: 'Start from scratch', about: 'Just a trigger. Add the steps you want.',
    graph: { nodes: [n('t', 'trigger', 60, 160)], edges: [] },
  },
  {
    id: 'after_hours', name: 'After-hours reply', about: 'When you’re closed, let customers know when you’ll be back.',
    graph: {
      nodes: [n('t', 'trigger', 60, 160), n('h', 'if_hours', 360, 150, { when: 'closed' }), n('r', 'reply', 680, 60, { text: 'Hi {first_name}, thanks for your message! We’re closed right now and will reply first thing when we open.' })],
      edges: [e('t', 'out', 'h'), e('h', 'yes', 'r')],
    },
  },
  {
    id: 'refunds', name: 'Refunds to a person, the rest to Colvy AI', about: 'Messages about refunds go straight to someone on the team. Everything else, Colvy AI answers.',
    graph: {
      nodes: [n('t', 'trigger', 60, 160, { cooldownHours: 0 }), n('k', 'if_keyword', 360, 150, { words: ['refund', 'money back', 'return'] }), n('p', 'pause_ai', 680, 40), n('a', 'assign', 960, 40), n('k2', 'task', 1240, 40, { title: 'Check the refund request', dueDays: 0 }), n('ai', 'ai', 680, 280)],
      edges: [e('t', 'out', 'k'), e('k', 'yes', 'p'), e('p', 'out', 'a'), e('a', 'out', 'k2'), e('k', 'no', 'ai')],
    },
  },
  {
    id: 'no_reply', name: 'Nobody replied in 15 minutes', about: 'If a customer is still waiting after 15 minutes, nudge the team.',
    graph: {
      nodes: [n('t', 'trigger', 60, 160, { cooldownHours: 1 }), n('w', 'wait', 360, 160, { minutes: 15 }), n('u', 'if_unanswered', 640, 150), n('nt', 'notify', 960, 80, { text: 'A customer has been waiting 15 minutes' })],
      edges: [e('t', 'out', 'w'), e('w', 'out', 'u'), e('u', 'yes', 'nt')],
    },
  },
  {
    id: 'new_customer', name: 'Welcome new customers', about: 'Tag first-time customers and give them a warm hello.',
    graph: {
      nodes: [n('t', 'trigger', 60, 160, { firstOnly: true }), n('nw', 'if_new', 360, 150), n('tg', 'tag', 680, 60, { tag: 'New customer' }), n('r', 'reply', 960, 60, { text: 'Welcome, {first_name}! Thanks for reaching out to {business_name}. Someone will be with you shortly.' })],
      edges: [e('t', 'out', 'nw'), e('nw', 'yes', 'tg'), e('tg', 'out', 'r')],
    },
  },
  {
    id: 'missed_call', name: 'Missed call follow-up', about: 'After a missed call, make sure someone calls back.',
    graph: {
      nodes: [n('t', 'trigger', 60, 160, { type: 'missed_call' }), n('k', 'task', 360, 150, { title: 'Call back the missed caller', dueDays: 0 }), n('nt', 'notify', 680, 150, { text: 'Missed call: someone needs a call back' })],
      edges: [e('t', 'out', 'k'), e('k', 'out', 'nt')],
    },
  },
]
export const templateGraph = (id: string): Graph => cleanGraph(JSON.parse(JSON.stringify((TEMPLATES.find(t => t.id === id) || TEMPLATES[0]).graph)))
