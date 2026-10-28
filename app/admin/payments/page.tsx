'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser } from '@/lib/client-cache'
import { SkeletonList } from '@/components/Skeleton'
import CreatePaymentLinkModal from '@/components/CreatePaymentLinkModal'
import { confirmDialog } from '@/components/ConfirmDialog'
import EmptyScroll from '@/components/EmptyScroll'

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
  // Manually recorded sales (conversation_sales) are merged into this list so
  // bank-transfer / cash takings show up in Payments too. These carry a couple
  // of extra fields and skip the Stripe-only actions (refund, receipt, etc.).
  source?: 'stripe' | 'sale'
  payment_method?: string | null   // sale: the method chosen (Bank transfer, Cash…)
  sold_by_name?: string | null     // sale: the credited team member
  contact_id?: string | null       // sale: direct contact link (no conversation needed)
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
  const [companyName, setCompanyName] = useState('')
  const [receiptModal, setReceiptModal] = useState<Payment | null>(null)
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
  const [repairing, setRepairing] = useState(false)

  // Repoint older pending payment links (raw Stripe URLs that expire in ~24h) at
  // the durable /pay/<id> resolver, so links already texted to customers work.
  const repairLinks = async () => {
    if (repairing) return
    setRepairing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/payments/backfill-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ companyId }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) setToast(`Repair failed: ${j.error || res.status}`)
      else if (!j.scanned) setToast('All payment links are already up to date')
      else setToast(`Repaired ${j.repointed} link${j.repointed === 1 ? '' : 's'} (${j.scanned} checked)`)
    } catch (e: any) {
      setToast(`Repair failed: ${e.message}`)
    } finally {
      setRepairing(false)
    }
  }
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
    let sq = (supabase as any).from('conversation_sales').select('*').eq('company_id', cid)
    if (since) sq = sq.gte('sale_at', since)
    // Pay links and recorded sales side by side.
    const [{ data }, salesRes] = await Promise.all([
      q.order('created_at', { ascending: false }).limit(1000),
      Promise.resolve(sq.order('sale_at', { ascending: false }).limit(1000)).catch(() => ({ data: null })),
    ])
    const stripeRows: Payment[] = (data || []).map((p: any) => ({ ...p, source: 'stripe' as const }))

    // Manually recorded sales (bank transfer, cash, etc.) — merge them into the
    // same list so takings that never went through a Stripe link still show up,
    // count toward Collected, and are searchable/exportable here. Best-effort:
    // if the table isn't present yet (migration not run) we just show Stripe rows.
    let saleRows: Payment[] = []
    try {
      const sales = salesRes?.data
      saleRows = (sales || []).map((s: any): Payment => ({
        id: `sale:${s.id}`,
        company_id: s.company_id,
        conversation_id: s.conversation_id || null,
        amount_cents: Math.round((Number(s.amount) || 0) * 100),
        currency: s.currency || 'AUD',
        description: s.note || 'Recorded sale',
        status: 'paid',
        stripe_payment_intent: null,
        checkout_url: null,
        receipt_url: null,
        card_brand: null,
        card_last4: null,
        refunded_cents: 0,
        refunded_at: null,
        paid_at: s.sale_at || s.created_at,
        created_at: s.created_at || s.sale_at,
        source: 'sale',
        payment_method: s.payment_method || null,
        sold_by_name: s.sold_by_name || null,
        contact_id: s.contact_id || null,
      }))
    } catch { saleRows = [] }

    const rows: Payment[] = [...stripeRows, ...saleRows].sort(
      (a, b) => (parseTs(b.paid_at || b.created_at)?.getTime() || 0) - (parseTs(a.paid_at || a.created_at)?.getTime() || 0)
    )
    setPayments(rows)

    const convIds = Array.from(new Set(rows.map(p => p.conversation_id).filter(Boolean))) as string[]
    // Sales can be attributed to a contact directly (no conversation), so gather
    // those contact ids too.
    const directContactIds = Array.from(new Set(rows.map(p => p.contact_id).filter(Boolean))) as string[]
    // Threads and the directly-attributed customers together; then any
    // customers only reachable through a thread.
    const ctmap: Record<string, any> = {}
    const loadContacts = async (ids: string[]) => {
      if (!ids.length) return
      const { data: cts } = await (supabase as any).from('contacts').select('id, name, phone, email').in('id', ids)
      for (const c of cts || []) ctmap[c.id] = c
    }
    const [cs] = await Promise.all([
      convIds.length ? (supabase as any).from('conversations').select('id, contact_id, subject, sms_number, channel').in('id', convIds).then((r: any) => r.data || []) : Promise.resolve([]),
      loadContacts(directContactIds),
    ])
    if (convIds.length) {
      const cmap: Record<string, any> = {}
      for (const c of cs) cmap[c.id] = c
      setConvs(cmap)
    }
    await loadContacts(Array.from(new Set((cs as any[]).map((c: any) => c.contact_id).filter((id: string) => id && !ctmap[id]))))
    if (Object.keys(ctmap).length) setContacts(ctmap)
  }, [])

  // Which company + range was last loaded, so opening the page loads once.
  const loadedKey = useRef('')
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
        Promise.resolve((supabase as any).from('companies').select('name').eq('id', cid).maybeSingle())
          .then(({ data: co }: any) => setCompanyName(co?.name || '')).catch(() => {})
        loadedKey.current = `${cid}:${range}`
        await load(cid, range)
      } finally { setLoading(false) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Reload when the range changes (the first load above already covers opening the page).
  useEffect(() => {
    if (!companyId || loadedKey.current === `${companyId}:${range}`) return
    loadedKey.current = `${companyId}:${range}`
    load(companyId, range)
  }, [range, companyId, load])

  const customerOf = useCallback((p: Payment) => {
    const conv = p.conversation_id ? convs[p.conversation_id] : null
    // A recorded sale may be attributed to a contact directly (no conversation).
    const directCt = p.contact_id ? contacts[p.contact_id] : null
    const ct = (conv?.contact_id ? contacts[conv.contact_id] : null) || directCt
    const name = ct?.name || conv?.subject || 'Customer'
    const phone = ct?.phone || conv?.sms_number || ''
    const email = ct?.email || ''
    return { name, phone, email, contact: phone || email, email2: email, conv, contactId: conv?.contact_id || p.contact_id || null, channel: conv?.channel || '' }
  }, [convs, contacts])

  // Turn a stored payment_method value (bank_transfer, cash…) into a label.
  const prettyMethod = (m?: string | null) => {
    const s = String(m || '').trim()
    return s ? s.replace(/[_-]+/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()) : ''
  }
  const methodLabel = (p: Payment) =>
    p.card_brand ? `${p.card_brand.toUpperCase()} •••• ${p.card_last4 || '••••'}`
      : (p.source === 'sale' ? (prettyMethod(p.payment_method) || 'Recorded') : (p.status === 'paid' ? 'Card' : '—'))

  const methodOptions = useMemo(() => {
    const set = new Set<string>()
    for (const p of payments) {
      if (p.card_brand) set.add(p.card_brand.toLowerCase())
      else if (p.source === 'sale' && p.payment_method) set.add(String(p.payment_method).toLowerCase())
    }
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
      if (methodFilter !== 'all') {
        const pm = (p.card_brand || (p.source === 'sale' ? p.payment_method : '') || '').toLowerCase()
        if (pm !== methodFilter) return false
      }
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
    if (!await confirmDialog(`Refund ${money(askCents, p.currency || 'AUD')} to ${customerOf(p).name}? This cannot be undone.`)) return
    setBusy(p.id)
    try {
      const res = await authFetch('/api/stripe/refund', {
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
      const res = await authFetch('/api/stripe/resend-receipt', {
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
      const res = await authFetch('/api/stripe/payment-reminder', {
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
    // A recorded sale has no Stripe object or payment link — skip the network
    // calls entirely.
    if (p.source === 'sale') { setDetailsLoading(false); return }
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
      const res = await authFetch('/api/stripe/payment-details', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, paymentId: p.id }),
      })
      const j = await res.json().catch(() => ({}))
      setDetails(j?.details || null)
    } catch { setDetails(null) }
    finally { setDetailsLoading(false) }
  }

  // Print the receipt via a hidden iframe (no popup, no blocker).
  const printReceipt = () => {
    const node = document.getElementById('rcpt-print')
    if (!node) return
    const frame = document.createElement('iframe')
    frame.style.position = 'fixed'; frame.style.right = '0'; frame.style.bottom = '0'
    frame.style.width = '0'; frame.style.height = '0'; frame.style.border = '0'
    document.body.appendChild(frame)
    const doc = frame.contentWindow?.document
    if (!doc) { frame.remove(); return }
    doc.open()
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:24px;color:#111}</style></head><body>${node.innerHTML}</body></html>`)
    doc.close()
    frame.contentWindow?.focus()
    setTimeout(() => { try { frame.contentWindow?.print() } catch {} setTimeout(() => frame.remove(), 500) }, 200)
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

  const I = (p: any) => ({ width: 20, height: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', ...p })
  const channelName = (ch: string) => ch ? (ch === 'sms' ? 'SMS' : ch.charAt(0).toUpperCase() + ch.slice(1)) : ''
  const countOf = (st: string) => st === 'all' ? payments.length : payments.filter(p => p.status === st).length
  const filtersOn = methodFilter !== 'all' || channelFilter !== 'all'

  const kpi = (label: string, value: string, sub: string, icon: React.ReactNode, tone: string, onClick?: () => void) => (
    <button type="button" className="py-card py-kpi" onClick={onClick} disabled={!onClick}>
      <span className="py-kpi-top">
        <span className="py-label">{label}</span>
        <span className="py-ic" style={{ background: `color-mix(in srgb, ${tone} 12%, #fff)`, color: tone }}>{icon}</span>
      </span>
      <span className="py-kpi-v">{value}</span>
      <span className="py-sub">{sub}</span>
    </button>
  )
  const statusTag = (st: string) => <span className="py-tag dot" style={tint(STATUS_DOT[st] || '#a1a1aa')}>{statusMeta(st).label}</span>
  const method = (p: Payment) => p.card_brand
    ? <span className="py-method"><b>{p.card_brand.toUpperCase()}</b> ···· {p.card_last4 || '••••'}</span>
    : p.source === 'sale'
      ? <span className="py-method"><b>{prettyMethod(p.payment_method) || 'Recorded'}</b></span>
      : <span className="py-method">{p.status === 'paid' ? 'Card' : '—'}</span>

  return (
    <div className="py">
      <style>{PY_CSS}</style>
      <div className="py-head">
        <div>
          <h1>Payments</h1>
          <p>Payments, refunds and payment links across Colvy.</p>
        </div>
        <div className="py-head-acts">
          {/* Revive pending payment links sent before durable links — repoints the
              short link a customer already has at the /pay resolver. Owner/admin
              only (enforced server-side); safe to run more than once. */}
          <button type="button" className="py-pill" onClick={repairLinks} disabled={repairing} title="Fix older pending payment links that expired on Stripe">
            {repairing ? 'Repairing…' : 'Repair old links'}
          </button>
          <button type="button" className="py-icbtn" onClick={exportCsv} title="Export these payments as CSV" aria-label="Export CSV">
            <svg {...I({ width: 17, height: 17 })}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          </button>
          <button type="button" className="cv-btn cv-btn-primary" onClick={() => setShowCreate(true)}>
            <svg {...I({ width: 15, height: 15, strokeWidth: 2.2 })}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
            <span className="py-hide-sm">Create payment link</span><span className="py-show-sm">New link</span>
          </button>
        </div>
      </div>

      {/* KPIs over the loaded range; a tap filters the list. */}
      <div className="py-kpis">
        {kpi('Collected', money(collected), range === 'all' ? 'All time' : `Last ${range} days`,
          <svg {...I({ width: 16, height: 16 })}><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4" /><path d="M4 6v12a2 2 0 0 0 2 2h14v-4" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>, '#16a34a', () => setStatusFilter('paid'))}
        {kpi('Paid', String(paidCount), paidCount === 1 ? 'payment' : 'payments',
          <svg {...I({ width: 16, height: 16 })}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>, '#16a34a', () => setStatusFilter('paid'))}
        {kpi('Pending', String(pendingCount), 'Awaiting payment',
          <svg {...I({ width: 16, height: 16 })}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>, '#d97706', () => setStatusFilter('pending'))}
        {kpi('Refunded', money(refunded), 'Given back',
          <svg {...I({ width: 16, height: 16 })}><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>, '#e11d48', () => setStatusFilter('refunded'))}
        {kpi('Failed', String(failedCount), 'Attempts that didn’t go through',
          <svg {...I({ width: 16, height: 16 })}><circle cx="12" cy="12" r="9" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>, '#71717a', () => setStatusFilter('failed'))}
      </div>

      {/* Toolbar */}
      <div className="py-bar">
        <div className="py-seg" role="tablist" aria-label="Status">
          {(['all', 'paid', 'pending', 'refunded', 'failed'] as const).map(st => (
            <button key={st} type="button" role="tab" aria-selected={statusFilter === st} className={statusFilter === st ? 'on' : ''} onClick={() => setStatusFilter(st)}>
              {st === 'all' ? 'All' : statusMeta(st).label}<span className="n">{countOf(st)}</span>
            </button>
          ))}
        </div>
        <div className="py-search">
          <svg {...I({ width: 15, height: 15 })}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customer, amount, description…" aria-label="Search payments" />
          {search && <button type="button" className="py-x" onClick={() => setSearch('')} aria-label="Clear search"><svg {...I({ width: 12, height: 12, strokeWidth: 2.6 })}><path d="M18 6 6 18M6 6l12 12" /></svg></button>}
        </div>
      </div>
      <div className="py-bar2">
        <select className={`py-sel${range !== '30' ? ' set' : ''}`} value={range} onChange={e => setRange(e.target.value as any)} aria-label="Date range">
          <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option>
        </select>
        <select className={`py-sel${methodFilter !== 'all' ? ' set' : ''}`} value={methodFilter} onChange={e => setMethodFilter(e.target.value)} aria-label="Method">
          <option value="all">Any method</option>
          {methodOptions.map(m => <option key={m} value={m}>{prettyMethod(m)}</option>)}
        </select>
        <select className={`py-sel${channelFilter !== 'all' ? ' set' : ''}`} value={channelFilter} onChange={e => setChannelFilter(e.target.value)} aria-label="Channel">
          <option value="all">Any channel</option>
          {channelOptions.map(c => <option key={c} value={c}>{channelName(c)}</option>)}
        </select>
        {filtersOn && <button type="button" className="py-clear" onClick={() => { setMethodFilter('all'); setChannelFilter('all') }}>Clear</button>}
      </div>

      {/* List */}
      <div className="py-card py-tablecard">
        {loading ? (
          <div style={{ padding: 16 }}><SkeletonList rows={7} /></div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '24px 12px' }}>
            {payments.length > 0
              ? <EmptyScroll kinds={['payment']} title={search.trim() ? 'No matches' : 'No payments match these filters'}
                  line={search.trim() ? `Nothing matches “${search.trim()}”. Try a name, email or amount.` : 'Try another status or method.'}
                  action={<button type="button" className="cv-btn" onClick={() => { setSearch(''); setStatusFilter('all'); setMethodFilter('all'); setChannelFilter('all') }}>Clear filters</button>} />
              : range !== 'all'
              ? <EmptyScroll kinds={['payment']} title="No payments in this period"
                  line="Nothing was paid in these dates. Try a longer range."
                  action={<button type="button" className="cv-btn" onClick={() => setRange('all')}>Show all time</button>} />
              : <EmptyScroll kinds={['payment']} title="No payments yet"
                  line="Create a payment link or take a payment from the inbox to see it here."
                  action={<button type="button" className="cv-btn cv-btn-primary" onClick={() => setShowCreate(true)}>Create payment link</button>} />}
          </div>
        ) : (
          <>
            <div className="py-tablewrap">
              <table className="py-table">
                <thead>
                  <tr>
                    <th>Customer</th><th className="r">Amount</th><th>Description</th><th>Method</th><th>Status</th><th>Date</th><th className="r"><span className="sr">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(p => {
                    const c = customerOf(p)
                    const ac = avatarColor(c.name)
                    const isBusy = busy === p.id
                    return (
                      <tr key={p.id} onClick={() => openDrawer(p)} className={selected?.id === p.id ? 'sel' : ''}>
                        <td>
                          <div className="py-who">
                            <span className="py-av" style={{ background: ac.bg, color: ac.fg }}>{initials(c.name)}</span>
                            <span className="py-who-t">
                              <b>{c.name}</b>
                              {c.contact && <small>{c.contact}</small>}
                            </span>
                          </div>
                        </td>
                        <td className="r">
                          <span className="py-amt">{money(p.amount_cents, p.currency || 'AUD')}</span>
                          {p.refunded_cents ? <span className="py-refd">−{money(p.refunded_cents, p.currency || 'AUD')}</span> : null}
                        </td>
                        <td className="py-desc">
                          {p.source === 'sale' && <span className="py-tag dot sm" style={tint('#0891b2')} title="Recorded manually (not a Stripe payment)">Recorded</span>}
                          <span>{p.description || '—'}</span>
                        </td>
                        <td>{method(p)}</td>
                        <td>{statusTag(p.status)}</td>
                        <td className="py-date">{fmtDate(p.paid_at || p.created_at)}</td>
                        <td className="r" onClick={e => e.stopPropagation()}>
                          <div className="py-acts">
                            {p.status === 'pending' && <button type="button" className="py-mini" disabled={isBusy} onClick={() => doRemind(p)}>Send reminder</button>}
                            {p.status === 'paid' && p.source !== 'sale' && <button type="button" className="py-mini" disabled={isBusy} onClick={() => doResend(p)}>Resend receipt</button>}
                            {p.checkout_url && (
                              <button type="button" className="py-round" onClick={() => copyLink(p)} title="Copy payment link" aria-label="Copy payment link">
                                <svg {...I({ width: 14, height: 14 })}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                              </button>
                            )}
                            {p.status === 'paid' && p.source !== 'sale' && <button type="button" className="py-mini danger" disabled={isBusy} onClick={() => doRefund(p)}>Refund</button>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Phones: one soft card per payment. */}
            <div className="py-mlist">
              {pageRows.map(p => {
                const c = customerOf(p)
                const ac = avatarColor(c.name)
                return (
                  <button key={p.id} type="button" className="py-m" onClick={() => openDrawer(p)}>
                    <span className="py-av" style={{ background: ac.bg, color: ac.fg }}>{initials(c.name)}</span>
                    <span className="py-m-main">
                      <b>{c.name}</b>
                      <small>{p.description || methodLabel(p)}</small>
                      <span className="py-m-meta">{statusTag(p.status)}<span>{fmtShort(p.paid_at || p.created_at)}</span></span>
                    </span>
                    <span className="py-m-amt">{money(p.amount_cents, p.currency || 'AUD')}{p.refunded_cents ? <small>−{money(p.refunded_cents, p.currency || 'AUD')}</small> : null}</span>
                  </button>
                )
              })}
            </div>
            <div className="py-pager">
              <span>Showing {page * PER + 1}–{Math.min((page + 1) * PER, filtered.length)} of {filtered.length}</span>
              <div>
                <button type="button" className="py-round" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page"><svg {...I({ width: 14, height: 14, strokeWidth: 2.4 })}><path d="m15 18-6-6 6-6" /></svg></button>
                <b>{page + 1} / {pageCount}</b>
                <button type="button" className="py-round" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page + 1 >= pageCount} aria-label="Next page"><svg {...I({ width: 14, height: 14, strokeWidth: 2.4 })}><path d="m9 18 6-6-6-6" /></svg></button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Detail panel: floats in from the right, like an order. */}
      {selected && (() => {
        const p = selected
        const c = customerOf(p)
        const ac = avatarColor(c.name)
        const remaining = (p.amount_cents || 0) - (p.refunded_cents || 0)
        const isSale = p.source === 'sale'
        const canRefund = p.status === 'paid' && remaining > 0 && !isSale
        const isBusy = busy === p.id
        const row = (label: string, val: React.ReactNode) => (
          <div className="py-row"><span>{label}</span><span>{val}</span></div>
        )
        // Build the activity timeline from real signals.
        const items: { label: string; at: string | null; tone: string; sub?: string }[] = []
        if (isSale) {
          items.push({ label: 'Sale recorded', at: p.paid_at || p.created_at, tone: '#16a34a', sub: [prettyMethod(p.payment_method), p.sold_by_name ? `by ${p.sold_by_name}` : ''].filter(Boolean).join(' · ') })
        } else {
          items.push({ label: 'Payment link created', at: p.created_at, tone: '#94a3b8' })
          for (const v of activity) items.push({ label: 'Payment link viewed', at: v.clicked_at, tone: '#3b82f6', sub: [v.city, v.region].filter(Boolean).join(', ') })
          if (p.status === 'paid' || p.status === 'refunded') items.push({ label: 'Payment completed', at: p.paid_at, tone: '#16a34a' })
          if (p.refunded_cents) items.push({ label: `Refunded ${money(p.refunded_cents, p.currency || 'AUD')}`, at: p.refunded_at, tone: '#e11d48' })
          if (p.status === 'pending') items.push({ label: 'Awaiting payment', at: null, tone: '#d97706' })
        }
        items.sort((a, b) => (parseTs(a.at)?.getTime() || Infinity) - (parseTs(b.at)?.getTime() || Infinity))

        return (
          <>
            <div className="py-scrim" onClick={() => setSelected(null)} />
            <aside className="py-panel" role="dialog" aria-modal="true" aria-label={`Payment ${payNumber(p.id)}`}>
              <div className="py-ph">
                <div className="py-ph-top">
                  {!isSale && <span className="py-ph-no">{payNumber(p.id)}</span>}
                  {statusTag(p.status)}
                  {isSale && <span className="py-tag dot" style={tint('#0891b2')}>Recorded sale</span>}
                  <span style={{ flex: 1 }} />
                  <button type="button" className="py-round lg" onClick={() => setSelected(null)} aria-label="Close" title="Close">
                    <svg {...I({ width: 16, height: 16, strokeWidth: 2.2 })}><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                </div>
                <p className="py-ph-amt">{money(p.amount_cents, p.currency || 'AUD')}</p>
                <p className="py-ph-sub">{p.description || 'Payment'}{p.refunded_cents ? ` · ${money(p.refunded_cents, p.currency || 'AUD')} refunded` : ''}</p>
                <div className="py-ph-acts">
                  {p.status === 'paid' && !isSale && <button type="button" className="py-act primary" disabled={isBusy} onClick={() => doResend(p)}>Resend receipt</button>}
                  {p.status === 'pending' && <button type="button" className="py-act primary" disabled={isBusy} onClick={() => doRemind(p)}>Send reminder</button>}
                  {p.checkout_url && <button type="button" className="py-act" onClick={() => copyLink(p)}>Copy link</button>}
                  {p.status !== 'pending' && <button type="button" className="py-act" onClick={() => setReceiptModal(p)}>View receipt</button>}
                  {c.conv?.id && <button type="button" className="py-act" onClick={() => router.push(`/admin/inbox?conversation=${c.conv.id}`)}>Open in inbox</button>}
                </div>
              </div>

              <div className="py-pbody">
                {/* Customer */}
                <section className="py-sect">
                  <div className="py-cust">
                    <span className="py-av lg" style={{ background: ac.bg, color: ac.fg }}>{initials(c.name)}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <b>{c.name}</b>
                      {c.phone && <small>{c.phone}</small>}
                      {c.email2 && <small>{c.email2}</small>}
                    </div>
                    {c.contactId && <button type="button" className="py-mini" onClick={() => router.push(`/admin/customers/profile?id=${c.contactId}`)}>View customer</button>}
                  </div>
                </section>

                {/* Details */}
                <section className="py-sect">
                  <p className="py-sect-h">Details</p>
                  {row('Amount', money(p.amount_cents, p.currency || 'AUD'))}
                  {p.refunded_cents ? row('Refunded', <span style={{ color: '#e11d48' }}>−{money(p.refunded_cents, p.currency || 'AUD')} · {money(remaining, p.currency || 'AUD')} kept</span>) : null}
                  {row('Description', p.description || '—')}
                  {isSale ? (
                    <>
                      {row('Method', prettyMethod(p.payment_method) || '—')}
                      {row('Recorded by', p.sold_by_name || '—')}
                      {row('Date', fmtDate(p.paid_at || p.created_at))}
                      {row('Channel', channelName(c.channel) || '—')}
                    </>
                  ) : (
                    <>
                      {row('Payment link', p.status === 'pending' ? <span className="py-tag dot sm" style={tint('#22c55e')}>Active</span> : p.checkout_url ? 'Used' : '—')}
                      {row('Created', fmtDate(p.created_at))}
                      {row('Method', detailsLoading && !p.card_brand ? 'Loading…' : (p.card_brand ? `${p.card_brand.toUpperCase()} •••• ${p.card_last4 || (details?.last4 || '••••')}` : (details?.brand ? `${details.brand.toUpperCase()} •••• ${details.last4}` : (p.status === 'paid' ? 'Card' : '—'))))}
                      {row('Channel', channelName(c.channel) || '—')}
                      {row('Stripe payment', <span className="py-mono">{details?.paymentIntentId || p.stripe_payment_intent || '—'}</span>)}
                    </>
                  )}
                </section>

                {/* Refund */}
                {canRefund && (
                  <section className="py-sect">
                    <p className="py-sect-h">Refund</p>
                    <div className="py-refund">
                      <div className="py-field">
                        <span>$</span>
                        <input value={refundAmt} onChange={e => setRefundAmt(e.target.value.replace(/[^\d.]/g, ''))} placeholder={`${(remaining / 100).toFixed(2)} (full)`} inputMode="decimal" aria-label="Refund amount" />
                      </div>
                      <button type="button" className="py-act danger" disabled={isBusy} onClick={() => doRefund(p, refundAmt.trim() ? parseFloat(refundAmt) : null)}>
                        {refundAmt.trim() ? `Refund $${refundAmt.trim()}` : 'Refund in full'}
                      </button>
                    </div>
                    <p className="py-fine">Leave it blank to refund the full {money(remaining, p.currency || 'AUD')} still kept.</p>
                  </section>
                )}

                {/* Activity */}
                <section className="py-sect">
                  <p className="py-sect-h">Activity</p>
                  {items.map((it, i) => (
                    <div key={i} className="py-tl">
                      <span className="py-tl-dot" style={{ background: it.tone, boxShadow: `0 0 0 3px color-mix(in srgb, ${it.tone} 18%, #fff)` }} />
                      <div style={{ minWidth: 0 }}>
                        <p>{it.label}</p>
                        <small>{it.at ? fmtShort(it.at) : 'Now'}{it.sub ? ` · ${it.sub}` : ''}</small>
                      </div>
                    </div>
                  ))}
                </section>
              </div>
            </aside>
          </>
        )
      })()}

      {/* Receipt pop-up (in-app, no new tab) */}
      {receiptModal && (() => {
        const p = receiptModal
        const c = customerOf(p)
        const sm = statusMeta(p.status)
        const refunded = p.refunded_cents || 0
        const kept = (p.amount_cents || 0) - refunded
        const line: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', fontSize: 13.5 }
        return (
          <div className="py-overlay" onClick={() => setReceiptModal(null)}>
            <div className="py-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Receipt">
              <div id="rcpt-print" style={{ padding: '26px 26px 8px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', color: '#111' }}>{companyName || 'Receipt'}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 13, color: '#71717a' }}>Payment receipt</p>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 11px', borderRadius: 999, background: sm.bg, color: sm.fg }}>{p.status === 'refunded' ? 'Refunded' : 'Paid'}</span>
                </div>

                <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13, color: '#71717a' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, color: '#111' }}>Billed to</p>
                    <p style={{ margin: '3px 0 0' }}>{c.name}</p>
                    {c.phone && <p style={{ margin: 0 }}>{c.phone}</p>}
                    {c.email2 && <p style={{ margin: 0 }}>{c.email2}</p>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0 }}>Receipt {payNumber(p.id)}</p>
                    <p style={{ margin: '3px 0 0' }}>{fmtDate(p.paid_at || p.created_at)}</p>
                  </div>
                </div>

                <div style={{ marginTop: 18, borderTop: '1px solid #ececef', borderBottom: '1px solid #ececef', padding: '6px 0' }}>
                  <div style={line}><span style={{ color: '#111' }}>{p.description || 'Payment'}</span><span style={{ fontWeight: 700 }}>{money(p.amount_cents, p.currency || 'AUD')}</span></div>
                </div>
                <div style={{ padding: '8px 0' }}>
                  <div style={line}><span style={{ color: '#71717a' }}>Total</span><span style={{ fontWeight: 800 }}>{money(p.amount_cents, p.currency || 'AUD')}</span></div>
                  {refunded > 0 && <div style={line}><span style={{ color: '#e11d48' }}>Refunded</span><span style={{ fontWeight: 700, color: '#e11d48' }}>−{money(refunded, p.currency || 'AUD')}</span></div>}
                  {refunded > 0 && <div style={line}><span style={{ color: '#71717a' }}>Amount kept</span><span style={{ fontWeight: 700 }}>{money(kept, p.currency || 'AUD')}</span></div>}
                </div>

                <div style={{ marginTop: 4, fontSize: 12.5, color: '#71717a' }}>
                  <p style={{ margin: 0 }}>Paid with {p.card_brand ? `${p.card_brand.toUpperCase()} •••• ${p.card_last4 || '••••'}` : (p.source === 'sale' ? (prettyMethod(p.payment_method) || 'recorded payment') : 'card')}</p>
                  {p.source === 'sale' && p.sold_by_name && <p style={{ margin: '2px 0 0' }}>Recorded by {p.sold_by_name}</p>}
                  {(p.stripe_payment_intent) && <p style={{ margin: '2px 0 0', fontSize: 11, wordBreak: 'break-all' }}>Ref: {p.stripe_payment_intent}</p>}
                </div>
                <p style={{ margin: '18px 0 0', fontSize: 12, color: '#a1a1aa', textAlign: 'center' }}>Thank you for your payment.</p>
              </div>

              <div className="py-modal-foot">
                <button type="button" className="cv-btn cv-btn-primary" onClick={printReceipt}>Print</button>
                {(details?.receiptUrl || p.receipt_url) && (
                  <a className="cv-btn" href={details?.receiptUrl || p.receipt_url || undefined} target="_blank" rel="noopener noreferrer">Stripe receipt</a>
                )}
                <button type="button" className="cv-btn" style={{ marginLeft: 'auto' }} onClick={() => setReceiptModal(null)}>Close</button>
              </div>
            </div>
          </div>
        )
      })()}

      {showCreate && companyId && (
        <CreatePaymentLinkModal companyId={companyId} accent="var(--coral)" senderName={senderName}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); setToast('Payment link created & sent'); if (companyId) load(companyId, range) }} />
      )}

      {toast && <div className="py-toast" role="status">{toast}</div>}
    </div>
  )
}

const STATUS_DOT: Record<string, string> = { paid: '#22c55e', pending: '#f59e0b', refunded: '#e11d48', failed: '#a1a1aa' }
const tint = (c: string) => ({ ['--t' as any]: c }) as React.CSSProperties

// The Payments look: a big bold header, KPI tiles, a segmented status switch,
// grey pill filters, a soft table (cards on phones) and a floating panel.
const PY_CSS = `
.py{padding:24px 28px 48px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink)}
.py button::before{display:none}
.py-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:20px}
.py-head h1{margin:0;font-size:30px;font-weight:800;letter-spacing:-.025em;line-height:1.1}
.py-head p{margin:6px 0 0;font-size:14px;color:#71717a}
.py-head-acts{display:flex;align-items:center;gap:8px}
.py-pill{height:38px;padding:0 14px;border:none;border-radius:999px;background:#f4f4f5;color:#3f3f46;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background-color .15s}
.py-pill:hover{background-color:#ececef}
.py-pill:disabled{opacity:.6;cursor:default}
.py-icbtn{width:38px;height:38px;padding:0;border:none;border-radius:999px;background:#f4f4f5;color:#3f3f46;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background-color .15s}
.py-icbtn:hover{background-color:#ececef;color:#18181b}
.py-show-sm{display:none}
.py-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:18px}
.py-card{background:#fff;border-radius:20px;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04);min-width:0}
.py-kpi{display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:16px 18px;border:none;font:inherit;text-align:left;cursor:pointer;color:inherit;transition:box-shadow .2s,transform .2s cubic-bezier(.22,1,.36,1)}
.py-kpi:hover{box-shadow:0 0 0 1px rgba(0,0,0,.07),0 12px 28px -14px rgba(0,0,0,.25);transform:translateY(-1px)}
.py-kpi-top{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%}
.py-label{font-size:13.5px;font-weight:600;color:#71717a}
.py-ic{width:32px;height:32px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
.py-kpi-v{margin-top:4px;font-size:26px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.py-sub{font-size:12.5px;color:#8e8e93;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.py-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
.py-seg{display:inline-flex;gap:2px;padding:3px;border-radius:999px;background:#f4f4f5;max-width:100%;overflow-x:auto;scrollbar-width:none}
.py-seg::-webkit-scrollbar{display:none}
.py-seg button{flex-shrink:0;height:32px;padding:0 12px 0 14px;border:none;border-radius:999px;background:transparent;font:inherit;font-size:13.5px;font-weight:600;color:#52525b;cursor:pointer;display:inline-flex;align-items:center;gap:7px;white-space:nowrap;transition:background .15s,color .15s,box-shadow .15s}
.py-seg button:hover{color:#18181b}
.py-seg button.on{background:#fff;color:#18181b;box-shadow:0 1px 3px rgba(0,0,0,.1),0 0 0 .5px rgba(0,0,0,.04)}
.py-seg .n{min-width:18px;height:18px;padding:0 6px;box-sizing:border-box;border-radius:999px;background:rgba(0,0,0,.06);font-size:11.5px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
.py-search{flex:1;min-width:220px;position:relative;display:flex;align-items:center;gap:8px;height:38px;padding:0 10px 0 14px;border-radius:999px;border:1.5px solid transparent;background:#f4f4f5;color:#a1a1aa;box-sizing:border-box;transition:background-color .15s,border-color .15s,box-shadow .15s}
.py-search:focus-within{background:#fff;border-color:#d4d4d8;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 16%,transparent)}
.py-search input{flex:1;min-width:0;border:none;outline:none;background:transparent;font:inherit;font-size:14px;color:var(--ink)}
.py-search input::placeholder{color:#a1a1aa}
.py-search input:focus,.py-field input:focus{box-shadow:none}
.py-x{width:24px;height:24px;padding:0;border:none;border-radius:999px;background:#e4e4e7;color:#52525b;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.py-bar2{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.py-sel{appearance:none;-webkit-appearance:none;height:36px;padding:0 34px 0 14px;border:none;border-radius:999px;background-color:#f4f4f5;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;background-size:14px;font:inherit;font-size:13.5px;font-weight:600;color:var(--ink);cursor:pointer}
.py-sel:hover{background-color:#ececef}
.py-sel.set{background-color:color-mix(in srgb,var(--coral) 12%,#fff);color:color-mix(in srgb,var(--coral) 85%,#000)}
.py-clear{height:36px;padding:0 12px;border:none;border-radius:999px;background:none;font:inherit;font-size:13.5px;font-weight:600;color:var(--coral);cursor:pointer}
.py-clear:hover{background:#f4f4f5}
.py-tablecard{overflow:hidden}
.py-tablewrap{overflow-x:auto}
.py-table{width:100%;border-collapse:collapse}
.py-table th{text-align:left;padding:14px 16px 10px;font-size:12.5px;font-weight:600;color:#8e8e93;white-space:nowrap;border-bottom:1px solid #f0f0f2}
.py-table td{padding:12px 16px;font-size:13.5px;color:var(--ink);border-bottom:1px solid #f4f4f5;vertical-align:middle}
.py-table tbody tr{cursor:pointer;transition:background-color .12s}
.py-table tbody tr:hover td{background:#fafafa}
.py-table tbody tr.sel td{background:color-mix(in srgb,var(--coral) 6%,#fff)}
.py-table tbody tr:last-child td{border-bottom:none}
.py-table .r{text-align:right}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.py-who{display:flex;align-items:center;gap:10px;min-width:0}
.py-who-t{display:flex;flex-direction:column;min-width:0}
.py-who-t b{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
.py-who-t small{font-size:12.5px;color:#8e8e93;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
.py-av{width:34px;height:34px;border-radius:50%;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}
.py-av.lg{width:46px;height:46px;font-size:15px}
.py-amt{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.py-refd{display:block;font-size:12px;font-weight:600;color:#e11d48;font-variant-numeric:tabular-nums}
.py-desc{max-width:260px;color:#52525b}
.py-desc > span:last-child{display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle}
.py-method{color:#71717a;white-space:nowrap;font-variant-numeric:tabular-nums}
.py-method b{color:var(--ink);font-weight:600}
.py-date{color:#71717a;white-space:nowrap}
.py-tag{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:999px;font-size:12.5px;font-weight:600;white-space:nowrap;background:#f4f4f5;color:#52525b}
.py-tag.dot{background:color-mix(in srgb,var(--t) 12%,#fff);color:color-mix(in srgb,var(--t) 78%,#000)}
.py-tag.dot::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--t)}
.py-tag.sm{height:20px;padding:0 7px;font-size:11.5px;margin-right:6px;vertical-align:middle}
.py-acts{display:inline-flex;align-items:center;gap:6px;justify-content:flex-end}
.py-mini{height:30px;padding:0 12px;border:none;border-radius:999px;background:#f4f4f5;color:#18181b;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background-color .15s}
.py-mini:hover{background-color:#ececef}
.py-mini:disabled{opacity:.55;cursor:default}
.py-mini.danger{color:#e11d48}
.py-mini.danger:hover{background-color:#fff1f2}
.py-round{width:30px;height:30px;padding:0;border:none;border-radius:999px;background:#f4f4f5;color:#52525b;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background-color .15s}
.py-round:hover:not(:disabled){background-color:#ececef;color:#18181b}
.py-round:disabled{opacity:.4;cursor:default}
.py-round.lg{width:34px;height:34px}
.py-pager{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:12px 16px;border-top:1px solid #f0f0f2;font-size:13px;color:#8e8e93}
.py-pager > div{display:flex;align-items:center;gap:8px}
.py-pager b{font-size:13px;color:var(--ink);font-variant-numeric:tabular-nums}
.py-mlist{display:none}
.py-m{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;border:none;border-bottom:1px solid #f4f4f5;background:none;font:inherit;text-align:left;cursor:pointer;color:inherit}
.py-m:last-child{border-bottom:none}
.py-m-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.py-m-main b{font-size:14.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.py-m-main small{font-size:12.5px;color:#8e8e93;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.py-m-meta{display:flex;align-items:center;gap:8px;margin-top:4px;font-size:12px;color:#a1a1aa}
.py-m-amt{flex-shrink:0;text-align:right;font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}
.py-m-amt small{display:block;font-size:12px;font-weight:600;color:#e11d48}
@keyframes pyIn{from{transform:translateX(28px);opacity:0}to{transform:none;opacity:1}}
@keyframes pyFade{from{opacity:0}to{opacity:1}}
@keyframes pyRise{from{transform:translateY(12px) scale(.98);opacity:0}to{transform:none;opacity:1}}
.py-scrim{position:fixed;inset:0;z-index:5600;background:rgba(15,15,20,.3);animation:pyFade .2s ease}
.py-panel{position:fixed;top:8px;right:8px;bottom:8px;width:440px;max-width:calc(100vw - 16px);z-index:5601;display:flex;flex-direction:column;background:#f4f4f5;border-radius:24px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.22),0 0 0 1px rgba(0,0,0,.05);animation:pyIn .32s cubic-bezier(.22,1,.36,1);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink)}
.py-panel button::before{display:none}
.py-ph{flex-shrink:0;background:#fff;border-bottom:1px solid #ececef;padding:14px 18px 16px}
.py-ph-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-right:-6px}
.py-ph-no{font-size:13.5px;font-weight:600;color:#71717a;font-variant-numeric:tabular-nums}
.py-ph-amt{margin:10px 0 0;font-size:32px;font-weight:800;letter-spacing:-.025em;font-variant-numeric:tabular-nums}
.py-ph-sub{margin:4px 0 0;font-size:14px;color:#71717a;overflow-wrap:anywhere}
.py-ph-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}
.py-act{flex-shrink:0;height:36px;padding:0 14px;border:none;border-radius:999px;background:#f4f4f5;color:#18181b;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background-color .15s}
.py-act:hover{background-color:#ececef}
.py-act:disabled{opacity:.55;cursor:default}
.py-act.primary{background:var(--coral);color:#fff}
.py-act.primary:hover{background:var(--coral);filter:brightness(.95)}
.py-act.danger{background:#e11d48;color:#fff}
.py-act.danger:hover{background:#e11d48;filter:brightness(.95)}
.py-pbody{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:10px}
.py-sect{background:#fff;border-radius:18px;padding:14px 16px}
.py-sect-h{margin:0 0 8px;font-size:14px;font-weight:700}
.py-cust{display:flex;align-items:center;gap:12px}
.py-cust b{display:block;font-size:15.5px;font-weight:700}
.py-cust small{display:block;font-size:13px;color:#71717a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.py-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:7px 0;font-size:13.5px;border-top:1px solid #f4f4f5}
.py-row:first-of-type{border-top:none}
.py-row > span:first-child{color:#71717a;flex-shrink:0}
.py-row > span:last-child{font-weight:600;text-align:right;min-width:0;overflow-wrap:anywhere}
.py-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;font-weight:500;color:#52525b}
.py-refund{display:flex;gap:8px;align-items:center}
.py-field{flex:1;display:flex;align-items:center;gap:4px;height:40px;padding:0 14px;border-radius:12px;border:1.5px solid transparent;background:#f4f4f5;box-sizing:border-box;transition:background-color .15s,border-color .15s,box-shadow .15s}
.py-field:focus-within{background:#fff;border-color:#d4d4d8;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 16%,transparent)}
.py-field span{color:#a1a1aa;font-size:14px}
.py-field input{flex:1;min-width:0;border:none;outline:none;background:transparent;font:inherit;font-size:14px;color:var(--ink)}
.py-fine{margin:8px 0 0;font-size:12.5px;color:#8e8e93}
.py-tl{position:relative;display:flex;gap:12px;padding-bottom:14px}
.py-tl:last-child{padding-bottom:0}
.py-tl::before{content:'';position:absolute;left:5px;top:16px;bottom:0;width:1.5px;background:#ececef}
.py-tl:last-child::before{display:none}
.py-tl-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0;margin-top:3px}
.py-tl p{margin:0;font-size:13.5px;font-weight:600}
.py-tl small{display:block;margin-top:2px;font-size:12px;color:#8e8e93}
.py-overlay{position:fixed;inset:0;z-index:6300;background:rgba(15,15,20,.35);display:flex;align-items:center;justify-content:center;padding:20px;animation:pyFade .18s ease}
.py-modal{width:440px;max-width:100%;max-height:92vh;overflow-y:auto;background:#fff;border-radius:24px;box-shadow:0 24px 64px rgba(0,0,0,.22);animation:pyRise .24s cubic-bezier(.22,1,.36,1)}
.py-modal-foot{display:flex;gap:8px;padding:12px 22px 20px;border-top:1px solid #f0f0f2}
.py-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:6400;padding:11px 18px;border-radius:999px;background:#18181b;color:#fff;font-size:13.5px;font-weight:500;box-shadow:0 12px 30px rgba(0,0,0,.25);max-width:calc(100vw - 32px)}
.py-kpi:focus-visible,.py-seg button:focus-visible,.py-mini:focus-visible,.py-round:focus-visible,.py-act:focus-visible,.py-pill:focus-visible,.py-icbtn:focus-visible,.py-sel:focus-visible,.py-m:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 28%,transparent)}
@media(max-width:1100px){.py-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:700px){
  .py{padding:16px 14px 40px}
  .py-head{flex-wrap:nowrap;align-items:center}
  .py-head h1{font-size:26px}
  .py-head p{display:none}
  .py-pill{display:none}
  .py-hide-sm{display:none}
  .py-show-sm{display:inline}
  .py-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .py-kpis > :first-child{grid-column:1 / -1}
  .py-kpi{padding:14px}
  .py-kpi-v{font-size:22px}
  .py-search{min-width:0;flex:1 1 100%}
  .py-bar2{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin:0 -14px 14px;padding:0 14px}
  .py-bar2::-webkit-scrollbar{display:none}
  .py-sel,.py-clear{flex-shrink:0}
  .py-tablewrap{display:none}
  .py-mlist{display:block}
  .py-panel{top:6px;right:6px;bottom:6px;left:6px;width:auto;max-width:none;border-radius:22px}
  .py-overlay{padding:0;align-items:flex-end}
  .py-modal{width:100%;border-radius:24px 24px 0 0;max-height:94dvh}
}
@media (prefers-reduced-motion: reduce){.py-panel,.py-scrim,.py-modal,.py-overlay{animation:none}.py-kpi:hover{transform:none}}
`
