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
import { confirmDialog } from '@/components/ConfirmDialog'
import { CK_ICON, CkHead, CkStyle } from '@/components/calls/CallKit'
import { FileDrop, RGF_CSS } from '@/components/RegulatoryForm'
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
    if (!await confirmDialog({ title: 'Cancel this port request?', message: 'Your number stays with your current provider.', confirmLabel: 'Cancel request', cancelLabel: 'Keep it', tone: 'danger' })) return
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
    <section id="porting" className="ck-card npc">
      <CkStyle />
      <style>{NPC_CSS}</style>
      <div className="npc-top">
        <CkHead icon={CK_ICON.move} tone="#0d9488" title="Move your number to Colvy">
          Keep the number your customers know. Send us a request with a recent bill and our team handles the paperwork with the carriers. {PORT_TIMELINE}
        </CkHead>
        {!data?.unavailable && (
          <button type="button" className="ck-btn" onClick={() => { setOpen(true); setMsg('') }}>Request a port</button>
        )}
      </div>

      {data?.unavailable && (
        <p className="ck-note info">{CK_ICON.info}<span>Port requests aren’t switched on for your workspace yet. Email <a href="mailto:support@colvy.com?subject=Move%20my%20number%20to%20Colvy">support@colvy.com</a> and we’ll move your number for you.</span></p>
      )}

      {msg && <p className="ck-note info" role="status">{CK_ICON.info}<span>{msg}</span></p>}

      {requests.length > 0 && (
        <div className="npc-list">
          {requests.map(r => {
            const st = (r.status || 'submitted') as PortStatus
            const tone = TONE[st] || TONE.submitted
            const stepAt = STEPS.indexOf(st)
            return (
              <div key={r.id} className="npc-req">
                <div className="npc-req-top">
                  <b>{(r.numbers || []).map(formatAuNumber).join(', ')}</b>
                  <span className="ck-badge" style={{ background: tone.bg, color: tone.fg }}><i aria-hidden />{PORT_STATUS_LABEL[st] || st}</span>
                </div>
                <p className="npc-req-meta">From {r.current_carrier} · sent {fmtDate(r.submitted_at || r.created_at)}{r.preferred_date ? ` · preferred date ${fmtDate(r.preferred_date)}` : ''}</p>

                {stepAt >= 0 && (
                  <div className="npc-steps" aria-hidden>
                    {STEPS.map((x, i) => <span key={x} title={PORT_STATUS_LABEL[x]} style={i <= stepAt ? { background: tone.fg } : undefined} />)}
                  </div>
                )}
                <p className="npc-req-help">
                  {PORT_STATUS_HELP[st]}{st === 'scheduled' && r.scheduled_for ? ` Port date: ${fmtDate(r.scheduled_for)}.` : ''}
                </p>
                {st === 'rejected' && r.rejection_reason && (
                  <p className="npc-req-help bad"><strong>Why:</strong> {r.rejection_reason}</p>
                )}
                {isOpenPort(st) && <p className="npc-req-keep">{KEEP_SERVICE}</p>}

                {st === 'completed' && r.billing_status === 'pending' && (
                  <div className="npc-bill">
                    <span>
                      Your number is live. It’s {money(Number(r.monthly_price_aud) || 0)} a month{Number(r.port_fee_aud) > 0 ? `, plus a one-off ${money(Number(r.port_fee_aud))} porting fee` : ''}. Add a card to keep it running.
                    </span>
                    <button type="button" className="ck-btn sm" onClick={() => startBilling(r.id)} disabled={busy === r.id}>{busy === r.id ? 'Opening…' : 'Set up billing'}</button>
                  </div>
                )}

                {(r.events || []).filter((e: any) => e.note).length > 0 && (
                  <div className="npc-events">
                    {(r.events || []).filter((e: any) => e.note).map((e: any) => (
                      <p key={e.id}><span>{fmtDate(e.created_at)} · </span>{e.note}</p>
                    ))}
                  </div>
                )}

                <div className="npc-acts">
                  {(r.files || []).map((f: any) => (
                    <button key={f.id} type="button" className="ck-btn soft sm npc-file" onClick={() => openFile(f.id)}>
                      <Icon name="form" size={13} /> <span>{f.file_name || 'Document'}</span>
                    </button>
                  ))}
                  {isOpenPort(st) && (
                    <label className="ck-btn soft sm">
                      {busy === r.id ? 'Uploading…' : '+ Add a document'}
                      <input type="file" accept={FILE_TYPES.join(',')} hidden onChange={e => addFile(r.id, e.target.files?.[0] || null)} />
                    </label>
                  )}
                  {businessCanCancel(st) && (
                    <button type="button" className="npc-cancel" onClick={() => cancel(r.id)} disabled={busy === r.id}>Cancel request</button>
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
    </section>
  )
}

const NPC_CSS = `
.npc-top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}
.npc-top .ck-head{flex:1 1 320px;margin-bottom:0}
.npc-top>.ck-btn{margin-top:4px}
.npc .ck-note a{color:var(--coral);font-weight:600}
.npc-list{display:flex;flex-direction:column;gap:10px;margin-top:18px}
.npc-req{min-width:0;padding:16px;border-radius:18px;background:var(--ck-soft)}
.npc-req-top{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.npc-req-top b{font-family:var(--font-display),-apple-system,sans-serif;font-size:17px;font-weight:700;letter-spacing:-.01em;color:var(--ink);overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.npc-req-meta{margin:4px 0 0;font-size:12.5px;color:var(--ck-muted)}
.npc-steps{display:flex;gap:4px;margin:12px 0 2px}
.npc-steps span{flex:1;height:5px;border-radius:5px;background:var(--ck-fill-2)}
.npc-req-help{margin:10px 0 0;font-size:13px;line-height:1.55;color:var(--ink)}
.npc-req-help.bad{color:#b91c1c}
.npc-req-keep{margin:8px 0 0;font-size:12px;line-height:1.5;color:var(--ck-muted)}
.npc-bill{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:12px;padding:12px 14px;border-radius:14px;background:color-mix(in srgb,var(--coral) 9%,var(--card,#fff))}
.npc-bill span{flex:1 1 220px;min-width:0;font-size:13px;line-height:1.5;color:var(--ink)}
.npc-events{display:flex;flex-direction:column;gap:6px;margin-top:12px;padding-top:12px;border-top:1px solid var(--ck-line)}
.npc-events p{margin:0;font-size:12.5px;line-height:1.5;color:var(--ink)}
.npc-events p span{color:var(--ck-muted)}
.npc-acts{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:12px}
.npc-acts .ck-btn.soft{background:var(--card,#fff)}
.npc-file span{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.npc-cancel{margin-left:auto;padding:4px;border:0;background:none;font:inherit;font-size:13px;font-weight:600;color:#b91c1c;cursor:pointer}
`

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

  // Three steps, like "Verify your details": the number and its account, who
  // we contact (with the bill), then the authority. Continue checks this step;
  // sending checks everything and goes back to the first step with a problem.
  const STEP_KEYS = [
    ['numbers', 'carrier', 'accountHolder', 'accountNumber', 'abn', 'serviceAddress'],
    ['contactName', 'contactEmail', 'contactPhone', 'bill', 'preferredDate'],
    ['signedName', 'consent'],
  ]
  const TITLES = ['Your number', 'Contact', 'Authority']
  const [step, setStep] = useState(0)
  const check = () => validatePortRequest(f, bill ? { name: bill.name, type: bill.type, size: bill.size } : null, today)
  const next = () => {
    const all = check().errors
    const mine = Object.fromEntries(Object.entries(all).filter(([k]) => STEP_KEYS[step].includes(k)))
    setErrors(mine); setError('')
    if (Object.keys(mine).length) return
    setStep(x => Math.min(2, x + 1))
  }
  const send = async () => {
    const all = check().errors
    if (Object.keys(all).length) {
      setErrors(all); setError('')
      const first = STEP_KEYS.findIndex(keys => keys.some(k => all[k]))
      if (first >= 0) setStep(first)
      return
    }
    await submit()
  }

  const field = (k: string, label: string, opts: { placeholder?: string; type?: string; hint?: string; inputMode?: 'numeric' | 'tel' | 'email'; auto?: string } = {}) => (
    <label className={`rgf-f${errors[k] ? ' bad' : ''}`}>
      <span>{label}</span>
      {opts.hint && <small className="pf-hint">{opts.hint}</small>}
      <input type={opts.type || 'text'} value={f[k] || ''} placeholder={opts.placeholder} inputMode={opts.inputMode} autoComplete={opts.auto}
        min={opts.type === 'date' ? today : undefined} onChange={e => set(k, e.target.value)} />
      {errors[k] && <small className="pf-err">{errors[k]}</small>}
    </label>
  )

  return (
    <div className="rgf-back" role="dialog" aria-modal="true" aria-labelledby="pf-title" onKeyDown={e => { if (e.key === 'Escape' && !saving) onCancel() }}>
      <style>{RGF_CSS}</style>
      <style>{PF_CSS}</style>
      <div className="rgf">
        <div className="rgf-head">
          <div className="rgf-steps" aria-label={`Step ${step + 1} of 3`}>
            {TITLES.map((t, i) => (
              <span key={t} className={i === step ? 'on' : i < step ? 'done' : ''}><i>{i < step ? '✓' : i + 1}</i>{t}</span>
            ))}
          </div>
          <h2 id="pf-title">Move your number to Colvy</h2>
          <p>{step === 0 ? `Fill this in exactly as it appears on your current provider’s bill. We check it, lodge it with the carriers and let you know at each step. ${PORT_TIMELINE}` : step === 1 ? 'Who we keep updated, and the bill that proves the number is yours.' : 'Your go-ahead for us to move the number. Nothing is charged until it has moved.'}</p>
        </div>

        <div className="rgf-body" key={step}>
          {error && <div className="rgf-err" role="alert">{error}</div>}
          {Object.keys(errors).length > 0 && !error && <div className="rgf-err soft">Check the highlighted fields to continue.</div>}

          {step === 0 && (<>
            <div className="pf-keep">{CK_ICON.warn}<span>{KEEP_SERVICE}</span></div>
            <label className={`rgf-f${errors.numbers ? ' bad' : ''}`}>
              <span>Number(s) to move</span>
              <small className="pf-hint">One per line. Landlines (02, 03, 07, 08), mobiles (04) and 1800 numbers. 13 and 1300 numbers can’t be moved yet.</small>
              <textarea value={f.numbers} onChange={e => set('numbers', e.target.value)} placeholder="03 9123 4567" rows={2} />
              {errors.numbers && <small className="pf-err">{errors.numbers}</small>}
            </label>
            {field('carrier', 'Current provider', { placeholder: 'e.g. Telstra, Optus, TPG, Aussie Broadband' })}
            {field('accountHolder', 'Account holder name', { hint: 'The person or business named on the bill.' })}
            <div className="rgf-row">
              {field('accountNumber', 'Account number')}
              {field('abn', 'ABN (if a business)', { placeholder: '51 824 753 556', inputMode: 'numeric' })}
            </div>
            {field('serviceAddress', 'Service address', { placeholder: '12 Collins St, Melbourne VIC 3000', hint: 'The address the service is registered to, with state and postcode.' })}
          </>)}

          {step === 1 && (<>
            {field('contactName', 'Name', { auto: 'name' })}
            <div className="rgf-row">
              {field('contactEmail', 'Email', { type: 'email', auto: 'email' })}
              {field('contactPhone', 'Phone', { type: 'tel', placeholder: '04…', auto: 'tel' })}
            </div>
            <div className={`rgf-f${errors.bill ? ' bad' : ''}`}>
              <span>Recent bill</span>
              <small className="pf-hint">Your most recent bill from the current provider, showing the number, account number and account holder.</small>
              <FileDrop file={bill} accept={FILE_TYPES.join(',')} hint="PDF or photo · up to 4 MB"
                onPick={file => { setBill(file); setErrors(x => { const n = { ...x }; delete n.bill; return n }) }} />
              {errors.bill && <small className="pf-err">{errors.bill}</small>}
            </div>
            {field('preferredDate', 'Preferred port date (optional)', { type: 'date', hint: 'We’ll ask for this date; the carriers confirm the actual one.' })}
          </>)}

          {step === 2 && (<>
            <div className="rgf-f">
              <span>Letter of authority</span>
              <div className="pf-loa">{authority}</div>
            </div>
            {field('signedName', 'Type your full name to sign', { auto: 'name' })}
            <label className={`pf-consent${errors.consent ? ' bad' : ''}`}>
              <input type="checkbox" checked={!!f.consent} onChange={e => set('consent', e.target.checked)} />
              <span>I am the account holder or authorised to act for them, and I give this authority.</span>
            </label>
            {errors.consent && <small className="pf-err">{errors.consent}</small>}
            <div className="rgf-id">
              <span className="rgf-id-ic" aria-hidden="true">{CK_ICON.info}</span>
              <div>
                <b>{portFee > 0 ? `Porting fee: ${money(portFee)} one-off` : 'No porting fee'}</b>
                <span>
                  {portFee > 0 ? 'Charged when your number has moved. ' : ''}Once it has moved, each number is {money(monthly)} a month{parsedNumbers.some(n => n.startsWith('+611800')) ? ` (1800 numbers ${money(tollfreeMonthly)})` : ''}, like any Colvy number{parsedNumbers.length > 1 ? `: ${money(monthlyTotal)} a month for these ${parsedNumbers.length}` : ''}. Nothing is charged until then.
                </span>
              </div>
            </div>
          </>)}
        </div>

        <div className="rgf-foot">
          <button type="button" className="rgf-btn ghost" onClick={() => (step === 0 ? onCancel() : (setErrors({}), setError(''), setStep(x => x - 1)))} disabled={saving}>{step === 0 ? 'Cancel' : 'Back'}</button>
          {step < 2
            ? <button type="button" className="rgf-btn" onClick={next}>Continue</button>
            : <button type="button" className="rgf-btn" onClick={send} disabled={saving}>{saving ? 'Sending…' : 'Send request'}</button>}
        </div>
      </div>
    </div>
  )
}

const PF_CSS = `
.rgf-f textarea{width:100%;box-sizing:border-box;min-height:70px;padding:12px 14px;border:0;border-radius:12px;background:#f4f4f5;font:inherit;font-size:14.5px;line-height:1.45;color:#111;outline:none;resize:vertical;transition:background .15s,box-shadow .15s}
.rgf-f textarea::placeholder{color:#a1a1aa}
.rgf-f textarea:focus{background:#fff;box-shadow:0 0 0 2px color-mix(in srgb,var(--coral) 55%,transparent)}
.rgf-f.bad textarea{background:#fef2f2;box-shadow:0 0 0 1.5px #fca5a5}
.pf-hint{margin-top:-2px;font-size:12px;line-height:1.45;color:#8e8e93}
.pf-err{font-size:12px;line-height:1.4;color:#dc2626}
.pf-keep{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:16px;background:#fffbeb;font-size:12.5px;line-height:1.5;color:#92400e}
.pf-keep svg{flex-shrink:0;margin-top:1px}
.pf-loa{padding:14px;border-radius:14px;background:#f7f7f8;font-size:12.5px;line-height:1.6;color:#3f3f46}
.pf-consent{display:flex;gap:11px;align-items:flex-start;padding:13px 14px;border-radius:16px;background:#f7f7f8;font-size:13px;line-height:1.5;color:#18181b;cursor:pointer}
.pf-consent input{width:18px;height:18px;margin:1px 0 0;flex-shrink:0;accent-color:var(--coral);cursor:pointer}
.pf-consent.bad{background:#fef2f2;box-shadow:0 0 0 1.5px #fca5a5}
`
