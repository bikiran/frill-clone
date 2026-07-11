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

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <button onClick={save} disabled={saving} style={S.btn}>{saving ? 'Saving…' : 'Save actions'}</button>
          {saved && <span style={{ color: '#059669', fontWeight: 600, fontSize: 13 }}>✓ Saved</span>}
        </div>
      </div>
    </div>
  )
}
