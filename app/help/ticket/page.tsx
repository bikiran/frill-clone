'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function HelpTicketPage() {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const slug = () => {
    if (typeof window === 'undefined') return ''
    const h = window.location.hostname
    return h.endsWith('.colvy.com') ? h.replace('.colvy.com', '') : h
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/help/ticket', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug(), subject, message, email, name }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not submit your ticket')
      setDone(d.ticketNumber || 'submitted')
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--canvas)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px 72px' }}>
        <Link href="/help" style={{ fontSize: 14, color: 'var(--slate)', textDecoration: 'none' }}>← Back to Help Centre</Link>
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 20, padding: 28, marginTop: 16 }}>
          {done ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ width: 54, height: 54, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: '0 0 8px' }}>Ticket submitted</h1>
              <p style={{ fontSize: 14.5, color: 'var(--slate)', margin: '0 0 6px' }}>Thanks — we've received your request{done !== 'submitted' ? ` (${done})` : ''}.</p>
              <p style={{ fontSize: 13.5, color: 'var(--slate)', margin: '0 0 20px' }}>We typically reply within 1–2 business days.</p>
              <Link href="/help" style={{ display: 'inline-block', padding: '11px 22px', borderRadius: 10, background: 'var(--coral)', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>Back to Help Centre</Link>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: '0 0 6px' }}>Submit a ticket</h1>
              <p style={{ fontSize: 14.5, color: 'var(--slate)', margin: '0 0 22px' }}>Tell us what's going on and we'll get back to you by email.</p>
              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--slate)', marginBottom: 6 }}>Your name</label>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" style={inp} />
                  </div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--slate)', marginBottom: 6 }}>Your email *</label>
                    <input value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="you@example.com" style={inp} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--slate)', marginBottom: 6 }}>Subject *</label>
                  <input value={subject} onChange={e => setSubject(e.target.value)} required placeholder="Brief summary of your issue" style={inp} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--slate)', marginBottom: 6 }}>Message</label>
                  <textarea value={message} onChange={e => setMessage(e.target.value)} rows={6} placeholder="Describe your issue in detail…" style={{ ...inp, resize: 'vertical' }} />
                </div>
                {err && <p style={{ fontSize: 13.5, color: '#dc2626', margin: 0 }}>{err}</p>}
                <button type="submit" disabled={busy} style={{ alignSelf: 'flex-start', padding: '12px 26px', borderRadius: 11, background: 'var(--coral)', color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                  {busy ? 'Submitting…' : 'Submit ticket'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
