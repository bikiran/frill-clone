'use client'

// Super admin → WhatsApp: every business that asked for WhatsApp (pending
// requests first), this month's usage, and the business's full WhatsApp
// console (CompanyWhatsApp) inline. Uses /api/platform-admin/whatsapp.

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { SENDER_STATUS_LABEL } from '@/lib/whatsapp-core'
import CompanyWhatsApp, { WhatsAppSetupSteps } from './CompanyWhatsApp'
import WhatsAppGlyph from '@/components/WhatsAppGlyph'

const COLOR: Record<string, string> = { pending: '#f59e0b', approved: '#10b981', rejected: '#ef4444', disabled: '#6b7280' }

export default function WhatsAppPage() {
  const [d, setD] = useState<any>(null)
  const [open, setOpen] = useState<string | null>(null)
  const load = async () => {
    try {
      const r = await authFetch('/api/platform-admin/whatsapp')
      const j = await r.json()
      setD(r.ok ? j : { error: j.error || 'Could not load' })
    } catch (e: any) { setD({ error: e?.message || 'Could not load' }) }
  }
  useEffect(() => { load() }, [])

  const senders: any[] = d?.senders || []
  const pending = senders.filter(s => s.status === 'pending').length
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <WhatsAppGlyph size={22} />
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--sa-text)', margin: 0 }}>WhatsApp</h1>
        {pending > 0 && <span style={{ fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 999, background: '#f59e0b22', color: '#b45309' }}>{pending} waiting</span>}
        <button onClick={() => { setD(null); load() }} style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'var(--sa-card)', color: 'var(--sa-text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Refresh</button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--sa-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>Businesses’ WhatsApp senders on Colvy’s Twilio account. Register the number in Twilio / Meta, then record it here; nothing sends until a sender is Approved.</p>

      {!d && <p style={{ color: 'var(--sa-muted)', fontSize: 13 }}>Loading…</p>}
      {d?.error && <p style={{ color: '#ef4444', fontSize: 13 }}>{d.error}</p>}
      {d && !d.error && !d.ready && <p style={{ fontSize: 13, color: 'var(--sa-text)', padding: 12, borderRadius: 10, border: '1px solid #f59e0b55', background: '#f59e0b18' }}>Run <b>COLVY_V402_WHATSAPP.sql</b> to set up WhatsApp.</p>}
      {d && !d.error && d.ready && d.platformReady === false && <p style={{ fontSize: 13, color: 'var(--sa-text)', padding: 12, borderRadius: 10, border: '1px solid #ef444455', background: '#ef444418' }}>Colvy’s Twilio account isn’t configured (TWILIO_MASTER_ACCOUNT_SID / TWILIO_MASTER_AUTH_TOKEN), so nothing can send.</p>}

      {d && !d.error && d.ready && (
        <div style={{ border: '1px solid var(--sa-border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
          {senders.length === 0 && <p style={{ margin: 0, padding: 16, fontSize: 13, color: 'var(--sa-muted)' }}>No business has asked for WhatsApp yet. Requests from Settings → Channels → WhatsApp show here.</p>}
          {senders.map((s, i) => {
            const u = d.usage?.[s.company_id] || {}
            const sent = (u.session || 0) + Object.values(u.template || {}).reduce((a: number, b: any) => a + (Number(b) || 0), 0)
            const isOpen = open === s.company_id
            return (
              <div key={s.company_id} style={{ borderTop: i ? '1px solid var(--sa-border)' : 'none' }}>
                <button onClick={() => setOpen(isOpen ? null : s.company_id)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 14px', border: 'none', background: isOpen ? 'var(--sa-hover)' : 'transparent', cursor: 'pointer', textAlign: 'left', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--sa-text)', minWidth: 0 }}>{s.company?.name || s.company_id}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: (COLOR[s.status] || '#6b7280') + '22', color: COLOR[s.status] || '#6b7280' }}>{SENDER_STATUS_LABEL[s.status as keyof typeof SENDER_STATUS_LABEL] || s.status}</span>
                  <span style={{ fontSize: 12, color: 'var(--sa-muted)' }}>{s.phone_number || s.request?.phoneNumber || 'new number'}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--sa-muted)' }}>
                    {s.status === 'pending' && s.requested_at ? `asked ${new Date(s.requested_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : `${(u.inbound || 0).toLocaleString('en-AU')} in · ${sent.toLocaleString('en-AU')} out this month`}
                  </span>
                </button>
                {isOpen && <div style={{ padding: '4px 14px 16px' }}><CompanyWhatsApp companyId={s.company_id} /></div>}
              </div>
            )
          })}
        </div>
      )}
      <WhatsAppSetupSteps />
    </div>
  )
}
