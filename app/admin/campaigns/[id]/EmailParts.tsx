'use client'

// The campaign wizard's email pieces: the designer step, the "send a test to
// yourself" card and the Review step's email summary. The SMS parts of the
// wizard live in page.tsx; an email campaign shows these instead and never
// shows SMS cost, credit or allowance.

import { useState } from 'react'
import Link from 'next/link'
import { authFetch } from '@/lib/auth-fetch'
import { EmailDesigner, blankBlock, type DesignDraft, type EmailBrand, type SenderInfo } from '@/components/EmailDesigner'

export type EmailInfo = {
  brand: EmailBrand
  sender: SenderInfo
  /** The campaign's saved design row (email_designs), or null before one is saved. */
  design: any | null
  dbReady: boolean
}

/** What the designer opens with: the saved design, else a simple starting layout. */
export function draftFrom(info: EmailInfo | null, campaignName: string): DesignDraft {
  const d = info?.design
  if (d?.design?.blocks?.length) {
    return { id: d.id, name: d.name || campaignName, subject: d.subject || '', previewText: d.preview_text || '', design: d.design }
  }
  return {
    id: null, name: campaignName || 'Campaign email', subject: '', previewText: '',
    design: { version: 1, blocks: [blankBlock('header'), blankBlock('heading'), blankBlock('text'), blankBlock('button'), blankBlock('footer')] },
  }
}

const SendIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>
)
const WarnIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
)

/** Step 3 for email: the designer, full width, saving the design against this campaign. */
export function EmailDesignStep({ companyId, campaignId, info, campaignName, onSaved }: {
  companyId: string; campaignId: string; info: EmailInfo | null; campaignName: string; onSaved: (row: any) => void
}) {
  if (!info) return <div style={{ padding: 24, color: 'var(--slate)', fontSize: 13 }}>Loading the email designer…</div>
  return (
    <div className="camp-email-step" style={{ display: 'grid', gap: 12, minWidth: 0 }}>
      {!info.dbReady && (
        <div style={{ padding: '12px 16px', borderRadius: 16, border: '1px solid #fedf89', background: '#fffaeb', color: '#93370d', fontSize: 13 }}>
          Saving emails is waiting on a database update (V396). You can design and send yourself a test in the meantime.
        </div>
      )}
      <EmailDesigner companyId={companyId} brand={info.brand} sender={info.sender}
        initial={draftFrom(info, campaignName)} campaignId={campaignId} onSaved={onSaved} />
    </div>
  )
}

/** "Send a test to yourself": the saved design, to the signed-in staff member's own address. */
export function EmailTestCard({ companyId, info, card, label }: { companyId: string; info: EmailInfo | null; card: React.CSSProperties; label: React.CSSProperties }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')
  const d = info?.design
  const ready = !!d?.design?.blocks?.length
  const send = async () => {
    setBusy(true); setResult('')
    try {
      const r = await authFetch('/api/email-campaigns/test-send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, subject: d.subject, previewText: d.preview_text, design: d.design }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || 'The test didn’t send')
      setResult(`Test sent to ${j.to}`)
    } catch (e: any) { setResult('Could not send: ' + e.message) }
    finally { setBusy(false) }
  }
  return (
    <div style={card}>
      <label style={label}>Send a test</label>
      <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--slate)' }}>
        Sends the email to your own address with example details, so you can check it in your inbox.
        It never touches the campaign audience.
      </p>
      <button type="button" onClick={send} disabled={busy || !ready}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 999, background: 'var(--ink)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: busy || !ready ? 'default' : 'pointer', opacity: busy || !ready ? 0.5 : 1 }}>
        <SendIcon />{busy ? 'Sending…' : 'Send a test to yourself'}
      </button>
      {!ready && <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--slate)' }}>Design and save the email first.</p>}
      {result && (
        <p style={{ margin: '10px 0 0', fontSize: 12.5, color: result.startsWith('Test sent') ? '#15803d' : '#dc2626' }}>{result}</p>
      )}
    </div>
  )
}

/** The Review step's email card: subject, preview text and who it's from. */
export function EmailReviewCard({ info, card, label, onEdit }: { info: EmailInfo | null; card: React.CSSProperties; label: React.CSSProperties; onEdit: () => void }) {
  const d = info?.design
  const sender = info?.sender
  const row = (k: string, v: React.ReactNode) => (
    <tr style={{ borderTop: '1px solid #f0f0f2' }}>
      <td style={{ padding: '9px 0', color: 'var(--slate)', width: 150, verticalAlign: 'top' }}>{k}</td>
      <td style={{ padding: '9px 0', color: 'var(--ink)', fontWeight: 600, wordBreak: 'break-word' }}>{v}</td>
    </tr>
  )
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <label style={{ ...label, marginBottom: 0 }}>The email</label>
        <button type="button" onClick={onEdit}
          style={{ padding: '0 14px', height: 32, borderRadius: 999, border: 'none', background: '#f4f4f5', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Edit email
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
        <tbody>
          {row('Subject', d?.subject?.trim() || <span style={{ color: '#b42318' }}>No subject yet</span>)}
          {row('Preview text', d?.preview_text?.trim() || <span style={{ color: 'var(--slate)', fontWeight: 500 }}>None (inboxes show the first line instead)</span>)}
          {row('From', sender?.from || '—')}
          {sender?.replyTo ? row('Replies go to', sender.replyTo) : null}
        </tbody>
      </table>
      {sender?.shared && (
        <div style={{ marginTop: 10, display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 10, border: '1px solid #fedf89', background: '#fffaeb', color: '#93370d', fontSize: 12.5, lineHeight: 1.5 }}>
          <WarnIcon />
          <span>
            This goes out from Colvy’s shared address under your business name until your own domain is verified.
            Email from your own domain lands in inboxes more reliably.{' '}
            <Link href="/admin/crm-settings/channels/sending-domain" style={{ color: '#93370d', fontWeight: 700 }}>Set up your sending domain</Link>
          </span>
        </div>
      )}
    </div>
  )
}
