'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useCompanyUser, S } from '../_shared'

// Each channel points at the page that actually connects it. Channels that
// aren't built yet say so honestly instead of offering a button that does
// nothing (which is exactly what this page used to do).
const CHANNELS = [
  { id: 'web_form',  name: 'Live Chat Widget', color: '#F59E0B', icon: 'C',
    href: '/admin/settings#general', ready: true,
    note: 'Embedded on your website.' },
  { id: 'email',     name: 'Email',            color: '#EA4335', icon: 'M',
    href: '/admin/integrations/email', ready: true,
    note: 'Customers email you; replies thread back.' },
  { id: 'sms',       name: 'SMS',              color: '#00c08b', icon: '✉',
    href: '/admin/integrations/telnyx', ready: true,
    note: 'Two-way texting with a business number.' },
  { id: 'phone',     name: 'Calls',            color: '#6366F1', icon: '☎',
    href: '/admin/integrations/telnyx', ready: true,
    note: 'Inbound and outbound calling.' },
  { id: 'google',    name: 'Google Reviews',   color: '#4285F4', icon: 'G',
    href: '/admin/integrations/google-reviews', ready: true,
    note: 'See and reply to your reviews.' },
  { id: 'whatsapp',  name: 'WhatsApp',         color: '#25D366', icon: 'W',
    href: '', ready: false,
    note: 'Needs a Meta app + WhatsApp Business account.' },
  { id: 'instagram', name: 'Instagram',        color: '#E4405F', icon: 'IG',
    href: '', ready: false,
    note: 'Needs a Meta app and App Review.' },
  { id: 'facebook',  name: 'Messenger',        color: '#1877F2', icon: 'f',
    href: '', ready: false,
    note: 'Needs a Meta app and App Review.' },
]

export default function ChannelsSettings() {
  const router = useRouter()
  const { companyId, loading } = useCompanyUser()
  const [connected, setConnected] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const status: Record<string, boolean> = {}

      // SMS / Calls — a Telnyx integration with a number.
      try {
        const { data: telnyx } = await (supabase as any).from('telnyx_integrations')
          .select('api_key, phone_number').eq('company_id', companyId).maybeSingle()
        if (telnyx?.api_key && telnyx?.phone_number) { status.sms = true; status.phone = true }
      } catch {}

      // Email — an active inbound address.
      try {
        const { data } = await (supabase as any).from('email_channels')
          .select('id').eq('company_id', companyId).eq('is_active', true).limit(1)
        status.email = !!data?.length
      } catch {}

      // Google Reviews — an OAuth token stored.
      try {
        const { data } = await (supabase as any).from('google_business_accounts')
          .select('access_token').eq('company_id', companyId).maybeSingle()
        status.google = !!data?.access_token
      } catch {}

      // The chat widget is always available.
      status.web_form = true

      setConnected(status)
    })()
  }, [companyId])

  if (loading) return <div style={{ color: 'var(--slate)' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={S.h1}>Channels</h1>
      <p style={S.sub}>Connect the places your customers reach you. Messages from every connected channel land in one inbox.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16, marginTop: 22 }}>
        {CHANNELS.map(ch => {
          const isConnected = !!connected[ch.id]
          return (
            <div key={ch.id} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 18, background: '#fff', opacity: ch.ready ? 1 : 0.72 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: ch.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                  {ch.icon}
                </div>
                <span style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--ink)' }}>{ch.name}</span>
              </div>

              <p style={{ fontSize: 12.5, color: 'var(--slate)', margin: '0 0 14px', lineHeight: 1.5, minHeight: 34 }}>{ch.note}</p>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: isConnected ? '#059669' : 'var(--slate)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: isConnected ? '#22c55e' : '#d1d5db', flexShrink: 0 }} />
                  {isConnected ? 'Connected' : ch.ready ? 'Not connected' : 'Coming soon'}
                </span>

                {ch.ready ? (
                  <button
                    onClick={() => router.push(ch.href)}
                    style={{ padding: '7px 15px', borderRadius: 8, border: isConnected ? '1px solid var(--border)' : 'none', background: isConnected ? '#fff' : 'var(--coral)', color: isConnected ? 'var(--ink)' : '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                    {isConnected ? 'Manage' : 'Connect'}
                  </button>
                ) : (
                  <button disabled title="Not available yet"
                    style={{ padding: '7px 15px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--canvas)', color: '#b6bac0', fontSize: 12.5, fontWeight: 700, cursor: 'not-allowed' }}>
                    Connect
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 22, padding: 16, borderRadius: 12, background: 'var(--canvas)', border: '1px solid var(--border)' }}>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.6 }}>
          <strong>Instagram, Messenger and WhatsApp</strong> aren&rsquo;t built yet. They need a Meta Developer app, Business Verification, and (for Instagram/Messenger) Meta App Review, which takes time to approve. We&rsquo;d rather show an honest status than a button that does nothing.
        </p>
      </div>
    </div>
  )
}
