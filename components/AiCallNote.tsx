'use client'

import { useState } from 'react'

// A call the AI phone agent answered, as one compact card in the conversation:
// who called, what they first asked, how it ended, and the transcript as chat
// bubbles on demand. Built from the agent's transcript note (an internal,
// team-only message), so nothing here is ever sent to the customer.

type Turn = { who: 'ai' | 'caller'; text: string }

/** The note's text → its header line and the turns ("AI: …" / "Caller: …" lines). */
export function parseAiCall(content: string): { header: string; turns: Turn[] } {
  const lines = String(content || '').split('\n')
  const header = lines[0] || ''
  const turns: Turn[] = []
  for (const line of lines.slice(1)) {
    const m = line.match(/^(AI|Caller):\s?(.*)$/)
    if (m) turns.push({ who: m[1] === 'AI' ? 'ai' : 'caller', text: m[2] })
    else if (line.trim() && turns.length) turns[turns.length - 1].text += `\n${line}`
  }
  return { header, turns }
}

const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

const GRADIENT = 'linear-gradient(135deg, #6366f1 0%, #a855f7 52%, #22d3ee 100%)'

const Bars = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
    <line x1="4" y1="10" x2="4" y2="14" /><line x1="8" y1="6" x2="8" y2="18" /><line x1="12" y1="3" x2="12" y2="21" />
    <line x1="16" y1="7" x2="16" y2="17" /><line x1="20" y1="10" x2="20" y2="14" />
  </svg>
)
const Lock = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)
const Chevron = ({ open }: { open: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden
    style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease' }}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

const chip = (bg: string, color: string, border: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999,
  background: bg, color, border: `1px solid ${border}`, fontSize: 11, fontWeight: 650, whiteSpace: 'nowrap', lineHeight: 1.5,
})

export default function AiCallNote({ content, metadata, createdAt, highlight }: {
  content: string; metadata?: any; createdAt?: string; highlight?: string
}) {
  const { header, turns } = parseAiCall(content)
  const q = (highlight || '').trim().toLowerCase()
  const [open, setOpen] = useState(() => !!q && content.toLowerCase().includes(q))

  const md = metadata || {}
  // Older notes carry the facts only in their header line.
  const avgS = md.avg_reply_ms != null
    ? (md.avg_reply_ms / 1000).toFixed(1)
    : (header.match(/(\d+(?:\.\d+)?)s on average/)?.[1] ?? null)
  const isTest = md.test ?? /\(test/.test(header)
  const duration = typeof md.duration_seconds === 'number' && md.duration_seconds > 0 ? md.duration_seconds : null
  const firstAsk = turns.find(t => t.who === 'caller')?.text || ''
  const when = createdAt ? new Date(createdAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''

  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0' }}>
      {/* Gradient hairline border around a white card. */}
      <div style={{ width: '100%', maxWidth: 560, padding: 1, borderRadius: 16, background: GRADIENT, boxShadow: '0 1px 2px rgba(15,23,42,.05), 0 10px 28px -14px rgba(99,102,241,.45)' }}>
        <div style={{ background: '#fff', borderRadius: 15, padding: '11px 13px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
            <span style={{ width: 32, height: 32, borderRadius: '50%', background: GRADIENT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 0 3px rgba(168,85,247,.12)' }}>
              <Bars />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', rowGap: 4 }}>
                <span style={{ fontSize: 13.5, fontWeight: 750, color: '#0f172a', letterSpacing: '-0.01em' }}>AI answered a call</span>
                <span title="Team only: not sent to the customer" style={{ display: 'inline-flex', color: '#94a3b8' }}><Lock /></span>
                {duration ? <span style={{ fontSize: 12.5, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>· {fmtDur(duration)}</span> : null}
                {isTest ? <span style={chip('#f5f3ff', '#6d28d9', '#ddd6fe')}>Test</span> : null}
                <span style={{ flex: 1 }} />
                {avgS ? (
                  <span title="How long callers waited, on average, before the AI started each reply" style={chip('#ecfeff', '#0e7490', '#a5f3fc')}>
                    ⚡ {avgS}s replies
                  </span>
                ) : null}
              </div>
              {firstAsk ? (
                <p title={firstAsk} style={{ margin: '3px 0 0', fontSize: 13, color: '#334155', lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  “{firstAsk}”
                </p>
              ) : (
                <p style={{ margin: '3px 0 0', fontSize: 13, color: '#94a3b8' }}>The caller hung up during the greeting.</p>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap', rowGap: 6 }}>
                {md.message_taken ? (
                  <span title={md.message_about || undefined} style={chip('#f0fdf4', '#15803d', '#bbf7d0')}>✓ Call-back task created</span>
                ) : null}
                {turns.length > 1 ? (
                  <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
                    style={{ ...chip('#f8fafc', '#334155', '#e2e8f0'), cursor: 'pointer', fontFamily: 'inherit' }}>
                    {open ? 'Hide transcript' : 'Transcript'} <Chevron open={open} />
                  </button>
                ) : null}
                <span style={{ flex: 1 }} />
                {when ? <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{when}</span> : null}
              </div>
            </div>
          </div>

          {open ? (
            <div style={{ marginTop: 10, padding: '10px 2px 2px', borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
              {turns.map((t, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: t.who === 'ai' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '82%', padding: '7px 11px', fontSize: 12.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    borderRadius: t.who === 'ai' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    background: t.who === 'ai' ? 'linear-gradient(135deg, #eef2ff, #f5f3ff)' : '#f1f5f9',
                    color: t.who === 'ai' ? '#312e81' : '#0f172a',
                    border: t.who === 'ai' ? '1px solid #e0e7ff' : '1px solid #e2e8f0',
                  }}>
                    {t.text}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
