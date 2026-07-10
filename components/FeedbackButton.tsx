'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// A persistent feedback / bug-report button pinned to the right edge of the
// screen (like Coax). Clicking opens a panel with a session ID and a message
// box; submissions go to feedback_reports for the debugging team.
export default function FeedbackButton({ companyId }: { companyId?: string }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [sessionId, setSessionId] = useState('')

  useEffect(() => {
    // Stable per-browser session id
    try {
      let sid = localStorage.getItem('colvy-session-id')
      if (!sid) { sid = 'sess_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); localStorage.setItem('colvy-session-id', sid) }
      setSessionId(sid)
    } catch { setSessionId('sess_' + Math.random().toString(36).slice(2, 10)) }
  }, [])

  const submit = async () => {
    if (!message.trim()) return
    setSending(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await (supabase as any).from('feedback_reports').insert({
        company_id: companyId || null,
        session_id: sessionId,
        user_id: user?.id || null,
        user_email: user?.email || null,
        page_url: typeof window !== 'undefined' ? window.location.href : null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        message: message.trim(),
      })
      setSent(true); setMessage('')
      setTimeout(() => { setSent(false); setOpen(false) }, 2200)
    } catch (e) { console.error(e) } finally { setSending(false) }
  }

  return (
    <>
      {/* Tab button pinned to the right edge */}
      {!open && (
        <button onClick={() => setOpen(true)} title="Send feedback"
          style={{
            position: 'fixed', right: 0, top: '50%', transform: 'translateY(-50%) rotate(-90deg)', transformOrigin: 'right center',
            background: 'var(--coral)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px 8px 0 0',
            fontSize: 12.5, fontWeight: 700, cursor: 'pointer', zIndex: 9998, boxShadow: '0 2px 10px rgba(0,0,0,0.15)', letterSpacing: 0.3,
          }}>
          Feedback
        </button>
      )}

      {open && (
        <div style={{ position: 'fixed', right: 20, bottom: 20, width: 340, maxWidth: 'calc(100vw - 40px)', background: '#fff', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.22)', zIndex: 9999, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div style={{ background: 'var(--coral)', color: '#fff', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Send feedback</span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ padding: 18 }}>
            {sent ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Thanks! Your feedback has been sent to our team.</p>
              </div>
            ) : (
              <>
                <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
                  Found a bug or have a suggestion? Let us know and our team will take a look.
                </p>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} placeholder="Describe what happened…"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13.5, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 10 }}>
                  <span style={{ fontSize: 10.5, color: '#9ca3af', fontFamily: 'monospace' }}>ID: {sessionId}</span>
                  <button onClick={submit} disabled={sending || !message.trim()}
                    style={{ padding: '9px 20px', borderRadius: 9, background: message.trim() ? 'var(--coral)' : '#e5e5e5', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700, cursor: message.trim() ? 'pointer' : 'default' }}>
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
