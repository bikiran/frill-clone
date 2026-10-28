'use client'

// Text a missed caller back. Colvy drafts it (AI from their voicemail or the
// call's summary, or the business's own missed-call message); a person reads,
// edits and sends it. Sending goes through the usual SMS route with the
// opt-out check switched on, so a customer who replied STOP is never texted.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { authFetch } from '@/lib/auth-fetch'
import { Icon, Chip, C, btn, iconBtn, Spinner } from './ui'

type Draft = { text: string; source: 'ai' | 'template'; why: string[]; to: string; toDisplay: string; from: string | null; conversationId: string | null; contactId: string | null; consent: 'ok' | 'unknown'; autoTexted: boolean }

export default function TextBack({ companyId, callId, who, senderName, onClose, onSent }: {
  companyId: string; callId: string; who: string; senderName: string | null; onClose: () => void; onSent: () => void
}) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [showWhy, setShowWhy] = useState(false)

  useEffect(() => {
    let live = true
    authFetch('/api/command-centre/text-back', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, callId }) })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (!live) return; if (ok) { setDraft(d); setText(d.text || '') } else setError(d.error || 'Couldn’t draft a text.') })
      .catch(() => live && setError('Couldn’t reach Colvy.'))
    return () => { live = false }
  }, [companyId, callId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const send = async () => {
    if (!draft || !text.trim()) return
    setSending(true); setError('')
    try {
      const r = await authFetch('/api/telnyx/sms/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, conversationId: draft.conversationId || undefined, to: draft.to, from: draft.from || undefined, text: text.trim(), senderName: senderName || undefined, checkOptOut: true }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'The text didn’t send.'); return }
      onSent()
    } catch { setError('Couldn’t reach Colvy.') } finally { setSending(false) }
  }

  const len = text.length
  const parts = len <= 160 ? 1 : Math.ceil(len / 153)
  if (typeof document === 'undefined') return null
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,15,20,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label="Text back" onClick={e => e.stopPropagation()}
        className="cc-tb" style={{ width: 'min(520px, 100%)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', background: '#fff', borderRadius: 24, border: 'none', boxShadow: '0 24px 64px rgba(0,0,0,0.22)', padding: '20px 22px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <span style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--peach)', color: 'var(--coral)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{Icon.chat(18)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Text {who} back</p>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#71717a' }}>{draft ? `To ${draft.toDisplay}` : 'Drafting…'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ ...iconBtn, width: 34, height: 34 }}>{Icon.x(16)}</button>
        </div>

        {!draft && !error && <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--slate)', margin: '18px 0' }}><Spinner /> Writing a draft from the call…</p>}
        {error && !draft && <p style={{ margin: '10px 0', padding: '10px 12px', borderRadius: 14, background: 'color-mix(in srgb, #dc2626 9%, transparent)', color: C.red, fontSize: 13, fontWeight: 600 }}>{error}</p>}

        {draft && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {draft.source === 'ai' ? <Chip color={C.violet}>{Icon.spark(11)} AI draft</Chip> : <Chip color="#6b6b70">Your missed-call message</Chip>}
              {draft.consent === 'ok' ? <Chip color={C.green}>{Icon.check(11)} OK to text</Chip> : <Chip color={C.amber}>Opt-out checked when sent</Chip>}
              <button type="button" onClick={() => setShowWhy(v => !v)} aria-expanded={showWhy} style={{ border: 'none', background: 'none', padding: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--coral)', cursor: 'pointer' }}>Why?</button>
            </div>
            {showWhy && (
              <ul style={{ margin: '0 0 10px', padding: '10px 14px 10px 28px', borderRadius: 14, background: '#f4f4f5', border: 'none', fontSize: 12.5, color: '#3f3f46', lineHeight: 1.55 }}>
                {draft.why.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
            {draft.autoTexted && (
              <p style={{ margin: '0 0 10px', padding: '10px 12px', borderRadius: 14, background: 'color-mix(in srgb, #d97706 10%, transparent)', color: '#b45309', fontSize: 12, fontWeight: 600 }}>
                They already got your automatic missed-call text for this call. Make this one count, or call instead.
              </p>
            )}
            <textarea value={text} onChange={e => setText(e.target.value)} rows={5} maxLength={640} aria-label="Message"
              className="cc-tb-field" style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 14, border: '1.5px solid transparent', background: '#f4f4f5', color: 'var(--ink)', fontSize: 14.5, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
            <style>{`.cc-tb-field:focus{background:#fff!important;border-color:#d4d4d8!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 16%,transparent)!important}.cc-tb button::before{display:none}`}</style>
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#8e8e93' }}>{len} characters · {parts} text{parts === 1 ? '' : 's'}</p>
            {error && <p style={{ margin: '10px 0 0', color: C.red, fontSize: 12.5, fontWeight: 600 }}>{error}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button type="button" onClick={onClose} style={btn('ghost')}>Cancel</button>
              <button type="button" onClick={send} disabled={sending || !text.trim()} style={{ ...btn('primary'), opacity: sending || !text.trim() ? 0.6 : 1 }}>
                {sending ? <Spinner size={12} /> : Icon.send(13)} Send text
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
