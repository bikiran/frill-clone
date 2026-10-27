'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useCompanyUser, S, ToggleRow } from '../_shared'
import { DEFAULT_ORDER_MESSAGES, isStaleOrderMessage, withCompletedFallbacks } from '@/lib/order-messages'
import { resolveCartRecovery, fillCartMessage, CART_DELAYS, DEFAULT_CART_MESSAGE, type CartRecoverySettings } from '@/lib/cart-recovery-shared'

// Placeholders: {name} first name, {full_name}, #{order} order number, {business}, {amount}, {total}.
// Defaults live in lib/order-messages.ts, shared with the order webhook.
const STATUSES: { key: string; label: string; hint: string; default: string }[] = [
  { key: 'processing', label: 'Processing (paid)', hint: '{name} is the customer’s first name. Sent when an order is paid and being processed.', default: DEFAULT_ORDER_MESSAGES['processing'] },
  { key: 'failed', label: 'Failed payment', hint: 'Use {name} and #{order}. Sent when an order payment fails.', default: DEFAULT_ORDER_MESSAGES['failed'] },
  { key: 'cancelled', label: 'Cancelled', hint: 'Use {name} and #{order}. Sent when an order is cancelled.', default: DEFAULT_ORDER_MESSAGES['cancelled'] },
  { key: 'refunded', label: 'Refunded', hint: 'Use {amount} for the refunded amount, #{order} for the order.', default: DEFAULT_ORDER_MESSAGES['refunded'] },
  { key: 'completed', label: 'Completed: shipped', hint: 'Sent when a shipped order is marked completed and you’ve already sent the customer tracking from Colvy.', default: DEFAULT_ORDER_MESSAGES['completed'] },
  { key: 'completed_no_tracking', label: 'Completed: shipped, tracking not sent yet', hint: 'Sent when a shipped order is marked completed before you’ve sent tracking from Colvy.', default: DEFAULT_ORDER_MESSAGES['completed_no_tracking'] },
  { key: 'completed_pickup', label: 'Completed: picked up', hint: 'Sent when a click & collect order is marked completed (collected). In-store POS sales never get a message.', default: DEFAULT_ORDER_MESSAGES['completed_pickup'] },
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
  const [sendBy, setSendBy] = useState<'auto' | 'sms' | 'email'>('auto')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [cart, setCart] = useState<CartRecoverySettings>(() => resolveCartRecovery(null))
  const loadedCfg = useRef<any>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data: co } = await (supabase as any).from('companies').select('name, order_chat_automation').eq('id', companyId).maybeSingle()
      const cfg = co?.order_chat_automation || {}
      loadedCfg.current = cfg
      setEnabled(!!cfg.enabled)
      setCart(resolveCartRecovery(cfg.cart_recovery))
      setBusinessName(co?.name || '')
      // A saved message that's just an old default (maybe with a sign-off) isn't
      // used any more, so show the current default the customer will get.
      const msgs: Record<string, string> = {}
      for (const [k, v] of Object.entries(cfg.messages || {})) {
        if (typeof v === 'string' && !isStaleOrderMessage(v, co?.name)) msgs[k] = v
      }
      setMessages(withCompletedFallbacks(msgs))
      setDoa(cfg.doa || {})
      setReviewUrl(cfg.review_url || '')
      setAlsoSms(!!cfg.also_sms)
      setAlsoEmail(!!cfg.also_email)
      setSendBy(cfg.channel === 'sms' || cfg.channel === 'email' ? cfg.channel : 'auto')
    })()
    if (typeof window !== 'undefined') {
      const origin = window.location.origin.replace(/[^.]+\.colvy/, 'colvy')
      setWebhookUrl(`${origin}/api/webhooks/woocommerce?company=${companyId || ''}`)
    }
  }, [companyId])

  const save = async () => {
    if (!companyId) return
    setSaving(true)
    // Turning the cart message on stamps when, so it only ever messages carts
    // abandoned from then on — never a backlog.
    const cart_recovery = { ...cart, enabled_at: cart.enabled ? (cart.enabled_at || new Date().toISOString()) : null }
    // With a saved Completed message, store the other Completed boxes as shown,
    // so one reset to its default isn't replaced by the Completed wording.
    const toSave = { ...messages }
    if (toSave.completed !== undefined) for (const k of ['completed_no_tracking', 'completed_pickup']) toSave[k] ??= DEFAULT_ORDER_MESSAGES[k]
    await (supabase as any).from('companies').update({
      order_chat_automation: { ...loadedCfg.current, enabled, review_url: reviewUrl, messages: toSave, also_sms: alsoSms, also_email: alsoEmail, channel: sendBy, doa, cart_recovery },
    }).eq('id', companyId)
    loadedCfg.current = { ...loadedCfg.current, cart_recovery }
    setCart(cart_recovery)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--slate)' }}>Loading…</div>

  return (
    <div>
      <h1 style={S.h1}>Order Automation</h1>
      <p style={S.sub}>Automatically start a chat with the customer when a WooCommerce order is created or changes status, with a message tailored to that status.</p>

      <div className="st-sec">
        <ToggleRow title="Start a chat on new orders & status changes" desc="When on, Colvy messages the customer based on the order's status." checked={enabled} onChange={setEnabled} />
      </div>

      {enabled && (
        <>
          <div className="st-sec">
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

          <div className="st-sec">
            <h2 style={S.h2}>How order messages are sent</h2>
            <p style={{ ...S.hint, marginBottom: 12 }}>The message always posts into the customer's conversation. If they aren't on live chat right now, it's also sent to them so they actually see it.</p>
            <ChannelPicker value={sendBy} onChange={setSendBy}
              autoDesc="If the customer has messaged you before, the channel they last used. If they haven’t, email when you have their address (what customers expect for order updates), otherwise SMS." />
            <p style={{ ...S.hint, marginTop: 10 }}>Texts are only sent 9am to 8pm. Outside those hours the message goes by email, or the text waits until 9am if there’s no email.</p>
          </div>

          <div className="st-sec">
            <h2 style={S.h2}>Also notify the customer directly</h2>
            <p style={{ ...S.hint, marginBottom: 12 }}>These send a copy even when the customer is on live chat.</p>
            <ToggleRow title="Also send as SMS" desc="Requires a Colvy number and the customer's mobile. Standard SMS rates apply." checked={alsoSms} onChange={setAlsoSms} />
            <div style={{ height: 10 }} />
            <ToggleRow title="Also send as email" desc="Sent from your verified Colvy email domain to the order's email address." checked={alsoEmail} onChange={setAlsoEmail} />
          </div>

          <div className="st-sec">
            <h2 style={S.h2}>Google review reminder</h2>
            <p style={{ ...S.hint, marginBottom: 10 }}>Added after each Completed message. Paste your Google review link.</p>
            <input value={reviewUrl} onChange={e => setReviewUrl(e.target.value)} placeholder="https://g.page/r/…/review" style={S.input} />
          </div>
        </>
      )}

      <div className="st-sec">
        <h2 style={{ ...S.h2, marginBottom: 4 }}>Automatic abandoned-cart message</h2>
        <p style={{ ...S.hint, margin: '0 0 4px' }}>Off by default. When on, a shopper who leaves checkout gets one message, so you don't have to follow up by hand. Each message uses SMS credits.</p>
        <ToggleRow title="Message shoppers who leave checkout" desc="One message per cart, posted into their conversation so replies come to your inbox." checked={cart.enabled} onChange={v => setCart(c => ({ ...c, enabled: v }))} />
        {cart.enabled && (
          <div style={{ marginTop: 14 }}>
            <label style={S.label}>How it's sent</label>
            <ChannelPicker value={cart.channel} onChange={v => setCart(c => ({ ...c, channel: v }))}
              autoDesc="The channel the customer last used to contact you. If they haven’t messaged you: SMS when they have a mobile and haven’t opted out of texts, otherwise email." />
            <div style={{ height: 14 }} />
            <label style={S.label}>Send after</label>
            <select value={cart.delay_minutes} onChange={e => setCart(c => ({ ...c, delay_minutes: Number(e.target.value) }))} style={{ ...S.input, maxWidth: 260, fontSize: 16 }}>
              {CART_DELAYS.map(m => <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? '' : 's'}`} after they leave</option>)}
            </select>
            <label style={{ ...S.label, marginTop: 14 }}>Message</label>
            <textarea value={cart.message} onChange={e => setCart(c => ({ ...c, message: e.target.value }))} style={{ ...S.input, minHeight: 96, resize: 'vertical', fontSize: 16 }} />
            <p style={S.hint}>
              Placeholders: <code>{'{name}'}</code> (first name), <code>{'{items}'}</code>, <code>{'{total}'}</code>, <code>{'{business}'}</code>, <code>{'{link}'}</code> (their checkout, when your store sends one).
              {cart.message !== DEFAULT_CART_MESSAGE && (
                <> <button type="button" onClick={() => setCart(c => ({ ...c, message: DEFAULT_CART_MESSAGE }))}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--coral)', fontWeight: 700, cursor: 'pointer', fontSize: 'inherit', fontFamily: 'inherit' }}>Reset to default</button></>
              )}
            </p>
            {(() => {
              const pv = fillCartMessage(cart.message, { name: 'Cassandra', items: 'Lemon Oscar - Medium', total: '$124.00', business: businessName || 'Your business', link: 'https://colvy.com/l/ab12cd' })
              const segs = pv.length <= 160 ? 1 : Math.ceil(pv.length / 153)
              return (
                <p style={{ ...S.hint, whiteSpace: 'pre-wrap', background: 'var(--canvas, #f6f6f8)', borderRadius: 10, padding: '8px 10px', marginTop: 8 }}>
                  <strong>Preview · {pv.length} characters · {segs} SMS: </strong>{pv}
                </p>
              )
            })()}
            {!/stop/i.test(cart.message) && <p style={{ ...S.hint, color: '#b45309' }}>Keep "Reply STOP to opt out" — it's required for marketing texts in Australia.</p>}
            <ul style={{ ...S.hint, margin: '10px 0 0', paddingLeft: 18, lineHeight: 1.6 }}>
              <li>Only sent 9am to 8pm; anything due overnight goes out in the morning.</li>
              <li>Never sent if they've since ordered, the cart was recovered or dismissed, or they've opted out.</li>
              <li>Only carts abandoned after you turn this on, and within the last 24 hours.</li>
            </ul>
          </div>
        )}
      </div>

      <div className="st-sec">
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
        <h2 style={S.h2}>One-time WooCommerce setup</h2>
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
        <h2 style={S.h2}>Abandoned carts</h2>
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

// "How it's sent" for an automation. Automatic follows the shared rule in
// lib/channel-choice.ts, spelled out here so the business knows what happens.
const CHANNEL_OPTIONS: { key: 'auto' | 'sms' | 'email'; title: string; desc: string }[] = [
  { key: 'auto', title: 'Automatic (recommended)', desc: '' },
  { key: 'sms', title: 'SMS', desc: 'Always text when they have a mobile and haven’t opted out. Falls back to email if they can’t be texted.' },
  { key: 'email', title: 'Email', desc: 'Always email when you have their address. Falls back to SMS if there’s no email.' },
]

function ChannelPicker({ value, onChange, autoDesc }: { value: 'auto' | 'sms' | 'email'; onChange: (v: 'auto' | 'sms' | 'email') => void; autoDesc: string }) {
  return (
    <div role="radiogroup" aria-label="How it's sent" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
      {CHANNEL_OPTIONS.map(o => {
        const on = value === o.key
        return (
          <button key={o.key} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.key)}
            style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 12, border: `1px solid ${on ? 'var(--coral)' : 'var(--border)'}`, background: on ? 'color-mix(in srgb, var(--coral) 7%, #fff)' : '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
              <span aria-hidden style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${on ? 'var(--coral)' : 'var(--border)'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {on && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--coral)' }} />}
              </span>
              {o.title}
            </span>
            <span style={{ display: 'block', marginTop: 4, fontSize: 12.5, lineHeight: 1.5, color: 'var(--slate)' }}>{o.key === 'auto' ? autoDesc : o.desc}</span>
          </button>
        )
      })}
    </div>
  )
}
