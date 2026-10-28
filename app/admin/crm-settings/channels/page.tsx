'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import { useCompanyUser, S } from '../_shared'
import BrandLogo, { type BrandKey } from '@/components/BrandLogo'

// Each channel points at the page that actually connects it. Channels that
// aren't built yet say so honestly instead of offering a button that does
// nothing (which is exactly what this page used to do).
type Channel = { id: string; name: string; brand: BrandKey; group: string; href: string; ready: boolean; note: string }
const CHANNELS: Channel[] = [
  { id: 'web_form', name: 'Live chat widget', brand: 'colvy', group: 'chat',
    href: '/admin/crm-settings/chat-widget', ready: true,
    note: 'Chat with visitors on your website.' },
  { id: 'whatsapp', name: 'WhatsApp', brand: 'whatsapp', group: 'chat',
    href: '/admin/crm-settings/channels/whatsapp', ready: true,
    note: 'WhatsApp Business messages in your inbox. Colvy registers your number with Meta.' },
  { id: 'instagram', name: 'Instagram', brand: 'instagram', group: 'chat',
    href: '/admin/crm-settings/channels/meta', ready: true,
    note: 'DMs and comments from your Instagram accounts.' },
  { id: 'facebook', name: 'Messenger', brand: 'messenger', group: 'chat',
    href: '/admin/crm-settings/channels/meta', ready: true,
    note: 'Messages to your Facebook Pages.' },
  { id: 'sms', name: 'SMS', brand: 'sms', group: 'phone',
    href: '/admin/crm-settings/channels/calls', ready: true,
    note: 'Two-way texting from a business number.' },
  { id: 'phone', name: 'Calls', brand: 'calls', group: 'phone',
    href: '/admin/crm-settings/channels/calls', ready: true,
    note: 'Answer and make calls in your browser.' },
  { id: 'email', name: 'Email', brand: 'gmail', group: 'email',
    href: '/admin/crm-settings/channels/email', ready: true,
    note: 'Connect Gmail or any mailbox; replies thread back.' },
  { id: 'sending_domain', name: 'Email sending domain', brand: 'domain', group: 'email',
    href: '/admin/crm-settings/channels/sending-domain', ready: true,
    note: 'Send campaign email from your own domain.' },
  { id: 'google', name: 'Google reviews', brand: 'google', group: 'leads',
    href: '/admin/crm-settings/channels/google-reviews', ready: true,
    note: 'See and reply to your Google reviews.' },
  { id: 'realestate', name: 'realestate.com.au', brand: 'realestate', group: 'leads',
    href: '/admin/crm-settings/channels/realestate', ready: true,
    note: 'Listing enquiries land in your inbox.' },
  { id: 'webform', name: 'Web form', brand: 'webform', group: 'leads',
    href: '/admin/crm-settings/channels/web-form', ready: true,
    note: 'Point your website forms at a per-location address.' },
]
const GROUPS: { key: string; title: string; sub: string }[] = [
  { key: 'chat', title: 'Chat and social', sub: 'Your website chat and the apps your customers message you on.' },
  { key: 'phone', title: 'Phone and text', sub: 'A business number for calls and SMS.' },
  { key: 'email', title: 'Email', sub: 'Your inbox, and the domain your campaigns send from.' },
  { key: 'leads', title: 'Reviews and leads', sub: 'Reviews, listing enquiries and website forms.' },
]

export default function ChannelsSettings() {
  const router = useRouter()
  const { companyId, loading } = useCompanyUser()
  const [connected, setConnected] = useState<Record<string, boolean>>({})
  // WhatsApp goes request → pending → connected, set by Colvy (/api/whatsapp).
  const [waStatus, setWaStatus] = useState<string>('not_requested')

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const status: Record<string, boolean> = {}
      // Each channel's check is independent — ask them all at once.
      const q = (p: any) => Promise.resolve(p).then((r: any) => r?.data ?? null).catch(() => null)
      const [telnyx, twilio, email, google, realestate, meta, sending] = await Promise.all([
        q((supabase as any).from('telnyx_integrations').select('api_key, phone_number').eq('company_id', companyId).maybeSingle()),
        q((supabase as any).from('twilio_integrations').select('account_sid, phone_number').eq('company_id', companyId).maybeSingle()),
        q((supabase as any).from('email_channels').select('id, provider').eq('company_id', companyId).eq('is_active', true).limit(50)),
        q((supabase as any).from('google_business_accounts').select('access_token').eq('company_id', companyId).maybeSingle()),
        q((supabase as any).from('realestate_integrations').select('is_active').eq('company_id', companyId).maybeSingle()),
        q(supabase.from('meta_channels').select('platform').eq('company_id', companyId).eq('is_active', true).limit(50)),
        // Staff may read their own sending domains (V396); null before it runs.
        q((supabase as any).from('email_sending_domains').select('status').eq('company_id', companyId).eq('status', 'verified').limit(1)),
      ])

      // SMS / Calls — a number on Twilio (below), or a legacy Telnyx integration.
      if (telnyx?.api_key && telnyx?.phone_number) { status.sms = true; status.phone = true }
      // Twilio — a second SMS/MMS + calling provider (BYO account).
      status.twilio = !!(twilio?.account_sid && twilio?.phone_number)
      if (status.twilio) { status.sms = true; status.phone = true }
      // Email — an active mailbox. Web-form addresses live in the same table
      // but are their own channel.
      const mail = (email || []) as { provider?: string | null }[]
      status.email = mail.some(r => r.provider !== 'webform')
      status.webform = mail.some(r => r.provider === 'webform')
      // Instagram / Messenger — an active Page or Instagram account (a Page
      // connect brings its linked Instagram along as its own row).
      const social = (meta || []) as { platform?: string }[]
      status.instagram = social.some(r => r.platform === 'instagram')
      status.facebook = social.some(r => r.platform === 'facebook')
      // Google Reviews — an OAuth token stored.
      status.google = !!google?.access_token
      // RealEstate — an active realestate.com.au integration.
      status.realestate = !!realestate?.is_active

      // Email sending domain — a verified domain of the business's own.
      status.sending_domain = ((sending || []) as any[]).length > 0

      // The chat widget is always available.
      status.web_form = true

      setConnected(status)
    })()
    authFetch(`/api/whatsapp?companyId=${encodeURIComponent(companyId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const s = d?.sender?.status || 'not_requested'
        setWaStatus(s)
        if (s === 'approved') setConnected(c => ({ ...c, whatsapp: true }))
      })
      .catch(() => {})
  }, [companyId])

  if (loading) return <div style={{ color: 'var(--slate)' }}>Loading…</div>

  return (
    <div className="chn">
      <style>{CHN_CSS}</style>
      <h1 style={S.h1}>Channels</h1>
      <p style={S.sub}>Connect the places your customers reach you. Messages from every connected channel land in one inbox.</p>

      {GROUPS.map(g => (
        <section key={g.key} className="chn-group">
          <div className="chn-gh"><h2>{g.title}</h2><p>{g.sub}</p></div>
          <div className="chn-grid">
            {CHANNELS.filter(ch => ch.group === g.key).map(ch => {
              const isConnected = !!connected[ch.id]
              // WhatsApp's own states: Request access / Pending approval / Connected.
              const wa = ch.id === 'whatsapp' ? ({
                not_requested: { label: 'Not connected', tone: '', cta: 'Request access', primary: true },
                pending: { label: 'Pending approval', tone: 'warn', cta: 'View request', primary: false },
                approved: { label: 'Connected', tone: 'on', cta: 'Manage', primary: false },
                rejected: { label: 'Not approved', tone: 'bad', cta: 'Details', primary: false },
                disabled: { label: 'Switched off', tone: '', cta: 'Details', primary: false },
              } as Record<string, { label: string; tone: string; cta: string; primary: boolean }>)[waStatus] || null : null
              const label = wa ? wa.label : isConnected ? 'Connected' : ch.ready ? 'Not connected' : 'Coming soon'
              const tone = wa ? wa.tone : isConnected ? 'on' : ''
              const primary = wa ? wa.primary : !isConnected
              return (
                <div key={ch.id} className={`chn-card${tone === 'on' ? ' on' : ''}`} onClick={() => ch.ready && router.push(ch.href)} role="link" tabIndex={-1}>
                  <div className="chn-top">
                    <BrandLogo brand={ch.brand} size={46} />
                    <span className={`chn-state ${tone}`}><i />{label}</span>
                  </div>
                  <b className="chn-name">{ch.name}</b>
                  <p className="chn-note">{ch.note}</p>
                  {ch.ready ? (
                    <button type="button" className={`chn-btn${primary ? ' primary' : ''}`} onClick={e => { e.stopPropagation(); router.push(ch.href) }}>
                      {wa ? wa.cta : isConnected ? 'Manage' : 'Connect'}
                    </button>
                  ) : (
                    <button type="button" className="chn-btn" disabled title="Not available yet">Coming soon</button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

const CHN_CSS = `
.chn{max-width:980px}
.chn button::before{display:none!important}
.chn-group{margin-top:26px}
.chn-gh h2{margin:0;font-size:16px;font-weight:700;color:#111;letter-spacing:-.01em}
.chn-gh p{margin:3px 0 12px;font-size:13.5px;color:#71717a}
.chn-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(214px,1fr));gap:12px}
.chn-card{display:flex;flex-direction:column;align-items:flex-start;padding:16px;border-radius:20px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04);cursor:pointer;transition:box-shadow .2s,transform .25s cubic-bezier(.22,1,.36,1)}
.chn-card:hover{box-shadow:0 0 0 1px rgba(0,0,0,.08),0 12px 30px -14px rgba(16,24,40,.25);transform:translateY(-2px)}
.chn-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;width:100%;margin-bottom:14px}
.chn-state{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:#f4f4f5;font-size:11.5px;font-weight:600;color:#71717a;white-space:nowrap}
.chn-state i{width:6px;height:6px;border-radius:50%;background:#d4d4d8}
.chn-state.on{background:#dcfce7;color:#15803d}.chn-state.on i{background:#22c55e}
.chn-state.warn{background:#fef3c7;color:#b45309}.chn-state.warn i{background:#f59e0b}
.chn-state.bad{background:#fee2e2;color:#b91c1c}.chn-state.bad i{background:#ef4444}
.chn-name{font-size:15.5px;font-weight:700;color:#111;letter-spacing:-.01em}
.chn-note{flex:1;margin:4px 0 14px;font-size:13px;line-height:1.5;color:#71717a}
.chn-btn{padding:8px 16px;border-radius:999px;border:0;background:#fff;color:#18181b;font:inherit;font-size:13px;font-weight:650;cursor:pointer;box-shadow:0 0 0 1.5px #e4e4e7;transition:background .15s}
.chn-btn:hover{background:#f7f7f8}
.chn-btn.primary{background:var(--coral);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 1px 2px rgba(16,24,40,.12)}
.chn-btn.primary:hover{filter:brightness(.96);background:var(--coral)}
.chn-btn:disabled{background:#f4f4f5;color:#a1a1aa;cursor:not-allowed;box-shadow:none}
.chn-btn:focus-visible{outline:2px solid var(--coral);outline-offset:2px}
`
