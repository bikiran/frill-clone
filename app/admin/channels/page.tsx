'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// One place to connect every channel. Cards show a REAL connection state —
// nothing is marked connected unless it actually is.
export default function ChannelsPage() {
  const router = useRouter()
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<Record<string, boolean>>({})

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      let cid: string | null = null
      const { data: owned } = await (supabase as any).from('companies').select('id').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1)
      cid = owned?.[0]?.id || null
      if (!cid) {
        const { data: tm } = await (supabase as any).from('team_members').select('company_id').eq('user_id', user.id).limit(1)
        cid = tm?.[0]?.company_id || null
      }
      setCompanyId(cid)
      if (cid) await loadStatus(cid)
      setLoading(false)
    })()
  }, [])

  const loadStatus = async (cid: string) => {
    const s: Record<string, boolean> = {}
    // SMS / Calls — a Telnyx integration with a number.
    try {
      const { data } = await (supabase as any).from('telnyx_integrations')
        .select('api_key, phone_number').eq('company_id', cid).maybeSingle()
      s.sms = !!(data?.api_key && data?.phone_number)
      s.calls = s.sms
    } catch {}
    // Email
    try {
      const { data } = await (supabase as any).from('email_channels')
        .select('id').eq('company_id', cid).eq('is_active', true).limit(1)
      s.email = !!data?.length
    } catch {}
    // Google Reviews
    try {
      const { data } = await (supabase as any).from('google_business_accounts')
        .select('access_token').eq('company_id', cid).maybeSingle()
      s.google_reviews = !!data?.access_token
    } catch {}
    // Chat widget is always available.
    s.widget = true
    setStatus(s)
  }

  const CHANNELS = [
    { key: 'widget', name: 'Live Chat Widget', letter: 'C', color: '#ff7a6b', href: '/admin/settings#general', ready: true,
      note: 'Embedded on your website.' },
    { key: 'email', name: 'Email', letter: 'M', color: '#ea4335', href: '/admin/integrations/email', ready: true,
      note: 'Customers email you; replies thread back.' },
    { key: 'sms', name: 'SMS', letter: 'S', color: '#22c55e', href: '/admin/integrations/telnyx', ready: true,
      note: 'Two-way texting with a business number.' },
    { key: 'calls', name: 'Calls', letter: 'P', color: '#8b5cf6', href: '/admin/integrations/telnyx', ready: true,
      note: 'Inbound and outbound calling.' },
    { key: 'google_reviews', name: 'Google Reviews', letter: 'G', color: '#4285f4', href: '/admin/integrations/google-reviews', ready: true,
      note: 'See and reply to your reviews.' },
    { key: 'whatsapp', name: 'WhatsApp', letter: 'W', color: '#25d366', href: '', ready: false,
      note: 'Requires a Meta app + WhatsApp Business account.' },
    { key: 'instagram', name: 'Instagram', letter: 'IG', color: '#e1306c', href: '', ready: false,
      note: 'Requires a Meta app and App Review.' },
    { key: 'facebook', name: 'Messenger', letter: 'f', color: '#1877f2', href: '', ready: false,
      note: 'Requires a Meta app and App Review.' },
  ]

  if (loading) return <div style={{ padding: 28 }}>Loading…</div>

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)', margin: '0 0 6px' }}>Channels</h1>
      <p style={{ fontSize: 14.5, color: 'var(--slate)', margin: '0 0 26px' }}>
        Connect the places your customers reach you. Messages from every connected channel land in one inbox.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {CHANNELS.map(c => {
          const connected = !!status[c.key]
          return (
            <div key={c.key} style={{ border: '1px solid var(--border)', borderRadius: 16, padding: 18, background: '#fff', opacity: c.ready ? 1 : 0.72 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: c.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                  {c.letter}
                </div>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{c.name}</span>
              </div>

              <p style={{ fontSize: 12.5, color: 'var(--slate)', margin: '0 0 14px', lineHeight: 1.5, minHeight: 34 }}>{c.note}</p>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: connected ? '#15803d' : 'var(--slate)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? '#22c55e' : '#d1d5db', flexShrink: 0 }} />
                  {connected ? 'Connected' : c.ready ? 'Not connected' : 'Coming soon'}
                </span>

                {c.ready ? (
                  <button type="button" onClick={() => router.push(c.href)}
                    style={{ padding: '8px 16px', borderRadius: 9, border: connected ? '1px solid var(--border)' : 'none', background: connected ? '#fff' : 'var(--coral)', color: connected ? 'var(--ink)' : '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    {connected ? 'Manage' : 'Connect'}
                  </button>
                ) : (
                  <button type="button" disabled title="Not available yet"
                    style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--canvas)', color: '#b6bac0', fontSize: 13, fontWeight: 700, cursor: 'not-allowed' }}>
                    Connect
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 24, padding: 16, borderRadius: 12, background: 'var(--canvas)', border: '1px solid var(--border)' }}>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.6 }}>
          <strong>Instagram, Messenger and WhatsApp</strong> are marked <em>Coming soon</em> because they aren&rsquo;t built yet — they need a Meta Developer app, Business Verification, and (for Instagram/Messenger) Meta App Review, which takes time to approve. We&rsquo;d rather show you an honest status than a Connect button that does nothing.
        </p>
      </div>
    </div>
  )
}
