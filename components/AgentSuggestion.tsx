'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { WhyLink } from '@/components/WhyAgent'
import { authFetch } from '@/lib/auth-fetch'

// Inbox: a reply the Support Agent prepared for this conversation, waiting for
// the team (Agent Engine "prepare"). Send it as is, edit it first, or dismiss
// it. "Why?" explains the agent's run — what it looked up and why it said this.

const EASE = 'cubic-bezier(.22,1,.36,1)'
const Spark = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z" /></svg>

export type Suggestion = { id: string; run_id: string; action_key: string; args: any; created_at: string; run?: { summary?: string | null; intent?: string | null; role_key?: string | null; input?: any } | null }

export function SuggestionCard({ s, companyId, onDone, compact }: { s: Suggestion; companyId: string; onDone: (id: string, result: string) => void; compact?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(String(s.args?.text || ''))
  const [busy, setBusy] = useState<'' | 'send' | 'dismiss'>('')
  // A public reply to a Google review (Reputation Agent) or a message to a customer (Support Agent).
  const isReview = s.action_key === 'reply_to_review'
  // A booking change the Reception Agent prepared: approve or dismiss (nothing to edit).
  const isBooking = s.action_key === 'reschedule_booking' || s.action_key === 'cancel_booking'
  const [error, setError] = useState('')

  const decide = async (action: 'approve' | 'reject') => {
    setBusy(action === 'approve' ? 'send' : 'dismiss'); setError('')
    try {
      const r = await authFetch(`/api/agent/approvals/${s.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action, ...(action === 'approve' && !isBooking ? { text } : {}) }) })
      const d = await r.json()
      if (!r.ok || d.error) { setError(d.error || 'That didn’t work. Try again.'); return }
      onDone(s.id, d.status)
    } catch { setError('Couldn’t reach Colvy. Try again.') } finally { setBusy('') }
  }

  return (
    <div className="agsg" role="region" aria-label="Suggested reply">
      <div className="agsg-head">
        <span className="agsg-orb"><Spark /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="agsg-t">{isBooking ? `Reception Agent wants to ${s.action_key === 'cancel_booking' ? 'cancel a booking' : 'move a booking'}` : isReview ? 'Reputation Agent drafted a reply' : s.run?.role_key === 'reception' ? 'Reception Agent suggests a reply' : 'Support Agent suggests a reply'}</p>
          {!compact && s.run?.summary && <p className="agsg-s">{s.run.summary}</p>}
        </div>
        <WhyLink companyId={companyId} runId={s.run_id} className="agsg-why" style={{ textDecoration: 'none' }} />
      </div>
      {isBooking
        ? <p className="agsg-text">{String(s.args?._preview || (s.action_key === 'cancel_booking' ? 'Cancel this booking' : 'Move this booking'))}. The customer gets the usual booking message{s.action_key === 'cancel_booking' ? ', and your cancellation policy decides any refund' : ''}.</p>
        : editing
        ? <textarea className="agsg-edit" value={text} onChange={e => setText(e.target.value)} rows={Math.min(8, Math.max(3, Math.ceil(text.length / 60)))} autoFocus aria-label={isReview ? 'Edit the public reply' : 'Edit the reply'} />
        : <p className="agsg-text">{text}</p>}
      {error && <p className="agsg-err" role="alert">{error}</p>}
      <div className="agsg-actions">
        <button type="button" className="agsg-send" onClick={() => decide('approve')} disabled={!!busy || (!isBooking && !text.trim())}>{busy === 'send' ? (isBooking ? 'Approving…' : isReview ? 'Posting…' : 'Sending…') : isBooking ? (s.action_key === 'cancel_booking' ? 'Approve cancellation' : 'Approve move') : editing ? (isReview ? 'Post edited' : 'Send edited') : (isReview ? 'Post reply' : 'Send')}</button>
        {!editing && !isBooking && <button type="button" className="agsg-btn" onClick={() => setEditing(true)} disabled={!!busy}>Edit</button>}
        <button type="button" className="agsg-btn" onClick={() => decide('reject')} disabled={!!busy}>{busy === 'dismiss' ? 'Dismissing…' : 'Dismiss'}</button>
      </div>
      <style>{CSS}</style>
    </div>
  )
}

export default function AgentSuggestion({ companyId, conversationId, onChange }: { companyId: string | null; conversationId: string | null; onChange?: () => void }) {
  const [items, setItems] = useState<Suggestion[]>([])
  const [done, setDone] = useState<Set<string>>(() => new Set())
  const convRef = useRef(conversationId)
  convRef.current = conversationId
  // The parent passes a fresh onChange every render. Keep it out of the deps,
  // or each inbox re-render would clear and refetch the card (it flickers).
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const shownRef = useRef('')

  const load = useCallback(async () => {
    if (!companyId || !conversationId) { setItems([]); return }
    try {
      const r = await authFetch(`/api/agent/approvals?companyId=${companyId}&conversationId=${conversationId}`)
      if (!r.ok) return
      const d = await r.json()
      if (convRef.current !== conversationId) return
      const next: Suggestion[] = (d.approvals || []).filter((a: Suggestion) => ['send_message', 'reschedule_booking', 'cancel_booking'].includes(a.action_key))
      const ids = next.map(a => a.id).join(',')
      if (ids === shownRef.current) return   // nothing new: leave the card alone
      const grew = next.some(a => !shownRef.current.split(',').includes(a.id))
      shownRef.current = ids
      setItems(next)
      if (grew) setTimeout(() => onChangeRef.current?.(), 60)
    } catch {}
  }, [companyId, conversationId])

  useEffect(() => {
    setItems([]); shownRef.current = ''; load()
    if (!companyId || !conversationId) return
    // Runs finish a few seconds after a message arrives — check while open.
    const iv = setInterval(load, 8000)
    return () => clearInterval(iv)
  }, [companyId, conversationId, load])

  const visible = items.filter(i => !done.has(i.id))
  if (!companyId || !visible.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '8px 0' }}>
      {visible.map(s => (
        <SuggestionCard key={s.id} s={s} companyId={companyId} onDone={(id) => { setDone(d => new Set(d).add(id)); setTimeout(load, 1200) }} />
      ))}
    </div>
  )
}

const CSS = `
.agsg{border:1px solid color-mix(in srgb,var(--coral,#e2553f) 22%,#e5e7eb);border-radius:16px;background:#fff;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.06);animation:agsgIn .45s ${EASE} both;max-width:640px;margin-left:auto}
@keyframes agsgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.agsg{animation:none}}
.agsg-head{display:flex;align-items:flex-start;gap:10px;padding:11px 13px;background:color-mix(in srgb,var(--coral,#e2553f) 6%,#fff);border-bottom:1px solid color-mix(in srgb,var(--coral,#e2553f) 14%,#f1f1f1)}
.agsg-orb{width:26px;height:26px;flex-shrink:0;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(135deg,var(--coral,#e2553f),color-mix(in srgb,var(--coral,#e2553f) 55%,#a855f7))}
.agsg-t{margin:0;font-size:13px;font-weight:800;color:#0d0d0d}
.agsg-s{margin:2px 0 0;font-size:12px;color:#71717a;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.agsg-why{flex-shrink:0;font-size:12.5px;font-weight:700;color:var(--coral,#e2553f);text-decoration:none;padding:3px 2px}
.agsg-text{margin:0;padding:12px 14px;font-size:14px;line-height:1.55;color:#18181b;white-space:pre-wrap}
.agsg-edit{display:block;width:calc(100% - 24px);margin:10px 12px 0;box-sizing:border-box;padding:10px 12px;border-radius:12px;border:1px solid #e4e4e7;font-size:14px;line-height:1.5;font-family:inherit;color:#18181b;resize:vertical;outline:none;transition:border-color .2s ease,box-shadow .2s ease}
.agsg-edit:focus{border-color:var(--coral,#e2553f);box-shadow:0 0 0 3px color-mix(in srgb,var(--coral,#e2553f) 15%,transparent)}
.agsg-err{margin:6px 14px 0;font-size:12.5px;color:#b42318}
.agsg-actions{display:flex;gap:8px;flex-wrap:wrap;padding:10px 12px 12px}
.agsg-send{padding:8px 16px;border-radius:11px;border:none;background:var(--coral,#e2553f);color:#fff;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;transition:transform .15s ${EASE},opacity .2s ease}
.agsg-send:hover:not(:disabled){transform:translateY(-1px)}.agsg-send:active:not(:disabled){transform:scale(.97)}.agsg-send:disabled{opacity:.5;cursor:default}
.agsg-btn{padding:8px 14px;border-radius:11px;border:1px solid #e4e4e7;background:#fff;color:#18181b;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:background .2s ease}
.agsg-btn:hover:not(:disabled){background:#fafafa}.agsg-btn:disabled{opacity:.5;cursor:default}
`
