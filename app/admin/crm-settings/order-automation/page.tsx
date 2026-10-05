'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useCompanyUser, S, ToggleRow } from '../_shared'
import { DEFAULT_ORDER_MESSAGES, isStaleOrderMessage } from '@/lib/order-messages'

// Placeholders: {name} first name, {full_name}, #{order} order number, {business}, {amount}, {total}.
// Defaults live in lib/order-messages.ts, shared with the order webhook.
const STATUSES: { key: string; label: string; hint: string; default: string }[] = [
  { key: 'processing', label: 'Processing (paid)', hint: '{name} is the customer’s first name. Sent when an order is paid and being processed.', default: DEFAULT_ORDER_MESSAGES['processing'] },
  { key: 'failed', label: 'Failed payment', hint: 'Use {name} and #{order}. Sent when an order payment fails.', default: DEFAULT_ORDER_MESSAGES['failed'] },
  { key: 'cancelled', label: 'Cancelled', hint: 'Use {name} and #{order}. Sent when an order is cancelled.', default: DEFAULT_ORDER_MESSAGES['cancelled'] },
  { key: 'refunded', label: 'Refunded', hint: 'Use {amount} for the refunded amount, #{order} for the order.', default: DEFAULT_ORDER_MESSAGES['refunded'] },
  { key: 'completed', label: 'Completed', hint: 'Use {name} and #{order}. Sent when an order is completed.', default: DEFAULT_ORDER_MESSAGES['completed'] },
  { key: 'on-hold', label: 'On hold', hint: 'Use {name} and #{order}. Sent when an order goes on hold.', default: DEFAULT_ORDER_MESSAGES['on-hold'] },
]

// What a customer would see, with sample order details.
const preview = (t: string, business: string) => t
  .replace(/\{business\}/g, business || 'Your business')
  .replace(/\{full_name\}/g, 'Cassandra Scofield')
  .replace(/\{name\}/g, 'Cassandra')
  .replace(/\{order\}/g, '124434')
  .replace(/\{amount\}/g, '$24.00')
  .replace(/\{total\}/g, '$124.00')

// Messages the DOA claim tool sends the customer when an agent resolves a
// damaged-order claim from the inbox. These are separate from the status
// automation above — they fire on the agent's action, not a Woo status change.
const DOA_MESSAGES: { key: string; label: string; hint: string; default: string }[] = [
  { key: 'refund', label: 'Refund issued', hint: 'Use {amount} for the refunded amount.', default: "We're sorry your order arrived damaged. We've refunded {amount} — it should appear on your original payment method within 3–5 business days." },
  { key: 'coupon', label: 'Store credit issued', hint: 'Use {amount} for the credit and {code} for the coupon code.', default: "We're sorry your order arrived damaged. We've issued you {amount} in store credit — use code {code} at checkout." },
  { key: 'resend', label: 'Replacement sent', hint: 'Sent when you flag a replacement / re-ship.', default: "We're sorry your order arrived damaged. A replacement is on its way at no charge — we'll send tracking once it ships." },
]

export default function OrderAutomationSettings() {
  const { companyId, loading } = useCompanyUser()
  const [enabled, setEnabled] = useState(false)
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [businessName, setBusinessName] = useState('')
  const [doa, setDoa] = useState<Record<string, string>>({})
  const [reviewUrl, setReviewUrl] = useState('')
  const [alsoSms, setAlsoSms] = useState(false)
  const [alsoEmail, setAlsoEmail] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data: co } = await (supabase as any).from('companies').select('name, order_chat_automation').eq('id', companyId).maybeSingle()
      const cfg = co?.order_chat_automation || {}
      setEnabled(!!cfg.enabled)
      setBusinessName(co?.name || '')
      // A saved message that's just an old default (maybe with a sign-off) isn't
      // used any more, so show the current default the customer will get.
      const msgs: Record<string, string> = {}
      for (const [k, v] of Object.entries(cfg.messages || {})) {
        if (typeof v === 'string' && !isStaleOrderMessage(v, co?.name)) msgs[k] = v
      }
      setMessages(msgs)
      setDoa(cfg.doa || {})
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
      order_chat_automation: { enabled, review_url: reviewUrl, messages, also_sms: alsoSms, also_email: alsoEmail, doa },
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
            <p style={{ ...S.hint, marginBottom: 14 }}>Placeholders: <code>{'{business}'}</code>, <code>{'{name}'}</code> (first name), <code>{'{full_name}'}</code>, <code>{'{order}'}</code>, <code>{'{amount}'}</code> (refund), <code>{'{total}'}</code>. Leave a field blank to send nothing for that status.</p>
            {STATUSES.map(st => (
              <div key={st.key} style={{ marginBottom: 16 }}>
                <label style={S.label}>{st.label}</label>
                <textarea
                  value={messages[st.key] ?? st.default}
                  onChange={e => setMessages(m => ({ ...m, [st.key]: e.target.value }))}
                  style={{ ...S.input, minHeight: st.default.includes('\n') ? 120 : 54, resize: 'vertical' }}
                />
                <p style={S.hint}>
                  {st.hint}
                  {messages[st.key] !== undefined && messages[st.key] !== st.default && (
                    <> <button type="button" onClick={() => setMessages(m => { const n = { ...m }; delete n[st.key]; return n })}
                      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--coral)', fontWeight: 700, cursor: 'pointer', fontSize: 'inherit', fontFamily: 'inherit' }}>Reset to default</button></>
                  )}
                </p>
                {!(messages[st.key] ?? st.default).trim() && (
                  <p style={{ ...S.hint, marginTop: 6, color: '#b45309', fontWeight: 600 }}>Not sent: this field is blank, so customers get no message for this status.</p>
                )}
                {!!(messages[st.key] ?? st.default).trim() && (
                  <p style={{ ...S.hint, whiteSpace: 'pre-wrap', background: 'var(--canvas, #f6f6f8)', borderRadius: 10, padding: '8px 10px', marginTop: 6 }}>
                    <strong>Preview: </strong>{preview(messages[st.key] ?? st.default, businessName)}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div style={S.card}>
            <h2 style={S.h2}>Also notify the customer directly</h2>
            <p style={{ ...S.hint, marginBottom: 12 }}>The message always posts into the chat. If the customer isn't active on live chat, it's automatically sent by SMS so they're notified — the options below force a copy even when they are on live chat.</p>
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

      <div style={S.card}>
        <h2 style={S.h2}>DOA claim messages</h2>
        <p style={{ ...S.hint, marginBottom: 14 }}>What Colvy sends the customer when you resolve a damaged-order (DOA) claim from the inbox. These fire on your action, independent of the order-automation toggle above. Placeholders: <code>{'{amount}'}</code>, <code>{'{code}'}</code> (store-credit coupon). Leave blank to use the default wording.</p>
        {DOA_MESSAGES.map(dm => (
          <div key={dm.key} style={{ marginBottom: 16 }}>
            <label style={S.label}>{dm.label}</label>
            <textarea
              value={doa[dm.key] ?? dm.default}
              onChange={e => setDoa(m => ({ ...m, [dm.key]: e.target.value }))}
              style={{ ...S.input, minHeight: 54, resize: 'vertical' }}
            />
            <p style={S.hint}>{dm.hint}</p>
          </div>
        ))}
      </div>

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

      <div style={{ ...S.card, background: 'var(--canvas)' }}>
        <h2 style={S.h2}>🛒 Abandoned carts</h2>
        <p style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.6 }}>
          WooCommerce doesn't track abandoned carts on its own. If your store uses an abandonment plugin (or a small checkout snippet) that can send cart data to a URL, point it at Colvy and abandoned carts will appear in the chat sidebar — so you can see exactly what a customer wanted and convert it into an order.
        </p>
        <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', margin: '10px 0 4px' }}>Send cart data (POST, JSON) to:</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input readOnly value={typeof window !== 'undefined' ? `${window.location.origin.replace(/[^.]+\.colvy/, 'colvy')}/api/abandoned-carts?company=${companyId || ''}` : ''} onFocus={e => e.currentTarget.select()} style={{ ...S.input, fontSize: 12, fontFamily: 'monospace' }} />
        </div>
        <p style={{ fontSize: 12, color: 'var(--slate)', marginTop: 8, lineHeight: 1.6 }}>
          Expected fields (all optional, but include email or phone): <code>name</code>, <code>email</code>, <code>phone</code>, <code>billing</code> (address), <code>items</code> (or <code>line_items</code>), <code>coupon</code>, <code>shipping</code>, <code>notes</code>, <code>total</code>, <code>cart_url</code>, <code>external_id</code>.
        </p>
      </div>
    </div>
  )
}
