'use client'

import { useEffect, useState } from 'react'

const CORAL = '#ff6a4d'

/**
 * Contact-sales popup used by the pricing Enterprise strip and the compare pages.
 * Controlled via `open`/`onClose`; posts to /api/contact-sales (emails the sales
 * inbox). Theme-aware via `dark`. `plan`/`source` are passed through for context.
 */
export default function ContactSalesModal({
  open, onClose, dark = false, plan, source, title = 'Talk to sales',
}: {
  open: boolean; onClose: () => void; dark?: boolean; plan?: string; source?: string; title?: string
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [message, setMessage] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, onClose])

  // Reset back to the form a moment after closing, so a re-open is fresh.
  useEffect(() => { if (!open) { const t = setTimeout(() => { setState('idle'); setErr('') }, 250); return () => clearTimeout(t) } }, [open])

  if (!open) return null

  const bg = dark ? '#12131d' : '#ffffff'
  const text = dark ? '#f4f5fb' : '#0f1119'
  const muted = dark ? 'rgba(244,245,251,0.62)' : 'rgba(15,17,25,0.6)'
  const border = dark ? 'rgba(255,255,255,0.12)' : 'rgba(15,17,25,0.12)'
  const field = dark ? 'rgba(255,255,255,0.05)' : '#fff'
  const inputStyle: React.CSSProperties = { width: '100%', padding: '11px 13px', borderRadius: 11, border: `1px solid ${border}`, background: field, color: text, fontSize: 14.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
  const label: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, color: muted, margin: '0 0 5px' }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    if (!name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setErr('Please enter your name and a valid email.'); return }
    setState('sending')
    try {
      const res = await fetch('/api/contact-sales', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), company: company.trim(), message: message.trim(), plan, source }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error || 'Could not send — please email support@colvy.com.'); setState('error'); return }
      setState('done')
    } catch { setErr('Could not send — please email support@colvy.com.'); setState('error') }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(9,10,16,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'csFade .2s ease both' }}>
      <style>{`@keyframes csFade{from{opacity:0}to{opacity:1}} @keyframes csPop{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}} .cs-btn{transition:transform .18s,box-shadow .18s} .cs-btn:hover{transform:translateY(-1px)} .cs-field:focus{border-color:${CORAL} !important;box-shadow:0 0 0 3px ${CORAL}22}`}</style>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" style={{ width: '100%', maxWidth: 460, background: bg, borderRadius: 22, border: `1px solid ${border}`, boxShadow: '0 30px 70px rgba(0,0,0,0.35)', overflow: 'hidden', animation: 'csPop .28s cubic-bezier(0.16,1,0.3,1) both', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 22px 0' }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 900, color: text, letterSpacing: '-0.01em' }}>{state === 'done' ? 'Thanks — we’ll be in touch' : title}</h2>
          <button onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${border}`, background: field, color: text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {state === 'done' ? (
          <div style={{ padding: '10px 22px 26px' }}>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: '#dcfce7', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '10px 0 14px' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <p style={{ fontSize: 15, color: text, margin: '0 0 6px', fontWeight: 600 }}>Your enquiry is on its way to our team.</p>
            <p style={{ fontSize: 13.5, color: muted, margin: 0, lineHeight: 1.55 }}>We usually reply within one business day. In a hurry? Email <a href="mailto:support@colvy.com" style={{ color: CORAL, textDecoration: 'none', fontWeight: 600 }}>support@colvy.com</a>.</p>
            <button onClick={onClose} className="cs-btn" style={{ marginTop: 20, width: '100%', padding: '12px 0', borderRadius: 12, background: CORAL, color: '#fff', fontWeight: 800, fontSize: 15, border: 'none', cursor: 'pointer' }}>Done</button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ padding: '8px 22px 24px' }}>
            <p style={{ fontSize: 13.5, color: muted, margin: '4px 0 18px', lineHeight: 1.5 }}>Tell us a little about your team{plan ? <> — you’re looking at <strong style={{ color: text }}>{plan}</strong></> : ''}. We’ll get back within one business day.</p>
            {err && <div style={{ marginBottom: 14, padding: '10px 13px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', fontSize: 13 }}>{err}</div>}
            <div style={{ marginBottom: 13 }}><label style={label}>Name</label><input className="cs-field" style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Your name" autoFocus /></div>
            <div style={{ marginBottom: 13 }}><label style={label}>Work email</label><input className="cs-field" style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" /></div>
            <div style={{ marginBottom: 13 }}><label style={label}>Company <span style={{ fontWeight: 500 }}>(optional)</span></label><input className="cs-field" style={inputStyle} value={company} onChange={e => setCompany(e.target.value)} placeholder="Company name" /></div>
            <div style={{ marginBottom: 18 }}><label style={label}>What do you need? <span style={{ fontWeight: 500 }}>(optional)</span></label><textarea className="cs-field" style={{ ...inputStyle, minHeight: 84, resize: 'vertical' }} value={message} onChange={e => setMessage(e.target.value)} placeholder="Team size, channels, timeline…" /></div>
            <button type="submit" disabled={state === 'sending'} className="cs-btn" style={{ width: '100%', padding: '13px 0', borderRadius: 12, background: CORAL, color: '#fff', fontWeight: 800, fontSize: 15, border: 'none', cursor: state === 'sending' ? 'default' : 'pointer', opacity: state === 'sending' ? 0.7 : 1, boxShadow: `0 10px 24px ${CORAL}44` }}>{state === 'sending' ? 'Sending…' : 'Send enquiry'}</button>
            <p style={{ fontSize: 11.5, color: muted, textAlign: 'center', margin: '12px 0 0' }}>Or email <a href="mailto:support@colvy.com" style={{ color: CORAL, textDecoration: 'none', fontWeight: 600 }}>support@colvy.com</a></p>
          </form>
        )}
      </div>
    </div>
  )
}
