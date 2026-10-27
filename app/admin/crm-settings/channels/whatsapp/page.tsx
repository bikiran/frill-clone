'use client'

// Settings → Channels → WhatsApp. The business asks for WhatsApp here; Colvy's
// super admin registers the number with Meta through Colvy's Twilio account
// and marks it approved, and from then on WhatsApp messages land in the inbox.
// Everything goes through /api/whatsapp (owner / admin to request).

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { authFetch } from '@/lib/auth-fetch'
import { useCompanyUser, S } from '../../_shared'
import WhatsAppGlyph from '@/components/WhatsAppGlyph'

type Sender = { status: string; phoneNumber?: string | null; displayName?: string | null; request?: any; requestedAt?: string | null; approvedAt?: string | null; note?: string | null }
type State = { ready: boolean; sender: Sender; canSend: boolean; reason: string | null; reasonText: string | null; numbers: string[]; canRequest: boolean }

const PILL: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  not_requested: { label: 'Not connected', bg: '#f4f4f5', fg: '#52525b', dot: '#a1a1aa' },
  pending: { label: 'Pending approval', bg: '#fffaeb', fg: '#b54708', dot: '#f79009' },
  approved: { label: 'Connected', bg: '#ecfdf3', fg: '#067647', dot: '#17b26a' },
  rejected: { label: 'Not approved', bg: '#fef3f2', fg: '#b42318', dot: '#f04438' },
  disabled: { label: 'Switched off', bg: '#f4f4f5', fg: '#52525b', dot: '#a1a1aa' },
}

const fmtNum = (n?: string | null) => {
  const s = String(n || '')
  const m = s.match(/^\+61(4\d{2})(\d{3})(\d{3})$/)
  if (m) return `0${m[1]} ${m[2]} ${m[3]}`
  const l = s.match(/^\+61([2378])(\d{4})(\d{4})$/)
  return l ? `(0${l[1]}) ${l[2]} ${l[3]}` : s
}
const fmtDate = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

function Pill({ status }: { status: string }) {
  const p = PILL[status] || PILL.not_requested
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: p.bg, color: p.fg, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.dot }} />{p.label}
    </span>
  )
}

const Step = ({ n, title, body }: { n: number; title: string; body: string }) => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0 }}>
    <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#ecfdf3', color: '#067647', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>
    <div style={{ minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{title}</p>
      <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.5 }}>{body}</p>
    </div>
  </div>
)

export default function WhatsAppChannelPage() {
  const { companyId, loading } = useCompanyUser()
  const [st, setSt] = useState<State | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({ displayName: '', phoneNumber: 'new', website: '', industry: '', description: '', address: '', contactName: '', contactEmail: '', notes: '' })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  const load = useCallback(async () => {
    if (!companyId) return
    try {
      const r = await authFetch(`/api/whatsapp?companyId=${encodeURIComponent(companyId)}`)
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Couldn’t load WhatsApp'); return }
      setSt(d); setErr('')
      const req = d.sender?.request || {}
      setForm(f => ({
        ...f,
        displayName: f.displayName || req.displayName || d.sender?.displayName || '',
        phoneNumber: req.phoneNumber || (d.numbers?.[0] ?? 'new'),
        website: f.website || req.website || '', industry: f.industry || req.industry || '', description: f.description || req.description || '',
        address: f.address || req.address || '', contactName: f.contactName || req.contactName || '', contactEmail: f.contactEmail || req.contactEmail || '', notes: f.notes || req.notes || '',
      }))
    } catch (e: any) { setErr(e?.message || 'Couldn’t load WhatsApp') }
  }, [companyId])
  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!companyId) return
    setBusy('request'); setMsg(''); setErr('')
    try {
      const r = await authFetch('/api/whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, ...form }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'The request didn’t go through'); return }
      setMsg('Request sent. Colvy will register your number with Meta and this page will show when it’s approved.')
      await load()
    } finally { setBusy('') }
  }
  const withdraw = async () => {
    if (!companyId) return
    setBusy('withdraw'); setMsg(''); setErr('')
    try {
      const r = await authFetch(`/api/whatsapp?companyId=${encodeURIComponent(companyId)}`, { method: 'DELETE' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'Couldn’t withdraw the request'); return }
      setMsg('Request withdrawn.')
      await load()
    } finally { setBusy('') }
  }

  if (loading || (!st && !err)) return <div style={{ color: 'var(--slate)' }}>Loading…</div>
  const status = st?.sender?.status || 'not_requested'
  const showForm = !!st?.ready && (status === 'not_requested' || status === 'rejected')
  const req = st?.sender?.request || {}

  return (
    <div style={{ maxWidth: 760 }}>
      <Link href="/admin/crm-settings/channels" style={{ fontSize: 13, color: 'var(--slate)', textDecoration: 'none' }}>← Channels</Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '10px 0 6px', flexWrap: 'wrap' }}>
        <span style={{ width: 40, height: 40, borderRadius: 11, background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><WhatsAppGlyph size={22} color="#fff" /></span>
        <h1 style={{ ...S.h1, margin: 0 }}>WhatsApp</h1>
        <Pill status={status} />
      </div>
      <p style={S.sub}>Answer WhatsApp Business messages in the same inbox as your texts, DMs and email. Colvy registers your WhatsApp number with Meta for you; you don’t need a Meta developer account.</p>

      {err && <div style={{ ...S.card, padding: '12px 14px', background: '#fef3f2', borderColor: '#fecdca', color: '#b42318', fontSize: 13.5 }}>{err}</div>}
      {msg && <div style={{ ...S.card, padding: '12px 14px', background: '#ecfdf3', borderColor: '#abefc6', color: '#067647', fontSize: 13.5 }}>{msg}</div>}

      {st && !st.ready && (
        <div className="st-sec">
          <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)', fontWeight: 600 }}>WhatsApp isn’t available on your workspace yet.</p>
          <p style={S.hint}>Colvy is finishing the set-up on our side. Check back soon, or contact us if you’d like to be first.</p>
        </div>
      )}

      {status === 'approved' && st && (
        <div className="st-sec">
          <h2 style={S.h2}>Connected</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div><p style={{ ...S.hint, margin: 0 }}>WhatsApp number</p><p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{fmtNum(st.sender.phoneNumber)}</p></div>
            <div><p style={{ ...S.hint, margin: 0 }}>Name customers see</p><p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{st.sender.displayName}</p></div>
            {st.sender.approvedAt && <div><p style={{ ...S.hint, margin: 0 }}>Approved</p><p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{fmtDate(st.sender.approvedAt)}</p></div>}
          </div>
          {!st.canSend && st.reasonText && <p style={{ margin: '12px 0 0', fontSize: 13, color: '#b54708' }}>{st.reasonText}</p>}
          <ul style={{ margin: '16px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--slate)', lineHeight: 1.7 }}>
            <li>Customers message your WhatsApp number and it lands in the <Link href="/admin/inbox" style={{ color: 'var(--coral)' }}>inbox</Link>.</li>
            <li>Reply freely for 24 hours after their last message. After that, WhatsApp only allows an approved template, which the reply box offers.</li>
            <li>A customer who sends STOP won’t get WhatsApp messages until they send START. Their texts and email aren’t affected.</li>
            <li>AI agents can answer WhatsApp too: switch it on under <Link href="/admin/agents" style={{ color: 'var(--coral)' }}>AI Agents</Link> → channels.</li>
          </ul>
          <p style={{ ...S.hint, marginTop: 12 }}>Need another template (say, for order updates)? Contact Colvy and we’ll submit it to Meta for you.</p>
        </div>
      )}

      {status === 'pending' && st && (
        <div className="st-sec">
          <h2 style={S.h2}>Waiting for approval</h2>
          <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--slate)', lineHeight: 1.55 }}>
            Colvy is registering your number with Meta. Meta reviews the name customers will see, which usually takes one to three business days. We may contact {req.contactName || 'you'} to confirm details.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, fontSize: 13 }}>
            <div><span style={{ color: 'var(--slate)' }}>Name on WhatsApp</span><br /><b>{req.displayName || st.sender.displayName}</b></div>
            <div><span style={{ color: 'var(--slate)' }}>Number</span><br /><b>{req.phoneNumber ? fmtNum(req.phoneNumber) : 'A new number from Colvy'}</b></div>
            {st.sender.requestedAt && <div><span style={{ color: 'var(--slate)' }}>Requested</span><br /><b>{fmtDate(st.sender.requestedAt)}</b></div>}
          </div>
          {st.sender.note && <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--ink)' }}><b>From Colvy:</b> {st.sender.note}</p>}
          {st.canRequest && <button onClick={withdraw} disabled={!!busy} style={{ ...S.btnGhost, marginTop: 16, padding: '9px 16px', fontSize: 13 }}>{busy === 'withdraw' ? 'Withdrawing…' : 'Withdraw request'}</button>}
        </div>
      )}

      {(status === 'rejected' || status === 'disabled') && st?.sender?.note && (
        <div style={{ ...S.card, background: '#fffaf5' }}>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink)' }}><b>From Colvy:</b> {st.sender.note}</p>
          {status === 'disabled' && <p style={S.hint}>Contact Colvy to turn WhatsApp back on.</p>}
        </div>
      )}

      {showForm && st && (
        <>
          <div className="st-sec">
            <h2 style={S.h2}>How it works</h2>
            <div style={{ display: 'grid', gap: 14 }}>
              <Step n={1} title="Tell us about your business" body="The name customers will see on WhatsApp, the number to use and a few details Meta asks for." />
              <Step n={2} title="Colvy registers the number with Meta" body="We set it up with Meta through Twilio, Colvy’s messaging provider. Meta reviews the name, usually within one to three business days." />
              <Step n={3} title="Answer WhatsApp in your inbox" body="Messages arrive beside your texts and DMs. Available as soon as your WhatsApp number is approved." />
            </div>
          </div>

          <div className="st-sec">
            <h2 style={S.h2}>Request WhatsApp</h2>
            {!st.canRequest && <p style={{ margin: '0 0 12px', fontSize: 13, color: '#b54708' }}>Only the owner or an admin can request WhatsApp.</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <label style={{ minWidth: 0 }}>
                <span style={S.label}>Name customers will see</span>
                <input value={form.displayName} onChange={set('displayName')} maxLength={80} placeholder="e.g. Roxy Aquarium" style={S.input} />
                <span style={{ ...S.hint, display: 'block' }}>Meta checks it matches your business name or brand.</span>
              </label>
              <label style={{ minWidth: 0 }}>
                <span style={S.label}>WhatsApp number</span>
                <select value={form.phoneNumber} onChange={set('phoneNumber')} style={S.input}>
                  {st.numbers.map(n => <option key={n} value={n}>{fmtNum(n)} (your Colvy number)</option>)}
                  <option value="new">A new number from Colvy</option>
                </select>
                <span style={{ ...S.hint, display: 'block' }}>It can’t already be on the WhatsApp or WhatsApp Business app.</span>
              </label>
              <label style={{ minWidth: 0 }}>
                <span style={S.label}>Website</span>
                <input value={form.website} onChange={set('website')} maxLength={200} placeholder="https://" style={S.input} />
              </label>
              <label style={{ minWidth: 0 }}>
                <span style={S.label}>Industry</span>
                <input value={form.industry} onChange={set('industry')} maxLength={80} placeholder="e.g. Retail, Restaurant, Trades" style={S.input} />
              </label>
              <label style={{ minWidth: 0, gridColumn: '1 / -1' }}>
                <span style={S.label}>What your business does</span>
                <textarea value={form.description} onChange={set('description')} maxLength={500} rows={2} placeholder="One or two sentences; Meta shows it on your WhatsApp profile." style={{ ...S.input, resize: 'vertical' }} />
              </label>
              <label style={{ minWidth: 0, gridColumn: '1 / -1' }}>
                <span style={S.label}>Business address</span>
                <input value={form.address} onChange={set('address')} maxLength={300} style={S.input} />
              </label>
              <label style={{ minWidth: 0 }}>
                <span style={S.label}>Contact name</span>
                <input value={form.contactName} onChange={set('contactName')} maxLength={120} style={S.input} />
              </label>
              <label style={{ minWidth: 0 }}>
                <span style={S.label}>Contact email</span>
                <input value={form.contactEmail} onChange={set('contactEmail')} maxLength={200} type="email" style={S.input} />
              </label>
              <label style={{ minWidth: 0, gridColumn: '1 / -1' }}>
                <span style={S.label}>Anything else (optional)</span>
                <textarea value={form.notes} onChange={set('notes')} maxLength={1000} rows={2} placeholder="e.g. what you’ll use WhatsApp for, or a Meta Business account you already have" style={{ ...S.input, resize: 'vertical' }} />
              </label>
            </div>
            <button onClick={submit} disabled={!!busy || !st.canRequest || form.displayName.trim().length < 2}
              style={{ ...S.btn, marginTop: 18, opacity: busy || !st.canRequest || form.displayName.trim().length < 2 ? 0.6 : 1 }}>
              {busy === 'request' ? 'Sending…' : status === 'rejected' ? 'Request again' : 'Request WhatsApp'}
            </button>
            <p style={S.hint}>WhatsApp messages aren’t paid from your SMS credit.</p>
          </div>
        </>
      )}
    </div>
  )
}
