'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useCompanyUser, S, ToggleRow } from '../_shared'

const STATUSES: { key: string; label: string; hint: string; default: string }[] = [
  { key: 'processing', label: 'Processing (paid)', hint: 'Sent when an order is paid and being processed.', default: 'Thank you for placing an order with {business}. We have received it. If you have any questions, feel free to reply here.' },
  { key: 'failed', label: 'Failed payment', hint: 'Sent when an order payment fails.', default: 'We noticed there was an issue with your recent order payment. Do you need any help?' },
  { key: 'cancelled', label: 'Cancelled', hint: 'Sent when an order is cancelled.', default: 'Your recent order was cancelled. Can we help you with anything?' },
  { key: 'refunded', label: 'Refunded', hint: 'Use {amount} for the refunded amount.', default: 'Your order has been refunded. The refund of {amount} has been processed and should appear shortly.' },
  { key: 'completed', label: 'Completed', hint: 'Sent when an order is completed.', default: 'Your order has been completed. Thank you for choosing {business}!' },
  { key: 'on-hold', label: 'On hold', hint: 'Sent when an order goes on hold.', default: "Your order is on hold while we confirm a few details. We'll be in touch shortly — feel free to reply here." },
]

export default function OrderAutomationSettings() {
  const { companyId, loading } = useCompanyUser()
  const [enabled, setEnabled] = useState(false)
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [reviewUrl, setReviewUrl] = useState('')
  const [alsoSms, setAlsoSms] = useState(false)
  const [alsoEmail, setAlsoEmail] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data: co } = await (supabase as any).from('companies').select('order_chat_automation').eq('id', companyId).maybeSingle()
      const cfg = co?.order_chat_automation || {}
      setEnabled(!!cfg.enabled)
      setMessages(cfg.messages || {})
      setReviewUrl(cfg.review_url || '')
      setAlsoSms(!!cfg.also_sms)
      setAlsoEmail(!!cfg.also_email)
    })()
    if (typeof window !== 'undefined') {
      const origin = window.location.origin.replace(/[^.]+\.colvy/, 'colvy')
      setWebhookUrl(`${origin}/api/webhooks/woocommerce?company=${companyId || ''}`)
    }
  }, [companyId])

  const save = async () => {
    if (!companyId) return
    setSaving(true)
    await (supabase as any).from('companies').update({
      order_chat_automation: { enabled, review_url: reviewUrl, messages, also_sms: alsoSms, also_email: alsoEmail },
    }).eq('id', companyId)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--slate)' }}>Loading…</div>

  return (
    <div>
      <h1 style={S.h1}>Order Automation</h1>
      <p style={S.sub}>Automatically start a chat with the customer when a WooCommerce order is created or changes status, with a message tailored to that status.</p>

      <div style={S.card}>
        <ToggleRow title="Start a chat on new orders & status changes" desc="When on, Colvy messages the customer based on the order's status." checked={enabled} onChange={setEnabled} />
      </div>

      {enabled && (
        <>
          <div style={S.card}>
            <h2 style={S.h2}>Messages per status</h2>
            <p style={{ ...S.hint, marginBottom: 14 }}>Placeholders: <code>{'{business}'}</code>, <code>{'{name}'}</code>, <code>{'{order}'}</code>, <code>{'{amount}'}</code> (refund), <code>{'{total}'}</code>. Leave a field blank to send nothing for that status.</p>
            {STATUSES.map(st => (
              <div key={st.key} style={{ marginBottom: 16 }}>
                <label style={S.label}>{st.label}</label>
                <textarea
                  value={messages[st.key] ?? st.default}
                  onChange={e => setMessages(m => ({ ...m, [st.key]: e.target.value }))}
                  style={{ ...S.input, minHeight: 54, resize: 'vertical' }}
                />
                <p style={S.hint}>{st.hint}</p>
              </div>
            ))}
          </div>

          <div style={S.card}>
            <h2 style={S.h2}>Also notify the customer directly</h2>
            <p style={{ ...S.hint, marginBottom: 12 }}>The message always posts into the chat. Optionally also send it as an SMS and/or email so the customer is notified immediately.</p>
            <ToggleRow title="Also send as SMS" desc="Requires a Colvy number and the customer's mobile. Standard SMS rates apply." checked={alsoSms} onChange={setAlsoSms} />
            <div style={{ height: 10 }} />
            <ToggleRow title="Also send as email" desc="Sent from your verified Colvy email domain to the order's email address." checked={alsoEmail} onChange={setAlsoEmail} />
          </div>

          <div style={S.card}>
            <h2 style={S.h2}>Google review reminder</h2>
            <p style={{ ...S.hint, marginBottom: 10 }}>Added after the "completed" message. Paste your Google review link.</p>
            <input value={reviewUrl} onChange={e => setReviewUrl(e.target.value)} placeholder="https://g.page/r/…/review" style={S.input} />
          </div>
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={save} disabled={saving} style={S.btn}>{saving ? 'Saving…' : 'Save'}</button>
        {saved && <span style={{ color: '#059669', fontWeight: 600, fontSize: 13 }}>✓ Saved</span>}
      </div>

      <div style={{ ...S.card, background: 'var(--canvas)' }}>
        <h2 style={S.h2}>⚙️ One-time WooCommerce setup</h2>
        <p style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.6 }}>
          For this to work, WooCommerce needs to notify Colvy when orders change. In your WooCommerce admin go to <strong>WooCommerce → Settings → Advanced → Webhooks</strong> and add two webhooks:
        </p>
        <ul style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.7, paddingLeft: 18 }}>
          <li>One with <strong>Topic:</strong> "Order created"</li>
          <li>One with <strong>Topic:</strong> "Order updated"</li>
          <li>For both, set <strong>Delivery URL</strong> to:</li>
        </ul>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
          <input readOnly value={webhookUrl} onFocus={e => e.currentTarget.select()} style={{ ...S.input, fontSize: 12, fontFamily: 'monospace' }} />
          <button onClick={() => { navigator.clipboard?.writeText(webhookUrl) }} style={{ ...S.btnGhost, whiteSpace: 'nowrap', padding: '10px 16px' }}>Copy</button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 10 }}>The company id is already embedded in this URL, so no custom headers are needed. Set the webhook status to <strong>Active</strong> and save.</p>
      </div>
    </div>
  )
}
