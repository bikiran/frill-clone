'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Colvy AI replying to a customer, shown live at the bottom of the thread:
//   writing → an animated "Colvy AI is writing a reply" bubble
//   draft   → the reply with a countdown; Send now / Edit / Cancel
// Driven entirely by the conversation row (ai_status / ai_draft / …), which the
// inbox already receives in realtime — everyone watching sees the same thing.

const GRAD = 'linear-gradient(135deg, #ff7a6b, #ff9d72)'

type Conv = { id: string; ai_status?: string | null; ai_draft?: string | null; ai_draft_id?: string | null; ai_draft_send_at?: string | null }

function Spark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
      <path d="M19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
    </svg>
  )
}

export default function AiLiveReply({ conv, onEdit, onChange }: { conv: Conv | null; onEdit: (text: string) => void; onChange?: () => void }) {
  const status = conv?.ai_status || null
  const draftId = conv?.ai_draft_id || null
  const [busy, setBusy] = useState<'' | 'send' | 'edit' | 'cancel'>('')
  const [error, setError] = useState('')
  const [hidden, setHidden] = useState<string | null>(null)    // draft we've acted on
  const [left, setLeft] = useState(0)
  const [total, setTotal] = useState(3000)
  const startRef = useRef<{ id: string; at: number; total: number } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { if (!status) return; const iv = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(iv) }, [status])

  // Countdown, measured locally from when this draft first appeared (so a clock
  // difference between this device and the server can't skew it).
  useEffect(() => {
    if (status !== 'pending' || !draftId) { startRef.current = null; return }
    if (startRef.current?.id !== draftId) {
      const serverLeft = conv?.ai_draft_send_at ? new Date(conv.ai_draft_send_at).getTime() - Date.now() : 3000
      const t = serverLeft > 0 && serverLeft <= 15000 ? serverLeft : 3000
      startRef.current = { id: draftId, at: Date.now(), total: t }
      setTotal(t); setError(''); setBusy('')
    }
    const tick = () => { const s = startRef.current; if (s) setLeft(Math.max(0, s.total - (Date.now() - s.at))) }
    tick()
    const iv = setInterval(tick, 100)
    return () => clearInterval(iv)
  }, [status, draftId, conv?.ai_draft_send_at])

  useEffect(() => { onChange?.() }, [status, draftId])   // keep it in view

  const act = async (action: 'send' | 'edit' | 'cancel') => {
    if (!conv || !draftId || busy) return
    setBusy(action); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await authFetch('/api/ai/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ conversationId: conv.id, draftId, action }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'Something went wrong.'); setBusy(''); return }
      setHidden(draftId)
      if (action === 'edit') onEdit(String(d.text || conv.ai_draft || ''))
    } catch (e: any) { setError(e?.message || 'Network error.'); setBusy('') }
  }

  if (!conv || !status) return null
  // A state left behind by a cut-off run expires rather than showing forever.
  const until = conv.ai_draft_send_at ? Date.parse(conv.ai_draft_send_at) : 0
  if (until && until < now - 30000) return null
  if (status === 'pending' && (!conv.ai_draft || hidden === draftId)) return null
  if (status !== 'thinking' && status !== 'pending') return null

  const secs = Math.ceil(left / 1000)
  const R = 15, C = 2 * Math.PI * R
  const sending = status === 'pending' && left <= 0

  return (
    <div className="ailr" key={status + (draftId || '')}>
      <style>{`
        .ailr{display:flex;justify-content:flex-end;padding:6px 4px 10px;animation:ailrIn .35s cubic-bezier(.22,1,.36,1) both}
        @keyframes ailrIn{from{opacity:0;transform:translate3d(0,10px,0)}to{opacity:1;transform:none}}
        .ailr-think{display:inline-flex;align-items:center;gap:10px;padding:10px 16px 10px 10px;border-radius:18px 18px 6px 18px;background:#fff;border:1px solid #ffd6cc;box-shadow:0 10px 26px -16px rgba(226,85,63,.55);position:relative;overflow:hidden}
        .ailr-think::after{content:'';position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,rgba(255,122,107,.12) 50%,transparent 70%);animation:ailrShimmer 1.6s ease-in-out infinite}
        @keyframes ailrShimmer{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
        .ailr-orb{width:28px;height:28px;border-radius:50%;background:${GRAD};color:#fff;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;animation:ailrPulse 1.6s ease-in-out infinite}
        @keyframes ailrPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,122,107,.45)}50%{box-shadow:0 0 0 7px rgba(255,122,107,0)}}
        .ailr-dot{width:5px;height:5px;border-radius:50%;background:#e2553f;display:inline-block;animation:ailrDot 1.1s ease-in-out infinite}
        .ailr-dot:nth-child(2){animation-delay:.15s}.ailr-dot:nth-child(3){animation-delay:.3s}
        @keyframes ailrDot{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
        .ailr-card{width:min(460px,92%);border-radius:18px 18px 6px 18px;background:#fff;border:1.5px solid #ffc9bf;box-shadow:0 16px 36px -20px rgba(226,85,63,.6);overflow:hidden}
        .ailr-btn{border:none;border-radius:11px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:filter .15s ease,background .15s ease}
        .ailr-btn:disabled{opacity:.6;cursor:default}
        @media (prefers-reduced-motion:reduce){.ailr,.ailr-orb,.ailr-dot,.ailr-think::after{animation:none}}
      `}</style>

      {status === 'thinking' ? (
        <div className="ailr-think" role="status" aria-live="polite">
          <span className="ailr-orb"><Spark /></span>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: '#3f3f46' }}>Colvy AI is writing a reply</span>
          <span style={{ display: 'inline-flex', gap: 3, marginLeft: 2 }}><span className="ailr-dot" /><span className="ailr-dot" /><span className="ailr-dot" /></span>
        </div>
      ) : (
        <div className="ailr-card" role="status" aria-live="polite">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#fff7f5', borderBottom: '1px solid #ffe4dc' }}>
            <span style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
              <svg width="36" height="36" viewBox="0 0 36 36" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} aria-hidden>
                <circle cx="18" cy="18" r={R} fill="none" stroke="#ffe0d8" strokeWidth="3" />
                <circle cx="18" cy="18" r={R} fill="none" stroke="#ff7a6b" strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={C} strokeDashoffset={C * (1 - left / Math.max(1, total))} style={{ transition: 'stroke-dashoffset .1s linear' }} />
              </svg>
              <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#e2553f' }}>
                {sending ? <Spark size={13} /> : secs}
              </span>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#0d0d0d' }}>Colvy AI reply</p>
              <p style={{ margin: 0, fontSize: 12, color: '#71717a' }}>{sending ? 'Sending…' : `Sending in ${secs} second${secs === 1 ? '' : 's'}`}</p>
            </div>
          </div>
          <p style={{ margin: 0, padding: '12px 14px', fontSize: 14, lineHeight: 1.55, color: '#1f2937', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{conv.ai_draft}</p>
          {error && <p style={{ margin: '0 14px 8px', fontSize: 12.5, color: '#b42318' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, padding: '0 12px 12px', flexWrap: 'wrap' }}>
            <button type="button" className="ailr-btn" onClick={() => act('send')} disabled={!!busy || sending} style={{ background: GRAD, color: '#fff', flex: 1, minWidth: 110 }}>
              {busy === 'send' ? 'Sending…' : 'Send now'}
            </button>
            <button type="button" className="ailr-btn" onClick={() => act('edit')} disabled={!!busy || sending} style={{ background: '#fff', color: '#0d0d0d', border: '1px solid #e4e4e7' }}>
              {busy === 'edit' ? '…' : 'Edit'}
            </button>
            <button type="button" className="ailr-btn" onClick={() => act('cancel')} disabled={!!busy || sending} style={{ background: '#fff', color: '#b42318', border: '1px solid #fecdca' }}>
              {busy === 'cancel' ? '…' : 'Cancel'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
