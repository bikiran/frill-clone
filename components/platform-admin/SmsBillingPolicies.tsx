'use client'

// Super admin → SMS credits → SMS billing policies. One row per plan: how its
// companies pay for texts (unlimited, allowance then credit, credit only,
// allowance only, or no SMS), the monthly allowance, and whether they can top
// up and use auto top-up themselves. Before saving, each changed row says who
// it affects ("Enterprise: 3 companies will start using SMS credits beyond
// 3,000 texts/month (1 has its own override)"). Saved to platform_settings
// through /api/platform-admin/sms-policy, which audits every change.
// A company's own override (its console → SMS billing) beats its plan's row.

import { useEffect, useMemo, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import {
  SMS_MODES, SMS_MODE_LABEL, SMS_MODE_HINT, planChangePreview, allowanceWords,
  type PolicyFields, type PolicyPlan, type SmsMode,
} from '@/lib/sms-policy-core'

const card: React.CSSProperties = { background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 18, minWidth: 0 }
const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }
const input: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'var(--sa-bg)', color: 'var(--sa-text)', fontSize: 13, boxSizing: 'border-box' }
const btn = (color: string, filled = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
  border: filled ? 'none' : '1px solid var(--sa-border)', background: filled ? color : 'var(--sa-card)', color: filled ? '#fff' : color, whiteSpace: 'nowrap',
})
const infoIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
const usesAllowance = (m: SmsMode) => m === 'allowance_then_credit' || m === 'allowance_only'
const usesCredit = (m: SmsMode) => m === 'allowance_then_credit' || m === 'credit_only'

type Row = {
  plan: PolicyPlan; name: string; saved: PolicyFields | null
  codeDefault: { mode: SmsMode; monthly_allowance: number | null }
  effective: { mode: SmsMode; allowance: number | null; topupEnabled: boolean; autoTopupAllowed: boolean }
  companies: number; overridden: number
}

const same = (a: PolicyFields, b: PolicyFields) =>
  (a.mode ?? null) === (b.mode ?? null) && (a.monthly_allowance ?? null) === (b.monthly_allowance ?? null)
  && (a.topup_enabled ?? null) === (b.topup_enabled ?? null) && (a.auto_topup_allowed ?? null) === (b.auto_topup_allowed ?? null)

function Check({ on, onChange, disabled, children }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: disabled ? 'var(--sa-muted)' : 'var(--sa-text)', cursor: disabled ? 'default' : 'pointer', minHeight: 34 }}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={e => onChange(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#ff7a6b' }} />
      {children}
    </label>
  )
}

export default function SmsBillingPolicies({ initial }: { initial?: any } = {}) {
  const [d, setD] = useState<any>(initial || null)
  const [draft, setDraft] = useState<Record<string, PolicyFields>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string; lines?: string[] } | null>(null)
  const rows: Row[] = d?.plans || []

  const reset = (data: any) => {
    const next: Record<string, PolicyFields> = {}
    for (const r of (data?.plans || []) as Row[]) next[r.plan] = { ...(r.saved || {}) }
    setDraft(next)
  }
  const load = async () => {
    try {
      const r = await authFetch('/api/platform-admin/sms-policy')
      const j = await r.json()
      if (!r.ok) { setD({ error: j.error || 'Could not load' }); return }
      setD(j); reset(j)
    } catch (e: any) { setD({ error: e?.message || 'Could not load' }) }
  }
  useEffect(() => { if (initial) reset(initial); else load() }, [])

  const changed = useMemo(() => rows.filter(r => !same(r.saved || {}, draft[r.plan] || {})), [rows, draft])
  const previews = useMemo(() => {
    const out: Record<string, string | null> = {}
    for (const r of rows) out[r.plan] = planChangePreview({ plan: r.plan, before: r.saved || {}, after: draft[r.plan] || {}, companies: r.companies, overridden: r.overridden })
    return out
  }, [rows, draft])

  const set = (plan: string, patch: PolicyFields) => setDraft(prev => ({ ...prev, [plan]: { ...(prev[plan] || {}), ...patch } }))

  const save = async () => {
    if (!changed.length) return
    setBusy(true); setMsg(null)
    try {
      const plans: Record<string, PolicyFields> = {}
      for (const r of changed) plans[r.plan] = draft[r.plan] || {}
      const res = await authFetch('/api/platform-admin/sms-policy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plans }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ tone: 'bad', text: j.error || 'That didn’t save' }); return }
      setMsg({ tone: 'ok', text: 'Saved. The next text each company sends follows the new policy.', lines: (j.changes || []).map((c: any) => c.preview) })
      await load()
    } finally { setBusy(false) }
  }

  return (
    <div style={{ ...card, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ minWidth: 0, flex: '1 1 320px' }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--sa-text)', margin: 0 }}>SMS billing policies</p>
          <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', margin: '3px 0 0', lineHeight: 1.5 }}>How each plan pays for texts. A company’s own setting (its console → SMS billing) beats its plan. Rates are on the SMS Pricing page.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {changed.length > 0 && <button onClick={() => reset(d)} disabled={busy} style={btn('var(--sa-text)')}>Discard</button>}
          <button onClick={save} disabled={!changed.length || busy} style={{ ...btn('#ff7a6b', true), opacity: !changed.length || busy ? 0.55 : 1 }}>{busy ? 'Saving…' : changed.length ? `Save ${changed.length} plan${changed.length === 1 ? '' : 's'}` : 'Save'}</button>
        </div>
      </div>
      {d?.error && <p style={{ color: '#ef4444', fontSize: 13, margin: '0 0 10px' }}>{d.error}</p>}
      {!d && <p style={{ color: 'var(--sa-muted)', fontSize: 13 }}>Loading…</p>}
      {d && d.tableReady === false && (
        <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: '0 0 10px', display: 'flex', gap: 6, alignItems: 'flex-start' }}>{infoIcon}<span>Plan policies work now. Per-company overrides need <b>COLVY_V398_SMS_BILLING_POLICY.sql</b>.</span></p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(r => {
          const f = draft[r.plan] || {}
          const mode: SmsMode = f.mode || r.codeDefault.mode
          const dirty = !same(r.saved || {}, f)
          const preview = previews[r.plan]
          const defAllowance = r.codeDefault.monthly_allowance ?? 3000
          return (
            <div key={r.plan} style={{ border: `1px solid ${dirty ? '#ff7a6b' : 'var(--sa-border)'}`, borderRadius: 12, padding: 14, background: 'var(--sa-bg)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, alignItems: 'start' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--sa-text)', margin: 0 }}>{r.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: '2px 0 0' }}>{r.companies.toLocaleString('en-AU')} compan{r.companies === 1 ? 'y' : 'ies'}{r.overridden ? ` · ${r.overridden} with their own override` : ''}</p>
                  <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '4px 0 0' }}>Now: {SMS_MODE_LABEL[r.effective.mode]}{usesAllowance(r.effective.mode) ? `, ${allowanceWords(r.effective.mode, r.effective.allowance ?? 0)}` : ''}</p>
                </div>
                <label style={{ minWidth: 0 }}>
                  <span style={{ ...label, display: 'block', marginBottom: 5 }}>Mode</span>
                  <select value={f.mode || ''} onChange={e => set(r.plan, { mode: (e.target.value || null) as SmsMode | null })} style={input} aria-label={`${r.name} mode`}>
                    <option value="">Colvy default ({SMS_MODE_LABEL[r.codeDefault.mode]})</option>
                    {SMS_MODES.map(m => <option key={m} value={m}>{SMS_MODE_LABEL[m]}</option>)}
                  </select>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--sa-muted)', marginTop: 4, lineHeight: 1.4 }}>{SMS_MODE_HINT[mode]}</span>
                </label>
                <label style={{ minWidth: 0 }}>
                  <span style={{ ...label, display: 'block', marginBottom: 5 }}>Texts a month</span>
                  {usesAllowance(mode) ? (
                    <input value={f.monthly_allowance ?? ''} inputMode="numeric" placeholder={`${defAllowance.toLocaleString('en-AU')} (default)`}
                      onChange={e => { const v = e.target.value.replace(/[^\d]/g, ''); set(r.plan, { monthly_allowance: v === '' ? null : Number(v) }) }}
                      style={input} aria-label={`${r.name} monthly allowance`} />
                  ) : (
                    <p style={{ ...input, margin: 0, color: 'var(--sa-muted)', background: 'transparent' }}>{mode === 'unlimited' ? 'Unlimited' : mode === 'credit_only' ? 'None (all from credit)' : 'No SMS'}</p>
                  )}
                </label>
                <div style={{ minWidth: 0 }}>
                  <span style={{ ...label, display: 'block', marginBottom: 2 }}>Credit</span>
                  <Check on={(f.topup_enabled ?? true) && usesCredit(mode)} disabled={!usesCredit(mode)} onChange={v => set(r.plan, { topup_enabled: v })}>Top-ups allowed</Check>
                  <Check on={(f.auto_topup_allowed ?? true) && (f.topup_enabled ?? true) && usesCredit(mode)} disabled={!usesCredit(mode) || !(f.topup_enabled ?? true)} onChange={v => set(r.plan, { auto_topup_allowed: v })}>Auto top-up allowed</Check>
                </div>
              </div>
              {dirty && preview && (
                <p role="status" style={{ margin: '10px 0 0', fontSize: 12.5, fontWeight: 600, color: '#c2410c', display: 'flex', gap: 6, alignItems: 'flex-start', lineHeight: 1.45 }}>{infoIcon}<span>{preview}</span></p>
              )}
              {dirty && !preview && <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--sa-muted)' }}>No change for companies on this plan (same as the current policy).</p>}
            </div>
          )
        })}
      </div>
      {msg && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: msg.tone === 'ok' ? '#10b981' : '#ef4444' }}>
          <p style={{ margin: 0, fontWeight: 700 }}>{msg.text}</p>
          {(msg.lines || []).map((l, i) => <p key={i} style={{ margin: '3px 0 0', color: 'var(--sa-muted)' }}>{l}</p>)}
        </div>
      )}
      <p style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--sa-muted)', lineHeight: 1.5 }}>
        Free and Feedback plans don’t include SMS channels, so their companies send nothing whatever the mode, unless Channels is turned on for them in Entitlements. Switching a plan to unlimited stops charging straight away and gives back credit held for scheduled campaigns when they next run. Every change is in Audit Logs.
      </p>
    </div>
  )
}
