'use client'

import { useEffect, useRef, useState } from 'react'
import { WhyLink } from '@/components/WhyAgent'
import { aiAddedBy, waitlistNoteLine } from '@/lib/waitlist-ai'

// "Added by AI" — waitlist entries an AI agent or Colvy AI added, marked the way
// the app marks AI work (violet spark, as on AI replies in the inbox).
//
//   AiAddedPill   on a Waitlists customer row: hover for who and when, click for
//                 the details with links to the conversation and "Why?"
//   WaitlistNoteLine any waitlist note in a conversation, as a quiet event line

export const AI_VIOLET = { c: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' }

export const AiSpark = ({ size = 10 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.6 5.3L19 9l-5.4 1.7L12 16l-1.6-5.3L5 9l5.4-1.7z" /><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></svg>
)

const fmtWhen = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '')

export function AiAddedPill({ entry, companyId }: { entry: any; companyId: string | null }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLSpanElement>(null)
  const by = aiAddedBy(entry)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Element | null
      // The "Why?" sheet opens in a portal: clicks inside it aren't "outside".
      if (btn.current?.contains(t as Node) || panel.current?.contains(t as Node) || t?.closest?.('.why-wrap')) return
      setOpen(false)
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', down)
    document.addEventListener('touchstart', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('touchstart', down); document.removeEventListener('keydown', key) }
  }, [open])
  // The details open in the row's flow (a full-width line under the name), so a
  // collapsing panel or a phone screen never clips them.
  return (
    <>
      <button ref={btn} type="button" className="ai-added-pill" onClick={() => setOpen(o => !o)} aria-expanded={open}
        title={`Added by ${by} · ${fmtWhen(entry.created_at)}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, border: `1px solid ${AI_VIOLET.border}`, background: AI_VIOLET.bg, color: AI_VIOLET.c, whiteSpace: 'nowrap', cursor: 'pointer', lineHeight: 1.4, flexShrink: 0 }}>
        <AiSpark /> Added by AI
      </button>
      {open && (
        <span ref={panel} role="group" aria-label="Added by AI" className="ai-added-pop"
          style={{ flexBasis: '100%', display: 'block', boxSizing: 'border-box', maxWidth: 420, background: '#fff', border: `1px solid ${AI_VIOLET.border}`, borderRadius: 12, boxShadow: '0 6px 18px rgba(15,23,42,.08)', padding: '10px 12px', marginTop: 2, fontWeight: 400 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, color: AI_VIOLET.c }}><AiSpark size={12} /> Added by {by}</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--slate, #6b7280)', marginTop: 3 }}>{fmtWhen(entry.created_at)}</span>
          <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 12.5 }}>
            {entry.conversation_id && <a href={`/admin/inbox?conversation=${entry.conversation_id}`} style={{ fontWeight: 700, color: AI_VIOLET.c }}>Open conversation</a>}
            <WhyLink companyId={companyId} {...(entry.agent_run_id ? { runId: entry.agent_run_id } : { entityType: 'waitlist', entityId: entry.id })} style={{ color: AI_VIOLET.c }} />
          </span>
        </span>
      )}
    </>
  )
}

/**
 * A waitlist note in the conversation (staff only), as one quiet centred line —
 * the same look as the inbox's other event lines: grey for a person's add
 * ("Auto-assigned to … · 5:26 pm"), the AI line (spark, tinted, Why?) for an
 * AI add ("Handed to the team — … · Support Agent · 4:25 pm  Why?") in violet.
 */
export function WaitlistNoteLine({ msg, companyId, fmtTime }: { msg: any; companyId: string | null; fmtTime: (iso: string) => string }) {
  const l = waitlistNoteLine(msg)
  const when = msg?.created_at ? fmtTime(msg.created_at) : ''
  const link = { fontSize: 11.5, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 2, whiteSpace: 'nowrap', marginLeft: 6 } as React.CSSProperties
  // The middle may wrap onto a second line on a phone rather than cut off the item or who added it.
  const mid = { flex: '0 1 auto', minWidth: 0, maxWidth: 680, fontSize: 11.5, lineHeight: 1.5, textAlign: 'center', whiteSpace: 'normal', overflowWrap: 'anywhere' } as React.CSSProperties
  const icon = { display: 'inline-block', verticalAlign: '-2px', marginRight: 5 } as React.CSSProperties
  if (l.ai) {
    const rule = { flex: '1 1 16px', minWidth: 16, height: 1, background: `color-mix(in srgb, ${AI_VIOLET.c} 22%, transparent)` }
    return (
      <div className="wl-note-line ai" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
        <div style={rule} />
        <span style={{ ...mid, fontWeight: 600, color: AI_VIOLET.c }}>
          <span style={icon}><AiSpark size={13} /></span>
          {l.text}
          {when && <span style={{ opacity: 0.55, fontWeight: 500 }}> · {when}</span>}
          <a href={l.href} style={{ ...link, color: AI_VIOLET.c }}>View</a>
          {l.runId && <WhyLink companyId={companyId} runId={l.runId} style={{ fontSize: 11.5, marginLeft: 8, color: AI_VIOLET.c }} />}
        </span>
        <div style={rule} />
      </div>
    )
  }
  const rule = { flex: '1 1 16px', minWidth: 16, height: 1, background: '#eceef0' }
  return (
    <div className="wl-note-line" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
      <div style={rule} />
      <span style={{ ...mid, color: '#9ca3af' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={icon} aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
        {l.text}{l.by ? ` · by ${l.by}` : ''}
        {when && <span style={{ color: '#c2c6cb', fontWeight: 500 }}> · {when}</span>}
        <a href={l.href} style={{ ...link, color: '#9ca3af' }}>View</a>
      </span>
      <div style={rule} />
    </div>
  )
}
