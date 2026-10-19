'use client'

// Settings → Calls & SMS → "Move your number to Colvy". The business asks to
// port an existing Australian number; the Colvy team checks it, lodges it with
// the carriers and attaches the number when it arrives (lib/number-porting,
// /api/phone-porting). Shows each request's progress, and once a port is done
// the step to start paying for the number.

import { useEffect, useMemo, useRef, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/integrations/ui'
import {
  validatePortRequest, loaText, formatAuNumber, parsePortNumber, businessCanCancel, isOpenPort,
  PORT_STATUS_LABEL, PORT_STATUS_HELP, PORT_TIMELINE, KEEP_SERVICE, FILE_TYPES, type PortStatus,
} from '@/lib/number-porting'

const TONE: Record<string, { bg: string; fg: string }> = {
  submitted: { bg: '#eef2ff', fg: '#4338ca' },
  in_review: { bg: '#fef3c7', fg: '#92400e' },
  submitted_to_carrier: { bg: '#e0f2fe', fg: '#0369a1' },
  scheduled: { bg: '#ecfeff', fg: '#0e7490' },
  completed: { bg: '#dcfce7', fg: '#15803d' },
  rejected: { bg: '#fef2f2', fg: '#b91c1c' },
  cancelled: { bg: '#f1f5f9', fg: '#475569' },
}
const STEPS: PortStatus[] = ['submitted', 'in_review', 'submitted_to_carrier', 'scheduled', 'completed']

const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box', background: '#fff', minWidth: 0 }
const btn = (primary = false): React.CSSProperties => ({ padding: '9px 15px', borderRadius: 9, border: primary ? 'none' : '1px solid var(--border)', background: primary ? 'var(--coral)' : '#fff', color: primary ? '#fff' : 'var(--ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer' })
const fmtDate = (d?: string | null) => { if (!d) return ''; const t = new Date(d.length === 10 ? d + 'T00:00:00' : d); return isNaN(t.getTime()) ? d : t.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) }
const money = (n: number) => (Number.isInteger(n) ? `A$${n}` : `A$${n.toFixed(2)}`)

export default function NumberPortingCard({ companyId }: { companyId: string }) {
  const [data, setData] = useState<{ requests: any[]; unavailable: boolean; portFee: number; monthly: number; tollfreeMonthly: number } | null>(null)
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')

  const load = async () => {
    try {
      const res = await authFetch(`/api/phone-porting?companyId=${encodeURIComponent(companyId)}`)
      const d = await res.json()
      if (res.ok) setData({ requests: d.requests || [], unavailable: !!d.unavailable, portFee: Number(d.portFee) || 0, monthly: Number(d.monthly) || 15, tollfreeMonthly: Number(d.tollfreeMonthly) || 25 })
    } catch {}
  }

  useEffect(() => {
    load()
    // Back from the billing checkout: confirm it.
    const qp = new URLSearchParams(window.location.search)
    if (qp.get('port_billing') === '1' && qp.get('port_request') && qp.get('session_id')) {
      authFetch('/api/phone-porting/billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, requestId: qp.get('port_request'), sessionId: qp.get('session_id') }) })
        .then(r => r.json()).then(d => { setMsg(d.ok ? 'Thanks. Billing for your moved number is set up.' : d.error || ''); load() }).catch(() => {})
    }
  }, [companyId])

  const cancel = async (id: string) => {
    if (!confirm('Cancel this port request? Your number stays with your current provider.')) return
    setBusy(id); setMsg('')
    try {
      const res = await authFetch('/api/phone-porting', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, requestId: id, action: 'cancel' }) })
      const d = await res.json()
      if (!res.ok) setMsg(d.error || 'Couldn’t cancel.')
      await load()
    } finally { setBusy('') }
  }

  const startBilling = async (id: string) => {
    setBusy(id); setMsg('')
    try {
      const { data: s } = await supabase.auth.getSession()
      const res = await authFetch('/api/phone-porting/billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, requestId: id, email: s?.session?.user?.email }) })
      const d = await res.json()
      if (d.url) { window.location.href = d.url; return }
      setMsg(d.error || (d.ok ? 'Billing is already set up.' : 'Couldn’t start checkout.'))
    } finally { setBusy('') }
  }

  const openFile = async (fileId: string) => {
    const res = await authFetch(`/api/phone-porting/files?companyId=${encodeURIComponent(companyId)}&fileId=${encodeURIComponent(fileId)}`)
    const d = await res.json()
    if (d.url) window.open(d.url, '_blank', 'noopener')
    else setMsg(d.error || 'The file isn’t available.')
  }

  const addFile = async (id: string, file: File | null) => {
    if (!file) return
    setBusy(id); setMsg('')
    try {
      const fd = new FormData()
      fd.set('companyId', companyId); fd.set('requestId', id); fd.set('file', file)
      const res = await authFetch('/api/phone-porting/files', { method: 'POST', body: fd })
      const d = await res.json()
      setMsg(res.ok ? 'Document added.' : d.error || 'Couldn’t add the document.')
      await load()
    } finally { setBusy('') }
  }

  const requests = data?.requests || []

  return (
    <div id="porting" style={{ marginTop: 22, border: '1px solid var(--border)', borderRadius: 14, padding: 18, background: '#fff', scrollMarginTop: 80 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <p style={{ margin: '0 0 3px', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Move your number to Colvy</p>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.5 }}>
            Keep the number your customers know. Send us a request with a recent bill and our team handles the paperwork with the carriers. {PORT_TIMELINE}
          </p>
        </div>
        {!data?.unavailable && (
          <button onClick={() => { setOpen(true); setMsg('') }} style={{ ...btn(true), flexShrink: 0 }}>Request a port</button>
        )}
      </div>

      {data?.unavailable && (
        <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.5 }}>
          Port requests aren’t switched on for your workspace yet. Email <a href="mailto:support@colvy.com?subject=Move%20my%20number%20to%20Colvy" style={{ color: 'var(--coral)', fontWeight: 600 }}>support@colvy.com</a> and we’ll move your number for you.
        </p>
      )}

      {msg && <div style={{ marginTop: 12, background: 'var(--canvas, #f8fafc)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', fontSize: 12.5, color: 'var(--ink)' }}>{msg}</div>}

      {requests.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {requests.map(r => {
            const st = (r.status || 'submitted') as PortStatus
            const tone = TONE[st] || TONE.submitted
            const stepAt = STEPS.indexOf(st)
            return (
              <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{(r.numbers || []).map(formatAuNumber).join(', ')}</p>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: tone.bg, color: tone.fg, whiteSpace: 'nowrap' }}>{PORT_STATUS_LABEL[st] || st}</span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--slate)' }}>From {r.current_carrier} · sent {fmtDate(r.submitted_at || r.created_at)}{r.preferred_date ? ` · preferred date ${fmtDate(r.preferred_date)}` : ''}</p>

                {stepAt >= 0 && (
                  <div aria-hidden style={{ display: 'flex', gap: 4, margin: '10px 0 2px' }}>
                    {STEPS.map((s, i) => <span key={s} title={PORT_STATUS_LABEL[s]} style={{ flex: 1, height: 4, borderRadius: 4, background: i <= stepAt ? tone.fg : 'var(--border)' }} />)}
                  </div>
                )}
                <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.5 }}>
                  {PORT_STATUS_HELP[st]}{st === 'scheduled' && r.scheduled_for ? ` Port date: ${fmtDate(r.scheduled_for)}.` : ''}
                </p>
                {st === 'rejected' && r.rejection_reason && (
                  <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#b91c1c', lineHeight: 1.5 }}><strong>Why:</strong> {r.rejection_reason}</p>
                )}
                {isOpenPort(st) && (
                  <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--slate)', lineHeight: 1.5 }}>{KEEP_SERVICE}</p>
                )}

                {st === 'completed' && r.billing_status === 'pending' && (
                  <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--peach)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.45, minWidth: 0, flex: '1 1 200px' }}>
                      Your number is live. It’s {money(Number(r.monthly_price_aud) || 0)} a month{Number(r.port_fee_aud) > 0 ? `, plus a one-off ${money(Number(r.port_fee_aud))} porting fee` : ''}. Add a card to keep it running.
                    </span>
                    <button onClick={() => startBilling(r.id)} disabled={busy === r.id} style={btn(true)}>{busy === r.id ? 'Opening…' : 'Set up billing'}</button>
                  </div>
                )}

                {(r.events || []).filter((e: any) => e.note).length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(r.events || []).filter((e: any) => e.note).map((e: any) => (
                      <p key={e.id} style={{ margin: 0, fontSize: 12, color: 'var(--ink)', lineHeight: 1.45 }}>
                        <span style={{ color: 'var(--slate)' }}>{fmtDate(e.created_at)} · </span>{e.note}
                      </p>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
                  {(r.files || []).map((f: any) => (
                    <button key={f.id} onClick={() => openFile(f.id)} style={{ ...btn(), padding: '6px 10px', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%' }}>
                      <Icon name="form" size={12} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{f.file_name || 'Document'}</span>
                    </button>
                  ))}
                  {isOpenPort(st) && (
                    <label style={{ ...btn(), padding: '6px 10px', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      {busy === r.id ? 'Uploading…' : 'Add a document'}
                      <input type="file" accept={FILE_TYPES.join(',')} style={{ display: 'none' }} onChange={e => addFile(r.id, e.target.files?.[0] || null)} />
                    </label>
                  )}
                  {businessCanCancel(st) && (
                    <button onClick={() => cancel(r.id)} disabled={busy === r.id} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#b91c1c', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 4 }}>Cancel request</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {open && data && (
        <PortForm companyId={companyId} portFee={data.portFee} monthly={data.monthly} tollfreeMonthly={data.tollfreeMonthly}
          onCancel={() => setOpen(false)}
          onDone={() => { setOpen(false); setMsg('Request sent. We’ll email you as it moves along.'); load() }} />
      )}
    </div>
  )
}

function PortForm({ companyId, portFee, monthly, tollfreeMonthly, onCancel, onDone }: { companyId: string; portFee: number; monthly: number; tollfreeMonthly: number; onCancel: () => void; onDone: () => void }) {
  const [f, setF] = useState<any>({ numbers: '', carrier: '', accountHolder: '', accountNumber: '', serviceAddress: '', abn: '', contactName: '', contactEmail: '', contactPhone: '', signedName: '', consent: false, preferredDate: '' })
  const [bill, setBill] = useState<File | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const set = (k: string, v: any) => { setF((x: any) => ({ ...x, [k]: v })); setErrors(e => { const n = { ...e }; delete n[k]; return n }) }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      const u = data?.session?.user
      if (u) setF((x: any) => ({ ...x, contactEmail: x.contactEmail || u.email || '', contactName: x.contactName || u.user_metadata?.full_name || '' }))
    }).catch(() => {})
  }, [])

  const parsedNumbers = useMemo(() => String(f.numbers).split(/[\n,;]+/).map((s: string) => s.trim()).filter(Boolean).map(parsePortNumber).filter((p: any) => 'e164' in p).map((p: any) => p.e164 as string), [f.numbers])
  const monthlyTotal = parsedNumbers.reduce((s: number, n: string) => s + (n.startsWith('+611800') ? tollfreeMonthly : monthly), 0)
  const authority = loaText({ accountHolder: f.accountHolder, carrier: f.carrier, numbers: parsedNumbers })
  const today = new Date().toISOString().slice(0, 10)

  const submit = async () => {
    setError('')
    const check = validatePortRequest(f, bill ? { name: bill.name, type: bill.type, size: bill.size } : null, today)
    setErrors(check.errors)
    if (!check.ok) { setError('Check the highlighted fields.'); return }
    setSaving(true)
    try {
      const fd = new FormData()
      fd.set('companyId', companyId)
      fd.set('data', JSON.stringify(f))
      fd.set('bill', bill!)
      const res = await authFetch('/api/phone-porting', { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErrors(d.errors || {}); setError(d.error || 'Your request couldn’t be sent.'); return }
      onDone()
    } catch (e: any) { setError(e?.message || 'Your request couldn’t be sent.') } finally { setSaving(false) }
  }

  const L = ({ k, children, hint }: { k?: string; children: React.ReactNode; hint?: string }) => (
    <>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', margin: '14px 0 5px' }}>{children}</label>
      {hint && <p style={{ margin: '-2px 0 6px', fontSize: 11.5, color: 'var(--slate)', lineHeight: 1.4 }}>{hint}</p>}
      {k && errors[k] && <p style={{ margin: '0 0 5px', fontSize: 11.5, color: '#dc2626' }}>{errors[k]}</p>}
    </>
  )
  const bad = (k: string): React.CSSProperties => errors[k] ? { ...inputStyle, borderColor: '#fca5a5' } : inputStyle

  return (
    <div role="dialog" aria-modal="true" aria-label="Move your number to Colvy" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div style={{ background: '#fff', borderRadius: 18, maxWidth: 560, width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: 'clamp(16px, 4vw, 26px)', boxSizing: 'border-box' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>Move your number to Colvy</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
          Fill this in exactly as it appears on your current provider’s bill. We check it, lodge it with the carriers and let you know at each step. {PORT_TIMELINE}
        </p>
        <div style={{ margin: '12px 0 0', padding: '10px 12px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 12, color: '#78350f', lineHeight: 1.5 }}>{KEEP_SERVICE}</div>

        {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 12px', margin: '12px 0 0', fontSize: 13, color: '#dc2626' }}>{error}</div>}

        <L k="numbers" hint="One per line. Landlines (02, 03, 07, 08), mobiles (04) and 1800 numbers. 13 and 1300 numbers can’t be moved yet.">Number(s) to move</L>
        <textarea style={{ ...bad('numbers'), minHeight: 64, resize: 'vertical', fontFamily: 'inherit' }} value={f.numbers} onChange={e => set('numbers', e.target.value)} placeholder="03 9123 4567" />

        <L k="carrier">Current provider</L>
        <input style={bad('carrier')} value={f.carrier} onChange={e => set('carrier', e.target.value)} placeholder="e.g. Telstra, Optus, TPG, Aussie Broadband" />

        <L k="accountHolder" hint="The person or business named on the bill.">Account holder name</L>
        <input style={bad('accountHolder')} value={f.accountHolder} onChange={e => set('accountHolder', e.target.value)} />

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <L k="accountNumber">Account number</L>
            <input style={bad('accountNumber')} value={f.accountNumber} onChange={e => set('accountNumber', e.target.value)} />
          </div>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <L k="abn">ABN (if a business)</L>
            <input style={bad('abn')} value={f.abn} onChange={e => set('abn', e.target.value)} inputMode="numeric" placeholder="51 824 753 556" />
          </div>
        </div>

        <L k="serviceAddress" hint="The address the service is registered to, with state and postcode.">Service address</L>
        <input style={bad('serviceAddress')} value={f.serviceAddress} onChange={e => set('serviceAddress', e.target.value)} placeholder="12 Collins St, Melbourne VIC 3000" />

        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Who we contact</p>
        </div>
        <L k="contactName">Name</L>
        <input style={bad('contactName')} value={f.contactName} onChange={e => set('contactName', e.target.value)} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <L k="contactEmail">Email</L>
            <input type="email" style={bad('contactEmail')} value={f.contactEmail} onChange={e => set('contactEmail', e.target.value)} />
          </div>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <L k="contactPhone">Phone</L>
            <input type="tel" style={bad('contactPhone')} value={f.contactPhone} onChange={e => set('contactPhone', e.target.value)} placeholder="04…" />
          </div>
        </div>

        <L k="bill" hint="Your most recent bill from the current provider, showing the number, account number and account holder. PDF or photo, up to 4 MB.">Recent bill</L>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, border: `1px ${bill ? 'solid' : 'dashed'} ${errors.bill ? '#fca5a5' : 'var(--border)'}`, background: 'var(--canvas, #fafafa)', flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept={FILE_TYPES.join(',')} style={{ display: 'none' }} onChange={e => { setBill(e.target.files?.[0] || null); setErrors(x => { const n = { ...x }; delete n.bill; return n }) }} />
          <span style={{ flex: '1 1 160px', minWidth: 0, fontSize: 13, color: bill ? 'var(--ink)' : 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bill ? bill.name : 'No file chosen'}</span>
          <button type="button" onClick={() => fileRef.current?.click()} style={btn()}>{bill ? 'Change' : 'Choose file'}</button>
        </div>

        <L k="preferredDate" hint="We’ll ask for this date; the carriers confirm the actual one.">Preferred port date (optional)</L>
        <input type="date" min={today} style={bad('preferredDate')} value={f.preferredDate} onChange={e => set('preferredDate', e.target.value)} />

        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Letter of authority</p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--ink)', lineHeight: 1.55, padding: '10px 12px', borderRadius: 10, background: 'var(--canvas, #f8fafc)', border: '1px solid var(--border)' }}>{authority}</p>
        </div>
        <L k="signedName">Type your full name to sign</L>
        <input style={bad('signedName')} value={f.signedName} onChange={e => set('signedName', e.target.value)} autoComplete="name" />
        <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 12, fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.45, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!f.consent} onChange={e => set('consent', e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>I am the account holder or authorised to act for them, and I give this authority.</span>
        </label>
        {errors.consent && <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#dc2626' }}>{errors.consent}</p>}

        <div style={{ marginTop: 16, padding: '10px 12px', borderRadius: 10, background: 'var(--peach)', fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.5 }}>
          {portFee > 0 ? `Porting fee: ${money(portFee)} one-off, charged when your number has moved. ` : 'No porting fee. '}
          Once it has moved, each number is {money(monthly)} a month{parsedNumbers.some(n => n.startsWith('+611800')) ? ` (1800 numbers ${money(tollfreeMonthly)})` : ''}, like any Colvy number{parsedNumbers.length > 1 ? `: ${money(monthlyTotal)} a month for these ${parsedNumbers.length}` : ''}. Nothing is charged until then.
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          <button type="button" onClick={onCancel} style={{ ...btn(), flex: '1 1 120px', padding: 12 }}>Cancel</button>
          <button type="button" onClick={submit} disabled={saving} style={{ ...btn(true), flex: '2 1 180px', padding: 12, opacity: saving ? 0.7 : 1 }}>{saving ? 'Sending…' : 'Send request'}</button>
        </div>
      </div>
    </div>
  )
}
