'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useCompanyUser, S, ToggleRow } from '../_shared'

// The catalogue of conversation actions a company can enable. Each becomes an
// item in the inbox "+ Action" menu. Form-based actions can be linked to a form.
const ACTION_CATALOGUE: { key: string; label: string; desc: string; icon: string; formBased?: boolean }[] = [
  { key: 'doa', label: 'DOA Claim', desc: 'Dead-on-arrival / faulty item claims with order lookup and refund.', icon: '📦' },
  { key: 'warranty', label: 'Warranty Claim', desc: 'Collect warranty claim details from the customer.', icon: '🛡️', formBased: true },
  { key: 'return_refund', label: 'Return / Refund', desc: 'Process returns and refunds against an order.', icon: '↩️' },
  { key: 'create_order', label: 'Create Order', desc: 'Build a WooCommerce or Shopify order from the chat.', icon: '🛒' },
  { key: 'booking', label: 'Booking', desc: 'Take a booking or appointment from the conversation.', icon: '📅', formBased: true },
  { key: 'support_ticket', label: 'Support Ticket', desc: 'Raise a support ticket with a number and link.', icon: '🎫' },
  { key: 'send_coupon', label: 'Send Coupon', desc: 'Create a WooCommerce coupon and send it to the customer as a copyable code.', icon: '🎟️' },
  { key: 'custom_form', label: 'Custom Form', desc: 'Send any form you have built as an action.', icon: '📝', formBased: true },
]

const DEFAULT_CLAIM_OFFER = `Hi {name}, it looks like you may have an issue with an order. Would you like to start a claim? We can pre-fill most of the details for you — you'll just need to check they're correct. 📋`

export default function ConversationActionsSettings() {
  const { companyId, loading } = useCompanyUser()
  const [config, setConfig] = useState<Record<string, any>>({})
  const [forms, setForms] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data: co } = await (supabase as any).from('companies').select('conversation_actions').eq('id', companyId).maybeSingle()
      setConfig(co?.conversation_actions || {})
      const { data: f } = await (supabase as any).from('forms').select('id, title').eq('company_id', companyId).order('created_at', { ascending: false })
      setForms(f || [])
    })()
  }, [companyId])

  const setEnabled = (key: string, enabled: boolean) => {
    setConfig(c => ({ ...c, [key]: { ...(c[key] || {}), enabled } }))
  }
  const setForm = (key: string, formId: string) => {
    setConfig(c => ({ ...c, [key]: { ...(c[key] || {}), form_id: formId || null } }))
  }

  const save = async () => {
    if (!companyId) return
    setSaving(true)
    await (supabase as any).from('companies').update({ conversation_actions: config }).eq('id', companyId)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--slate)' }}>Loading…</div>

  return (
    <div>
      <h1 style={S.h1}>Conversation Actions</h1>
      <p style={S.sub}>Choose which actions your team can trigger from a conversation. Enabled actions appear under the <strong>+ Action</strong> button next to the customer's details in the inbox.</p>

      <div style={S.card}>
        {ACTION_CATALOGUE.map(a => {
          const enabled = !!config[a.key]?.enabled
          return (
            <div key={a.key} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 14, marginBottom: 14 }}>
              <ToggleRow
                title={`${a.icon} ${a.label}`}
                desc={a.desc}
                checked={enabled}
                onChange={(v) => setEnabled(a.key, v)}
              />
              {enabled && a.formBased && (
                <div style={{ marginTop: 10, marginLeft: 4 }}>
                  <label style={S.label}>Which form should this send?</label>
                  <select value={config[a.key]?.form_id || ''} onChange={e => setForm(a.key, e.target.value)}
                    style={{ ...S.input, maxWidth: 320 }}>
                    <option value="">— Select a form —</option>
                    {forms.map(f => <option key={f.id} value={f.id}>{f.title || 'Untitled form'}</option>)}
                  </select>
                  {forms.length === 0 && <p style={S.hint}>No forms yet — create one in the Forms section first.</p>}
                </div>
              )}
            </div>
          )
        })}

        {/* Auto claim-offer: the message Colvy sends when a customer reports an
            issue (dead/faulty/refund…) and matches an order. */}
        <div style={{ borderTop: '2px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
          <ToggleRow
            title="🤖 Auto-offer a claim"
            desc="When a customer mentions an issue (dead, faulty, refund, damaged…) and matches a WooCommerce order, automatically offer to start a claim — once per conversation."
            checked={config.claim_auto_offer?.enabled !== false}
            onChange={(v) => setConfig(c => ({ ...c, claim_auto_offer: { ...(c.claim_auto_offer || {}), enabled: v } }))}
          />
          {config.claim_auto_offer?.enabled !== false && (
            <div style={{ marginTop: 10, marginLeft: 4 }}>
              <label style={S.label}>Message</label>
              <textarea
                value={config.claim_auto_offer?.message ?? DEFAULT_CLAIM_OFFER}
                onChange={e => setConfig(c => ({ ...c, claim_auto_offer: { ...(c.claim_auto_offer || {}), message: e.target.value } }))}
                rows={3}
                style={{ ...S.input, width: '100%', maxWidth: 620, resize: 'vertical' }}
              />
              <p style={S.hint}>Placeholders: <code>{'{name}'}</code> (customer's first name), <code>{'{business}'}</code>. This still only sends when a claim action above is enabled and the customer matches an order.</p>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <button onClick={save} disabled={saving} style={S.btn}>{saving ? 'Saving…' : 'Save actions'}</button>
          {saved && <span style={{ color: '#059669', fontWeight: 600, fontSize: 13 }}>✓ Saved</span>}
        </div>
      </div>
    </div>
  )
}
