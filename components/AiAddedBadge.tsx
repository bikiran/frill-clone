'use client'

import { useEffect, useRef, useState } from 'react'
import { WhyLink } from '@/components/WhyAgent'
import { aiAddedBy } from '@/lib/waitlist-ai'

// "Added by AI" — waitlist entries an AI agent or Colvy AI added, marked the way
// the app marks AI work (violet spark, as on AI replies in the inbox).
//
//   AiAddedPill   on a Waitlists customer row: hover for who and when, click for
//                 the details with links to the conversation and "Why?"
//   AiWaitlistNote the staff-only note an AI add leaves in the conversation

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

/** The note an AI add leaves in the conversation (staff only). */
export function AiWaitlistNote({ content, metadata, createdAt, companyId }: { content: string; metadata?: any; createdAt?: string; companyId: string | null }) {
  // The text without the trailing link (the card links to it).
  const text = String(content || '').split('\n').filter(l => !/^https?:\/\//.test(l.trim())).join('\n').trim()
  const href = metadata?.waitlist_href || (metadata?.waitlist_id ? `/admin/waitlists?entry=${metadata.waitlist_id}` : '/admin/waitlists')
  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
      <div className="ai-wl-note" style={{ maxWidth: '86%', width: '100%', background: AI_VIOLET.bg, border: `1px solid ${AI_VIOLET.border}`, borderLeft: `4px solid ${AI_VIOLET.c}`, borderRadius: 14, padding: '10px 14px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#fff', border: `1px solid ${AI_VIOLET.border}`, color: AI_VIOLET.c }}><AiSpark /> Added by AI</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9' }}>Waiting list · team only</span>
          {createdAt && <span style={{ fontSize: 11, color: '#8b8fa3', marginLeft: 'auto' }}>{fmtWhen(createdAt)}</span>}
        </div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: '#2e1065', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, fontSize: 12.5 }}>
          <a href={href} style={{ fontWeight: 700, color: AI_VIOLET.c }}>View on Waitlists</a>
          {metadata?.agent_run_id && <WhyLink companyId={companyId} runId={metadata.agent_run_id} style={{ color: AI_VIOLET.c }} />}
        </div>
      </div>
    </div>
  )
}
