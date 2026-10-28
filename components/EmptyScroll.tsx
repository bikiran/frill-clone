'use client'

// An empty list that still feels alive: a few placeholder cards drift slowly
// upward behind a soft fade at the top and bottom, above a short title and
// line ("No conversations yet / New conversations will show up here"). The
// cards are drawn twice and the strip moves up by half its height, so it loops
// seamlessly. Still for people who prefer less motion.

import type { ReactNode } from 'react'

export type EmptyKind = 'chat' | 'sms' | 'email' | 'task' | 'contact' | 'order' | 'ticket'
  | 'review' | 'link' | 'campaign' | 'calendar' | 'form' | 'payment' | 'photo' | 'call' | 'note' | 'article' | 'place' | 'idea'
type Kind = EmptyKind

// Drawn as a coloured outline on its own, without the tile behind it.
const OUTLINE: Kind[] = ['ticket']

const TINT: Record<Kind, string> = {
  chat: '#ff7a6b', sms: '#34c759', email: '#007aff', task: '#af52de', contact: '#ff9f0a', order: '#5ac8fa', ticket: '#f2551d',
  review: '#ffb800', link: '#5856d6', campaign: '#ff375f', calendar: '#ff453a', form: '#30b0c7', payment: '#00b894',
  photo: '#ff9500', call: '#32c766', note: '#c69c6d', article: '#5e5ce6', place: '#ff2d55', idea: '#f5b400',
}

const Glyph = ({ kind }: { kind: Kind }) => {
  const p = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: '#fff', strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (kind) {
    case 'ticket': return <svg {...p} width={19} height={19} stroke={TINT.ticket} strokeWidth={1.9}><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2.2a2.8 2.8 0 0 0 0 5.6V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2.2a2.8 2.8 0 0 0 0-5.6z" /><circle cx="12" cy="12" r="2.2" /></svg>
    case 'sms': return <svg {...p}><rect x="6" y="2.5" width="12" height="19" rx="3" /><path d="M11 18h2" /></svg>
    case 'email': return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></svg>
    case 'task': return <svg {...p}><path d="m5 12 4.5 4.5L19 7" /></svg>
    case 'contact': return <svg {...p}><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>
    case 'order': return <svg {...p}><path d="M6 7h12l-1 13H7z" /><path d="M9 7a3 3 0 0 1 6 0" /></svg>
    case 'review': return <svg {...p}><path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.3l-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z" /></svg>
    case 'link': return <svg {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
    case 'campaign': return <svg {...p}><path d="M4 10v4h3l6 4V6L7 10z" /><path d="M17 9a4 4 0 0 1 0 6" /></svg>
    case 'calendar': return <svg {...p}><rect x="4" y="5.5" width="16" height="14" rx="2.5" /><path d="M4 10h16M9 3.5v4M15 3.5v4" /></svg>
    case 'form': return <svg {...p}><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="M9 9h6M9 13h6M9 17h3" /></svg>
    case 'payment': return <svg {...p}><rect x="3" y="6" width="18" height="12" rx="2.5" /><path d="M3 10.5h18M7 15h3" /></svg>
    case 'photo': return <svg {...p}><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m20 16-4.5-4.5L7 19" /></svg>
    case 'call': return <svg {...p}><path d="M6.5 4h3l1.5 4-2 1.3a10 10 0 0 0 5.7 5.7l1.3-2 4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 4.5 6a2 2 0 0 1 2-2z" /></svg>
    case 'note': return <svg {...p}><path d="M5 4.5h10l4 4v11H5z" /><path d="M15 4.5v4h4M8.5 13h7M8.5 16.5h4" /></svg>
    case 'article': return <svg {...p}><path d="M4 6a2 2 0 0 1 2-2h5v16H6a2 2 0 0 0-2 2zM20 6a2 2 0 0 0-2-2h-5v16h5a2 2 0 0 1 2 2z" /></svg>
    case 'place': return <svg {...p}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.2" /></svg>
    case 'idea': return <svg {...p}><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" /></svg>
    default: return <svg {...p}><path d="M20 14.5a2 2 0 0 1-2 2H8.5L4 20V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" /></svg>
  }
}

function Card({ kind, w }: { kind: Kind; w: number }) {
  return (
    <div className="es-card">
      {OUTLINE.includes(kind)
        ? <span className="es-ic"><Glyph kind={kind} /></span>
        : <span className="es-ic" style={{ background: TINT[kind] }}><Glyph kind={kind} /><span className="es-dot" /></span>}
      <span className="es-bar" style={{ width: `${w}%` }} />
      <svg className="es-plus" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    </div>
  )
}

export default function EmptyScroll({ title, line, kinds = ['chat', 'sms', 'email'], action, compact }: {
  title: string
  line?: ReactNode
  /** Which little icons the cards show, cycled (what will appear in the list). */
  kinds?: Kind[]
  action?: ReactNode
  compact?: boolean
}) {
  const widths = [62, 48, 70, 54, 66, 44]
  const cards = widths.map((w, i) => ({ w, kind: kinds[i % kinds.length] }))
  return (
    <div className={`es-root${compact ? ' es-compact' : ''}`}>
      <style>{`
        .es-root { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 4px; padding: 24px 12px; }
        .es-window { width: 100%; max-width: 256px; height: 144px; overflow: hidden; padding: 0 16px; margin-bottom: 8px;
          -webkit-mask-image: linear-gradient(transparent, #000 24%, #000 76%, transparent); mask-image: linear-gradient(transparent, #000 24%, #000 76%, transparent); }
        .es-compact .es-window { height: 112px; }
        .es-strip { display: flex; flex-direction: column; animation: esScroll 12s linear infinite; will-change: transform; }
        .es-card { margin-top: 14px; display: flex; align-items: center; gap: 12px; padding: 13px 14px; border-radius: 16px; background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .es-ic { position: relative; width: 26px; height: 26px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .es-dot { position: absolute; top: -3px; right: -3px; width: 8px; height: 8px; border-radius: 50%; background: inherit; border: 2px solid #fff; }
        .es-bar { height: 10px; border-radius: 999px; background: #ececef; }
        .es-plus { margin-left: auto; color: #8e8e93; flex-shrink: 0; }
        .es-title { margin: 0; font-size: 14px; font-weight: 600; color: var(--ink); }
        .es-line { margin: 0; font-size: 12.5px; color: #8e8e93; max-width: 260px; line-height: 1.45; }
        @keyframes esScroll { from { transform: translateY(0); } to { transform: translateY(-50%); } }
        @media (prefers-reduced-motion: reduce) { .es-strip { animation: none; } }
      `}</style>
      <div className="es-window" aria-hidden="true">
        <div className="es-strip">
          {[...cards, ...cards].map((c, i) => <Card key={i} kind={c.kind} w={c.w} />)}
        </div>
      </div>
      <p className="es-title">{title}</p>
      {line && <p className="es-line">{line}</p>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  )
}
