'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function EmailChannelPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [channel, setChannel] = useState<any>({ inbound_address: '', from_address: '', from_name: '', is_active: true })

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      // Resolve the company: owned first, then team membership.
      let cid: string | null = null
      const { data: owned } = await (supabase as any).from('companies').select('id').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1)
      cid = owned?.[0]?.id || null
      if (!cid) {
        const { data: tm } = await (supabase as any).from('team_members').select('company_id').eq('user_id', user.id).limit(1)
        cid = tm?.[0]?.company_id || null
      }
      setCompanyId(cid)
      if (cid) {
        const { data } = await (supabase as any).from('email_channels').select('*').eq('company_id', cid).limit(1)
        if (data?.[0]) setChannel(data[0])
      }
      setLoading(false)
    })()
  }, [])

  const save = async () => {
    if (!companyId || !channel.inbound_address) return
    setSaving(true); setMsg('')
    try {
      const payload = {
        company_id: companyId,
        inbound_address: channel.inbound_address.trim().toLowerCase(),
        from_address: (channel.from_address || '').trim().toLowerCase() || null,
        from_name: channel.from_name || null,
        is_active: channel.is_active !== false,
      }
      if (channel.id) {
        await (supabase as any).from('email_channels').update(payload).eq('id', channel.id)
      } else {
        const { data } = await (supabase as any).from('email_channels').insert(payload).select().maybeSingle()
        if (data) setChannel(data)
      }
      setMsg('Saved. Point your email provider’s inbound webhook at the URL below.')
    } catch (e: any) {
      setMsg('Could not save: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const webhookUrl = 'https://colvy.com/api/webhooks/email'
  const L: any = { display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }
  const I: any = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box', marginBottom: 16 }

  if (loading) return <div style={{ padding: 28 }}>Loading…</div>

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 24px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: '0 0 4px' }}>Email</h1>
      <p style={{ fontSize: 14, color: 'var(--slate)', margin: '0 0 24px' }}>
        Let customers email you and have it land in your inbox as a conversation. Replies you send from Colvy go back to them by email, in the same thread.
      </p>

      <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 20, background: '#fff', marginBottom: 20 }}>
        <label style={L}>Inbound address</label>
        <input style={I} value={channel.inbound_address || ''} placeholder="support@yourbusiness.com.au"
          onChange={e => setChannel({ ...channel, inbound_address: e.target.value })} />

        <label style={L}>Reply-from address <span style={{ fontWeight: 400, color: 'var(--slate)' }}>(must be on a domain verified in Resend)</span></label>
        <input style={I} value={channel.from_address || ''} placeholder="support@updates.colvy.com"
          onChange={e => setChannel({ ...channel, from_address: e.target.value })} />

        <label style={L}>Reply-from name</label>
        <input style={I} value={channel.from_name || ''} placeholder="Roxy Aquarium Support"
          onChange={e => setChannel({ ...channel, from_name: e.target.value })} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <input type="checkbox" checked={channel.is_active !== false}
            onChange={e => setChannel({ ...channel, is_active: e.target.checked })}
            style={{ width: 18, height: 18, accentColor: 'var(--coral)' }} />
          <span style={{ fontSize: 13.5, color: 'var(--ink)' }}>Active</span>
        </label>

        <button onClick={save} disabled={saving || !channel.inbound_address}
          style={{ padding: '10px 20px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {msg && <p style={{ fontSize: 13, color: 'var(--slate)', margin: '12px 0 0' }}>{msg}</p>}
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 20, background: 'var(--canvas)' }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', margin: '0 0 8px' }}>Connect your email provider</p>
        <p style={{ fontSize: 13, color: 'var(--slate)', margin: '0 0 12px', lineHeight: 1.6 }}>
          Colvy receives email through an inbound webhook. In your provider (Resend, Postmark, Mailgun, SendGrid, or Cloudflare Email Routing), set the inbound/parse webhook for <strong>{channel.inbound_address || 'your address'}</strong> to:
        </p>
        <code style={{ display: 'block', padding: '10px 12px', borderRadius: 8, background: '#fff', border: '1px solid var(--border)', fontSize: 13, wordBreak: 'break-all', marginBottom: 12 }}>{webhookUrl}</code>
        <p style={{ fontSize: 12.5, color: 'var(--slate)', margin: 0, lineHeight: 1.6 }}>
          Colvy matches the address the mail was sent <em>to</em> against the inbound address above, so each company gets its own mailbox. Sending replies requires <code>RESEND_API_KEY</code> and a verified sending domain.
        </p>
      </div>
    </div>
  )
}
