'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser } from '@/lib/client-cache'
import { SkeletonList } from '@/components/Skeleton'

// Payments — every transaction taken through a Colvy payment link (Stripe).
// Shows the customer, amount, status and receipt, with filters and the two
// actions staff actually need day-to-day: refund and resend the receipt.

type Payment = {
  id: string
  company_id: string
  conversation_id: string | null
  amount_cents: number
  currency: string | null
  description: string | null
  status: string
  stripe_payment_intent: string | null
  receipt_url: string | null
  refunded_cents: number | null
  paid_at: string | null
  created_at: string
}

function parseTs(d: string | null | undefined): Date | null {
  if (!d) return null
  let s = String(d).trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s += 'Z'
  const p = new Date(s)
  return isNaN(p.getTime()) ? null : p
}
const fmtDate = (d: string | null | undefined) => {
  const p = parseTs(d)
  return p ? p.toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
}
const money = (cents: number, cur = 'AUD') =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: (cur || 'AUD').toUpperCase(), currencyDisplay: 'narrowSymbol' }).format((cents || 0) / 100)

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  paid: { label: 'Paid', bg: '#dcfce7', fg: '#15803d' },
  pending: { label: 'Pending', bg: '#fef3c7', fg: '#b45309' },
  refunded: { label: 'Refunded', bg: '#f3f4f6', fg: '#6b7280' },
  failed: { label: 'Failed', bg: '#fee2e2', fg: '#dc2626' },
}
const statusMeta = (s: string) => STATUS_META[s] || { label: s || 'Unknown', bg: '#f3f4f6', fg: '#6b7280' }

export default function PaymentsPage() {
  const router = useRouter()
  const seededCid = peekCompanyUser()?.companyId ?? null
  const [companyId, setCompanyId] = useState<string | null>(seededCid)
  const [loading, setLoading] = useState(true)
  const [payments, setPayments] = useState<Payment[]>([])
  const [convs, setConvs] = useState<Record<string, any>>({})
  const [contacts, setContacts] = useState<Record<string, any>>({})
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'refunded' | 'failed'>('all')
  const [range, setRange] = useState<'7' | '30' | '90' | 'all'>('30')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [selected, setSelected] = useState<Payment | null>(null)
  const [details, setDetails] = useState<any>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [refundAmt, setRefundAmt] = useState('')
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t) }, [toast])

  const load = useCallback(async (cid: string, r: string) => {
    const since = r !== 'all' ? new Date(Date.now() - parseInt(r) * 86400000).toISOString() : null
    let q = (supabase as any).from('chat_payments').select('*').eq('company_id', cid)
    if (since) q = q.gte('created_at', since)
    const { data } = await q.order('created_at', { ascending: false }).limit(1000)
    const rows: Payment[] = data || []
    setPayments(rows)

    // Resolve the customer behind each payment (conversation → contact).
    const convIds = Array.from(new Set(rows.map(p => p.conversation_id).filter(Boolean))) as string[]
    if (convIds.length) {
      const { data: cs } = await (supabase as any).from('conversations').select('id, contact_id, subject, sms_number, channel').in('id', convIds)
      const cmap: Record<string, any> = {}
      for (const c of cs || []) cmap[c.id] = c
      setConvs(cmap)
      const ctIds = Array.from(new Set((cs || []).map((c: any) => c.contact_id).filter(Boolean)))
      if (ctIds.length) {
        const { data: cts } = await (supabase as any).from('contacts').select('id, name, phone, email').in('id', ctIds)
        const ctmap: Record<string, any> = {}
        for (const c of cts || []) ctmap[c.id] = c
        setContacts(ctmap)
      }
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        let cid: string | null = seededCid
        if (!cid && typeof window !== 'undefined') {
          const host = window.location.hostname
          if (host.endsWith('.colvy.com') && host !== 'colvy.com') {
            const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', host.replace('.colvy.com', '')).maybeSingle()
            if (co) cid = co.id
          }
        }
        if (!cid) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            const { data: own } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
            if (own?.id) cid = own.id
            else {
              const { data: mem } = await (supabase as any).from('team_members').select('company_id').eq('user_id', session.user.id).limit(1)
              if (mem?.length) cid = mem[0].company_id
            }
          }
        }
        if (!cid) { setLoading(false); return }
        setCompanyId(cid)
        await load(cid, range)
      } finally { setLoading(false) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { if (companyId) load(companyId, range) }, [range, companyId, load])

  const customerOf = (p: Payment) => {
    const conv = p.conversation_id ? convs[p.conversation_id] : null
    const ct = conv?.contact_id ? contacts[conv.contact_id] : null
    const name = ct?.name || conv?.subject || 'Customer'
    const contact = ct?.phone || ct?.email || conv?.sms_number || ''
    return { name, contact, email: ct?.email || '', conv }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return payments.filter(p => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      if (q) {
        const c = customerOf(p)
        const hay = `${c.name} ${c.contact} ${p.description || ''} ${money(p.amount_cents, p.currency || 'AUD')} ${(p.amount_cents / 100).toFixed(2)}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [payments, statusFilter, search, convs, contacts])

  // KPIs.
  const collected = payments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount_cents - (p.refunded_cents || 0)), 0)
  const refunded = payments.reduce((s, p) => s + (p.refunded_cents || 0), 0)
  const paidCount = payments.filter(p => p.status === 'paid').length
  const pendingCount = payments.filter(p => p.status === 'pending').length

  // Refund `amount` dollars, or the whole remaining balance when amount is null.
  const doRefund = async (p: Payment, amount?: number | null) => {
    const remainingCents = (p.amount_cents || 0) - (p.refunded_cents || 0)
    const askCents = amount != null ? Math.round(amount * 100) : remainingCents
    const label = money(askCents, p.currency || 'AUD')
    if (!window.confirm(`Refund ${label} to ${customerOf(p).name}? This cannot be undone.`)) return
    setBusy(p.id)
    try {
      const res = await fetch('/api/stripe/refund', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, paymentId: p.id, amount: amount != null ? amount : undefined }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) { setToast(`Refund failed: ${j.error || res.status}`); return }
      const patch = { status: j.full ? 'refunded' : 'paid', refunded_cents: j.totalRefunded ?? j.refundedCents ?? p.amount_cents }
      setPayments(ps => ps.map(x => x.id === p.id ? { ...x, ...patch } : x))
      setSelected(s => s && s.id === p.id ? { ...s, ...patch } : s)
      setRefundAmt('')
      setToast(j.full ? 'Payment fully refunded' : `Refunded ${money(j.refundedCents, p.currency || 'AUD')}`)
    } catch (e: any) { setToast(`Refund failed: ${e?.message || e}`) }
    finally { setBusy(null) }
  }

  const openDrawer = async (p: Payment) => {
    setSelected(p); setDetails(null); setRefundAmt(''); setDetailsLoading(true)
    try {
      const res = await fetch('/api/stripe/payment-details', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, paymentId: p.id }),
      })
      const j = await res.json().catch(() => ({}))
      setDetails(j?.details || null)
    } catch { setDetails(null) }
    finally { setDetailsLoading(false) }
  }

  const doResend = async (p: Payment) => {
    setBusy(p.id)
    try {
      const res = await fetch('/api/stripe/resend-receipt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, paymentId: p.id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) { setToast(`Couldn't resend: ${j.error || res.status}`); return }
      setToast(`Receipt resent to ${j.email}`)
    } catch (e: any) { setToast(`Couldn't resend: ${e?.message || e}`) }
    finally { setBusy(null) }
  }

  const card: React.CSSProperties = { flex: 1, minWidth: 150, background: 'var(--card,#fff)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px' }
  const statLbl: React.CSSProperties = { margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--slate)' }
  const statNum: React.CSSProperties = { margin: '6px 0 0', fontSize: 26, fontWeight: 800, color: 'var(--ink)' }
  const ctrl: React.CSSProperties = { padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer', outline: 'none' }
  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: 'var(--ink)', borderTop: '1px solid var(--border)', verticalAlign: 'middle' }

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Payments</h1>
      <p style={{ margin: '3px 0 18px', fontSize: 13, color: 'var(--slate)' }}>Transactions taken through Colvy payment links. Refund or resend a receipt in a click.</p>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={card}><p style={statLbl}>Collected</p><p style={{ ...statNum, color: '#15803d' }}>{money(collected)}</p></div>
        <div style={card}><p style={statLbl}>Paid payments</p><p style={statNum}>{paidCount}</p></div>
        <div style={card}><p style={statLbl}>Pending</p><p style={statNum}>{pendingCount}</p></div>
        <div style={card}><p style={statLbl}>Refunded</p><p style={statNum}>{money(refunded)}</p></div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'inline-flex', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {(['all', 'paid', 'pending', 'refunded', 'failed'] as const).map(s => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)}
              style={{ padding: '8px 13px', border: 'none', background: statusFilter === s ? 'var(--coral)' : 'var(--card,#fff)', color: statusFilter === s ? '#fff' : 'var(--slate)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}>{s === 'all' ? 'All' : statusMeta(s).label}</button>
          ))}
        </div>
        <select value={range} onChange={e => setRange(e.target.value as any)} style={ctrl}>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">All time</option>
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customer, amount, description…"
          style={{ ...ctrl, flex: 1, minWidth: 200, fontWeight: 500, cursor: 'text' }} />
      </div>

      {/* Table */}
      <div style={{ background: 'var(--card,#fff)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 16 }}><SkeletonList rows={6} /></div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--slate)' }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>No payments yet</p>
            <p style={{ margin: '6px 0 0', fontSize: 13 }}>Payments taken through a Colvy payment link will appear here.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Customer</th><th style={th}>Contact</th><th style={{ ...th, textAlign: 'right' }}>Amount</th>
                  <th style={th}>Description</th><th style={th}>Status</th><th style={th}>Date</th><th style={{ ...th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const c = customerOf(p)
                  const sm = statusMeta(p.status)
                  const isBusy = busy === p.id
                  return (
                    <tr key={p.id} onClick={() => openDrawer(p)} className="pay-row" style={{ cursor: 'pointer' }}>
                      <td style={{ ...td, fontWeight: 700 }}>{c.name}</td>
                      <td style={{ ...td, color: 'var(--slate)' }}>{c.contact || '—'}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                        {money(p.amount_cents, p.currency || 'AUD')}
                        {p.refunded_cents ? <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#dc2626' }}>−{money(p.refunded_cents, p.currency || 'AUD')} refunded</span> : null}
                      </td>
                      <td style={{ ...td, color: 'var(--slate)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description || '—'}</td>
                      <td style={td}><span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: sm.bg, color: sm.fg }}>{sm.label}</span></td>
                      <td style={{ ...td, color: 'var(--slate)', whiteSpace: 'nowrap' }}>{fmtDate(p.paid_at || p.created_at)}</td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                          {p.receipt_url && (
                            <a href={p.receipt_url} target="_blank" rel="noopener noreferrer" title="View Stripe receipt"
                              style={{ padding: '5px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--slate)', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>Receipt</a>
                          )}
                          {p.status === 'paid' && (
                            <button type="button" disabled={isBusy} onClick={() => doResend(p)} title="Resend the receipt by email"
                              style={{ padding: '5px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--ink)', fontSize: 12, fontWeight: 600, cursor: isBusy ? 'default' : 'pointer', opacity: isBusy ? 0.6 : 1 }}>Resend</button>
                          )}
                          {p.status === 'paid' && (
                            <button type="button" disabled={isBusy} onClick={() => doRefund(p)} title="Refund this payment"
                              style={{ padding: '5px 9px', borderRadius: 8, border: '1px solid #f0a5a5', background: 'var(--card,#fff)', color: '#dc2626', fontSize: 12, fontWeight: 700, cursor: isBusy ? 'default' : 'pointer', opacity: isBusy ? 0.6 : 1 }}>Refund</button>
                          )}
                          {c.conv?.id && (
                            <button type="button" onClick={() => router.push(`/admin/inbox?conversation=${c.conv.id}`)} title="Open the conversation"
                              style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--slate)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && <p style={{ margin: '10px 2px 0', fontSize: 12, color: 'var(--slate)' }}>{filtered.length} payment{filtered.length === 1 ? '' : 's'}</p>}

      <style>{`.pay-row:hover td { background: color-mix(in srgb, var(--coral) 5%, transparent); }`}</style>

      {/* Detail drawer */}
      {selected && (() => {
        const p = selected
        const c = customerOf(p)
        const sm = statusMeta(p.status)
        const remaining = (p.amount_cents || 0) - (p.refunded_cents || 0)
        const canRefund = p.status === 'paid' && remaining > 0
        const isBusy = busy === p.id
        const kick: React.CSSProperties = { margin: 0, fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)' }
        const row = (label: string, val: React.ReactNode) => (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>{label}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', textAlign: 'right', wordBreak: 'break-all' }}>{val}</span>
          </div>
        )
        return (
          <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, zIndex: 5600, background: 'rgba(15,23,42,0.45)', display: 'flex', justifyContent: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 460, maxWidth: '96vw', height: '100%', background: 'var(--card,#fff)', boxShadow: '-20px 0 60px rgba(0,0,0,0.25)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              {/* Header */}
              <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>{money(p.amount_cents, p.currency || 'AUD')}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: sm.bg, color: sm.fg }}>{sm.label}</span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{c.name}</p>
                  {p.refunded_cents ? <p style={{ margin: '2px 0 0', fontSize: 12, color: '#dc2626', fontWeight: 600 }}>{money(p.refunded_cents, p.currency || 'AUD')} refunded{remaining > 0 ? ` · ${money(remaining, p.currency || 'AUD')} remaining` : ''}</p> : null}
                </div>
                <button type="button" onClick={() => setSelected(null)} title="Close" style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--slate)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>

              <div style={{ padding: '8px 20px 20px' }}>
                {/* Details */}
                <p style={{ ...kick, margin: '12px 0 2px' }}>Details</p>
                {row('Contact', c.contact || '—')}
                {row('Description', p.description || '—')}
                {row('Date', fmtDate(p.paid_at || p.created_at))}
                {row('Currency', String(p.currency || 'AUD').toUpperCase())}
                {row('Payment card', detailsLoading ? 'Loading…' : (details?.brand ? `${details.brand.toUpperCase()} •••• ${details.last4}${details.wallet ? ` · ${details.wallet}` : ''}` : '—'))}
                {row('Stripe payment', details?.paymentIntentId || p.stripe_payment_intent || '—')}
                {details?.chargeId ? row('Charge', details.chargeId) : null}

                {/* Refunds already issued */}
                {details?.refunds?.length > 0 && (
                  <>
                    <p style={{ ...kick, margin: '18px 0 6px' }}>Refunds</p>
                    {details.refunds.map((r: any) => (
                      <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>{r.created ? new Date(r.created * 1000).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—'}{r.reason ? ` · ${r.reason}` : ''}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#dc2626' }}>−{money(r.amount, r.currency || p.currency || 'AUD')}</span>
                      </div>
                    ))}
                  </>
                )}

                {/* Actions */}
                <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {canRefund && (
                    <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: 'color-mix(in srgb, var(--slate) 3%, transparent)' }}>
                      <p style={{ ...kick, margin: '0 0 8px' }}>Refund</p>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--slate)' }}>$</span>
                          <input value={refundAmt} onChange={e => setRefundAmt(e.target.value.replace(/[^\d.]/g, ''))}
                            placeholder={`${(remaining / 100).toFixed(2)} (full remaining)`}
                            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px 9px 22px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }} />
                        </div>
                        <button type="button" disabled={isBusy}
                          onClick={() => doRefund(p, refundAmt.trim() ? parseFloat(refundAmt) : null)}
                          style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 700, cursor: isBusy ? 'default' : 'pointer', opacity: isBusy ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                          {refundAmt.trim() ? `Refund $${refundAmt.trim()}` : 'Refund full'}
                        </button>
                      </div>
                      <p style={{ margin: '7px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>Leave blank to refund the full remaining {money(remaining, p.currency || 'AUD')}.</p>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {p.status === 'paid' && (
                      <button type="button" disabled={isBusy} onClick={() => doResend(p)}
                        style={{ flex: 1, minWidth: 130, padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--ink)', fontSize: 13, fontWeight: 700, cursor: isBusy ? 'default' : 'pointer', opacity: isBusy ? 0.6 : 1 }}>Resend receipt</button>
                    )}
                    {(details?.receiptUrl || p.receipt_url) && (
                      <a href={details?.receiptUrl || p.receipt_url} target="_blank" rel="noopener noreferrer"
                        style={{ flex: 1, minWidth: 130, textAlign: 'center', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--ink)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>View receipt</a>
                    )}
                    {c.conv?.id && (
                      <button type="button" onClick={() => router.push(`/admin/inbox?conversation=${c.conv.id}`)}
                        style={{ flex: 1, minWidth: 130, padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Open conversation</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 6000, padding: '11px 18px', borderRadius: 11, background: '#111827', color: '#fff', fontSize: 13, fontWeight: 600, boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>{toast}</div>
      )}
    </div>
  )
}
