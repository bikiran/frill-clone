'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useCompanyUser, S } from '../_shared'

const CHANNELS = [
  { id: 'instagram', name: 'Instagram', color: '#E4405F', icon: 'IG' },
  { id: 'facebook', name: 'Facebook', color: '#1877F2', icon: 'f' },
  { id: 'gmail', name: 'Gmail', color: '#EA4335', icon: 'M' },
  { id: 'microsoft', name: 'Outlook', color: '#0078D4', icon: 'O' },
  { id: 'whatsapp', name: 'WhatsApp', color: '#25D366', icon: 'W' },
  { id: 'sms', name: 'SMS', color: '#00c08b', icon: '✉' },
  { id: 'phone', name: 'Calls', color: '#6366F1', icon: '📞' },
  { id: 'web_form', name: 'Web Form', color: '#F59E0B', icon: '▤' },
  { id: 'google', name: 'Google Reviews', color: '#4285F4', icon: 'G' },
]

export default function ChannelsSettings() {
  const { companyId, loading } = useCompanyUser()
  const [connected, setConnected] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const status: Record<string, boolean> = {}
      // SMS/Calls are connected if Telnyx is configured
      const { data: telnyx } = await (supabase as any).from('telnyx_integrations').select('is_active, phone_number').eq('company_id', companyId).maybeSingle()
      if (telnyx?.phone_number) { status.sms = true; status.phone = true }
      // Web form is always available
      status.web_form = true
      setConnected(status)
    })()
  }, [companyId])

  if (loading) return <div style={{ color: 'var(--slate)' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={S.h1}>Channels</h1>
      <p style={S.sub}>Connect the places your customers reach you. Messages from every connected channel land in one inbox.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {CHANNELS.map(ch => {
          const isConnected = connected[ch.id]
          return (
            <div key={ch.id} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 18, background: '#fff', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: ch.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800 }}>{ch.icon}</div>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{ch.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: isConnected ? '#059669' : 'var(--slate)' }}>
                  {isConnected ? '● Connected' : '○ Not Connected'}
                </span>
                <button style={{ padding: '6px 14px', borderRadius: 8, border: isConnected ? '1px solid var(--border)' : 'none', background: isConnected ? '#fff' : 'var(--coral)', color: isConnected ? 'var(--slate)' : '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  {isConnected ? 'Manage' : 'Connect'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
