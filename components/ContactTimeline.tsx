'use client'

import { useState, useEffect } from 'react'

// Shows one person's entire history across every channel — live chat, SMS,
// email, Messenger, Instagram — in a single time-ordered stream, with each
// message tagged by the channel it came in on.

const CH: Record<string, { label: string; color: string; bg: string }> = {
  chat:      { label: 'Live chat', color: '#15803d', bg: '#dcfce7' },
  widget:    { label: 'Live chat', color: '#15803d', bg: '#dcfce7' },
  sms:       { label: 'SMS',       color: '#b45309', bg: '#fef3c7' },
  email:     { label: 'Email',     color: '#4338ca', bg: '#e0e7ff' },
  facebook:  { label: 'Messenger', color: '#1d4ed8', bg: '#dbeafe' },
  messenger: { label: 'Messenger', color: '#1d4ed8', bg: '#dbeafe' },
  instagram: { label: 'Instagram', color: '#be185d', bg: '#fce7f3' },
  whatsapp:  { label: 'WhatsApp',  color: '#15803d', bg: '#dcfce7' },
}

export default function ContactTimeline({ contactId, contactName, onClose }: { contactId: string; contactName?: string; onClose: () => void }) {
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [linkedCount, setLinkedCount] = useState(0)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(`/api/contacts/timeline?contactId=${contactId}`)
        const d = await res.json()
        setMessages(d.messages || [])
        setLinkedCount(d.linkedCount || 0)
      } catch {} finally { setLoading(false) }
    })()
  }, [contactId])

  const fmt = (iso: string) => new Date(iso).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' })

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 420, display: 'flex', justifyContent: 'flex-end' }}>
      <style>{`@keyframes tlIn { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 460, maxWidth: '96vw', height: '100%', background: '#fff', overflowY: 'auto', animation: 'tlIn 0.18s ease-out', boxShadow: '-12px 0 40px rgba(0,0,0,0.16)' }}>
        <div style={{ position: 'sticky', top: 0, background: '#fff', borderBottom: '1px solid var(--border)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 2 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>All conversations</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--slate)' }}>
              {contactName || 'This contact'}{linkedCount > 1 ? ` · ${linkedCount} linked channels` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--slate)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={{ padding: '14px 20px' }}>
          {loading ? (
            <p style={{ fontSize: 13, color: 'var(--slate)' }}>Loading…</p>
          ) : messages.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--slate)' }}>No messages yet.</p>
          ) : messages.map((m, i) => {
            const isAgent = m.sender_type === 'agent'
            const isSystem = m.sender_type === 'system'
            const ch = CH[m.channel] || { label: m.channel, color: 'var(--slate)', bg: 'var(--canvas)' }
            const prevCh = i > 0 ? (messages[i - 1].channel) : null
            const showChannelDivider = m.channel !== prevCh

            if (isSystem) {
              return (
                <div key={m.id} style={{ textAlign: 'center', margin: '10px 0' }}>
                  <span style={{ fontSize: 11, color: 'var(--slate)', background: 'var(--canvas)', padding: '3px 10px', borderRadius: 20 }}>{m.content}</span>
                </div>
              )
            }

            return (
              <div key={m.id}>
                {showChannelDivider && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 8px' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, padding: '3px 9px', borderRadius: 20, color: ch.color, background: ch.bg }}>{ch.label}</span>
                    <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: isAgent ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                  <div style={{ maxWidth: '80%' }}>
                    <div style={{ padding: '9px 13px', borderRadius: 12, fontSize: 13, lineHeight: 1.5, background: isAgent ? 'var(--coral)' : 'var(--canvas)', color: isAgent ? '#fff' : 'var(--ink)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {m.content}
                    </div>
                    <p style={{ margin: '2px 4px 0', fontSize: 10, color: '#9ca3af', textAlign: isAgent ? 'right' : 'left' }}>
                      {m.sender_name ? `${m.sender_name} · ` : ''}{fmt(m.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
