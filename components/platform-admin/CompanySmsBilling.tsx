'use client'

// Super admin → a company's console → SMS billing. The effective SMS billing
// policy with where each value comes from ("from Enterprise plan" or "set for
// this company"), override controls with "Inherit from plan" per field, a
// note, Save and Reset to plan. Also the SMS credit balance, a link to the
// ledger, and the manual adjustment: add credit, or charge (a charge never
// takes the balance below zero). Uses /api/platform-admin/sms-policy and
// /api/platform-admin/sms-credits, both audited.

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { fmtCents, fmtRate, parseAudToCents } from '@/lib/sms-credits-core'
import { SMS_MODES, SMS_MODE_LABEL, SMS_MODE_HINT, allowanceWords, sourceWords, type SmsMode, type PolicySource } from '@/lib/sms-policy-core'
import type { Plan } from '@/lib/plan'

const card: React.CSSProperties = { background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 12, padding: 14, minWidth: 0 }
const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }
const input: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'var(--sa-bg)', color: 'var(--sa-text)', fontSize: 13, boxSizing: 'border-box' }
const btn = (color: string, filled = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 13px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
  border: filled ? 'none' : '1px solid var(--sa-border)', background: filled ? color : 'var(--sa-card)', color: filled ? '#fff' : color, whiteSpace: 'nowrap',
})
const linkIcon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
const usesAllowance = (m: SmsMode) => m === 'allowance_then_credit' || m === 'allowance_only'

type Tri = '' | 'yes' | 'no'
const toTri = (v: boolean | null | undefined): Tri => (v === true ? 'yes' : v === false ? 'no' : '')
const fromTri = (v: Tri) => (v === 'yes' ? true : v === 'no' ? false : null)

function Source({ s, plan }: { s: PolicySource; plan: Plan }) {
  const mine = s === 'company'
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap', background: mine ? '#ff7a6b22' : 'var(--sa-bg)', color: mine ? '#c2410c' : 'var(--sa-muted)', border: mine ? 'none' : '1px solid var(--sa-border)' }}>{sourceWords(s, plan)}</span>
}

function Line({ k, v, s, plan }: { k: string; v: React.ReactNode; s: PolicySource; plan: Plan }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--sa-border)', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>{k}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)' }}>{v}</span>
        <Source s={s} plan={plan} />
      </span>
    </div>
  )
}

export default function CompanySmsBilling({ companyId, initial }: { companyId: string; initial?: any }) {
  const [d, setD] = useState<any>(initial || null)
  const [mode, setMode] = useState<SmsMode | ''>('')
  const [allow, setAllow] = useState('')
  const [topup, setTopup] = useState<Tri>('')
  const [auto, setAuto] = useState<Tri>('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  // Manual adjustment
  const [kind, setKind] = useState<'credit' | 'charge'>('credit')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [adjMsg, setAdjMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  const sync = (j: any) => {
    const o = j?.override || {}
    setMode(o.sms_mode || ''); setAllow(o.monthly_allowance != null ? String(o.monthly_allowance) : '')
    setTopup(toTri(o.topup_enabled)); setAuto(toTri(o.auto_topup_allowed)); setNote(o.note || '')
  }
  const load = async () => {
    try {
      const r = await authFetch(`/api/platform-admin/sms-policy?companyId=${encodeURIComponent(companyId)}`)
      const j = await r.json()
      if (!r.ok) { setD({ error: j.error || 'Could not load' }); return }
      setD(j); sync(j)
    } catch (e: any) { setD({ error: e?.message || 'Could not load' }) }
  }
  useEffect(() => { if (initial) sync(initial); else load() }, [companyId])

  if (!d) return <p style={{ color: 'var(--sa-muted)', fontSize: 13 }}>Loading…</p>
  if (d.error) return <p style={{ color: '#ef4444', fontSize: 13 }}>{d.error}</p>
  const p = d.policy
  const plan: Plan = p.plan
  const planName = d.company?.planName || plan
  const lvl = p.planLevel
  const o = d.override || {}
  const dirty = (o.sms_mode || '') !== mode || String(o.monthly_allowance ?? '') !== allow || toTri(o.topup_enabled) !== topup || toTri(o.auto_topup_allowed) !== auto || (o.note || '') !== note
  const hasOverride = !!(o.sms_mode || o.monthly_allowance != null || o.topup_enabled != null || o.auto_topup_allowed != null)
  const shownMode: SmsMode = (mode || lvl.mode) as SmsMode
  const w = d.wallet

  const save = async (reset = false) => {
    setBusy(reset ? 'reset' : 'save'); setMsg(null)
    try {
      const body = reset ? { companyId, reset: true } : {
        companyId, note,
        override: { mode: mode || null, monthly_allowance: allow === '' ? null : Number(allow), topup_enabled: fromTri(topup), auto_topup_allowed: fromTri(auto) },
      }
      const r = await authFetch('/api/platform-admin/sms-policy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg({ tone: 'bad', text: j.error || 'That didn’t save' }); return }
      setMsg({ tone: 'ok', text: reset ? `Back to the ${planName} plan’s settings.` : 'Saved. Their next text follows this.' })
      await load()
    } finally { setBusy('') }
  }

  const cents = parseAudToCents(amount)
  const adjValid = Number.isFinite(cents) && cents > 0 && reason.trim().length >= 3
  const overBalance = kind === 'charge' && Number.isFinite(cents) && cents > (w?.balanceCents || 0)
  const adjust = async () => {
    if (!adjValid || overBalance) return
    setBusy('adjust'); setAdjMsg(null)
    try {
      const r = await authFetch('/api/platform-admin/sms-credits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, amountCents: kind === 'charge' ? -cents : cents, reason: reason.trim() }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setAdjMsg({ tone: 'bad', text: j.error || 'That didn’t work' }); return }
      setAdjMsg({ tone: 'ok', text: `${kind === 'charge' ? 'Charged' : 'Added'} ${fmtCents(cents)}. New balance ${fmtCents(j.balanceCents)}.` }); setAmount(''); setReason('')
      await load()
    } finally { setBusy('') }
  }

  const triSelect = (v: Tri, set: (t: Tri) => void, inherited: boolean, aria: string, disabled = false) => (
    <select value={v} onChange={e => set(e.target.value as Tri)} style={{ ...input, opacity: disabled ? 0.6 : 1 }} aria-label={aria} disabled={disabled}>
      <option value="">Inherit from plan ({inherited ? 'yes' : 'no'})</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Effective policy */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
          <p style={label}>How {d.company?.name || 'this company'} pays for texts</p>
          <span style={{ fontSize: 12, fontWeight: 800, color: p.entitled ? (p.chargesCredit ? '#2b59ff' : '#10b981') : '#ef4444' }}>{SMS_MODE_LABEL[p.mode as SmsMode]}</span>
        </div>
        <Line k="Mode" v={SMS_MODE_LABEL[p.mode as SmsMode]} s={p.source.mode} plan={plan} />
        <Line k="Monthly allowance" v={allowanceWords(p.mode, p.allowance ?? Infinity)} s={p.source.allowance} plan={plan} />
        <Line k="Top-ups by the business" v={p.chargesCredit ? (p.canTopUp ? 'Allowed' : 'Managed by Colvy') : 'Not used'} s={p.source.topupEnabled} plan={plan} />
        <Line k="Auto top-up" v={p.chargesCredit ? (p.canAutoTopUp ? 'Allowed' : 'Not allowed') : 'Not used'} s={p.source.autoTopupAllowed} plan={plan} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>Rate beyond the allowance</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)' }}>{fmtRate(d.rate?.pricePerPart || 0)} a text</span>
            <span style={{ fontSize: 11, color: 'var(--sa-muted)' }}>{d.rate?.ownRate ? 'own rate' : 'platform rate'}</span>
            <a href="/platform-admin#sms" target="_blank" rel="noopener" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: '#ff7a6b', textDecoration: 'none' }}>SMS Pricing {linkIcon}</a>
          </span>
        </div>
        {p.blockReason === 'plan' && p.mode === 'disabled' && <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--sa-muted)', lineHeight: 1.45 }}>The {planName} plan doesn’t include SMS channels. To let them text, turn on Channels in Entitlements first, then choose a mode here.</p>}
      </div>

      {/* Override */}
      <div style={card}>
        <p style={{ ...label, marginBottom: 10 }}>Set for this company</p>
        {d.tableReady === false ? (
          <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', margin: 0, lineHeight: 1.5 }}>Run <b>COLVY_V398_SMS_BILLING_POLICY.sql</b> to set SMS billing per company. Until then every company follows its plan’s policy.</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              <label style={{ minWidth: 0 }}>
                <span style={{ ...label, display: 'block', marginBottom: 5 }}>Mode</span>
                <select value={mode} onChange={e => setMode(e.target.value as SmsMode | '')} style={input} aria-label="Mode">
                  <option value="">Inherit from plan ({SMS_MODE_LABEL[lvl.mode as SmsMode]})</option>
                  {SMS_MODES.map(m => <option key={m} value={m}>{SMS_MODE_LABEL[m]}</option>)}
                </select>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--sa-muted)', marginTop: 4, lineHeight: 1.4 }}>{SMS_MODE_HINT[shownMode]}</span>
              </label>
              <label style={{ minWidth: 0 }}>
                <span style={{ ...label, display: 'block', marginBottom: 5 }}>Texts a month</span>
                <input value={allow} onChange={e => setAllow(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" disabled={!usesAllowance(shownMode)}
                  placeholder={usesAllowance(shownMode) ? `Inherit from plan (${lvl.allowance != null ? Number(lvl.allowance).toLocaleString('en-AU') : '3,000'})` : 'Not used in this mode'} style={{ ...input, opacity: usesAllowance(shownMode) ? 1 : 0.6 }} aria-label="Monthly allowance" />
              </label>
              <label style={{ minWidth: 0 }}>
                <span style={{ ...label, display: 'block', marginBottom: 5 }}>Top-ups allowed</span>
                {triSelect(topup, setTopup, lvl.topupEnabled, 'Top-ups allowed')}
              </label>
              <label style={{ minWidth: 0 }}>
                <span style={{ ...label, display: 'block', marginBottom: 5 }}>Auto top-up allowed</span>
                {triSelect(auto, setAuto, lvl.autoTopupAllowed, 'Auto top-up allowed')}
              </label>
            </div>
            <label style={{ display: 'block', marginTop: 10 }}>
              <span style={{ ...label, display: 'block', marginBottom: 5 }}>Note (why, for the audit log)</span>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Agreed unlimited texts with the owner, 18 Oct" style={input} aria-label="Note" maxLength={500} />
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
              <button onClick={() => save(false)} disabled={!dirty || !!busy} style={{ ...btn('#ff7a6b', true), opacity: !dirty || busy ? 0.55 : 1 }}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
              <button onClick={() => save(true)} disabled={!hasOverride || !!busy} style={{ ...btn('var(--sa-text)'), opacity: !hasOverride || busy ? 0.55 : 1 }}>{busy === 'reset' ? 'Resetting…' : 'Reset to plan'}</button>
              {o.updated_at && <span style={{ fontSize: 11.5, color: 'var(--sa-muted)' }}>Last changed {new Date(o.updated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}{o.updated_by ? ` by ${o.updated_by}` : ''}</span>}
            </div>
            {msg && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: msg.tone === 'ok' ? '#10b981' : '#ef4444' }}>{msg.text}</p>}
          </>
        )}
      </div>

      {/* Balance + manual adjustment */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <p style={label}>SMS credit balance</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--sa-text)', margin: '4px 0 0' }}>{w?.ready ? fmtCents(w.balanceCents) : 'Not set up'}</p>
            {w?.ready && <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: '2px 0 0' }}>{w.heldCents ? `Plus ${fmtCents(w.heldCents)} held for campaigns` : 'Nothing held'} · auto top-up {w.autoTopUp?.enabled ? 'on' : 'off'}</p>}
          </div>
          <a href={`/platform-admin#smscredits/${companyId}`} target="_blank" rel="noopener" style={{ ...btn('var(--sa-text)'), textDecoration: 'none' }}>Ledger {linkIcon}</a>
        </div>
        {w?.ready ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginTop: 12, alignItems: 'end' }}>
              <div style={{ display: 'flex', gap: 6 }} role="radiogroup" aria-label="Adjustment type">
                {(['credit', 'charge'] as const).map(k => (
                  <button key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)} style={{ ...btn(k === 'credit' ? '#10b981' : '#ef4444', kind === k), flex: 1 }}>{k === 'credit' ? 'Add credit' : 'Charge'}</button>
                ))}
              </div>
              <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount, e.g. 25.00" inputMode="decimal" style={input} aria-label="Amount in dollars" />
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder={kind === 'charge' ? 'Reason (shown in their ledger), e.g. texts sent before credit was set up' : 'Reason (shown in their ledger)'} style={{ ...input, gridColumn: '1 / -1' }} aria-label="Reason" />
              <button onClick={adjust} disabled={!adjValid || overBalance || !!busy} style={{ ...btn(kind === 'charge' ? '#ef4444' : '#ff7a6b', true), opacity: !adjValid || overBalance || busy ? 0.55 : 1, gridColumn: '1 / -1' }}>
                {busy === 'adjust' ? 'Saving…' : `${kind === 'charge' ? 'Charge' : 'Add'} ${Number.isFinite(cents) && cents > 0 ? fmtCents(cents) : ''}`}
              </button>
            </div>
            {overBalance && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#ef4444' }}>That’s more than the balance ({fmtCents(w.balanceCents)}). A charge can’t take the balance below zero.</p>}
            {adjMsg && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: adjMsg.tone === 'ok' ? '#10b981' : '#ef4444' }}>{adjMsg.text}</p>}
            <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--sa-muted)', lineHeight: 1.5 }}>Shows in their ledger as “Credit from Colvy” or “Charge by Colvy” with the reason, and in Audit Logs.</p>
          </>
        ) : <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--sa-muted)' }}>Run COLVY_V395_SMS_CREDITS.sql to turn SMS credits on.</p>}
      </div>
    </div>
  )
}
