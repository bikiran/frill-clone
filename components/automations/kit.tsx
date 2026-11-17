'use client'

// Pieces shared by the automations list (Settings → Automations) and the
// builder (/admin/automations/[id]): step icons, one-line summaries of a step,
// a small drawing of a flow for template cards, and the colour tokens (light
// and dark) both use.

import { KINDS, CHANNELS, describe, type Graph, type GNode, type NodeKind } from '@/lib/automations/graph'

const P: Record<string, string[]> = {
  bolt: ['M13 2.5 4.5 13.5H12L11 21.5l8.5-11H12z'],
  search: ['M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z', 'm20 20-4.6-4.6'],
  radio: ['M4.9 19.1a10 10 0 0 1 0-14.2', 'M7.8 16.2a6 6 0 0 1 0-8.4', 'M16.2 7.8a6 6 0 0 1 0 8.4', 'M19.1 4.9a10 10 0 0 1 0 14.2', 'M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z'],
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
  tag: ['M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.4 1.4 0 0 1 0 2l-6.7 6.7a1.4 1.4 0 0 1-2 0z', 'M8 8h.01'],
  sparkle: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z', 'M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z'],
  hourglass: ['M6.5 3h11', 'M6.5 21h11', 'M7.5 3v3.5a4.5 4.5 0 0 0 9 0V3', 'M7.5 21v-3.5a4.5 4.5 0 0 1 9 0V21'],
  reply: ['M9.5 14.5 4.5 9.5l5-5', 'M4.5 9.5H14a5.5 5.5 0 0 1 5.5 5.5v4'],
  user: ['M12 3.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M4.5 20.5a7.5 7.5 0 0 1 15 0'],
  check: ['M4 6.5h9', 'M4 12h9', 'M4 17.5h6', 'm15.5 15.5 2 2 4-4'],
  note: ['M5 3.5h10l4 4v13H5z', 'M15 3.5v4h4', 'M8.5 12h7', 'M8.5 16h5'],
  bell: ['M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z', 'M10 21h4'],
  pause: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M10 9v6', 'M14 9v6'],
  done: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'm8 12.5 2.8 2.8L16.5 9.5'],
  plus: ['M12 5v14', 'M5 12h14'],
  play: ['M7 4.5v15l12-7.5z'],
  list: ['M8 6h12', 'M8 12h12', 'M8 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  undo: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  redo: ['m15 14 5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
  fit: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  minus: ['M5 12h14'],
  trash: ['M4 7h16', 'M9.5 7V4.5h5V7', 'M6.5 7l1 13h9l1-13'],
  x: ['M6 6l12 12', 'M18 6 6 18'],
  back: ['M15 18l-6-6 6-6'],
  warn: ['M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'M12 9v4', 'M12 17h.01'],
  flow: ['M4 4.5h6v5H4z', 'M14 14.5h6v5h-6z', 'M7 9.5v2.5a2.5 2.5 0 0 0 2.5 2.5H14'],
  chat: ['M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.1A8 8 0 1 1 20 12z'],
  phone: ['M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
}

export function Ic({ name, size = 16, stroke = 2 }: { name: string; size?: number; stroke?: number }) {
  const paths = P[name] || P.bolt
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}

export const NODE_W = 248, NODE_H = 92    // a step's card on the canvas (the builder and MiniFlow)
export const kindIcon = (k: NodeKind) => KINDS[k]?.icon || 'bolt'
export const GROUP_LABEL = { trigger: 'Trigger', check: 'Check', action: 'Action', timing: 'Timing' } as const
const q = (s: string) => `“${s}”`
const chanLabel = (id: string) => CHANNELS.find(c => c.id === id)?.label || id

/** The bold line on a step's card. */
export function summary(n: GNode): string {
  const c = n.config || {}
  switch (n.kind) {
    case 'trigger': return c.type === 'missed_call' ? 'A call is missed' : c.firstOnly ? 'A new customer writes in' : 'A customer sends a message'
    case 'if_keyword': return c.words?.length ? `Mentions ${c.words.slice(0, 3).map(q).join(', ')}${c.words.length > 3 ? ` +${c.words.length - 3}` : ''}` : 'Mentions… (add words)'
    case 'if_channel': return c.channels?.length ? `Came in on ${c.channels.map(chanLabel).join(', ')}` : 'Came in on… (pick channels)'
    case 'if_hours': return c.when === 'open' ? 'You’re open right now' : 'You’re closed right now'
    case 'if_tag': return c.tag ? `Has the tag ${q(c.tag)}` : 'Has the tag… (type it)'
    case 'if_new': return 'First conversation with you'
    case 'if_unanswered': return 'Nobody has replied yet'
    case 'reply': return c.text ? `“${String(c.text).slice(0, 70)}${String(c.text).length > 70 ? '…' : ''}”` : 'Send a reply… (write it)'
    case 'assign': return c.userId ? `Assign to ${c.name || 'a teammate'}` : 'Assign to… (pick someone)'
    case 'tag': return c.tag ? `Tag them ${q(c.tag)}` : 'Tag them… (type it)'
    case 'task': return c.title ? `Task: ${c.title}` : 'Create a task… (give it a title)'
    case 'note': return c.text ? `Note: ${String(c.text).slice(0, 60)}` : 'Add a note… (write it)'
    default: return describe(n)
  }
}

/** The small line under it: which channels and the cool-down, who gets a task… */
export function detail(n: GNode): string {
  const c = n.config || {}
  const cool = Number(c.cooldownHours) || 0
  const short = cool >= 24 && cool % 24 === 0 ? `${cool / 24}d` : `${cool}h`
  switch (n.kind) {
    case 'trigger': {
      if (c.type === 'missed_call') return cool ? `Once per ${short} per caller` : 'Every missed call'
      const ch = c.channels?.length ? c.channels.map(chanLabel).join(', ') : 'Any channel'
      return `${ch} · ${cool ? `once per ${short}` : 'every time'}`
    }
    case 'if_keyword': return c.words?.length ? `${c.words.length} ${c.words.length === 1 ? 'word' : 'words'} · any of them` : 'Whole words, any of them'
    case 'if_channel': return 'Yes or no'
    case 'if_hours': return 'From your opening hours'
    case 'if_tag': return 'On their profile'
    case 'if_new': return 'Never talked to you before'
    case 'if_unanswered': return 'By your team or Colvy AI'
    case 'reply': return 'On the channel they used'
    case 'assign': return 'They get a notification'
    case 'tag': return 'Added to their profile'
    case 'task': return [c.assigneeName, c.dueDays === 0 ? 'due today' : c.dueDays === 1 ? 'due tomorrow' : c.dueDays > 1 ? `due in ${c.dueDays} days` : ''].filter(Boolean).join(' · ') || 'Anyone, no due date'
    case 'note': return 'Only your team sees it'
    case 'notify': return c.userIds?.length ? `${c.userIds.length} ${c.userIds.length === 1 ? 'person' : 'people'}` : 'Everyone on the team'
    case 'ai': return 'If it’s switched on'
    case 'pause_ai': return 'Your team takes it'
    case 'close': return 'Opens again if they write'
    case 'wait': return 'Then carries on'
    default: return ''
  }
}

export function hoursLabel(h: number): string {
  if (h >= 24 && h % 24 === 0) return `${h / 24} ${h === 24 ? 'day' : 'days'}`
  return `${h} ${h === 1 ? 'hour' : 'hours'}`
}

/** A small drawing of a flow (template cards, list rows). */
export function MiniFlow({ graph, height = 70 }: { graph: Graph; height?: number }) {
  const ns = graph.nodes
  if (!ns.length) return null
  const W = NODE_W, H = NODE_H
  const minX = Math.min(...ns.map(n => n.x)), minY = Math.min(...ns.map(n => n.y))
  const maxX = Math.max(...ns.map(n => n.x + W)), maxY = Math.max(...ns.map(n => n.y + H))
  const pad = 24
  const vb = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`
  const at = (id: string) => ns.find(n => n.id === id)
  return (
    <svg viewBox={vb} height={height} width="100%" preserveAspectRatio="xMidYMid meet" aria-hidden className="ab-mini">
      {graph.edges.map(e => {
        const a = at(e.from), b = at(e.to)
        if (!a || !b) return null
        const y1 = a.y + (e.port === 'yes' ? H * 0.36 : e.port === 'no' ? H * 0.72 : H / 2)
        const x1 = a.x + W, x2 = b.x, y2 = b.y + H / 2
        const dx = Math.max(40, Math.abs(x2 - x1) / 2)
        return <path key={e.id} d={`M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`} fill="none" stroke={e.port === 'yes' ? '#22a06b' : e.port === 'no' ? '#a1a1aa' : 'currentColor'} strokeOpacity={e.port === 'out' ? 0.35 : 0.8} strokeWidth={6} />
      })}
      {ns.map(n => (
        <g key={n.id}>
          <rect x={n.x} y={n.y} width={W} height={H} rx={22} fill="var(--ab-card, #fff)" stroke="currentColor" strokeOpacity={0.14} strokeWidth={4} />
          <rect x={n.x + 18} y={n.y + 24} width={44} height={44} rx={13} fill={KINDS[n.kind].color} />
          <rect x={n.x + 78} y={n.y + 30} width={110} height={12} rx={6} fill="currentColor" fillOpacity={0.5} />
          <rect x={n.x + 78} y={n.y + 52} width={80} height={10} rx={5} fill="currentColor" fillOpacity={0.2} />
        </g>
      ))}
    </svg>
  )
}

/** Colour tokens for both screens, light and dark (the app sets data-theme on <html>). */
export const AB_TOKENS = `
.ab-tok{--ab-bg:#f6f6f8;--ab-card:#fff;--ab-ink:var(--ink,#1a1a1a);--ab-mut:#71717a;--ab-line:#e7e7ea;--ab-soft:#f4f4f5;--ab-field:#f4f4f5;--ab-dot:#d9d9de;--ab-coral:var(--coral,#ff7a6b);--ab-shadow:0 1px 2px rgba(16,24,40,.06),0 8px 24px -12px rgba(16,24,40,.18)}
[data-theme="dark"] .ab-tok{--ab-bg:#0f0f11;--ab-card:#1c1c1f;--ab-mut:#a1a1aa;--ab-line:#2c2c31;--ab-soft:#232327;--ab-field:#26262a;--ab-dot:#2e2e33;--ab-shadow:0 1px 2px rgba(0,0,0,.4),0 10px 28px -12px rgba(0,0,0,.6)}
.ab-mini{color:var(--ab-ink);display:block}
`
