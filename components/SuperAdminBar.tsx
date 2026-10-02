'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// In-workspace Super-Admin context bar.
// Renders ONLY for a platform super-admin (the summary API 403s for everyone
// else, so this is invisible to normal admins). It surfaces the company's plan,
// trial state and live usage while you're inside their admin, and lets you act —
// change plan, grant credit, extend trial, suspend — without leaving the
// workspace. All actions go through the existing super-admin-gated APIs, and
// every privileged action is recorded to the super-admin audit log (viewable
// here via "Audit").

const PLANS = ['free', 'trial', 'feedback', 'omnichannel', 'everything', 'enterprise', 'suspended']
const PLAN_COLOR: Record<string, string> = { free: '#6b7280', trial: '#6366f1', feedback: '#7c5cff', omnichannel: '#2b59ff', everything: '#ff6a4d', pro: '#10b981', enterprise: '#8b5cf6', suspended: '#ef4444' }

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const t = data?.session?.access_token
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

export default function SuperAdminBar({ companyId }: { companyId: string | null }) {
  const [data, setData] = useState<{ company: any; usage: any } | null>(null)
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [open, setOpen] = useState(true)
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState('')
  const [creditOpen, setCreditOpen] = useState(false)
  const [creditAmt, setCreditAmt] = useState('')
  const [auditOpen, setAuditOpen] = useState(false)
  const [audit, setAudit] = useState<any[] | null>(null)
  const [auditNote, setAuditNote] = useState('')
  const lastId = useRef<string | null>(null)

  const load = async (cid: string) => {
    try {
      const res = await fetch(`/api/platform-admin/company?companyId=${cid}`, { headers: await authHeaders() })
      if (res.status === 403) { setAllowed(false); return }
      if (!res.ok) { setAllowed(false); return }
      const d = await res.json()
      setAllowed(true)
      setData(d)
    } catch { setAllowed(false) }
  }

  useEffect(() => {
    if (!companyId || companyId === lastId.current) return
    lastId.current = companyId
    load(companyId)
  }, [companyId])

  if (!allowed || !data?.company) return null
  const co = data.company
  const u = data.usage || {}
  const plan = String(co.plan || 'free')
  const suspended = plan === 'suspended'
  const trialLeft = co.trial_ends_at ? Math.ceil((new Date(co.trial_ends_at).getTime() - Date.now()) / 86400000) : null

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 4000) }

  const patchCompany = async (patch: any, label: string) => {
    if (!companyId) return
    setBusy(label)
    try {
      const res = await fetch('/api/platform-admin/company', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ companyId, patch }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed')
      await load(companyId)
      flash('Saved.')
    } catch (e: any) { flash(e.message) } finally { setBusy('') }
  }

  const changePlan = (p: string) => { if (p && p !== plan) patchCompany({ plan: p }, 'plan') }
  const extendTrial = () => {
    const base = trialLeft && trialLeft > 0 && co.trial_ends_at ? new Date(co.trial_ends_at).getTime() : Date.now()
    patchCompany({ trial_ends_at: new Date(base + 14 * 86400000).toISOString() }, 'trial')
  }
  const toggleSuspend = () => {
    if (suspended) { if (confirm('Reactivate this workspace? It will be set to the Free plan.')) patchCompany({ plan: 'free' }, 'suspend') }
    else { if (confirm('Suspend this workspace? The plan is set to "suspended".')) patchCompany({ plan: 'suspended' }, 'suspend') }
  }
  const openAudit = async () => {
    setAuditOpen(true); setAudit(null); setAuditNote('')
    try {
      const res = await fetch(`/api/platform-admin/audit?companyId=${companyId}&limit=50`, { headers: await authHeaders() })
      const d = await res.json()
      if (d.needsMigration) { setAuditNote(d.error || 'Audit log not set up yet.'); setAudit([]); return }
      if (!res.ok) throw new Error(d.error || 'Failed')
      setAudit(d.entries || [])
    } catch (e: any) { setAuditNote(e.message); setAudit([]) }
  }

  const grantCredit = async () => {
    const dollars = Number(creditAmt)
    if (!Number.isFinite(dollars) || dollars === 0) { flash('Enter a non-zero amount.'); return }
    setBusy('credit')
    try {
      const res = await fetch('/api/platform-admin/company-credit', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ companyId, amountCents: Math.round(dollars * 100), reason: 'Super-admin manual credit' }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed')
      setCreditOpen(false); setCreditAmt(''); flash(`Credited $${dollars.toFixed(2)}.`)
    } catch (e: any) { flash(e.message) } finally { setBusy('') }
  }

  const chip = (label: string, value: any) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap' }}>
      <span style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span><strong style={{ color: '#fff', fontWeight: 700 }}>{value}</strong>
    </span>
  )

  // Collapsed pill.
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} title="Super Admin"
        style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 4000, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 999, background: '#0d0d0d', color: '#fff', border: '1px solid rgba(255,255,255,0.16)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}>
        🛡 Super Admin
        <span style={{ padding: '2px 8px', borderRadius: 999, background: PLAN_COLOR[plan] || '#6b7280', fontSize: 10.5, textTransform: 'capitalize' }}>{plan}</span>
      </button>
    )
  }

  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 4000, background: '#0d0d0d', color: '#fff', borderTop: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 -8px 30px rgba(0,0,0,0.35)' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color: '#ff6a4d', whiteSpace: 'nowrap' }}>🛡 SUPER ADMIN</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{co.name}</span>

        {/* Plan selector */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: PLAN_COLOR[plan] || '#6b7280' }} />
          <select value={plan} disabled={busy === 'plan'} onChange={e => changePlan(e.target.value)}
            style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 8, padding: '4px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}>
            {PLANS.map(p => <option key={p} value={p} style={{ color: '#000' }}>{p}</option>)}
          </select>
        </span>

        {trialLeft !== null && (
          <span style={{ fontSize: 12, color: trialLeft <= 0 ? '#fca5a5' : 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap' }}>
            {trialLeft > 0 ? `Trial: ${trialLeft}d left` : 'Trial ended'}
          </span>
        )}

        <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.14)' }} />
        {chip('Team', u.team ?? 0)}
        {chip('Contacts', u.contacts ?? 0)}
        {chip('Open', u.openConvos ?? 0)}
        {chip('SMS/mo', u.smsMonth ?? 0)}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {toast && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{toast}</span>}

          {creditOpen ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>$</span>
              <input value={creditAmt} onChange={e => setCreditAmt(e.target.value)} placeholder="20" autoFocus
                style={{ width: 60, background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 8, padding: '4px 8px', fontSize: 12 }} />
              <button onClick={grantCredit} disabled={busy === 'credit'} style={saBtn('#10b981')}>{busy === 'credit' ? '…' : 'Grant'}</button>
              <button onClick={() => { setCreditOpen(false); setCreditAmt('') }} style={saBtn('rgba(255,255,255,0.12)')}>✕</button>
            </span>
          ) : (
            <button onClick={() => setCreditOpen(true)} style={saBtn('rgba(255,255,255,0.12)')}>+ Credit</button>
          )}
          <button onClick={extendTrial} disabled={busy === 'trial'} style={saBtn('rgba(255,255,255,0.12)')}>{busy === 'trial' ? '…' : '+14d trial'}</button>
          <button onClick={toggleSuspend} disabled={busy === 'suspend'} style={saBtn(suspended ? '#10b981' : '#ef4444')}>
            {busy === 'suspend' ? '…' : (suspended ? 'Reactivate' : 'Suspend')}
          </button>
          <button onClick={openAudit} style={saBtn('rgba(255,255,255,0.12)')}>Audit</button>
          <a href="https://admin.colvy.com/#companies" target="_blank" rel="noreferrer" style={{ ...saBtn('rgba(255,255,255,0.12)'), textDecoration: 'none' }}>Console ↗</a>
          <button onClick={() => setOpen(false)} title="Hide" style={{ ...saBtn('transparent'), border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 16, padding: '2px 6px' }}>▾</button>
        </div>
      </div>

      {auditOpen && (
        <div onClick={() => setAuditOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 4100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 'min(560px, 100%)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: '#141414', color: '#fff', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 14, boxShadow: '0 24px 70px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>Super-Admin audit</div>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)' }}>{co.name}</div>
              </div>
              <button onClick={() => setAuditOpen(false)} style={{ ...saBtn('rgba(255,255,255,0.1)') }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '8px 16px 16px' }}>
              {audit === null ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Loading…</div>
              ) : audit.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{auditNote || 'No actions recorded yet.'}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {audit.map((e: any) => (
                    <div key={e.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ marginTop: 2, width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: AUDIT_COLOR[e.action] || '#6b7280' }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{e.summary || e.action}</div>
                        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                          {(e.admin_email || 'system')} · {new Date(e.created_at).toLocaleString()}
                        </div>
                      </div>
                      <span style={{ flexShrink: 0, alignSelf: 'flex-start', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.08)', padding: '2px 7px', borderRadius: 999 }}>{String(e.action).replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const AUDIT_COLOR: Record<string, string> = {
  plan_change: '#6366f1', suspend: '#ef4444', reactivate: '#10b981', trial_extend: '#f59e0b',
  credit_grant: '#10b981', impersonate_start: '#7c5cff', impersonate_end: '#8b5cf6', company_update: '#6b7280',
}

function saBtn(bg: string): React.CSSProperties {
  return { padding: '5px 11px', borderRadius: 8, background: bg, color: '#fff', border: '1px solid rgba(255,255,255,0.14)', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }
}
