'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  companyId: string
  senderName?: string
  onClose: () => void
  onStarted?: (conversationId: string) => void
}

// Coax-style "New Message" composer: pick a contact (searchable) or type a
// number, write a message, and send an outbound SMS which opens a conversation.
export default function ComposeMessage({ companyId, senderName, onClose, onStarted }: Props) {
  const [search, setSearch] = useState('')
  const [contacts, setContacts] = useState<any[]>([])
  const [picked, setPicked] = useState<any>(null)
  const [manualNumber, setManualNumber] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const timer = useRef<any>(null)

  const sb = supabase as any

  // Debounced contact search on name / phone / email.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (picked) return
    timer.current = setTimeout(async () => {
      const term = search.trim()
      let q = (sb as any).from('contacts').select('id, name, phone, email').eq('company_id', companyId)
      if (term) q = q.or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`)
      const { data } = await q.order('name', { ascending: true }).limit(30)
      setContacts((data || []).filter((c: any) => c.phone))
    }, 250)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [search, companyId, picked])

  const targetNumber = picked?.phone || manualNumber.trim()

  const send = async () => {
    setError('')
    if (!targetNumber) { setError('Choose a contact or enter a number.'); return }
    if (!body.trim()) { setError('Write a message first.'); return }
    setSending(true)
    try {
      const res = await fetch('/api/telnyx/sms/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, to: targetNumber, text: body.trim(), senderName }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error || 'Failed to send.'); setSending(false); return }
      if (data?.conversationId && onStarted) onStarted(data.conversationId)
      onClose()
    } catch (e: any) {
      setError(e.message || 'Failed to send.')
      setSending(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '8vh 16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 460, maxWidth: '95vw', background: '#fff', borderRadius: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>New message</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {/* To */}
          {picked ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, background: 'var(--peach)', marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 14 }}>{picked.name || picked.phone}</div>
                <div style={{ fontSize: 12, color: 'var(--slate)' }}>{picked.phone}</div>
              </div>
              <button onClick={() => setPicked(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--slate)', display: 'flex' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ) : (
            <>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>To</label>
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search contacts by name, phone, or email…"
                style={{ width: '100%', marginTop: 5, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box' }} />
              {/* Manual number entry */}
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--slate)' }}>…or enter a number directly:</div>
              <input value={manualNumber} onChange={e => setManualNumber(e.target.value)}
                placeholder="+61 4XX XXX XXX"
                style={{ width: '100%', marginTop: 5, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box' }} />
              {/* Results */}
              {search.trim() && contacts.length > 0 && (
                <div style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
                  {contacts.map(c => (
                    <button key={c.id} onClick={() => { setPicked(c); setManualNumber('') }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderBottom: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }}>
                      <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                        {(c.name || c.phone || '?').charAt(0).toUpperCase()}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || c.phone}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--slate)' }}>{c.phone}</div>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {search.trim() && contacts.length === 0 && (
                <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>No contacts with a phone number match.</p>
              )}
            </>
          )}

          {/* Message */}
          <label style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', display: 'block', marginTop: 16 }}>Message</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={4}
            placeholder="Type your message…"
            style={{ width: '100%', marginTop: 5, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }} />

          {error && <p style={{ color: '#dc2626', fontSize: 12.5, margin: '10px 0 0' }}>{error}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
            <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid var(--border)', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--slate)' }}>Cancel</button>
            <button onClick={send} disabled={sending || !targetNumber || !body.trim()}
              style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: (sending || !targetNumber || !body.trim()) ? '#f0a79d' : 'var(--coral)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: sending ? 'default' : 'pointer' }}>
              {sending ? 'Sending…' : 'Send message'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
