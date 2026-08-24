'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser } from '@/lib/client-cache'
import { SkeletonList } from '@/components/Skeleton'
import CreatePaymentLinkModal from '@/components/CreatePaymentLinkModal'

// Payments — transactions taken through Colvy payment links (Stripe). Refund
// (full or partial), resend receipts, remind on pending, and create new links.

type Payment = {
  id: string
  company_id: string
  conversation_id: string | null
  amount_cents: number
  currency: string | null
  description: string | null
  status: string
  stripe_payment_intent: string | null
  checkout_url: string | null
  receipt_url: string | null
  card_brand: string | null
  card_last4: string | null
  refunded_cents: number | null
  refunded_at: string | null
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
const fmtShort = (d: string | null | undefined) => {
  const p = parseTs(d)
  return p ? p.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—'
}
const money = (cents: number, cur = 'AUD') =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: (cur || 'AUD').toUpperCase(), currencyDisplay: 'narrowSymbol' }).format((cents || 0) / 100)

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  paid: { label: 'Paid', bg: '#dcfce7', fg: '#15803d' },
  pending: { label: 'Pending', bg: '#fef3c7', fg: '#b45309' },
  refunded: { label: 'Refunded', bg: '#ffe4e6', fg: '#be123c' },
  failed: { label: 'Failed', bg: '#f3f4f6', fg: '#6b7280' },
}
const statusMeta = (s: string) => STATUS_META[s] || { label: s || 'Unknown', bg: '#f3f4f6', fg: '#6b7280' }

// Deterministic soft avatar colour from a name.
const avatarColor = (name: string) => {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return { bg: `hsl(${h} 62% 92%)`, fg: `hsl(${h} 45% 40%)` }
}
const initials = (name: string) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
}
const payNumber = (id: string) => `#PAY-${String(id || '').replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase()}`
const codeOf = (url: string | null) => (String(url || '').match(/\/l\/([A-Za-z0-9_-]+)/) || [])[1] || null

export default function PaymentsPage() {
  const router = useRouter()
  const seededCid = peekCompanyUser()?.companyId ?? null
  const [companyId, setCompanyId] = useState<string | null>(seededCid)
  const [senderName, setSenderName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [payments, setPayments] = useState<Payment[]>([])
  const [convs, setConvs] = useState<Record<string, any>>({})
  const [contacts, setContacts] = useState<Record<string, any>>({})
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'refunded' | 'failed'>('all')
  const [range, setRange] = useState<'7' | '30' | '90' | 'all'>('30')
  const [methodFilter, setMethodFilter] = useState('all')
  const [channelFilter, setChannelFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [selected, setSelected] = useState<Payment | null>(null)
  const [details, setDetails] = useState<any>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [activity, setActivity] = useState<any[]>([])
  const [refundAmt, setRefundAmt] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [page, setPage] = useState(0)
  const PER = 25
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t) }, [toast])
  useEffect(() => { setPage(0) }, [statusFilter, range, methodFilter, channelFilter, search])

  const load = useCallback(async (cid: string, r: string) => {
    const since = r !== 'all' ? new Date(Date.now() - parseInt(r) * 86400000).toISOString() : null
    let q = (supabase as any).from('chat_payments').select('*').eq('company_id', cid)
    if (since) q = q.gte('created_at', since)
    const { data } = await q.order('created_at', { ascending: false }).limit(1000)
    const rows: Payment[] = data || []
    setPayments(rows)

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
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) setSenderName(session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || '')
        let cid: string | null = seededCid
        if (!cid && typeof window !== 'undefined') {
          const host = window.location.hostname
          if (host.endsWith('.colvy.com') && host !== 'colvy.com') {
            const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', host.replace('.colvy.com', '')).maybeSingle()
            if (co) cid = co.id
          }
        }
        if (!cid && session?.user) {
          const { data: own } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
          if (own?.id) cid = own.id
          else {
            const { data: mem } = await (supabase as any).from('team_members').select('company_id').eq('user_id', session.user.id).limit(1)
            if (mem?.length) cid = mem[0].company_id
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

  const customerOf = useCallback((p: Payment) => {
    const conv = p.conversation_id ? convs[p.conversation_id] : null
    const ct = conv?.contact_id ? contacts[conv.contact_id] : null
    const name = ct?.name || conv?.subject || 'Customer'
    const phone = ct?.phone || conv?.sms_number || ''
    const email = ct?.email || ''
    return { name, phone, email, contact: phone || email, email2: email, conv, contactId: conv?.contact_id || null, channel: conv?.channel || '' }
  }, [convs, contacts])

  const methodLabel = (p: Payment) => p.card_brand ? `${p.card_brand.toUpperCase()} •••• ${p.card_last4 || '••••'}` : (p.status === 'paid' ? 'Card' : '—')

  const methodOptions = useMemo(() => {
    const set = new Set<string>()
    for (const p of payments) if (p.card_brand) set.add(p.card_brand.toLowerCase())
    return Array.from(set).sort()
  }, [payments])
  const channelOptions = useMemo(() => {
    const set = new Set<string>()
    for (const p of payments) { const ch = customerOf(p).channel; if (ch) set.add(String(ch).toLowerCase()) }
    return Array.from(set).sort()
  }, [payments, customerOf])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return payments.filter(p => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      if (methodFilter !== 'all' && (p.card_brand || '').toLowerCase() !== methodFilter) return false
      const c = customerOf(p)
      if (channelFilter !== 'all' && String(c.channel || '').toLowerCase() !== channelFilter) return false
      if (q) {
        const hay = `${c.name} ${c.contact} ${p.description || ''} ${(p.amount_cents / 100).toFixed(2)}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [payments, statusFilter, methodFilter, channelFilter, search, customerOf])

  const pageRows = filtered.slice(page * PER, page * PER + PER)
  const pageCount = Math.max(1, Math.ceil(filtered.length / PER))

  // KPIs (over the loaded range, not just the page).
  const collected = payments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount_cents - (p.refunded_cents || 0)), 0)
  const refunded = payments.reduce((s, p) => s + (p.refunded_cents || 0), 0)
  const paidCount = payments.filter(p => p.status === 'paid').length
  const pendingCount = payments.filter(p => p.status === 'pending').length
  const failedCount = payments.filter(p => p.status === 'failed').length

  const applyPatch = (id: string, patch: Partial<Payment>) => {
    setPayments(ps => ps.map(x => x.id === id ? { ...x, ...patch } as Payment : x))
    setSelected(s => s && s.id === id ? { ...s, ...patch } as Payment : s)
  }

  const doRefund = async (p: Payment, amount?: number | null) => {
    const remainingCents = (p.amount_cents || 0) - (p.refunded_cents || 0)
    const askCents = amount != null ? Math.round(amount * 100) : remainingCents
    if (!window.confirm(`Refund ${money(askCents, p.currency || 'AUD')} to ${customerOf(p).name}? This cannot be undone.`)) return
    setBusy(p.id)
    try {
      const res = await fetch('/api/stripe/refund', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, paymentId: p.id, amount: amount != null ? amount : undefined }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) { setToast(`Refund failed: ${j.error || res.status}`); return }
      applyPatch(p.id, { status: j.full ? 'refunded' : 'paid', refunded_cents: j.totalRefunded ?? j.refundedCents ?? p.amount_cents })
      setRefundAmt('')
      setToast(j.full ? 'Payment fully refunded' : `Refunded ${money(j.refundedCents, p.currency || 'AUD')}`)
    } catch (e: any) { setToast(`Refund failed: ${e?.message || e}`) }
    finally { setBusy(null) }
  }

  const doResend = async (p: Payment) => {
    setBusy(p.id)
    try {
      const res = await fetch('/api/stripe/resend-receipt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, paymentId: p.id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) { setToast(`Couldn't resend: ${j.error || res.status}`); return }
      setToast(`Receipt resent to ${j.email}`)
    } catch (e: any) { setToast(`Couldn't resend: ${e?.message || e}`) }
    finally { setBusy(null) }
  }

  const doRemind = async (p: Payment) => {
    setBusy(p.id)
    try {
      const res = await fetch('/api/stripe/payment-reminder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, paymentId: p.id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) { setToast(`Couldn't send reminder: ${j.error || res.status}`); return }
      setToast(`Reminder sent by ${j.channel || 'message'}`)
    } catch (e: any) { setToast(`Couldn't send reminder: ${e?.message || e}`) }
    finally { setBusy(null) }
  }

  const copyLink = (p: Payment) => {
    if (!p.checkout_url) { setToast('No payment link on this record'); return }
    try { navigator.clipboard.writeText(p.checkout_url); setToast('Payment link copied') } catch { setToast(p.checkout_url) }
  }

  const openDrawer = async (p: Payment) => {
    setSelected(p); setDetails(null); setRefundAmt(''); setActivity([]); setDetailsLoading(true)
    // Link views for the activity timeline (real click data).
    ;(async () => {
      try {
        const code = codeOf(p.checkout_url)
        if (code) {
          const { data: sl } = await (supabase as any).from('short_links').select('id').eq('code', code).maybeSingle()
          if (sl?.id) {
            const { data: cl } = await (supabase as any).from('link_clicks').select('clicked_at, city, region, country').eq('link_id', sl.id).order('clicked_at', { ascending: true }).limit(30)
            setActivity(cl || [])
          }
        }
      } catch {}
    })()
    try {
      const res = await fetch('/api/stripe/payment-details', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, paymentId: p.id }),
      })
      const j = await res.json().catch(() => ({}))
      setDetails(j?.details || null)
    } catch { setDetails(null) }
    finally { setDetailsLoading(false) }
  }

  const exportCsv = () => {
    const head = ['Payment', 'Customer', 'Phone', 'Email', 'Amount', 'Currency', 'Refunded', 'Description', 'Method', 'Status', 'Date']
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [head.join(',')]
    for (const p of filtered) {
      const c = customerOf(p)
      lines.push([
        payNumber(p.id), c.name, c.phone, c.email2, (p.amount_cents / 100).toFixed(2), (p.currency || 'AUD').toUpperCase(),
        ((p.refunded_cents || 0) / 100).toFixed(2), p.description || '', methodLabel(p), statusMeta(p.status).label, fmtDate(p.paid_at || p.created_at),
      ].map(esc).join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }

  // ── styles ────────────────────────────────────────────────────────────────
  const CORAL = 'var(--coral)'
  const ctrl: React.CSSProperties = { padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer', outline: 'none' }
  const th: React.CSSProperties = { textAlign: 'left', padding: '11px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '12px 16px', fontSize: 13, color: 'var(--ink)', borderTop: '1px solid var(--border)', verticalAlign: 'middle' }

  const kpi = (label: string, value: string, sub: string, icon: React.ReactNode, tone: { bg: string; fg: string }) => (
    <div style={{ flex: 1, minWidth: 170, background: 'var(--card,#fff)', border: '1px solid var(--border)', borderRadius: 16, padding: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
      <span style={{ width: 44, height: 44, borderRadius: 12, background: tone.bg, color: tone.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: 'var(--slate)' }}>{label}</p>
        <p style={{ margin: '2px 0 0', fontSize: 21, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.1 }}>{value}</p>
        <p style={{ margin: '1px 0 0', fontSize: 11, color: 'var(--slate)' }}>{sub}</p>
      </div>
    </div>
  )
  const I = (p: any) => ({ width: 20, height: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', ...p })

  return (
    <div style={{ padding: 24, maxWidth: 1320, margin: '0 auto' }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Payments</h1>
      <p style={{ margin: '3px 0 18px', fontSize: 13, color: 'var(--slate)' }}>Track payments, refunds, and payment links across Colvy.</p>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        {kpi('Collected', money(collected), 'Total collected',
          <svg {...I({})}><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4" /><path d="M4 6v12a2 2 0 0 0 2 2h14v-4" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>, { bg: '#dcfce7', fg: '#16a34a' })}
        {kpi('Paid payments', String(paidCount), 'Completed',
          <svg {...I({})}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>, { bg: '#dcfce7', fg: '#16a34a' })}
        {kpi('Pending', String(pendingCount), 'Awaiting payment',
          <svg {...I({})}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>, { bg: '#fef3c7', fg: '#d97706' })}
        {kpi('Refunded', money(refunded), 'Total refunded',
          <svg {...I({})}><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>, { bg: '#ffe4e6', fg: '#e11d48' })}
        {kpi('Failed', String(failedCount), 'Failed attempts',
          <svg {...I({})}><circle cx="12" cy="12" r="9" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>, { bg: '#f3f4f6', fg: '#6b7280' })}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'inline-flex', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {(['all', 'paid', 'pending', 'refunded', 'failed'] as const).map(s => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)}
              style={{ padding: '8px 14px', border: 'none', background: statusFilter === s ? CORAL : 'var(--card,#fff)', color: statusFilter === s ? '#fff' : 'var(--slate)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{s === 'all' ? 'All' : statusMeta(s).label}</button>
          ))}
        </div>
        <select value={range} onChange={e => setRange(e.target.value as any)} style={ctrl}>
          <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option>
        </select>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <svg {...I({ width: 15, height: 15 })} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--slate)' }}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customer, amount, description…"
            style={{ ...ctrl, width: '100%', boxSizing: 'border-box', paddingLeft: 32, fontWeight: 500, cursor: 'text' }} />
        </div>
        <button type="button" onClick={() => setShowCreate(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, border: 'none', background: CORAL, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <svg {...I({ width: 15, height: 15 })}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
          Create payment link
        </button>
        <button type="button" onClick={exportCsv} style={{ ...ctrl, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <svg {...I({ width: 15, height: 15 })}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          Export
        </button>
      </div>

      {/* Secondary filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} style={{ ...ctrl, fontSize: 12.5 }}>
          <option value="all">Any method</option>
          {methodOptions.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
        </select>
        <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)} style={{ ...ctrl, fontSize: 12.5 }}>
          <option value="all">Any channel</option>
          {channelOptions.map(c => <option key={c} value={c}>{c === 'sms' ? 'SMS' : c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
        {(methodFilter !== 'all' || channelFilter !== 'all') && (
          <button type="button" onClick={() => { setMethodFilter('all'); setChannelFilter('all') }} style={{ fontSize: 12.5, fontWeight: 700, color: CORAL, background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--card,#fff)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 16 }}><SkeletonList rows={7} /></div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--slate)' }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>No payments yet</p>
            <p style={{ margin: '6px 0 0', fontSize: 13 }}>Create a payment link or take a payment from the inbox to see it here.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Customer</th><th style={th}>Contact</th><th style={{ ...th, textAlign: 'right' }}>Amount</th>
                  <th style={th}>Description</th><th style={th}>Method</th><th style={th}>Status</th><th style={th}>Date</th><th style={{ ...th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(p => {
                  const c = customerOf(p)
                  const sm = statusMeta(p.status)
                  const ac = avatarColor(c.name)
                  const isBusy = busy === p.id
                  return (
                    <tr key={p.id} onClick={() => openDrawer(p)} className="pay-row" style={{ cursor: 'pointer', background: selected?.id === p.id ? 'color-mix(in srgb, var(--coral) 6%, transparent)' : undefined }}>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: ac.bg, color: ac.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 800 }}>{initials(c.name)}</span>
                          <span style={{ fontWeight: 700 }}>{c.name}</span>
                        </div>
                      </td>
                      <td style={{ ...td, color: 'var(--slate)' }}>{c.contact || '—'}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                        {money(p.amount_cents, p.currency || 'AUD')}
                        {p.refunded_cents ? <span style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: '#e11d48' }}>−{money(p.refunded_cents, p.currency || 'AUD')}</span> : null}
                      </td>
                      <td style={{ ...td, color: 'var(--slate)', maxWidth: 210, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description || '—'}</td>
                      <td style={{ ...td, color: 'var(--slate)', whiteSpace: 'nowrap' }}>
                        {p.card_brand ? <span style={{ fontVariantNumeric: 'tabular-nums' }}><span style={{ fontWeight: 700, color: 'var(--ink)' }}>{p.card_brand.toUpperCase()}</span> ···· {p.card_last4 || '••••'}</span> : (p.status === 'paid' ? 'Card' : '—')}
                      </td>
                      <td style={td}><span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: sm.bg, color: sm.fg }}>{sm.label}</span></td>
                      <td style={{ ...td, color: 'var(--slate)', whiteSpace: 'nowrap' }}>{fmtDate(p.paid_at || p.created_at)}</td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                          {p.status === 'pending' && (
                            <button type="button" disabled={isBusy} onClick={() => doRemind(p)} style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--ink)', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: isBusy ? 0.6 : 1 }}>Send reminder</button>
                          )}
                          {p.status === 'paid' && (
                            <button type="button" disabled={isBusy} onClick={() => doResend(p)} style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--ink)', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: isBusy ? 0.6 : 1 }}>Resend receipt</button>
                          )}
                          {p.checkout_url && (
                            <button type="button" onClick={() => copyLink(p)} title="Copy payment link" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--slate)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg {...I({ width: 14, height: 14 })}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                            </button>
                          )}
                          {p.status === 'paid' && (
                            <button type="button" disabled={isBusy} onClick={() => doRefund(p)} style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid #f4b4bf', background: 'var(--card,#fff)', color: '#e11d48', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: isBusy ? 0.6 : 1 }}>Refund</button>
                          )}
                          <button type="button" onClick={() => openDrawer(p)} title="Details" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--slate)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg {...I({ width: 15, height: 15 })}><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {/* Pagination */}
        {!loading && filtered.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>Showing {filtered.length === 0 ? 0 : page * PER + 1}–{Math.min((page + 1) * PER, filtered.length)} of {filtered.length} payments</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ ...ctrl, padding: '6px 10px', color: page === 0 ? '#cbd5e1' : 'var(--slate)', cursor: page === 0 ? 'default' : 'pointer' }}>‹</button>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{page + 1} / {pageCount}</span>
              <button type="button" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page + 1 >= pageCount} style={{ ...ctrl, padding: '6px 10px', color: page + 1 >= pageCount ? '#cbd5e1' : 'var(--slate)', cursor: page + 1 >= pageCount ? 'default' : 'pointer' }}>›</button>
            </div>
          </div>
        )}
      </div>

      <style>{`.pay-row:hover td { background: color-mix(in srgb, var(--coral) 5%, transparent); }`}</style>

      {/* Detail drawer */}
      {selected && (() => {
        const p = selected
        const c = customerOf(p)
        const sm = statusMeta(p.status)
        const ac = avatarColor(c.name)
        const remaining = (p.amount_cents || 0) - (p.refunded_cents || 0)
        const canRefund = p.status === 'paid' && remaining > 0
        const isBusy = busy === p.id
        const kick: React.CSSProperties = { margin: 0, fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)' }
        const field = (label: string, val: React.ReactNode) => (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>{label}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', textAlign: 'right', wordBreak: 'break-word', maxWidth: 240 }}>{val}</span>
          </div>
        )
        // Build the activity timeline from real signals.
        const items: { label: string; at: string | null; tone: string; sub?: string }[] = []
        items.push({ label: 'Payment link created', at: p.created_at, tone: '#94a3b8' })
        for (const v of activity) items.push({ label: 'Payment link viewed', at: v.clicked_at, tone: '#3b82f6', sub: [v.city, v.region].filter(Boolean).join(', ') })
        if (p.status === 'paid' || p.status === 'refunded') items.push({ label: 'Payment completed', at: p.paid_at, tone: '#16a34a' })
        if (p.refunded_cents) items.push({ label: `Refunded ${money(p.refunded_cents, p.currency || 'AUD')}`, at: p.refunded_at, tone: '#e11d48' })
        if (p.status === 'pending') items.push({ label: 'Awaiting payment', at: null, tone: '#d97706' })
        items.sort((a, b) => (parseTs(a.at)?.getTime() || Infinity) - (parseTs(b.at)?.getTime() || Infinity))

        return (
          <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, zIndex: 5600, background: 'rgba(15,23,42,0.45)', display: 'flex', justifyContent: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 460, maxWidth: '96vw', height: '100%', background: 'var(--card,#fff)', boxShadow: '-20px 0 60px rgba(0,0,0,0.25)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              {/* Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Payment {payNumber(p.id)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: sm.bg, color: sm.fg }}>{sm.label}</span>
                </div>
                <button type="button" onClick={() => setSelected(null)} title="Close" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--slate)', cursor: 'pointer' }}>✕</button>
              </div>

              <div style={{ padding: '16px 20px 24px' }}>
                {/* Customer */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 44, height: 44, borderRadius: '50%', background: ac.bg, color: ac.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, flexShrink: 0 }}>{initials(c.name)}</span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{c.name}</p>
                    {c.phone && <p style={{ margin: '1px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>{c.phone}</p>}
                    {c.email2 && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email2}</p>}
                  </div>
                </div>
                {c.contactId && (
                  <button type="button" onClick={() => router.push(`/admin/customers/profile?id=${c.contactId}`)}
                    style={{ marginTop: 12, width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    View customer
                    <svg {...I({ width: 13, height: 13 })}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                  </button>
                )}

                {/* Fields */}
                <div style={{ marginTop: 18 }}>
                  {field('Amount', money(p.amount_cents, p.currency || 'AUD'))}
                  {p.refunded_cents ? field('Refunded', <span style={{ color: '#e11d48' }}>−{money(p.refunded_cents, p.currency || 'AUD')} · {money(remaining, p.currency || 'AUD')} kept</span>) : null}
                  {field('Description', p.description || '—')}
                  {field('Payment link', p.status === 'pending' ? <span style={{ color: '#16a34a', fontWeight: 700 }}>● Active</span> : p.checkout_url ? 'Used' : '—')}
                  {field('Created', fmtDate(p.created_at))}
                  {field('Method', detailsLoading && !p.card_brand ? 'Loading…' : (p.card_brand ? `${p.card_brand.toUpperCase()} •••• ${p.card_last4 || (details?.last4 || '••••')}` : (details?.brand ? `${details.brand.toUpperCase()} •••• ${details.last4}` : (p.status === 'paid' ? 'Card' : '—'))))}
                  {field('Channel', c.channel ? (c.channel === 'sms' ? 'SMS' : c.channel.charAt(0).toUpperCase() + c.channel.slice(1)) : '—')}
                  {field('Stripe payment', details?.paymentIntentId || p.stripe_payment_intent || '—')}
                </div>

                {/* Refund box */}
                {canRefund && (
                  <div style={{ marginTop: 18, padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: 'color-mix(in srgb, var(--slate) 3%, transparent)' }}>
                    <p style={{ ...kick, margin: '0 0 8px' }}>Refund</p>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--slate)' }}>$</span>
                        <input value={refundAmt} onChange={e => setRefundAmt(e.target.value.replace(/[^\d.]/g, ''))} placeholder={`${(remaining / 100).toFixed(2)} (full)`}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px 9px 22px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }} />
                      </div>
                      <button type="button" disabled={isBusy} onClick={() => doRefund(p, refundAmt.trim() ? parseFloat(refundAmt) : null)}
                        style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: '#e11d48', color: '#fff', fontSize: 13, fontWeight: 700, cursor: isBusy ? 'default' : 'pointer', opacity: isBusy ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                        {refundAmt.trim() ? `Refund $${refundAmt.trim()}` : 'Refund full'}
                      </button>
                    </div>
                    <p style={{ margin: '7px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>Leave blank to refund the full remaining {money(remaining, p.currency || 'AUD')}.</p>
                  </div>
                )}

                {/* Actions */}
                <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {p.status === 'paid' && <button type="button" disabled={isBusy} onClick={() => doResend(p)} style={{ padding: '10px 12px', borderRadius: 9, border: 'none', background: CORAL, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: isBusy ? 0.6 : 1 }}>Resend receipt</button>}
                  {p.status === 'pending' && <button type="button" disabled={isBusy} onClick={() => doRemind(p)} style={{ padding: '10px 12px', borderRadius: 9, border: 'none', background: CORAL, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: isBusy ? 0.6 : 1 }}>Send reminder</button>}
                  {canRefund && <button type="button" disabled={isBusy} onClick={() => doRefund(p)} style={{ padding: '10px 12px', borderRadius: 9, border: '1px solid #f4b4bf', background: 'var(--card,#fff)', color: '#e11d48', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Refund payment</button>}
                  {c.conv?.id && <button type="button" onClick={() => router.push(`/admin/inbox?conversation=${c.conv.id}`)} style={{ padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Open in inbox</button>}
                  {p.checkout_url && <button type="button" onClick={() => copyLink(p)} style={{ padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Copy payment link</button>}
                  {(details?.receiptUrl || p.receipt_url) && <a href={details?.receiptUrl || p.receipt_url || undefined} target="_blank" rel="noopener noreferrer" style={{ padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--ink)', fontSize: 13, fontWeight: 700, textAlign: 'center', textDecoration: 'none' }}>View receipt</a>}
                </div>

                {/* Activity */}
                <p style={{ ...kick, margin: '22px 0 10px' }}>Activity</p>
                <div style={{ position: 'relative', paddingLeft: 6 }}>
                  {items.map((it, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: i === items.length - 1 ? 0 : 16 }}>
                      {i < items.length - 1 && <span style={{ position: 'absolute', left: 5, top: 14, bottom: 0, width: 2, background: 'var(--border)' }} />}
                      <span style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, marginTop: 2, background: it.tone, boxShadow: `0 0 0 3px color-mix(in srgb, ${it.tone} 18%, transparent)` }} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{it.label}</p>
                        <p style={{ margin: '1px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>{it.at ? fmtShort(it.at) : 'Now'}{it.sub ? ` · ${it.sub}` : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {showCreate && companyId && (
        <CreatePaymentLinkModal companyId={companyId} accent={CORAL} senderName={senderName}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); setToast('Payment link created & sent'); if (companyId) load(companyId, range) }} />
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 6200, padding: '11px 18px', borderRadius: 11, background: '#111827', color: '#fff', fontSize: 13, fontWeight: 600, boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>{toast}</div>
      )}
    </div>
  )
}
