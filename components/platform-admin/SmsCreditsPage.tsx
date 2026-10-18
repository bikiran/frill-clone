'use client'

// Super admin → SMS credits. Every workspace's prepaid SMS balance, the total
// credit outstanding (money customers have paid for texts not yet sent: a
// liability), this month's credit consumed against the estimated carrier cost
// (the margin), and per company: the ledger and a manual adjustment with a
// reason (written to the ledger and the audit log).
// Uses /api/platform-admin/sms-credits (lib/sms-credits).

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { fmtCents, fmtSignedCents, KIND_LABEL, parseAudToCents } from '@/lib/sms-credits-core'

const card: React.CSSProperties = { background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 18, minWidth: 0 }
const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }
const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12.5, color: 'var(--sa-text)', borderTop: '1px solid var(--sa-border)' }
const input: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'var(--sa-bg)', color: 'var(--sa-text)', fontSize: 13, boxSizing: 'border-box' }
const btn = (color: string, filled = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
  border: filled ? 'none' : '1px solid var(--sa-border)', background: filled ? color : 'var(--sa-card)', color: filled ? '#fff' : color, whiteSpace: 'nowrap',
})
const refreshIcon = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
const backIcon = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
const fmtDate = (d: string) => { const t = new Date(d); return Number.isFinite(t.getTime()) ? t.toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '' }

function Kpi({ title, value, sub, color = 'var(--sa-text)' }: { title: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={card}>
      <p style={label}>{title}</p>
      <p style={{ fontSize: 24, fontWeight: 800, color, margin: '6px 0 0' }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: '3px 0 0', lineHeight: 1.45 }}>{sub}</p>}
    </div>
  )
}

function CompanyDetail({ companyId, initial, onBack, onChanged }: { companyId: string; initial?: any; onBack: () => void; onChanged: () => void }) {
  const [d, setD] = useState<any>(initial || null)
  const [amount, setAmount] = useState('')
  const [sign, setSign] = useState<1 | -1>(1)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const load = async () => {
    try { const r = await authFetch(`/api/platform-admin/sms-credits?companyId=${encodeURIComponent(companyId)}`); setD(await r.json()) } catch (e: any) { setD({ error: e?.message || 'Could not load' }) }
  }
  useEffect(() => { if (!initial) load() }, [companyId])
  const cents = parseAudToCents(amount)
  const valid = Number.isFinite(cents) && cents > 0 && reason.trim().length >= 3
  const submit = async () => {
    if (!valid) return
    setBusy(true); setMsg(null)
    try {
      const r = await authFetch('/api/platform-admin/sms-credits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, amountCents: sign * cents, reason: reason.trim() }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg({ tone: 'bad', text: j.error || 'That didn’t work' }); return }
      setMsg({ tone: 'ok', text: `Done. New balance ${fmtCents(j.balanceCents)}.` }); setAmount(''); setReason('')
      await load(); onChanged()
    } finally { setBusy(false) }
  }
  const w = d?.wallet
  const ledger: any[] = d?.ledger || []
  const campaigns: Record<string, string> = d?.campaigns || {}
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={btn('var(--sa-text)')}>{backIcon}All wallets</button>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--sa-text)', margin: 0 }}>{d?.company?.name || 'Company'}</h2>
        {d?.company?.slug && <span style={{ fontSize: 12, color: 'var(--sa-muted)' }}>{d.company.slug}.colvy.com</span>}
      </div>
      {d?.error && <p style={{ color: '#ef4444', fontSize: 13 }}>{d.error}</p>}
      {!d && <p style={{ color: 'var(--sa-muted)', fontSize: 13 }}>Loading…</p>}
      {w && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
            <Kpi title="Balance" value={fmtCents(w.balanceCents)} sub={w.heldCents ? `Plus ${fmtCents(w.heldCents)} held for campaigns` : 'Nothing held'} />
            <Kpi title="Auto top-up" value={w.autoTopUp.enabled ? 'On' : 'Off'} color={w.autoTopUp.enabled ? '#10b981' : 'var(--sa-text)'}
              sub={w.autoTopUp.enabled ? `${fmtCents(w.autoTopUp.amountCents)} below ${fmtCents(w.autoTopUp.thresholdCents)}` : w.autoTopUp.lastError ? `Last failure: ${w.autoTopUp.lastError}` : 'Not switched on'} />
            <Kpi title="Saved card" value={w.card ? `${w.card.brand ? w.card.brand.charAt(0).toUpperCase() + w.card.brand.slice(1) : 'Card'} ${w.card.last4 ? `ending ${w.card.last4}` : ''}`.trim() : 'None'} sub={w.autoTopUp.failures ? `${w.autoTopUp.failures} failed attempt${w.autoTopUp.failures === 1 ? '' : 's'}` : undefined} />
          </div>
          <div style={{ ...card, marginBottom: 14 }}>
            <p style={{ ...label, marginBottom: 10 }}>Manual adjustment</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'end' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {([1, -1] as const).map(s => (
                  <button key={s} onClick={() => setSign(s)} style={{ ...btn(s === 1 ? '#10b981' : '#ef4444', sign === s), flex: 1, justifyContent: 'center' }}>{s === 1 ? 'Add' : 'Remove'}</button>
                ))}
              </div>
              <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount, e.g. 25.00" inputMode="decimal" style={input} aria-label="Amount in dollars" />
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (shown in their ledger)" style={{ ...input, gridColumn: 'span 2' }} aria-label="Reason" />
              <button onClick={submit} disabled={!valid || busy} style={{ ...btn('#ff7a6b', true), justifyContent: 'center', opacity: !valid || busy ? 0.55 : 1 }}>{busy ? 'Saving…' : sign === 1 ? `Add ${Number.isFinite(cents) && cents > 0 ? fmtCents(cents) : ''}` : `Remove ${Number.isFinite(cents) && cents > 0 ? fmtCents(cents) : ''}`}</button>
            </div>
            {msg && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: msg.tone === 'ok' ? '#10b981' : '#ef4444' }}>{msg.text}</p>}
            <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--sa-muted)' }}>Recorded in the company’s ledger as an adjustment and in Audit Logs. A balance can’t go below zero.</p>
          </div>
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead><tr>{['Date', 'Type', 'Details', 'Amount', 'Balance'].map((h, i) => <th key={h} style={{ ...th, textAlign: i >= 3 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
              <tbody>
                {ledger.length === 0 && <tr><td colSpan={5} style={{ ...td, color: 'var(--sa-muted)', textAlign: 'center', padding: 24 }}>No ledger entries yet.</td></tr>}
                {ledger.map(r => (
                  <tr key={r.id}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</td>
                    <td style={td}>{(KIND_LABEL as any)[r.kind] || r.kind}</td>
                    <td style={{ ...td, color: 'var(--sa-muted)' }}>{r.campaign_id ? (campaigns[r.campaign_id] || 'Campaign') : (r.note || '')}{r.parts != null && r.kind === 'spend' ? ` · ${r.parts} parts` : ''}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: r.amount_cents > 0 ? '#10b981' : 'var(--sa-text)', whiteSpace: 'nowrap' }}>{fmtSignedCents(r.amount_cents)}</td>
                    <td style={{ ...td, textAlign: 'right', color: 'var(--sa-muted)', whiteSpace: 'nowrap' }}>{fmtCents(r.balance_after_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {d && d.ready === false && <p style={{ color: 'var(--sa-muted)', fontSize: 13 }}>Run COLVY_V395_SMS_CREDITS.sql to turn SMS credits on.</p>}
    </div>
  )
}

export default function SmsCreditsPage({ initial, initialDetail }: { initial?: any; initialDetail?: { companyId: string; data: any } } = {}) {
  const [d, setD] = useState<any>(initial || null)
  const [loading, setLoading] = useState(!initial)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(initialDetail?.companyId || null)
  const [find, setFind] = useState('')
  const [found, setFound] = useState<any[] | null>(null)
  useEffect(() => {
    const term = find.trim()
    if (term.length < 2) { setFound(null); return }
    const t = setTimeout(async () => {
      try { const r = await authFetch(`/api/platform-admin/sms-credits?find=${encodeURIComponent(term)}`); const j = await r.json(); setFound(j.companies || []) } catch { setFound([]) }
    }, 250)
    return () => clearTimeout(t)
  }, [find])
  const load = async () => {
    setLoading(true)
    try { const r = await authFetch('/api/platform-admin/sms-credits'); setD(await r.json()) } catch (e: any) { setD({ error: e?.message || 'Could not load' }) } finally { setLoading(false) }
  }
  useEffect(() => { if (!initial) load() }, [])

  const header = (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--sa-text)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>SMS credits</h1>
        <p style={{ fontSize: 13, color: 'var(--sa-muted)', margin: 0 }}>Prepaid credit for texts beyond each plan’s allowance: what’s outstanding, what was used this month, and every wallet</p>
      </div>
      <button onClick={load} style={btn('var(--sa-text)')}>{refreshIcon}Refresh</button>
    </div>
  )
  if (open) return <div>{header}<CompanyDetail companyId={open} initial={initialDetail?.companyId === open ? initialDetail.data : undefined} onBack={() => setOpen(null)} onChanged={load} /></div>
  if (loading && !d) return <div>{header}<p style={{ color: 'var(--sa-muted)', fontSize: 13 }}>Loading…</p></div>
  if (d?.error) return <div>{header}<p style={{ color: '#ef4444', fontSize: 13 }}>{d.error}</p></div>
  if (d && d.ready === false) return <div>{header}<div style={{ ...card, fontSize: 13, color: 'var(--sa-text)' }}>Run <b>COLVY_V395_SMS_CREDITS.sql</b> to turn SMS credits on. Until then Billing shows “SMS credits aren’t set up yet” and sending works as before.</div></div>

  const t = d?.totals || {}
  const accounts: any[] = (d?.accounts || []).filter((a: any) => !q || `${a.name} ${a.slug}`.toLowerCase().includes(q.toLowerCase()))
  const marginPct = t.consumedMonthExGstCents > 0 ? Math.round((t.marginMonthCents / t.consumedMonthExGstCents) * 100) : 0
  const monthName = new Date().toLocaleDateString('en-AU', { month: 'long' })
  return (
    <div>
      {header}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Kpi title="Credit outstanding" value={fmtCents(t.outstandingCents || 0)} sub={`Owed in texts to ${t.wallets || 0} workspace${t.wallets === 1 ? '' : 's'} (a liability)${t.heldCents ? `, incl. ${fmtCents(t.heldCents)} held for campaigns` : ''}`} color="#f59e0b" />
        <Kpi title={`Consumed in ${monthName}`} value={fmtCents(t.consumedMonthCents || 0)} sub={`${(t.partsMonth || 0).toLocaleString('en-AU')} parts beyond allowances · ${fmtCents(t.consumedMonthExGstCents || 0)} ex GST`} />
        <Kpi title="Est. carrier cost" value={fmtCents(t.carrierCostMonthCents || 0)} sub={d?.carrier ? `${d.carrier.cost} ${d.carrier.currency}/part at ${d.carrier.fx} AUD/${d.carrier.currency}` : undefined} />
        <Kpi title="Margin this month" value={fmtCents(t.marginMonthCents || 0)} sub={`${marginPct}% of credit consumed (ex GST)`} color={(t.marginMonthCents || 0) >= 0 ? '#10b981' : '#ef4444'} />
        <Kpi title={`Topped up in ${monthName}`} value={fmtCents(t.toppedUpMonthCents || 0)} sub="Card and auto top-ups" />
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '-6px 0 16px', lineHeight: 1.5 }}>Carrier cost is estimated from the platform SMS pricing (SMS Pricing page), for parts sent beyond allowances only. Texts within allowances are part of the plan price.</p>
      <div style={{ ...card, marginBottom: 14 }}>
        <p style={{ ...label, marginBottom: 8 }}>Any company</p>
        <input value={find} onChange={e => setFind(e.target.value)} placeholder="Find a company by name or subdomain to see its ledger or add credit" style={input} aria-label="Find a company" />
        {found && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {found.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>No companies match.</span>}
            {found.map(c => <button key={c.id} onClick={() => setOpen(c.id)} style={btn('var(--sa-text)')}>{c.name || 'Untitled'}{c.slug ? <span style={{ color: 'var(--sa-muted)', fontWeight: 500 }}>{c.slug}</span> : null}</button>)}
          </div>
        )}
      </div>
      <div style={{ ...card, padding: 0 }}>
        <div style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <p style={{ ...label, flex: 1 }}>Wallets</p>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search companies" style={{ ...input, maxWidth: 280 }} aria-label="Search companies" />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead><tr>{['Company', 'Balance', 'Held', 'Auto top-up', 'Updated', ''].map((h, i) => <th key={i} style={{ ...th, textAlign: i === 1 || i === 2 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>
              {accounts.length === 0 && <tr><td colSpan={6} style={{ ...td, color: 'var(--sa-muted)', textAlign: 'center', padding: 24 }}>{q ? 'No matching companies.' : 'No wallets yet: one is created on a company’s first top-up.'}</td></tr>}
              {accounts.map(a => (
                <tr key={a.company_id} style={{ cursor: 'pointer' }} onClick={() => setOpen(a.company_id)}>
                  <td style={td}><span style={{ fontWeight: 700 }}>{a.name}</span>{a.slug && <span style={{ color: 'var(--sa-muted)', marginLeft: 6, fontSize: 11.5 }}>{a.slug}</span>}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtCents(a.balance_cents)}</td>
                  <td style={{ ...td, textAlign: 'right', color: 'var(--sa-muted)' }}>{a.held_cents ? fmtCents(a.held_cents) : '—'}</td>
                  <td style={td}>{a.auto_topup_enabled ? <span style={{ color: '#10b981', fontWeight: 700 }}>On</span> : a.auto_topup_failures ? <span style={{ color: '#ef4444', fontWeight: 700 }}>Off after failures</span> : <span style={{ color: 'var(--sa-muted)' }}>Off</span>}</td>
                  <td style={{ ...td, color: 'var(--sa-muted)', whiteSpace: 'nowrap' }}>{a.updated_at ? fmtDate(a.updated_at) : ''}</td>
                  <td style={{ ...td, textAlign: 'right' }}><span style={{ color: '#ff7a6b', fontWeight: 700, fontSize: 12 }}>Ledger</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
