'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Panel, Toggle } from '@/components/ui/AdminKit'
import { useCompanyUser, SettingsPage, IconTile, SaveBar } from '../_shared'

// The catalogue of conversation actions a company can enable. Each becomes an
// item in the inbox "+ Action" menu. Form-based actions can be linked to a form.
const ACTION_CATALOGUE: { key: string; label: string; desc: string; color: string; icon: React.ReactNode; formBased?: boolean }[] = [
  { key: 'doa', label: 'DOA claim', desc: 'Dead-on-arrival or faulty item claims, with order lookup and refund.', color: '#f59e0b', icon: <path d="M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8" /> },
  { key: 'warranty', label: 'Warranty claim', desc: 'Collect warranty claim details from the customer.', color: '#6366f1', formBased: true, icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /> },
  { key: 'return_refund', label: 'Return / refund', desc: 'Process returns and refunds against an order.', color: '#f97316', icon: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></> },
  { key: 'create_order', label: 'Create order', desc: 'Build a WooCommerce or Shopify order from the chat, with a pay link.', color: '#10b981', icon: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></> },
  { key: 'booking', label: 'Booking', desc: 'Take a booking or appointment from the conversation.', color: '#0ea5e9', formBased: true, icon: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></> },
  { key: 'support_ticket', label: 'Support ticket', desc: 'Raise a support ticket with a number and link.', color: '#8b5cf6', icon: <><path d="M3 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a3 3 0 0 0 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" /><path d="M13 5v2M13 17v2M13 11v2" /></> },
  { key: 'send_coupon', label: 'Send coupon', desc: 'Create a store coupon and send it to the customer as a ticket they can copy.', color: '#ec4899', icon: <><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><circle cx="7" cy="7" r="1.5" fill="currentColor" /></> },
  { key: 'custom_form', label: 'Custom form', desc: 'Send any form you’ve built as an action.', color: '#14b8a6', formBased: true, icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></> },
]

const svg = (paths: React.ReactNode) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>

const DEFAULT_CLAIM_OFFER = `Hi {name}, it looks like you may have an issue with an order. Would you like to start a claim? We can pre-fill most of the details for you — you'll just need to check they're correct. 📋`

export default function ConversationActionsSettings() {
  const { companyId, loading } = useCompanyUser()
  const [config, setConfig] = useState<Record<string, any>>({})
  const [savedConfig, setSavedConfig] = useState<string>('{}')
  const [forms, setForms] = useState<any[]>([])
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data: co } = await (supabase as any).from('companies').select('conversation_actions').eq('id', companyId).maybeSingle()
      const c = co?.conversation_actions || {}
      setConfig(c); setSavedConfig(JSON.stringify(c)); setReady(true)
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
  const dirty = ready && JSON.stringify(config) !== savedConfig

  const save = async () => {
    if (!companyId) return
    setSaving(true); setMsg(null)
    const { error } = await (supabase as any).from('companies').update({ conversation_actions: config }).eq('id', companyId)
    setSaving(false)
    if (error) setMsg({ ok: false, text: 'Couldn’t save. Try again.' })
    else { setSavedConfig(JSON.stringify(config)); setMsg({ ok: true, text: 'Saved. The inbox shows these actions now.' }); setTimeout(() => setMsg(null), 2600) }
  }

  const enabledActions = ACTION_CATALOGUE.filter(a => !!config[a.key]?.enabled)
  const autoOn = config.claim_auto_offer?.enabled !== false

  if (loading || !ready) return <SettingsPage title="Conversation actions"><Panel><div className="ca-skel">{[0, 1, 2, 3].map(i => <span key={i} />)}</div></Panel><style>{CA_CSS}</style></SettingsPage>

  return (
    <SettingsPage title="Conversation actions"
      sub={<>What your team can do from a conversation. Switched-on actions appear under <b>+ Action</b> beside the customer’s details in the inbox.</>}>
      {msg && <div className={`ak-note ${msg.ok ? 'good' : 'bad'} ak-in`} role="status">{msg.text}</div>}
      <div className="ca-wrap">
        <div style={{ minWidth: 0 }}>
          <Panel flush>
            <ul className="ca-list">
              {ACTION_CATALOGUE.map(a => {
                const on = !!config[a.key]?.enabled
                return (
                  <li key={a.key} className={on ? 'on' : ''}>
                    <div className="ca-row">
                      <IconTile color={a.color} size={40}>{svg(a.icon)}</IconTile>
                      <div className="ca-t">
                        <b>{a.label}</b>
                        <p>{a.desc}</p>
                      </div>
                      <Toggle on={on} onChange={v => setEnabled(a.key, v)} label={a.label} />
                    </div>
                    {on && a.formBased && (
                      <div className="ca-form ak-in">
                        <label className="ak-label" htmlFor={`ca-f-${a.key}`}>Which form does it send?</label>
                        <select id={`ca-f-${a.key}`} className="ak-select" value={config[a.key]?.form_id || ''} onChange={e => setForm(a.key, e.target.value)}>
                          <option value="">Choose a form…</option>
                          {forms.map(f => <option key={f.id} value={f.id}>{f.title || 'Untitled form'}</option>)}
                        </select>
                        {forms.length === 0 && <p className="ak-hint">No forms yet. Make one in <a href="/admin/forms">Forms</a> first.</p>}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </Panel>

          {/* Auto claim-offer: the message Colvy sends when a customer reports an
              issue (dead/faulty/refund…) and matches an order. */}
          <Panel>
            <div className="ca-row">
              <IconTile color="#ff6a4d" size={40}>{svg(<><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z" /><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" /></>)}</IconTile>
              <div className="ca-t">
                <b>Offer a claim automatically</b>
                <p>When a customer mentions a problem (dead, faulty, damaged, refund…) and matches an order, Colvy offers to start a claim. Once per conversation.</p>
              </div>
              <Toggle on={autoOn} onChange={v => setConfig(c => ({ ...c, claim_auto_offer: { ...(c.claim_auto_offer || {}), enabled: v } }))} label="Offer a claim automatically" />
            </div>
            {autoOn && (
              <div className="ca-form ak-in">
                <label className="ak-label" htmlFor="ca-offer">Message</label>
                <textarea id="ca-offer" className="ak-field" rows={3}
                  value={config.claim_auto_offer?.message ?? DEFAULT_CLAIM_OFFER}
                  onChange={e => setConfig(c => ({ ...c, claim_auto_offer: { ...(c.claim_auto_offer || {}), message: e.target.value } }))} />
                <div className="ca-ph">
                  <span>Fills in:</span><code>{'{name}'}</code><small>first name</small><code>{'{business}'}</code><small>your business</small>
                </div>
                <p className="ak-hint">It only sends when a claim action above is on and the customer matches an order.</p>
              </div>
            )}
          </Panel>
        </div>

        <aside className="ca-side" aria-label="Preview">
          <p className="ca-side-h">What your team sees</p>
          <div className="ca-menu">
            <span className="ca-menu-btn">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
              Action
            </span>
            <div className="ca-menu-pop">
              {enabledActions.length === 0
                ? <p className="ca-menu-empty">Switch on an action to see it here.</p>
                : enabledActions.map(a => (
                  <div key={a.key} className="ca-menu-i">
                    <IconTile color={a.color} size={26}>{svg(a.icon)}</IconTile>
                    {a.label}
                  </div>
                ))}
            </div>
          </div>
          <p className="ca-side-note">{enabledActions.length} of {ACTION_CATALOGUE.length} actions on</p>
        </aside>
      </div>

      <SaveBar show={dirty} saving={saving} onSave={save} onDiscard={() => setConfig(JSON.parse(savedConfig))} />
      <style>{CA_CSS}</style>
    </SettingsPage>
  )
}

const CA_CSS = `
.ca-wrap{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:18px;align-items:start}
@media (max-width:1080px){.ca-wrap{grid-template-columns:minmax(0,1fr)}.ca-side{display:none}}
.ca-list{list-style:none;margin:0;padding:6px}
.ca-list li{padding:12px;border-radius:16px;transition:background .15s}
.ca-list li+li{box-shadow:0 -1px 0 var(--line)}
.ca-list li:hover{background:color-mix(in srgb,var(--f) 60%,transparent)}
.ca-list li:hover+li,.ca-list li+li:hover{box-shadow:none}
.ca-row{display:flex;align-items:center;gap:14px}
.ca-list li:not(.on) .stp-ic{filter:saturate(.35);opacity:.75;transition:filter .2s,opacity .2s}
.ca-t{flex:1;min-width:0}
.ca-t b{display:block;font-size:14.5px;font-weight:650;color:var(--ink)}
.ca-t p{margin:2px 0 0;font-size:13px;line-height:1.45;color:var(--mut)}
.ca-form{margin:12px 0 2px 54px;max-width:460px}
.ca-form textarea{max-width:none}
.ca-ph{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:8px;font-size:12.5px;color:var(--soft)}
.ca-ph code{height:22px;padding:0 7px;border-radius:6px;background:var(--f);color:var(--ink);font:600 12px/22px ui-monospace,SFMono-Regular,Menlo,monospace}
.ca-ph small{margin-right:6px;font-size:12px}
@media (max-width:560px){.ca-form{margin-left:0}.ca-row{align-items:flex-start}}
.ca-side{position:sticky;top:20px;padding:18px;border-radius:22px;background:linear-gradient(160deg,color-mix(in srgb,var(--coral) 9%,var(--card,#fff)),var(--card,#fff) 60%);box-shadow:0 0 0 1px rgba(0,0,0,.05)}
.ca-side-h{margin:0 0 12px;font-size:12.5px;font-weight:650;color:var(--mut)}
.ca-menu-btn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 13px;border-radius:999px;background:var(--ink);color:var(--card,#fff);font-size:13px;font-weight:650}
.ca-menu-pop{margin-top:8px;padding:6px;border-radius:16px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 14px 30px -14px rgba(16,24,40,.28)}
.ca-menu-i{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:11px;font-size:13.5px;font-weight:600;color:var(--ink);animation:akIn .3s cubic-bezier(.22,1,.36,1) both}
.ca-menu-i:first-child{background:var(--f)}
.ca-menu-i .stp-ic{border-radius:8px}
.ca-menu-empty{margin:0;padding:14px 10px;font-size:13px;color:var(--soft);text-align:center}
.ca-side-note{margin:12px 2px 0;font-size:12px;color:var(--soft)}
.ca-skel{display:flex;flex-direction:column;gap:10px}
.ca-skel span{height:58px;border-radius:14px;background:linear-gradient(90deg,var(--f) 25%,var(--f2) 37%,var(--f) 63%);background-size:400% 100%;animation:caSk 1.2s ease infinite}
@keyframes caSk{0%{background-position:100% 50%}100%{background-position:0 50%}}
`
