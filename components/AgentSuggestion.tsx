'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  const isComment = s.action_key === 'reply_to_comment'
  const isReview = s.action_key === 'reply_to_review' || isComment
  // A booking change the Reception Agent prepared: approve or dismiss (nothing to edit).
  const isBooking = s.action_key === 'reschedule_booking' || s.action_key === 'cancel_booking'
  // A follow-up to a shopper who left a cart (Sales Agent), sent by SMS or email.
  const isCart = s.action_key === 'send_cart_followup'
  // An update to a customer about a late or held-up order (Operations Agent).
  const isOrder = s.action_key === 'send_order_update'
  // A follow-up to a quote, payment request or enquiry that went quiet (Sales Agent).
  const isFollowup = s.action_key === 'send_sales_followup'
  // An outside tool the business connected (MCP): approve or dismiss (nothing to edit).
  const isOutside = s.action_key.startsWith('x_')
  const fixed = isBooking || isOutside
  const agentName = ({ support: 'Support Agent', reception: 'Reception Agent', reputation: 'Reputation Agent', sales: 'Sales Agent', operations: 'Operations Agent' } as Record<string, string>)[String(s.run?.role_key || '')] || 'An agent'
  const [error, setError] = useState('')
  // The edit box grows with the text (up to most of the screen), so editing
  // never means scrolling inside a few lines.
  const editRef = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = editRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight + 2, Math.round(window.innerHeight * 0.6))}px`
  }, [text, editing])

  const decide = async (action: 'approve' | 'reject') => {
    setBusy(action === 'approve' ? 'send' : 'dismiss'); setError('')
    try {
      const r = await authFetch(`/api/agent/approvals/${s.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action, ...(action === 'approve' && !fixed ? { text } : {}) }) })
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
          <p className="agsg-t">{isOutside ? `${agentName} wants to use an outside tool` : isBooking ? `Reception Agent wants to ${s.action_key === 'cancel_booking' ? 'cancel a booking' : 'move a booking'}` : isComment ? `Reputation Agent drafted ${s.run?.input?.platform === 'instagram' ? 'an Instagram' : 'a Facebook'} reply` : isReview ? 'Reputation Agent drafted a reply' : isCart ? 'Sales Agent wrote a cart follow-up' : isOrder ? 'Operations Agent wrote an order update' : isFollowup ? `Sales Agent wrote a ${s.run?.input?.kind === 'lead' ? 'follow-up to an enquiry' : 'quote follow-up'}` : s.run?.role_key === 'reception' ? 'Reception Agent suggests a reply' : 'Support Agent suggests a reply'}</p>
          {!compact && s.run?.summary && <p className="agsg-s">{s.run.summary}</p>}
        </div>
        <WhyLink companyId={companyId} runId={s.run_id} className="agsg-why" style={{ textDecoration: 'none' }} />
      </div>
      {isOutside
        ? <p className="agsg-text">{String(s.args?._preview || 'Use an outside tool')}. It runs once, with exactly these details.</p>
        : isBooking
        ? <p className="agsg-text">{String(s.args?._preview || (s.action_key === 'cancel_booking' ? 'Cancel this booking' : 'Move this booking'))}. The customer gets the usual booking message{s.action_key === 'cancel_booking' ? ', and your cancellation policy decides any refund' : ''}.</p>
        : editing
        ? <textarea ref={editRef} className="agsg-edit" value={text} onChange={e => setText(e.target.value)} rows={4} autoFocus aria-label={isReview ? 'Edit the public reply' : isCart ? 'Edit the follow-up' : isOrder ? 'Edit the update' : 'Edit the reply'} />
        : <p className="agsg-text">{text}</p>}
      {isCart && <p className="agsg-note">Goes out by SMS, else email. {'{link}'} becomes their checkout link and “Reply STOP to opt out.” is added.</p>}
      {isFollowup && <p className="agsg-note">{s.run?.input?.kind === 'quote' ? '{link} becomes their pay link. ' : ''}Goes in their conversation — by email or text on those threads, otherwise SMS, else email.</p>}
      {isOrder && <p className="agsg-note">Goes to the customer by SMS, else email, and shows in their conversation.</p>}
      {error && <p className="agsg-err" role="alert">{error}</p>}
      <div className="agsg-actions">
        <button type="button" className="agsg-send" onClick={() => decide('approve')} disabled={!!busy || (!fixed && !text.trim())}>{busy === 'send' ? (fixed ? 'Approving…' : isReview ? 'Posting…' : 'Sending…') : isOutside ? 'Approve' : isBooking ? (s.action_key === 'cancel_booking' ? 'Approve cancellation' : 'Approve move') : editing ? (isReview ? 'Post edited' : 'Send edited') : (isReview ? 'Post reply' : 'Send')}</button>
        {!editing && !fixed && <button type="button" className="agsg-btn" onClick={() => setEditing(true)} disabled={!!busy}>Edit</button>}
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
      // At most one suggested reply (the newest — the list is newest first); other kinds as they are.
      let replyShown = false
      const next: Suggestion[] = (d.approvals || []).filter((a: Suggestion) => ['send_message', 'reschedule_booking', 'cancel_booking', 'send_cart_followup', 'send_order_update', 'send_sales_followup'].includes(a.action_key) || a.action_key.startsWith('x_'))
        .filter((a: Suggestion) => !['send_message', 'send_sales_followup'].includes(a.action_key) || (!replyShown && (replyShown = true)))
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
.agsg{border:1px solid color-mix(in srgb,var(--coral,#e2553f) 22%,#e5e7eb);border-radius:16px;background:#fff;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.06);animation:agsgIn .45s ${EASE} both;width:100%;box-sizing:border-box;max-width:640px;margin-left:auto}
@keyframes agsgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.agsg{animation:none}}
.agsg-head{display:flex;align-items:flex-start;gap:10px;padding:11px 13px;background:color-mix(in srgb,var(--coral,#e2553f) 6%,#fff);border-bottom:1px solid color-mix(in srgb,var(--coral,#e2553f) 14%,#f1f1f1)}
.agsg-orb{width:26px;height:26px;flex-shrink:0;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(135deg,var(--coral,#e2553f),color-mix(in srgb,var(--coral,#e2553f) 55%,#a855f7))}
.agsg-t{margin:0;font-size:13px;font-weight:800;color:#0d0d0d}
.agsg-s{margin:2px 0 0;font-size:12px;color:#71717a;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.agsg-why{flex-shrink:0;font-size:12.5px;font-weight:700;color:var(--coral,#e2553f);text-decoration:none;padding:3px 2px}
.agsg-text{margin:0;padding:12px 14px;font-size:14px;line-height:1.55;color:#18181b;white-space:pre-wrap}
.agsg-edit{display:block;width:calc(100% - 24px);margin:10px 12px 0;box-sizing:border-box;padding:10px 12px;border-radius:12px;border:1px solid #e4e4e7;font-size:14px;line-height:1.55;font-family:inherit;color:#18181b;resize:vertical;min-height:96px;outline:none;transition:border-color .2s ease,box-shadow .2s ease}
.agsg-edit:focus{border-color:var(--coral,#e2553f);box-shadow:0 0 0 3px color-mix(in srgb,var(--coral,#e2553f) 15%,transparent)}
.agsg-note{margin:0;padding:0 14px 4px;font-size:12px;color:#71717a;line-height:1.45}
.agsg-err{margin:6px 14px 0;font-size:12.5px;color:#b42318}
.agsg-actions{display:flex;gap:8px;flex-wrap:wrap;padding:10px 12px 12px}
.agsg-send{padding:8px 16px;border-radius:11px;border:none;background:var(--coral,#e2553f);color:#fff;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;transition:transform .15s ${EASE},opacity .2s ease}
.agsg-send:hover:not(:disabled){transform:translateY(-1px)}.agsg-send:active:not(:disabled){transform:scale(.97)}.agsg-send:disabled{opacity:.5;cursor:default}
.agsg-btn{padding:8px 14px;border-radius:11px;border:1px solid #e4e4e7;background:#fff;color:#18181b;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:background .2s ease}
.agsg-btn:hover:not(:disabled){background:#fafafa}.agsg-btn:disabled{opacity:.5;cursor:default}
`
