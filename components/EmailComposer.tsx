'use client'

import { useState, useEffect } from 'react'

// Coax-style email composer: From (the mailbox) · To · Cc · Subject · Signature
// · body. The signature is chosen from the company's saved library (or "None"),
// and new ones can be added inline — matching the Coax "Signature ▾ / + Add" UX.

interface Sig { id: string; name: string; body: string; is_default?: boolean }

interface Props {
  conversationId: string
  companyId: string | null
  toEmail: string
  defaultSubject: string
  fromLabel?: string           // "Roxy Aquarium <aquarium.roxy@gmail.com>"
  signature?: string | null    // the mailbox's own signature (fallback default)
  agentName?: string
  onSent: () => void
}

export default function EmailComposer({
  conversationId, companyId, toEmail, defaultSubject, fromLabel, signature, agentName, onSent,
}: Props) {
  const [to, setTo] = useState(toEmail)
  const [cc, setCc] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [bcc, setBcc] = useState('')
  const [showBcc, setShowBcc] = useState(false)
  const [subject, setSubject] = useState(defaultSubject)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')

  // ── Signatures ─────────────────────────────────────────────────────────────
  // 'mailbox' = the mailbox's built-in signature; '' = none; otherwise a library id.
  const [sigs, setSigs] = useState<Sig[]>([])
  const [sigId, setSigId] = useState<string>(signature ? 'mailbox' : '')
  const [addingSig, setAddingSig] = useState(false)
  const [newSigName, setNewSigName] = useState('')
  const [newSigBody, setNewSigBody] = useState('')
  const [savingSig, setSavingSig] = useState(false)

  useEffect(() => { setTo(toEmail) }, [toEmail])
  useEffect(() => { setSubject(defaultSubject) }, [defaultSubject])

  const loadSigs = async () => {
    if (!companyId) return
    try {
      const res = await fetch(`/api/email/accounts?companyId=${companyId}`)
      const d = await res.json()
      const list: Sig[] = d.signatures || []
      setSigs(list)
      // Prefer a library default; otherwise keep the mailbox signature if present.
      const def = list.find(s => s.is_default)
      if (def) setSigId(def.id)
      else if (!signature) setSigId('')
    } catch {}
  }
  useEffect(() => { loadSigs() }, [companyId])

  const selectedSigBody = (): string => {
    if (sigId === 'mailbox') return signature || ''
    if (!sigId) return ''
    return sigs.find(s => s.id === sigId)?.body || ''
  }

  const saveNewSig = async () => {
    if (!newSigName.trim() || !newSigBody.trim() || !companyId) return
    setSavingSig(true)
    try {
      await fetch('/api/email/accounts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, action: 'save_signature', name: newSigName.trim(), sigBody: newSigBody, is_default: sigs.length === 0 }),
      })
      setNewSigName(''); setNewSigBody(''); setAddingSig(false)
      await loadSigs()
      // Select the one we just made (match by name).
      // loadSigs may set a default; re-select the new one after it lands.
      setTimeout(() => setSigs(cur => { const made = cur.find(s => s.name === newSigName.trim()); if (made) setSigId(made.id); return cur }), 0)
    } catch (e: any) { setErr(e.message || 'Could not save signature') }
    finally { setSavingSig(false) }
  }

  const send = async () => {
    if (!to.trim()) { setErr('Add a recipient'); return }
    if (!body.trim()) { setErr('Write a message'); return }
    setSending(true); setErr('')
    try {
      const res = await fetch('/api/email/reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId, to: to.trim(), cc: cc.trim() || null, bcc: bcc.trim() || null,
          subject: subject.trim() || defaultSubject,
          content: body, agentName,
          signature: selectedSigBody(),   // explicit — '' means no signature
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Send failed')
      setBody(''); setCc(''); setShowCc(false); setBcc(''); setShowBcc(false)
      onSent()
    } catch (e: any) {
      setErr(e.message || 'Could not send')
    } finally { setSending(false) }
  }

  const field: React.CSSProperties = { flex: 1, border: 'none', outline: 'none', fontSize: 13, background: 'transparent', color: 'var(--ink)', minWidth: 0 }
  const rowLabel: React.CSSProperties = { fontSize: 12, color: 'var(--slate)', width: 54, flexShrink: 0 }
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)' }

  const sigPreview = selectedSigBody()

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
      <div style={{ ...row, background: 'var(--canvas)' }}>
        <span style={rowLabel}>From</span>
        <span style={{ ...field, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fromLabel || 'Your mailbox'}</span>
      </div>
      <div style={row}>
        <span style={rowLabel}>To</span>
        <input value={to} onChange={e => setTo(e.target.value)} style={field} placeholder="customer@example.com" />
        {(!showCc || !showBcc) && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {!showCc && (
              <button type="button" onClick={() => setShowCc(true)}
                style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Cc
              </button>
            )}
            {!showBcc && (
              <button type="button" onClick={() => setShowBcc(true)}
                style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Bcc
              </button>
            )}
          </div>
        )}
      </div>
      {showCc && (
        <div style={row}>
          <span style={rowLabel}>Cc</span>
          <input value={cc} onChange={e => setCc(e.target.value)} style={field} placeholder="cc@example.com, another@example.com" />
        </div>
      )}
      {showBcc && (
        <div style={row}>
          <span style={rowLabel}>Bcc</span>
          <input value={bcc} onChange={e => setBcc(e.target.value)} style={field} placeholder="bcc@example.com" />
        </div>
      )}
      <div style={row}>
        <span style={rowLabel}>Subject</span>
        <input value={subject} onChange={e => setSubject(e.target.value)} style={field} placeholder="Subject" />
      </div>

      {/* Signature selector + inline add (Coax-style). */}
      <div style={row}>
        <span style={rowLabel}>Signature</span>
        <select value={sigId} onChange={e => setSigId(e.target.value)}
          style={{ ...field, cursor: 'pointer', flex: 'unset', maxWidth: 220 }}>
          <option value="">No signature</option>
          {signature && <option value="mailbox">Mailbox default</option>}
          {sigs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button type="button" onClick={() => { setAddingSig(v => !v); setErr('') }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
          + Add
        </button>
      </div>
      {addingSig && (
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--canvas)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input value={newSigName} onChange={e => setNewSigName(e.target.value)} placeholder="Signature name (e.g. Roxy — Sales)"
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }} />
          <textarea value={newSigBody} onChange={e => setNewSigBody(e.target.value)} rows={3} placeholder={'Kind regards,\nRoxy Aquarium'}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => { setAddingSig(false); setNewSigName(''); setNewSigBody('') }}
              style={{ border: 'none', background: 'none', color: 'var(--slate)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button type="button" onClick={saveNewSig} disabled={savingSig || !newSigName.trim() || !newSigBody.trim()}
              style={{ border: 'none', background: 'var(--coral)', color: '#fff', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: (savingSig || !newSigName.trim() || !newSigBody.trim()) ? 0.6 : 1 }}>{savingSig ? 'Saving…' : 'Save signature'}</button>
          </div>
        </div>
      )}

      <textarea value={body} onChange={e => setBody(e.target.value)} rows={7}
        placeholder="Write your reply…"
        style={{ width: '100%', border: 'none', outline: 'none', resize: 'vertical', padding: '12px', fontSize: 13.5, fontFamily: 'inherit', lineHeight: 1.55, color: 'var(--ink)', boxSizing: 'border-box' }} />

      {sigPreview && (
        <div style={{ padding: '0 12px 8px' }}>
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--slate)', borderTop: '1px dashed var(--border)', paddingTop: 8, whiteSpace: 'pre-wrap' }}>
            {sigPreview}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderTop: '1px solid var(--border)', background: 'var(--canvas)' }}>
        <span style={{ fontSize: 12, color: err ? '#dc2626' : 'var(--slate)' }}>
          {err || (sigPreview ? 'Signature will be appended' : ' ')}
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
