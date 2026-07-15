'use client'

import { useState, useEffect } from 'react'

// Coax-style email composer: From (the mailbox) · To · Cc · Subject · body,
// with the mailbox signature appended. Replaces the plain chat box for email
// threads, where a bare textarea can't set a subject or cc anyone.

interface Props {
  conversationId: string
  companyId: string | null
  toEmail: string
  defaultSubject: string
  fromLabel?: string           // "Roxy Aquarium <aquarium.roxy@gmail.com>"
  signature?: string | null
  agentName?: string
  onSent: () => void
}

export default function EmailComposer({
  conversationId, companyId, toEmail, defaultSubject, fromLabel, signature, agentName, onSent,
}: Props) {
  const [to, setTo] = useState(toEmail)
  const [cc, setCc] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [subject, setSubject] = useState(defaultSubject)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { setTo(toEmail) }, [toEmail])
  useEffect(() => { setSubject(defaultSubject) }, [defaultSubject])

  const send = async () => {
    if (!to.trim()) { setErr('Add a recipient'); return }
    if (!body.trim()) { setErr('Write a message'); return }
    setSending(true); setErr('')
    try {
      const res = await fetch('/api/email/reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId, to: to.trim(), cc: cc.trim() || null,
          subject: subject.trim() || defaultSubject,
          content: body, agentName,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Send failed')
      setBody(''); setCc(''); setShowCc(false)
      onSent()
    } catch (e: any) {
      setErr(e.message || 'Could not send')
    } finally { setSending(false) }
  }

  const field: React.CSSProperties = { flex: 1, border: 'none', outline: 'none', fontSize: 13, background: 'transparent', color: 'var(--ink)', minWidth: 0 }
  const rowLabel: React.CSSProperties = { fontSize: 12, color: 'var(--slate)', width: 54, flexShrink: 0 }
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)' }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
      <div style={{ ...row, background: 'var(--canvas)' }}>
        <span style={rowLabel}>From</span>
        <span style={{ ...field, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fromLabel || 'Your mailbox'}</span>
      </div>
      <div style={row}>
        <span style={rowLabel}>To</span>
        <input value={to} onChange={e => setTo(e.target.value)} style={field} placeholder="customer@example.com" />
        {!showCc && (
          <button type="button" onClick={() => setShowCc(true)}
            style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
            Cc
          </button>
        )}
      </div>
      {showCc && (
        <div style={row}>
          <span style={rowLabel}>Cc</span>
          <input value={cc} onChange={e => setCc(e.target.value)} style={field} placeholder="cc@example.com, another@example.com" />
        </div>
      )}
      <div style={row}>
        <span style={rowLabel}>Subject</span>
        <input value={subject} onChange={e => setSubject(e.target.value)} style={field} placeholder="Subject" />
      </div>

      <textarea value={body} onChange={e => setBody(e.target.value)} rows={7}
        placeholder="Write your reply…"
        style={{ width: '100%', border: 'none', outline: 'none', resize: 'vertical', padding: '12px', fontSize: 13.5, fontFamily: 'inherit', lineHeight: 1.55, color: 'var(--ink)', boxSizing: 'border-box' }} />

      {signature && (
        <div style={{ padding: '0 12px 8px' }}>
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--slate)', borderTop: '1px dashed var(--border)', paddingTop: 8, whiteSpace: 'pre-wrap' }}>
            {signature}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderTop: '1px solid var(--border)', background: 'var(--canvas)' }}>
        <span style={{ fontSize: 12, color: err ? '#dc2626' : 'var(--slate)' }}>
          {err || (signature ? 'Signature will be appended' : ' ')}
        </span>
        <button type="button" onClick={send} disabled={sending}
          style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: sending ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
          {sending ? 'Sending…' : 'Send email'}
          {!sending && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          )}
        </button>
      </div>
    </div>
  )
}
