'use client'

// Super admin → Signups: everyone who asked for a sign-up code, how far they
// got, where they came from and whether they look real. Reads and acts
// through /api/platform-admin/signups (platform super admin only).
// Uses the console's --sa-* theme variables.

import { useEffect, useMemo, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { confirmDialog } from '@/components/ConfirmDialog'
import SignupSmsHealth from '@/components/platform-admin/SignupSmsHealth'
import { deliveryProblem, explainDeliveryError } from '@/lib/signup-delivery'

type Filter = 'all' | 'abandoned' | 'suspicious' | 'completed' | 'spam'
type Range = 'today' | '7d' | '30d' | 'all'

const STATUS: Record<string, { label: string; color: string }> = {
  code_sent: { label: 'Code sent', color: '#6366f1' },
  verified: { label: 'Verified', color: '#0891b2' },
  account_created: { label: 'Account created', color: '#059669' },
  abandoned: { label: 'Abandoned', color: '#d97706' },
  spam: { label: 'Spam', color: '#6b7280' },
}
const EVENT_LABEL: Record<string, string> = {
  code_sent: 'Code sent', send_failed: 'Code not delivered', rate_limited: 'Refused: too many codes', wrong_code: 'Wrong code entered',
  email_verified: 'Email verified', mobile_verified: 'Mobile verified', account_created: 'Account created', complete_failed: 'Couldn’t finish',
  marked_spam: 'Marked as spam', unmarked_spam: 'Unmarked as spam', emailed: 'Emailed by Colvy', delivery: 'Delivery report',
}
const EVENT_COLOR: Record<string, string> = {
  code_sent: '#6366f1', send_failed: '#dc2626', rate_limited: '#dc2626', wrong_code: '#d97706', email_verified: '#0891b2',
  mobile_verified: '#0891b2', account_created: '#059669', complete_failed: '#dc2626', marked_spam: '#6b7280', unmarked_spam: '#6b7280', emailed: '#ff7a6b', delivery: '#6b7280',
}
// What happened to a code sent to their mobile (lib/signup-delivery deliveryOf).
const DELIVERY_COLOR: Record<string, string> = { delivered: '#059669', answered: '#059669', not_delivered: '#dc2626', send_failed: '#dc2626', sending: '#6366f1', no_report: '#d97706', untracked: '#6b7280', none: '#6b7280' }

/** A delivery report's own line in the timeline: "SMS delivered", "SMS not delivered — carrier blocked (30007)". */
function deliveryEventLabel(e: any): { label: string; color: string; explain?: string } {
  const r = deliveryEventLabelOf(e)
  // Fetched by "Check with Twilio": the status callback never brought it.
  return e.via === 'lookup' ? { ...r, label: `${r.label} · checked with Twilio` } : r
}
function deliveryEventLabelOf(e: any): { label: string; color: string; explain?: string } {
  const voice = e.channel === 'voice'
  const st = String(e.status || '')
  if (!voice && st === 'delivered') return { label: 'SMS delivered', color: '#059669' }
  if (voice && st === 'completed') return { label: 'Call answered', color: '#059669' }
  if (voice && !e.error_code) return { label: `Call not connected — ${({ busy: 'line busy', 'no-answer': 'not answered', canceled: 'cancelled' } as any)[st] || st}`, color: '#dc2626' }
  const x = explainDeliveryError(e.error_code)
  return { label: `${voice ? 'Call not connected' : 'SMS not delivered'} — ${x.label}`, color: '#dc2626', explain: x.explain }
}

/** One line under "Step reached" when the mobile code is the sticking point. */
function MobileLine({ m, step }: { m: any; step?: number }) {
  if (!m || m.state === 'none') return null
  const problem = deliveryProblem(m.state)
  if (!problem && step !== 6) return null
  const color = DELIVERY_COLOR[m.state] || '#6b7280'
  return <div title={m.explain} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 11.5, color, fontWeight: problem ? 700 : 500, marginTop: 3, whiteSpace: 'normal', lineHeight: 1.35, maxWidth: 280 }}>
    <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 5 }} />{m.label}
  </div>
}

const Ic = {
  refresh: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>,
  search: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  x: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
  chevron: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>,
  shield: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  mail: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22 6 12 13 2 6" /></svg>,
  ban: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>,
  external: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>,
  users: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>,
  building: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4" /><path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" /></svg>,
  alert: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  verified: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
  pin: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>,
}

function ago(d?: string | null, now = Date.now()): string {
  if (!d) return '—'
  const m = Math.floor((now - new Date(d).getTime()) / 60000)
  if (!Number.isFinite(m)) return '—'
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  return days < 30 ? `${days}d ago` : new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}
const when = (d?: string | null) => d ? new Date(d).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—'
const host = (u?: string | null) => { if (!u) return ''; try { return new URL(u).host.replace(/^www\./, '') } catch { return u } }
const sourceOf = (r: any) => r.utm?.source ? `${r.utm.source}${r.utm.medium ? ` / ${r.utm.medium}` : ''}` : host(r.referrer) || (r.legacy ? '—' : 'Direct')
const placeOf = (r: any) => [r.ip_city, r.ip_country].filter(Boolean).join(', ')
const firstName = (r: any) => String(r.name || '').trim().split(/\s+/)[0] || 'there'
/** The short business line in the list: 'Pet store · Dallas VIC' (older rows: the industry). */
const bizLine = (r: any) => r.business_summary || (r.industry ? String(r.industry).replace(/[_-]/g, ' ') : '')

function Chip({ status }: { status: string }) {
  const s = STATUS[status] || { label: status, color: '#6b7280' }
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: s.color + '1a', color: s.color, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
    <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />{s.label}
  </span>
}
function RiskBadge({ risk, full }: { risk: any; full?: boolean }) {
  const level = risk?.level || 'none'
  if (level === 'none') return <span style={{ fontSize: 12, color: 'var(--sa-muted)' }}>No flags</span>
  const color = level === 'high' ? '#dc2626' : '#d97706'
  return <span title={(risk.reasons || []).join('\n')} style={{ display: 'inline-flex', flexDirection: full ? 'row' : 'column', alignItems: 'flex-start', gap: full ? 6 : 4, minWidth: 0 }}>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 7, border: `1px solid ${color}55`, background: color + '12', color, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>
      {Ic.shield}{level === 'high' ? 'Suspicious' : 'Check'}
    </span>
    {!full && risk.reasons?.[0] && <span style={{ fontSize: 11.5, color: 'var(--sa-muted)', lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{risk.reasons[0]}{risk.reasons.length > 1 ? ` +${risk.reasons.length - 1}` : ''}</span>}
  </span>
}

const btn = (color = 'var(--sa-text)', filled = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
  border: filled ? 'none' : '1px solid var(--sa-border)', background: filled ? color : 'var(--sa-card)', color: filled ? '#fff' : color, whiteSpace: 'nowrap',
})
const th: React.CSSProperties = { padding: '11px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--sa-border)' }
const td: React.CSSProperties = { padding: '12px 12px', fontSize: 12.5, color: 'var(--sa-text)', verticalAlign: 'top', borderBottom: '1px solid var(--sa-border)' }
const input: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'var(--sa-bg)', color: 'var(--sa-text)', fontSize: 13.5, boxSizing: 'border-box', fontFamily: 'inherit' }

export default function SignupsPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [range, setRange] = useState<Range>('30d')
  const [q, setQ] = useState('')
  const [data, setData] = useState<any>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [crmBusy, setCrmBusy] = useState(false)
  const [crmMsg, setCrmMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const [tick, setTick] = useState(0)
  const load = () => { setLoading(true); setErr(''); setTick(t => t + 1) }
  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const res = await authFetch(`/api/platform-admin/signups?range=${range}`)
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error || 'Could not load sign-ups')
        if (live) { setData(d); setErr('') }
      } catch (e: any) { if (live) setErr(e.message) } finally { if (live) setLoading(false) }
    })()
    return () => { live = false }
  }, [range, tick])

  // Filter and search here so the chips' counts stay put.
  const all: any[] = useMemo(() => data?.rows || [], [data])
  const searched = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return all
    return all.filter(r => [r.email, r.name, r.business_name, r.business_slug, r.phone, r.ip, r.ip_city, r.industry, r.business?.category, r.business?.address?.formatted, r.website].some(v => String(v || '').toLowerCase().includes(s)))
  }, [all, q])
  const counts = {
    all: searched.length,
    abandoned: searched.filter(r => r.status === 'abandoned').length,
    suspicious: searched.filter(r => r.risk?.level === 'high' && r.status !== 'spam').length,
    completed: searched.filter(r => r.status === 'account_created').length,
    spam: searched.filter(r => r.status === 'spam').length,
  }
  const rows = searched.filter(r => filter === 'all' ? true
    : filter === 'abandoned' ? r.status === 'abandoned'
    : filter === 'suspicious' ? r.risk?.level === 'high' && r.status !== 'spam'
    : filter === 'completed' ? r.status === 'account_created'
    : r.status === 'spam')
  const open = all.find(r => r.id === openId) || null

  const act = async (row: any, action: string, extra: any = {}) => {
    const res = await authFetch('/api/platform-admin/signups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id: row.id, ...extra }) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error || 'That didn’t work')
    if (d.deleted) { setOpenId(null); setData((x: any) => ({ ...x, rows: (x?.rows || []).filter((r: any) => r.id !== row.id) })) }
    else if (d.row) setData((x: any) => ({ ...x, rows: (x?.rows || []).map((r: any) => r.id === row.id ? d.row : r) }))
    else load()
    return d
  }

  // "Add all to CRM": count first, confirm, then run (same rules as new sign-ups).
  const addAllToCrm = async () => {
    setCrmMsg(null); setCrmBusy(true)
    try {
      const call = async (dryRun: boolean, offset = 0) => {
        const res = await authFetch('/api/platform-admin/signups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'crm_backfill', dryRun, offset }) })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error || 'That didn’t work')
        return d
      }
      const dry = await call(true)
      const skipped = [dry.skippedSuspicious ? `${dry.skippedSuspicious} suspicious` : '', dry.skippedSpam ? `${dry.skippedSpam} marked spam` : ''].filter(Boolean).join(' and ')
      if (!dry.eligible) { setCrmMsg({ tone: 'ok', text: `Nothing to add${skipped ? ` (${skipped} left out)` : ''}.` }); return }
      const ok = await confirmDialog({
        title: `Add ${dry.eligible} sign-up${dry.eligible === 1 ? '' : 's'} to ${dry.workspace?.name || 'the CRM'}?`,
        message: `${dry.toAdd} new, ${dry.alreadyLinked} already linked (refreshed).${skipped ? ` ${skipped[0].toUpperCase() + skipped.slice(1)} left out.` : ''} Same rules as new sign-ups: matched by exact email, the mobile only if it was verified, and no marketing consent. Safe to run again: nobody is added twice.`,
        confirmLabel: 'Add to CRM',
      })
      if (!ok) return
      // 100 at a time, with progress.
      let offset = 0, added = 0, refreshed = 0, skippedN = 0
      for (let guard = 0; guard < 50; guard++) {
        setCrmMsg({ tone: 'ok', text: `Adding to the CRM… ${offset} of ${dry.eligible}` })
        const d = await call(false, offset)
        added += d.added || 0; refreshed += d.refreshed || 0; skippedN += d.skipped || 0
        offset = d.nextOffset ?? dry.eligible
        if (d.done) break
      }
      setCrmMsg({ tone: 'ok', text: `Done: ${added} added or linked, ${refreshed} refreshed${skippedN ? `, ${skippedN} left alone (a customer already has that email and it isn’t verified yet)` : ''}.` })
      load()
    } catch (e: any) { setCrmMsg({ tone: 'err', text: e.message }) } finally { setCrmBusy(false) }
  }

  const chips: [Filter, string][] = [['all', 'All'], ['abandoned', 'Abandoned'], ['suspicious', 'Suspicious'], ['completed', 'Account created'], ['spam', 'Spam']]
  const ranges: [Range, string][] = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['all', 'All time']]

  return (
    <div className="su-root" style={{ width: '100%', minWidth: 0 }}>
      <style>{`
        .su-cards { display: none; }
        @media (max-width: 900px) { .su-table { display: none; } .su-cards { display: flex; } .su-head { flex-direction: column; align-items: stretch !important; } }
        .su-row:hover { background: var(--sa-hover); }
        .su-bizline { display: none; }
        @media (max-width: 1360px) { .su-bizcol { display: none; } .su-bizline { display: block; } }
      `}</style>

      <div className="su-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--sa-text)', margin: 0, letterSpacing: '-0.01em' }}>Signups</h1>
          <p style={{ fontSize: 13, color: 'var(--sa-muted)', margin: '4px 0 0' }}>Everyone who asked for a sign-up code, how far they got and whether they look real</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {data?.workspace && data?.source !== 'legacy' && <button onClick={addAllToCrm} disabled={crmBusy} style={btn('var(--sa-text)')}>{Ic.users} {crmBusy ? 'Working…' : 'Add all to CRM'}</button>}
          <button onClick={load} style={btn('var(--sa-muted)')}>{Ic.refresh} Refresh</button>
        </div>
      </div>

      {/* Where leads go */}
      {data && !data.workspace && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px', borderRadius: 12, border: '1px solid #f59e0b77', background: '#f59e0b14', color: 'var(--sa-text)', fontSize: 13, marginBottom: 14 }}>
          <span style={{ color: '#d97706', display: 'flex' }}>{Ic.alert}</span>
          <span style={{ flex: '1 1 320px', minWidth: 0 }}><b>Sign-up leads aren’t going to a CRM yet.</b> Choose which Colvy workspace should receive them (it’s also where follow-up emails are sent from).</span>
          <button onClick={() => setPicking(true)} style={btn('#ff7a6b', true)}>{Ic.building} Choose workspace</button>
        </div>
      )}
      {data?.workspace && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--sa-muted)', marginBottom: 12 }}>
          <span style={{ display: 'flex' }}>{Ic.building}</span>
          <span>Sign-up leads go to <b style={{ color: 'var(--sa-text)' }}>{data.workspace.name}</b> ({data.workspace.slug}){data.workspace.source === 'env' ? ' · set by COLVY_WORKSPACE_ID' : data.workspace.source === 'fallback' ? ' · found by its “colvy” address' : ''}</span>
          <button onClick={() => setPicking(true)} style={{ background: 'none', border: 'none', padding: 0, color: '#ff7a6b', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>Change</button>
        </div>
      )}
      {crmMsg && <div style={{ padding: '9px 12px', borderRadius: 10, fontSize: 12.5, marginBottom: 12, background: crmMsg.tone === 'ok' ? '#05966914' : '#fee2e2', color: crmMsg.tone === 'ok' ? '#059669' : '#b91c1c' }}>{crmMsg.text}</div>}
      {data?.sms && data?.source !== 'legacy' && <div style={{ marginBottom: 14 }}><SignupSmsHealth sms={data.sms} onChanged={load} /></div>}

      {data?.source === 'legacy' && (
        <div style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #f59e0b55', background: '#f59e0b14', color: 'var(--sa-text)', fontSize: 12.5, marginBottom: 14 }}>
          Showing earlier sign-ups from the verification records only (email, mobile, when codes went out, whether they were verified). Run <b>COLVY_V390_SIGNUP_ATTEMPTS.sql</b> to record names, businesses, location, device and the full timeline, and to mark spam.
        </div>
      )}
      {err && <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fee2e2', color: '#b91c1c', fontSize: 13, marginBottom: 14 }}>{err}</div>}

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: '1 1 auto', minWidth: 0 }}>
          {chips.map(([k, label]) => {
            const on = filter === k
            const c = k === 'suspicious' ? '#dc2626' : k === 'abandoned' ? '#d97706' : k === 'completed' ? '#059669' : '#ff7a6b'
            return <button key={k} onClick={() => setFilter(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, border: `1px solid ${on ? c : 'var(--sa-border)'}`, background: on ? c + '14' : 'var(--sa-card)', color: on ? c : 'var(--sa-muted)' }}>
              {label}<span style={{ fontSize: 11, fontWeight: 800, padding: '0 6px', borderRadius: 999, background: on ? c + '22' : 'var(--sa-hover)', color: on ? c : 'var(--sa-text)' }}>{counts[k]}</span>
            </button>
          })}
        </div>
        <div style={{ display: 'flex', border: '1px solid var(--sa-border)', borderRadius: 10, overflow: 'hidden', background: 'var(--sa-card)' }}>
          {ranges.map(([k, label], i) => (
            <button key={k} onClick={() => { if (k !== range) { setLoading(true); setRange(k) } }} style={{ padding: '7px 11px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: 'none', borderLeft: i ? '1px solid var(--sa-border)' : 'none', background: range === k ? '#ff7a6b18' : 'transparent', color: range === k ? '#ff7a6b' : 'var(--sa-muted)', whiteSpace: 'nowrap' }}>{label}</button>
          ))}
        </div>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '100%' }}>
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--sa-muted)', display: 'flex' }}>{Ic.search}</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email, business, mobile, IP…" style={{ ...input, paddingLeft: 32, background: 'var(--sa-card)' }} />
        </div>
      </div>

      {/* Table (desktop) */}
      <div className="su-table" style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
          <thead><tr>
            {['Person', 'Business', 'Status', 'Step reached', 'Risk', 'Where from', 'Last activity'].map(h => <th key={h} className={h === 'Business' ? 'su-bizcol' : undefined} style={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {loading && !data ? <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--sa-muted)', padding: 32 }}>Loading…</td></tr>
            : rows.length === 0 ? <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--sa-muted)', padding: 32 }}>{all.length ? 'No sign-ups match.' : 'No sign-up attempts in this period.'}</td></tr>
            : rows.map(r => (
              <tr key={r.id} className="su-row" onClick={() => setOpenId(r.id)} style={{ cursor: 'pointer' }}>
                <td style={{ ...td, minWidth: 180, maxWidth: 280 }}>
                  <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || <span style={{ color: 'var(--sa-muted)', fontWeight: 500 }}>No name yet</span>}</div>
                  <div title={r.email} style={{ fontSize: 12, color: 'var(--sa-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.email}</div>
                  {r.phone && <div style={{ fontSize: 12, color: 'var(--sa-muted)', whiteSpace: 'nowrap' }}>{r.phone}</div>}
                  {r.business_name && <div className="su-bizline" style={{ fontSize: 12, color: 'var(--sa-text)', fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.business?.verified && <span title="Verified via Google" style={{ color: '#059669', marginRight: 4, verticalAlign: '-2px' }}>{Ic.verified}</span>}{r.business_name}{bizLine(r) ? <span style={{ color: 'var(--sa-muted)', fontWeight: 500 }}> · {bizLine(r)}</span> : null}</div>}
                </td>
                <td className="su-bizcol" style={{ ...td, minWidth: 140, maxWidth: 260 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600, minWidth: 0 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.business_name || <span style={{ color: 'var(--sa-muted)', fontWeight: 500 }}>—</span>}</span>
                    {r.business?.verified && <span title="Verified via Google" style={{ color: '#059669', display: 'flex', flexShrink: 0 }}>{Ic.verified}</span>}
                  </div>
                  {bizLine(r) && <div style={{ fontSize: 12, color: 'var(--sa-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bizLine(r)}</div>}
                </td>
                <td style={td}><Chip status={r.status} /></td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <div style={{ fontWeight: 600 }}>{r.step?.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--sa-muted)' }}>{r.step?.step >= 8 ? 'Done' : `Step ${r.step?.step} of 7`} · {r.codes_sent || 0} code{r.codes_sent === 1 ? '' : 's'}{r.wrong_codes ? <span style={{ color: '#d97706' }}> · {r.wrong_codes} wrong</span> : null}</div>
                  {r.step?.step < 8 && <MobileLine m={r.mobile} step={r.step?.step} />}
                </td>
                <td style={{ ...td, minWidth: 130, maxWidth: 220 }}><RiskBadge risk={r.risk} /></td>
                <td style={{ ...td, minWidth: 120, maxWidth: 190 }}>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{placeOf(r) || <span style={{ color: 'var(--sa-muted)' }}>—</span>}</div>
                  <div style={{ fontSize: 12, color: 'var(--sa-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><span style={{ textTransform: 'capitalize' }}>{r.device ? `${r.device} · ` : ''}</span>{sourceOf(r)}</div>
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }} title={when(r.last_activity_at)}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{ago(r.last_activity_at)}<span style={{ color: 'var(--sa-muted)', display: 'flex' }}>{Ic.chevron}</span></span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards (phone) */}
      <div className="su-cards" style={{ flexDirection: 'column', gap: 10 }}>
        {loading && !data ? <p style={{ color: 'var(--sa-muted)', fontSize: 13 }}>Loading…</p>
        : rows.length === 0 ? <p style={{ color: 'var(--sa-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>{all.length ? 'No sign-ups match.' : 'No sign-up attempts in this period.'}</p>
        : rows.map(r => (
          <button key={r.id} onClick={() => setOpenId(r.id)} style={{ textAlign: 'left', width: '100%', background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', minWidth: 0 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sa-text)' }}>{r.name || 'No name yet'}</div>
                <div style={{ fontSize: 12, color: 'var(--sa-muted)', wordBreak: 'break-all' }}>{r.email}</div>
              </div>
              <Chip status={r.status} />
            </div>
            {r.business_name && <div style={{ fontSize: 12.5, color: 'var(--sa-text)', fontWeight: 600, minWidth: 0 }}>{r.business?.verified && <span title="Verified via Google" style={{ color: '#059669', marginRight: 4, verticalAlign: '-2px' }}>{Ic.verified}</span>}{r.business_name}{bizLine(r) ? <span style={{ color: 'var(--sa-muted)', fontWeight: 500 }}> · {bizLine(r)}</span> : null}</div>}
            <div style={{ fontSize: 12.5, color: 'var(--sa-text)' }}>{r.step?.label}{r.step?.step < 8 && <MobileLine m={r.mobile} step={r.step?.step} />}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <RiskBadge risk={r.risk} full />
              <span style={{ fontSize: 12, color: 'var(--sa-muted)' }}>{[placeOf(r), ago(r.last_activity_at)].filter(Boolean).join(' · ')}</span>
            </div>
          </button>
        ))}
      </div>

      {open && <SignupDrawer key={open.id} row={open} workspace={data?.workspace} onClose={() => setOpenId(null)} act={act} />}
      {picking && <WorkspacePicker current={data?.workspace || null} envPinned={!!data?.leads?.envPinned} picked={data?.leads?.picked || null} onClose={() => setPicking(false)} onSaved={() => { setPicking(false); load() }} />}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--sa-border)', minWidth: 0 }}>
    <span style={{ width: 118, flexShrink: 0, fontSize: 12, color: 'var(--sa-muted)' }}>{label}</span>
    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--sa-text)', wordBreak: 'break-word' }}>{children || <span style={{ color: 'var(--sa-muted)' }}>—</span>}</span>
  </div>
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ marginTop: 18 }}>
    <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>{title}</p>
    {children}
  </div>
}

const HOURS_SOURCE: Record<string, { label: string; color: string }> = {
  google: { label: 'From Google', color: '#059669' },
  manual: { label: 'Set by them', color: '#6366f1' },
  default: { label: 'Colvy’s default, not changed', color: '#d97706' },
}
const SOURCE_LABEL: Record<string, string> = { google: 'Found on Google', map: 'Found on the map', manual: 'Typed in' }
const linkStyle: React.CSSProperties = { color: '#ff7a6b', textDecoration: 'none', fontWeight: 600, wordBreak: 'break-all' }

/** Everything Colvy learnt about their business (lib/signup-profile presentBusiness). */
function BusinessSection({ b }: { b: any }) {
  if (!b?.recorded) {
    return <Section title="Business">
      <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', margin: '6px 0', lineHeight: 1.5 }}>
        {b?.missing === 'before_recording'
          ? 'Not recorded. This sign-up started before Colvy kept business details, so only the email and mobile were saved.'
          : 'No business details were recorded for this sign-up.'}
      </p>
    </Section>
  }
  const src = b.hoursSource ? HOURS_SOURCE[b.hoursSource] : null
  return <Section title="Business">
    <div style={{ marginTop: 6, border: '1px solid var(--sa-border)', borderRadius: 12, padding: '12px 14px 6px', background: 'var(--sa-bg)', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
        <span style={{ width: 32, height: 32, borderRadius: 9, background: '#ff7a6b1a', color: '#ff7a6b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{Ic.building}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 8px' }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--sa-text)', wordBreak: 'break-word' }}>{b.name || 'No business name'}</span>
            {b.verified
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: '#0596691a', color: '#059669', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{Ic.verified} Verified via Google</span>
              : b.source && <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 999, background: 'var(--sa-hover)', color: 'var(--sa-muted)', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{SOURCE_LABEL[b.source] || b.source}</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--sa-muted)', marginTop: 2, wordBreak: 'break-word' }}>{[b.boardUrl, b.summary].filter(Boolean).join(' · ') || ' '}</div>
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <Field label="Industry">{b.industry || b.category ? <>{b.industry}{b.category ? <span style={{ color: 'var(--sa-muted)' }}>{b.industry ? ' · ' : ''}Google: {b.category}</span> : null}</> : null}</Field>
        <Field label="Address">{b.addressLines?.length ? <>
          {b.addressLines.map((l: string, i: number) => <div key={i}>{l}</div>)}
          {b.mapsUrl && <a href={b.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 12 }}>{Ic.pin} Open in Google Maps {Ic.external}</a>}
        </> : null}</Field>
        <Field label="Business phone">{b.phone ? <a href={`tel:${b.phone}`} style={linkStyle}>{b.phone}</a> : null}</Field>
        <Field label="Website">{b.website ? (b.websiteUrl ? <a href={b.websiteUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>{b.website}</a> : b.website) : null}</Field>
        <Field label="Opening hours">{b.hours ? <div>
          {src && <span style={{ display: 'inline-flex', marginBottom: 6, padding: '2px 8px', borderRadius: 999, background: src.color + '1a', color: src.color, fontSize: 11, fontWeight: 700 }}>{src.label}</span>}
          <div className="su-hours" style={{ display: 'grid', gridTemplateColumns: 'minmax(40px, auto) 1fr', columnGap: 14, rowGap: 3 }}>
            {b.hours.map((h: any) => <div key={h.day} style={{ display: 'contents' }}>
              <span style={{ fontWeight: 600, color: h.open ? 'var(--sa-text)' : 'var(--sa-muted)' }} title={h.label}>{h.short}</span>
              <span style={{ color: h.open ? 'var(--sa-text)' : 'var(--sa-muted)', fontVariantNumeric: 'tabular-nums' }}>{h.text}</span>
            </div>)}
          </div>
        </div> : null}</Field>
        <Field label="Time zone">{b.timezone ? <>{b.timezone}{b.timezoneFrom === 'browser' ? <span style={{ color: 'var(--sa-muted)' }}> (from their browser)</span> : null}</> : null}</Field>
        {b.abn && <Field label="ABN">{b.abn}</Field>}
        {b.placeId && <Field label="Google place ID"><span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5, color: 'var(--sa-muted)', wordBreak: 'break-all' }}>{b.placeId}</span></Field>}
      </div>
    </div>
  </Section>
}

export function SignupDrawer({ row: r, workspace, onClose, act }: { row: any; workspace?: { id?: string; slug: string; name: string; source?: string } | null; onClose: () => void; act: (row: any, action: string, extra?: any) => Promise<any> }) {
  const [composing, setComposing] = useState(false)
  const [subject, setSubject] = useState('Finishing your Colvy sign-up')
  // A fresh draft per person (the drawer is keyed by the sign-up).
  const [body, setBody] = useState(() => `Hi ${firstName(r)},\n\nI noticed you started setting up Colvy${r.business_name ? ` for ${r.business_name}` : ''} but didn't get to the end. Did the verification codes come through all right?\n\nIf something got in the way, just reply to this email and I'll help you get set up. You can also pick up where you left off at https://colvy.com/signup\n\nThanks,\nThe Colvy team`)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const run = async (key: string, fn: () => Promise<any>, ok?: string) => {
    setBusy(key); setMsg(null)
    try { await fn(); if (ok) setMsg({ tone: 'ok', text: ok }) } catch (e: any) { setMsg({ tone: 'err', text: e.message }) } finally { setBusy('') }
  }
  const send = async () => {
    if (!(await confirmDialog({ title: `Email ${r.email}?`, message: `Sends “${subject}” from Colvy’s own email. Replies go to Colvy’s inbox.`, confirmLabel: 'Send email' }))) return
    await run('email', async () => { await act(r, 'email', { subject, body }); setComposing(false) }, 'Email sent. Replies will land in Colvy’s inbox.')
  }
  const spam = async () => {
    const on = !r.spam_at
    if (on && !(await confirmDialog({ title: 'Mark this sign-up as spam?', message: 'It drops out of Abandoned and isn’t auto-deleted, so the record stays for reference.', confirmLabel: 'Mark as spam', tone: 'danger' }))) return
    await run('spam', () => act(r, on ? 'spam' : 'unspam'), on ? 'Marked as spam.' : 'No longer marked as spam.')
  }
  const del = async () => {
    if (!(await confirmDialog({ title: `Delete the sign-up record for ${r.email}?`, message: 'Removes the attempt and its timeline. A contact it added to Colvy’s CRM goes too, unless they finished signing up, another sign-up uses it, or it has conversations, orders or bookings. This can’t be undone.', confirmLabel: 'Delete', tone: 'danger' }))) return
    await run('delete', () => act(r, 'delete'))
  }
  const events: any[] = Array.isArray(r.events) ? r.events.slice().reverse() : []
  const mailto = `mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  const profileUrl = (id: string, ws: { slug: string }) => `${ws.slug === 'colvy' ? 'https://colvy.com' : `https://${ws.slug}.colvy.com`}/admin/customers/profile?id=${encodeURIComponent(id)}`
  const contactUrl = r.contact_id && workspace ? profileUrl(r.contact_id, workspace) : null
  // Add or refresh the contact first (mobile, business, step reached), then
  // open it. The tab opens at once, inside the click, so it isn't blocked.
  const openInCrm = async (e: React.MouseEvent) => {
    e.preventDefault()
    const w = window.open('about:blank', '_blank')
    setBusy('crm'); setMsg(null)
    try {
      const d = await act(r, 'crm_add')
      const url = profileUrl(d.contactId, d.workspace || workspace)
      if (w) { w.opener = null; w.location.href = url } else window.location.href = url
    } catch (err: any) { w?.close(); setMsg({ tone: 'err', text: err.message }) } finally { setBusy('') }
  }
  const utm = r.utm ? Object.entries(r.utm).map(([k, v]) => `${k}: ${v}`).join(' · ') : ''

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.35)', display: 'flex', justifyContent: 'flex-end' }}>
      <aside onClick={e => e.stopPropagation()} role="dialog" aria-label={`Sign-up: ${r.email}`}
        style={{ width: 'min(580px, 100vw)', height: '100%', overflowY: 'auto', background: 'var(--sa-card)', borderLeft: '1px solid var(--sa-border)', padding: '18px 20px 28px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--sa-text)', margin: 0 }}>{r.name || 'No name yet'}</h2>
            <p style={{ fontSize: 13, color: 'var(--sa-muted)', margin: '3px 0 8px', wordBreak: 'break-all' }}>{r.email}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}><Chip status={r.status} /><RiskBadge risk={r.risk} full /></div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: '1px solid var(--sa-border)', borderRadius: 9, padding: 6, cursor: 'pointer', color: 'var(--sa-muted)', display: 'flex' }}>{Ic.x}</button>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          <button onClick={() => setComposing(c => !c)} disabled={!!r.spam_at} style={{ ...btn('#ff7a6b', true), opacity: r.spam_at ? 0.5 : 1 }}>{Ic.mail} Email them</button>
          {!r.legacy && <button onClick={spam} disabled={!!busy} style={btn(r.spam_at ? 'var(--sa-text)' : '#6b7280')}>{Ic.ban} {busy === 'spam' ? 'Saving…' : r.spam_at ? 'Not spam' : 'Mark as spam'}</button>}
          <button onClick={del} disabled={!!busy} style={btn('#dc2626')}>{Ic.trash} {busy === 'delete' ? 'Deleting…' : 'Delete'}</button>
          {workspace && !r.legacy && !r.spam_at
            ? <a href={contactUrl || '#'} onClick={openInCrm} aria-disabled={!!busy} style={{ ...btn('var(--sa-text)'), textDecoration: 'none', opacity: busy === 'crm' ? 0.6 : 1 }}>{Ic.external} {busy === 'crm' ? 'Opening…' : contactUrl ? 'Contact in Colvy CRM' : 'Add to Colvy CRM'}</a>
            : contactUrl && <a href={contactUrl} target="_blank" rel="noopener" style={{ ...btn('var(--sa-text)'), textDecoration: 'none' }}>{Ic.external} Contact in Colvy CRM</a>}
        </div>
        {msg && <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 9, fontSize: 12.5, background: msg.tone === 'ok' ? '#05966914' : '#fee2e2', color: msg.tone === 'ok' ? '#059669' : '#b91c1c' }}>{msg.text}</div>}

        {composing && (
          <div style={{ marginTop: 12, padding: 14, border: '1px solid var(--sa-border)', borderRadius: 12, background: 'var(--sa-bg)' }}>
            <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: '0 0 8px' }}>A one-off, transactional follow-up about their sign-up. It goes from Colvy’s own email{workspace ? '' : ' (Colvy’s workspace wasn’t found, so use your mail app)'}; replies land in Colvy’s inbox.</p>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--sa-muted)', marginBottom: 4 }}>Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} style={input} />
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--sa-muted)', margin: '10px 0 4px' }}>Message</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={9} style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
              <a href={mailto} style={{ ...btn('var(--sa-text)'), textDecoration: 'none' }}>Open in mail app</a>
              <button onClick={send} disabled={!!busy || !workspace || !subject.trim() || !body.trim()} style={{ ...btn('#ff7a6b', true), opacity: busy || !workspace ? 0.6 : 1 }}>{busy === 'email' ? 'Sending…' : 'Send from Colvy'}</button>
            </div>
          </div>
        )}

        <Section title="About them">
          <Field label="Name">{r.name}</Field>
          <Field label="Email">{r.email}</Field>
          <Field label="Mobile">{r.phone}{r.phone_country ? <span style={{ color: 'var(--sa-muted)' }}> ({r.phone_country})</span> : null}</Field>
        </Section>

        <BusinessSection b={r.business} />

        <Section title="Progress">
          <Field label="Step reached">{r.step?.label}{r.step?.step < 8 ? <span style={{ color: 'var(--sa-muted)' }}> (step {r.step?.step} of 7)</span> : null}</Field>
          <Field label="Codes sent">{`${r.codes_sent || 0}${r.wrong_codes ? ` · ${r.wrong_codes} wrong code${r.wrong_codes === 1 ? '' : 's'} entered` : ''}`}</Field>
          <Field label="Email verified">{r.email_verified_at ? when(r.email_verified_at) : 'No'}</Field>
          <Field label="Mobile verified">{r.mobile_verified_at ? when(r.mobile_verified_at) : 'No'}</Field>
          <Field label="Account">{r.account_created_at ? <>{when(r.account_created_at)}{r.company_slug ? <> · <a href={`https://${r.company_slug}.colvy.com/admin`} target="_blank" rel="noopener" style={{ color: '#ff7a6b' }}>{r.company_slug}.colvy.com</a></> : null}</> : 'Not created'}</Field>
          <Field label="First seen">{when(r.first_seen_at)}</Field>
          <Field label="Last activity">{`${when(r.last_activity_at)} (${ago(r.last_activity_at)})`}</Field>
        </Section>

        <Section title="Mobile verification">
          {!r.mobile || r.mobile.sends.length === 0 ? <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', margin: '6px 0' }}>{r.phone ? 'No code has been sent to their mobile yet.' : 'No mobile number yet.'}</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
              {r.mobile_verified_at
                ? <p style={{ fontSize: 12.5, color: '#059669', fontWeight: 600, margin: 0 }}>Mobile verified {when(r.mobile_verified_at)}.</p>
                : deliveryProblem(r.mobile.state) && r.mobile.who && <p style={{ fontSize: 12.5, color: 'var(--sa-text)', margin: 0 }}>{r.mobile.who === 'person' ? 'Most likely the number itself: they may have mistyped it.' : r.mobile.who === 'colvy' ? 'This is a setting on Colvy’s Twilio account, not something they did.' : 'The phone company stopped it. Usually a sender setting on Colvy’s Twilio account; see below.'}</p>}
              {r.mobile.sends.map((x: any, i: number) => {
                const c = DELIVERY_COLOR[x.state] || '#6b7280'
                return <div key={i} style={{ padding: '9px 11px', borderRadius: 10, border: `1px solid ${deliveryProblem(x.state) ? c + '55' : 'var(--sa-border)'}`, background: deliveryProblem(x.state) ? c + '0d' : 'transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: c }}>{x.label}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--sa-muted)', whiteSpace: 'nowrap' }}>{x.channel === 'voice' ? 'Call' : 'Text'} · {when(x.at)}</span>
                  </div>
                  {x.explain && <div style={{ fontSize: 12, color: 'var(--sa-muted)', marginTop: 3, lineHeight: 1.45 }}>{x.explain}</div>}
                </div>
              })}
            </div>
          )}
        </Section>

        <Section title="Where they came from">
          <Field label="Source">{sourceOf(r)}</Field>
          <Field label="Referrer">{r.referrer}</Field>
          <Field label="Landing page">{r.landing_path}</Field>
          <Field label="UTM">{utm}</Field>
          <Field label="Plan / referral">{[r.plan, r.ref_code ? `ref ${r.ref_code}` : ''].filter(Boolean).join(' · ')}</Field>
        </Section>

        <Section title="Device and location">
          <Field label="Location (IP)">{[r.ip_city, r.ip_region, r.ip_country].filter(Boolean).join(', ')}</Field>
          <Field label="IP address">{r.ip}{r.ip_email_count > 1 ? <span style={{ color: '#d97706' }}> · {r.ip_email_count} emails from this IP in 24h</span> : null}</Field>
          <Field label="Device">{[r.device, r.os, r.browser].filter(Boolean).join(' · ')}</Field>
          <Field label="User agent"><span style={{ fontSize: 11.5, color: 'var(--sa-muted)' }}>{r.user_agent}</span></Field>
        </Section>

        <Section title="Risk">
          {(r.risk?.reasons || []).length === 0 ? <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', margin: '6px 0' }}>Nothing unusual.</p>
          : <ul style={{ margin: '6px 0', paddingLeft: 18 }}>{r.risk.reasons.map((x: string) => <li key={x} style={{ fontSize: 12.5, color: 'var(--sa-text)', marginBottom: 4 }}>{x}</li>)}</ul>}
        </Section>

        <Section title="Timeline">
          {events.length === 0 ? <p style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>Nothing recorded.</p> : (
            <div style={{ position: 'relative', marginTop: 6 }}>
              {events.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, paddingBottom: 12, position: 'relative' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: e.type === 'delivery' ? deliveryEventLabel(e).color : (EVENT_COLOR[e.type] || '#6b7280'), marginTop: 4 }} />
                    {i < events.length - 1 && <span style={{ flex: 1, width: 2, background: 'var(--sa-border)', marginTop: 3 }} />}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sa-text)' }}>{e.type === 'delivery' ? deliveryEventLabel(e).label : (EVENT_LABEL[e.type] || e.type)}{e.type !== 'delivery' && e.channel && e.channel !== 'both' ? <span style={{ fontWeight: 500, color: 'var(--sa-muted)' }}> · {e.channel === 'sms' ? 'SMS' : e.channel === 'voice' ? 'call' : 'email'}</span> : e.type !== 'delivery' && e.channel === 'both' ? <span style={{ fontWeight: 500, color: 'var(--sa-muted)' }}> · email and SMS</span> : null}</span>
                      <span style={{ fontSize: 11.5, color: 'var(--sa-muted)', whiteSpace: 'nowrap' }}>{when(e.at)}</span>
                    </div>
                    {(e.detail || e.by || e.sms_error) && <div style={{ fontSize: 12, color: 'var(--sa-muted)' }}>{[e.detail, e.sms_error ? `Twilio refused it: ${explainDeliveryError(e.sms_error, e.sms_error_message).label}` : '', e.by ? `by ${e.by}` : ''].filter(Boolean).join(' · ')}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
        <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', marginTop: 16 }}>Abandoned sign-ups that aren’t suspicious or marked spam are deleted automatically after 180 days. Verification codes are never stored.</p>
      </aside>
    </div>
  )
}

// "Where should sign-up leads go?": pick the Colvy workspace that receives
// sign-up contacts (and sends follow-up emails). Saved in platform_settings;
// COLVY_WORKSPACE_ID in the environment still wins when it's set.
function WorkspacePicker({ current, envPinned, picked, onClose, onSaved }: { current: any; envPinned: boolean; picked: string | null; onClose: () => void; onSaved: () => void }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState<any[] | null>(null)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState('')
  useEffect(() => {
    let live = true
    const t = setTimeout(async () => {
      try {
        const res = await authFetch(`/api/platform-admin/signups?companies=${encodeURIComponent(q.trim())}`)
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error || 'Could not search companies')
        if (live) { setList(d.companies || []); setErr('') }
      } catch (e: any) { if (live) setErr(e.message) }
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [q])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const save = async (companyId: string | null, name?: string) => {
    const ok = companyId
      ? await confirmDialog({ title: `Send sign-up leads to ${name}?`, message: `People who start signing up for Colvy will be added as contacts in ${name}’s CRM, and follow-up emails will go from its email.`, confirmLabel: 'Send leads here' })
      : await confirmDialog({ title: 'Clear the lead workspace?', message: 'Sign-up leads stop going to a CRM until you choose one (unless a workspace is found by its “colvy” address).', confirmLabel: 'Clear', tone: 'danger' })
    if (!ok) return
    setSaving(companyId || 'clear'); setErr('')
    try {
      const res = await authFetch('/api/platform-admin/signups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set_workspace', companyId }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not save')
      onSaved()
    } catch (e: any) { setErr(e.message) } finally { setSaving('') }
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '8vh 16px 16px', boxSizing: 'border-box' }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Where should sign-up leads go?" style={{ width: 'min(560px, 100%)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 18, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--sa-text)', margin: 0 }}>Where should sign-up leads go?</h2>
            <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', margin: '4px 0 0' }}>People who start signing up are added as contacts in this workspace’s CRM, tagged by how far they got. Follow-up emails go from its email too. Only workspaces you own or are a team member of can be chosen.</p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: '1px solid var(--sa-border)', borderRadius: 9, padding: 6, cursor: 'pointer', color: 'var(--sa-muted)', display: 'flex' }}>{Ic.x}</button>
        </div>
        {envPinned && <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 10, border: '1px solid #f59e0b55', background: '#f59e0b14', fontSize: 12.5, color: 'var(--sa-text)' }}>COLVY_WORKSPACE_ID is set in the environment, so it wins over this choice. Remove it there to use the workspace picked here.</div>}
        <div style={{ position: 'relative', marginTop: 12 }}>
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--sa-muted)', display: 'flex' }}>{Ic.search}</span>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search companies by name or address…" style={{ ...input, paddingLeft: 32 }} />
        </div>
        {err && <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 9, background: '#fee2e2', color: '#b91c1c', fontSize: 12.5 }}>{err}</div>}
        <div style={{ marginTop: 10, overflowY: 'auto', minHeight: 0, flex: 1, border: '1px solid var(--sa-border)', borderRadius: 12 }}>
          {list === null ? <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', padding: 14, margin: 0 }}>Loading…</p>
          : list.length === 0 ? <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', padding: 14, margin: 0 }}>No companies match.</p>
          : list.map((c, i) => {
            const isCurrent = current?.id === c.id
            return <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: i ? '1px solid var(--sa-border)' : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || c.slug}</div>
                <div style={{ fontSize: 11.5, color: 'var(--sa-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.slug}.colvy.com · <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{c.id}</span></div>
              </div>
              {isCurrent ? <span style={{ fontSize: 12, fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>Current</span>
              : c.eligible ? <button onClick={() => save(c.id, c.name || c.slug)} disabled={!!saving} style={btn('#ff7a6b', true)}>{saving === c.id ? 'Saving…' : 'Use this'}</button>
              : <span title="Leads are personal details, so they only go to a workspace you own or are a team member of. Add yourself to its team first." style={{ fontSize: 11.5, color: 'var(--sa-muted)', textAlign: 'right', maxWidth: 130, lineHeight: 1.3 }}>Not your workspace: join its team first</span>}
            </div>
          })}
        </div>
        {picked && <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}><button onClick={() => save(null)} disabled={!!saving} style={btn('var(--sa-muted)')}>{saving === 'clear' ? 'Clearing…' : 'Clear my choice'}</button></div>}
      </div>
    </div>
  )
}
