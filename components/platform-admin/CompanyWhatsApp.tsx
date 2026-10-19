'use client'

// Super admin → a company's console → WhatsApp (also opened from the
// WhatsApp page). The business's request, its WhatsApp sender on Colvy's
// Twilio account (number, display name, status, Twilio sender SID), its
// approved templates (Content SID + body), a test send, and this month's
// usage. Registration itself happens in Twilio's console / Meta Business
// Manager (WhatsAppSetupSteps); this records the result. Uses
// /api/platform-admin/whatsapp (audited).

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import {
  SENDER_STATUSES, SENDER_STATUS_LABEL, TEMPLATE_CATEGORIES, TEMPLATE_CATEGORY_LABEL, TEMPLATE_STATUSES, TEMPLATE_STATUS_LABEL,
  templateVariables, templateBodyProblems, fillTemplate, templateSendable, type WhatsAppTemplate,
} from '@/lib/whatsapp-core'

const card: React.CSSProperties = { background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 12, padding: 14, minWidth: 0 }
const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }
const input: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'var(--sa-bg)', color: 'var(--sa-text)', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }
const btn = (color: string, filled = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 13px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
  border: filled ? 'none' : '1px solid var(--sa-border)', background: filled ? color : 'var(--sa-card)', color: filled ? '#fff' : color, whiteSpace: 'nowrap',
})
const STATUS_COLOR: Record<string, string> = { not_requested: '#6b7280', pending: '#f59e0b', approved: '#10b981', rejected: '#ef4444', disabled: '#6b7280' }
const TPL_COLOR: Record<string, string> = { approved: '#10b981', pending: '#f59e0b', draft: '#6b7280', rejected: '#ef4444', paused: '#f59e0b', disabled: '#6b7280' }

const Field = ({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) => (
  <label style={{ minWidth: 0, display: 'block', ...(wide ? { gridColumn: '1 / -1' } : {}) }}>
    <span style={{ ...label, display: 'block', marginBottom: 5 }}>{title}</span>
    {children}
  </label>
)
const Tag = ({ text, color }: { text: string; color: string }) => (
  <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: color + '22', color, whiteSpace: 'nowrap' }}>{text}</span>
)

/** The real-world steps, shown to the super admin beside the form. */
export function WhatsAppSetupSteps({ webhookUrl }: { webhookUrl?: string }) {
  const hook = webhookUrl || 'https://colvy.com/api/twilio/whatsapp'
  return (
    <details style={{ ...card, padding: '10px 14px' }}>
      <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--sa-text)' }}>How to register a business’s WhatsApp number</summary>
      <ol style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--sa-muted)', lineHeight: 1.65 }}>
        <li>Use a number on Colvy’s Twilio account that can receive an SMS or call (Meta sends a code) and isn’t on the WhatsApp or WhatsApp Business app. Buy a new one if their Colvy number is.</li>
        <li>Twilio console → Messaging → Senders → WhatsApp senders → Create new sender (self sign-up / Meta embedded signup). Log in with Facebook and pick or create the Meta Business portfolio and WhatsApp Business Account. Prefer the business’s own portfolio (the owner logs in during signup, or adds Colvy as a partner). For many businesses, Twilio’s Tech Provider program lets this be embedded later.</li>
        <li>Enter the display name (it must follow Meta’s display-name rules and match their branding) and verify the number with the code.</li>
        <li>On the sender, set both “Webhook URL for incoming messages” and “Status callback URL” to <code style={{ wordBreak: 'break-all' }}>{hook}</code> (HTTP POST).</li>
        <li>Wait for Meta to approve the display name. Meta Business verification of the portfolio lifts the messaging limits.</li>
        <li>Templates: Twilio console → Messaging → Content Template Builder → new template, body with {'{{1}}'}, {'{{2}}'}…, category Utility, submit for WhatsApp approval. Copy its Content SID (HX…) and add it below with the same body.</li>
        <li>Here: set the number, display name, sender SID (XE…) and status Approved, then send a test. Until it’s Approved nothing is sent and messages to the number are ignored.</li>
      </ol>
      <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--sa-muted)', lineHeight: 1.5 }}>Billing: Twilio charges per WhatsApp message and Meta charges per template message by category (marketing, utility, authentication; utility templates inside an open 24-hour window and replies are free under Meta’s current pricing). None of it comes out of SMS credit. Usage is logged per business below; pricing to the business isn’t set up yet.</p>
    </details>
  )
}

type Tpl = WhatsAppTemplate & { rejection_reason?: string | null; updated_at?: string }
const blankTpl = { id: '', name: '', language: 'en', category: 'utility', body: '', contentSid: '', status: 'pending', labels: '', rejectionReason: '' }

export default function CompanyWhatsApp({ companyId }: { companyId: string }) {
  const [d, setD] = useState<any>(null)
  const [sender, setSender] = useState({ phoneNumber: '', displayName: '', status: 'not_requested', twilioSenderSid: '', wabaId: '', note: '' })
  const [tpl, setTpl] = useState<typeof blankTpl | null>(null)
  const [test, setTest] = useState<{ to: string; templateId: string; text: string; vars: Record<string, string> }>({ to: '', templateId: '', text: '', vars: {} })
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ where: string; tone: 'ok' | 'bad'; text: string } | null>(null)

  const load = async () => {
    try {
      const r = await authFetch(`/api/platform-admin/whatsapp?companyId=${encodeURIComponent(companyId)}`)
      const j = await r.json()
      if (!r.ok) { setD({ error: j.error || 'Could not load' }); return }
      setD(j)
      const s = j.sender || {}
      setSender({
        phoneNumber: s.phone_number || s.request?.phoneNumber || '', displayName: s.display_name || s.request?.displayName || '',
        status: s.status || 'not_requested', twilioSenderSid: s.twilio_sender_sid || '', wabaId: s.waba_id || '', note: s.admin_note || '',
      })
    } catch (e: any) { setD({ error: e?.message || 'Could not load' }) }
  }
  useEffect(() => { setD(null); load() }, [companyId])

  const post = async (where: string, body: any, ok: string) => {
    setBusy(where); setMsg(null)
    try {
      const r = await authFetch('/api/platform-admin/whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, ...body }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg({ where, tone: 'bad', text: j.error || 'That didn’t work' }); return false }
      setMsg({ where, tone: 'ok', text: typeof ok === 'string' ? ok : 'Saved.' })
      await load()
      return true
    } finally { setBusy('') }
  }

  if (!d) return <p style={{ color: 'var(--sa-muted)', fontSize: 13 }}>Loading…</p>
  if (d.error) return <p style={{ color: '#ef4444', fontSize: 13 }}>{d.error}</p>
  if (!d.ready) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card}><p style={{ fontSize: 12.5, color: 'var(--sa-muted)', margin: 0, lineHeight: 1.5 }}>Run <b>COLVY_V402_WHATSAPP.sql</b> to set up WhatsApp. Until then WhatsApp is dormant for every business.</p></div>
      <WhatsAppSetupSteps webhookUrl={d.webhookUrl} />
    </div>
  )
  const req = d.sender?.request || {}
  const templates: Tpl[] = d.templates || []
  const sendable = templates.filter(templateSendable)
  const testTpl = sendable.find(t => t.id === test.templateId) || null
  const u = d.usage || {}
  const note = (where: string) => msg && msg.where === where ? <p style={{ margin: '8px 0 0', fontSize: 12.5, color: msg.tone === 'ok' ? '#10b981' : '#ef4444' }}>{msg.text}</p> : null
  const tplProblems = tpl ? templateBodyProblems(tpl.body) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Where it stands */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <p style={label}>WhatsApp for {d.company?.name}</p>
          <Tag text={SENDER_STATUS_LABEL[(d.sender?.status || 'not_requested') as keyof typeof SENDER_STATUS_LABEL]} color={STATUS_COLOR[d.sender?.status || 'not_requested']} />
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 12.5, color: 'var(--sa-muted)' }}>
          <span>Colvy’s Twilio: <b style={{ color: d.platformReady ? '#10b981' : '#ef4444' }}>{d.platformReady ? 'configured' : 'not configured'}</b></span>
          <span>Plan channels: <b style={{ color: d.planOk ? '#10b981' : '#ef4444' }}>{d.planOk ? 'yes' : 'no'}</b></span>
          <span>WhatsApp switch (Entitlements): <b style={{ color: d.flagOn ? '#10b981' : '#ef4444' }}>{d.flagOn ? 'on' : 'off'}</b></span>
        </div>
        {d.sender?.requested_at && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--sa-border)', fontSize: 12.5, color: 'var(--sa-text)', lineHeight: 1.6 }}>
            <p style={{ ...label, marginBottom: 4 }}>Their request · {new Date(d.sender.requested_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
            <div><span style={{ color: 'var(--sa-muted)' }}>Display name:</span> {req.displayName || '—'}</div>
            <div><span style={{ color: 'var(--sa-muted)' }}>Number:</span> {req.phoneNumber || 'a new number'}</div>
            {req.website && <div><span style={{ color: 'var(--sa-muted)' }}>Website:</span> {req.website}</div>}
            {req.industry && <div><span style={{ color: 'var(--sa-muted)' }}>Industry:</span> {req.industry}</div>}
            {req.description && <div><span style={{ color: 'var(--sa-muted)' }}>About:</span> {req.description}</div>}
            {req.address && <div><span style={{ color: 'var(--sa-muted)' }}>Address:</span> {req.address}</div>}
            {(req.contactName || req.contactEmail) && <div><span style={{ color: 'var(--sa-muted)' }}>Contact:</span> {[req.contactName, req.contactEmail].filter(Boolean).join(' · ')}</div>}
            {req.notes && <div><span style={{ color: 'var(--sa-muted)' }}>Notes:</span> {req.notes}</div>}
          </div>
        )}
      </div>

      {/* Sender */}
      <div style={card}>
        <p style={{ ...label, marginBottom: 10 }}>Sender on Colvy’s Twilio account</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          <Field title="WhatsApp number (E.164)">
            <input value={sender.phoneNumber} onChange={e => setSender(s => ({ ...s, phoneNumber: e.target.value }))} list={`wa-nums-${companyId}`} placeholder="+61412345678" style={input} />
            <datalist id={`wa-nums-${companyId}`}>{(d.numbers || []).map((n: string) => <option key={n} value={n} />)}</datalist>
          </Field>
          <Field title="Display name (as Meta approved)"><input value={sender.displayName} onChange={e => setSender(s => ({ ...s, displayName: e.target.value }))} maxLength={80} style={input} /></Field>
          <Field title="Status">
            <select value={sender.status} onChange={e => setSender(s => ({ ...s, status: e.target.value }))} style={input}>
              {SENDER_STATUSES.map(s => <option key={s} value={s}>{SENDER_STATUS_LABEL[s]}</option>)}
            </select>
          </Field>
          <Field title="Twilio sender SID"><input value={sender.twilioSenderSid} onChange={e => setSender(s => ({ ...s, twilioSenderSid: e.target.value.trim() }))} placeholder="XE…" style={input} /></Field>
          <Field title="WhatsApp Business Account id"><input value={sender.wabaId} onChange={e => setSender(s => ({ ...s, wabaId: e.target.value.trim() }))} placeholder="optional" style={input} /></Field>
          <Field title="Note the business sees" wide><input value={sender.note} onChange={e => setSender(s => ({ ...s, note: e.target.value }))} maxLength={500} placeholder="e.g. Meta asked for a display name matching your website" style={input} /></Field>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => post('sender', { action: 'sender', ...sender }, sender.status === 'approved' ? 'Saved. WhatsApp is live for this business.' : 'Saved.')} disabled={!!busy} style={{ ...btn('#ff7a6b', true), opacity: busy ? 0.6 : 1 }}>{busy === 'sender' ? 'Saving…' : 'Save sender'}</button>
          {d.sender?.updated_by && <span style={{ fontSize: 11.5, color: 'var(--sa-muted)' }}>Last changed by {d.sender.updated_by}</span>}
        </div>
        {note('sender')}
      </div>

      {/* Templates */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <p style={label}>Templates ({templates.length})</p>
          {!tpl && <button onClick={() => setTpl({ ...blankTpl })} style={btn('#ff7a6b')}>Add template</button>}
        </div>
        {templates.length === 0 && !tpl && <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', margin: 0 }}>No templates yet. Without an approved utility template, the business can only reply within 24 hours of a customer’s message.</p>}
        {templates.map(t => (
          <div key={t.id} style={{ padding: '9px 0', borderTop: '1px solid var(--sa-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <code style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)' }}>{t.name}</code>
              <span style={{ fontSize: 11.5, color: 'var(--sa-muted)' }}>{t.language} · {TEMPLATE_CATEGORY_LABEL[t.category]}</span>
              <Tag text={TEMPLATE_STATUS_LABEL[t.status]} color={TPL_COLOR[t.status] || '#6b7280'} />
              {t.status === 'approved' && !templateSendable(t) && <span style={{ fontSize: 11, color: 'var(--sa-muted)' }}>can’t be sent from Colvy (only utility)</span>}
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
                <button onClick={() => setTpl({ id: t.id, name: t.name, language: t.language, category: t.category, body: t.body, contentSid: t.content_sid, status: t.status, labels: (t.variable_labels || []).join(', '), rejectionReason: t.rejection_reason || '' })} style={{ ...btn('var(--sa-text)'), padding: '5px 10px' }}>Edit</button>
                <button onClick={() => { if (confirm(`Delete the template ${t.name}? (It stays in Twilio.)`)) post('tpl', { action: 'delete_template', templateId: t.id }, 'Template deleted.') }} style={{ ...btn('#ef4444'), padding: '5px 10px' }}>Delete</button>
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--sa-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{t.body}</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--sa-muted)', wordBreak: 'break-all' }}>{t.content_sid}{t.rejection_reason ? ` · ${t.rejection_reason}` : ''}</p>
          </div>
        ))}
        {tpl && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--sa-border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
              <Field title="Name (as in Twilio / Meta)"><input value={tpl.name} onChange={e => setTpl({ ...tpl, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} placeholder="order_ready" style={input} /></Field>
              <Field title="Language"><input value={tpl.language} onChange={e => setTpl({ ...tpl, language: e.target.value.trim() })} placeholder="en or en_AU" style={input} /></Field>
              <Field title="Category">
                <select value={tpl.category} onChange={e => setTpl({ ...tpl, category: e.target.value })} style={input}>
                  {TEMPLATE_CATEGORIES.map(c => <option key={c} value={c}>{TEMPLATE_CATEGORY_LABEL[c]}</option>)}
                </select>
              </Field>
              <Field title="Status">
                <select value={tpl.status} onChange={e => setTpl({ ...tpl, status: e.target.value })} style={input}>
                  {TEMPLATE_STATUSES.map(s => <option key={s} value={s}>{TEMPLATE_STATUS_LABEL[s]}</option>)}
                </select>
              </Field>
              <Field title="Content SID" wide><input value={tpl.contentSid} onChange={e => setTpl({ ...tpl, contentSid: e.target.value.trim() })} placeholder="HX…" style={input} /></Field>
              <Field title="Body (exactly as approved, with {{1}} variables)" wide>
                <textarea value={tpl.body} onChange={e => setTpl({ ...tpl, body: e.target.value })} rows={3} maxLength={1024} placeholder="Hi {{1}}, your order {{2}} is ready to collect." style={{ ...input, resize: 'vertical' }} />
              </Field>
              <Field title={`Variable hints for the inbox (${templateVariables(tpl.body).length}), comma separated`} wide>
                <input value={tpl.labels} onChange={e => setTpl({ ...tpl, labels: e.target.value })} placeholder="Customer name, Order number" style={input} />
              </Field>
              {tpl.status === 'rejected' && <Field title="Why Meta rejected it" wide><input value={tpl.rejectionReason} onChange={e => setTpl({ ...tpl, rejectionReason: e.target.value })} maxLength={500} style={input} /></Field>}
            </div>
            {tplProblems.length > 0 && tpl.body && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#f59e0b' }}>{tplProblems.join(' ')}</p>}
            {tpl.category !== 'utility' && <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--sa-muted)' }}>Only utility templates can be sent from Colvy for now; this one is kept for reference.</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button onClick={async () => {
                const ok = await post('tpl', { action: 'template', template: { id: tpl.id || undefined, name: tpl.name, language: tpl.language, category: tpl.category, body: tpl.body, contentSid: tpl.contentSid, status: tpl.status, variableLabels: tpl.labels.split(',').map(s => s.trim()).filter(Boolean), rejectionReason: tpl.rejectionReason } }, 'Template saved.')
                if (ok) setTpl(null)
              }} disabled={!!busy} style={{ ...btn('#ff7a6b', true), opacity: busy ? 0.6 : 1 }}>{busy === 'tpl' ? 'Saving…' : tpl.id ? 'Save template' : 'Add template'}</button>
              <button onClick={() => setTpl(null)} style={btn('var(--sa-text)')}>Cancel</button>
            </div>
          </div>
        )}
        {note('tpl')}
      </div>

      {/* Test send */}
      <div style={card}>
        <p style={{ ...label, marginBottom: 6 }}>Test send</p>
        <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>Sends from this business’s sender (it must be Approved). Free text only reaches a number that messaged the business in the last 24 hours; otherwise pick a template.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          <Field title="To"><input value={test.to} onChange={e => setTest(t => ({ ...t, to: e.target.value }))} placeholder="+61412345678" inputMode="tel" style={input} /></Field>
          <Field title="Template">
            <select value={test.templateId} onChange={e => setTest(t => ({ ...t, templateId: e.target.value, vars: {} }))} style={input}>
              <option value="">Free text</option>
              {sendable.map(t => <option key={t.id} value={t.id}>{t.name} ({t.language})</option>)}
            </select>
          </Field>
          {!testTpl && <Field title="Message" wide><input value={test.text} onChange={e => setTest(t => ({ ...t, text: e.target.value }))} placeholder="Test from Colvy" style={input} /></Field>}
          {testTpl && templateVariables(testTpl.body).map((v, i) => (
            <Field key={v} title={`{{${v}}}${testTpl.variable_labels?.[i] ? ` · ${testTpl.variable_labels[i]}` : ''}`}>
              <input value={test.vars[v] || ''} onChange={e => setTest(t => ({ ...t, vars: { ...t.vars, [v]: e.target.value } }))} style={input} />
            </Field>
          ))}
        </div>
        {testTpl && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--sa-text)', whiteSpace: 'pre-wrap' }}>{fillTemplate(testTpl.body, test.vars).text}</p>}
        <button onClick={() => post('test', { action: 'test', to: test.to, ...(testTpl ? { templateId: testTpl.id, variables: test.vars } : { text: test.text }) }, 'Sent. Check the phone; delivery shows in usage below.')}
          disabled={!!busy || !test.to.trim() || (!testTpl && !test.text.trim())} style={{ ...btn('#25D366', true), marginTop: 10, opacity: busy || !test.to.trim() || (!testTpl && !test.text.trim()) ? 0.55 : 1 }}>
          {busy === 'test' ? 'Sending…' : 'Send test'}
        </button>
        {note('test')}
      </div>

      {/* Usage */}
      <div style={card}>
        <p style={{ ...label, marginBottom: 8 }}>Usage this month</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
          {[
            ['Received', u.inbound], ['Replies sent', u.session], ['Utility templates', u.template?.utility],
            ['Marketing templates', u.template?.marketing], ['Delivered', u.delivered], ['Read', u.read], ['Failed', u.failed], ['Tests', u.tests],
          ].map(([k, v]) => (
            <div key={k as string} style={{ padding: '8px 10px', borderRadius: 9, border: '1px solid var(--sa-border)' }}>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--sa-text)' }}>{Number(v || 0).toLocaleString('en-AU')}</p>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--sa-muted)' }}>{k}</p>
            </div>
          ))}
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--sa-muted)' }}>From whatsapp_messages. Not charged to the business yet; compare with the Twilio invoice.</p>
      </div>

      <WhatsAppSetupSteps webhookUrl={d.webhookUrl} />
    </div>
  )
}
