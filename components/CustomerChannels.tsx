'use client'

import { useEffect, useState } from 'react'

// A compact "Also reachable on …" chip row showing the OTHER channels a customer
// exists on (resolved across their linked identities), so an agent on an email
// or SMS thread can see they also talk on Instagram/Messenger/etc.

const CH: Record<string, { label: string; color: string; bg: string }> = {
  instagram: { label: 'Instagram', color: '#be185d', bg: '#fce7f3' },
  facebook:  { label: 'Messenger', color: '#1d4ed8', bg: '#dbeafe' },
  whatsapp:  { label: 'WhatsApp',  color: '#15803d', bg: '#dcfce7' },
  sms:       { label: 'SMS',       color: '#b45309', bg: '#fef3c7' },
  email:     { label: 'Email',     color: '#4338ca', bg: '#e0e7ff' },
  chat:      { label: 'Live chat', color: '#15803d', bg: '#dcfce7' },
}

const norm = (ch?: string | null) => {
  const c = String(ch || '').toLowerCase()
  if (c === 'messenger') return 'facebook'
  if (c === 'widget' || c === 'live_chat') return 'chat'
  return c
}

export default function CustomerChannels({ contactId, currentChannel }: { contactId?: string | null; currentChannel?: string | null }) {
  const [channels, setChannels] = useState<string[]>([])

  useEffect(() => {
    if (!contactId) { setChannels([]); return }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/contacts/channels?contactId=${contactId}`)
        const d = await res.json()
        if (!cancelled) setChannels(Array.isArray(d.channels) ? d.channels : [])
      } catch { if (!cancelled) setChannels([]) }
    })()
    return () => { cancelled = true }
  }, [contactId])

  const cur = norm(currentChannel)
  const others = channels.filter(c => c !== cur && CH[c])
  if (others.length === 0) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '0 0 14px' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate)' }}>Also on</span>
      {others.map(c => {
        const t = CH[c]
        return <span key={c} style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 20, color: t.color, background: t.bg }}>{t.label}</span>
      })}
    </div>
  )
}
