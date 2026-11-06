'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { fmtMoney, LINE_KIND_LABEL, type LineKind } from '@/lib/jobs/quote-math'

// The customer's quote (/q/<token>): the business, the work, the items with
// GST, the terms, and Accept (typed name + agreement) or Decline. A deposit,
// when the quote asks for one, is paid by card straight after accepting; it
// only shows as paid once the server has checked with Stripe.

const fmtDate = (ymd: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '')
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
}
const fmtWhen = (iso: string | null | undefined, tz: string) => {
  if (!iso) return ''
  try { return new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) } catch { return '' }
}
const qty = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000))

export default function PublicQuotePage() {
  const { token } = useParams() as { token: string }
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState('')
  const [mode, setMode] = useState<'view' | 'decline'>('view')
  const [name, setName] = useState('')
  const [agree, setAgree] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const sp = new URLSearchParams(window.location.search)
      const qs = new URLSearchParams()
      if (sp.get('session_id')) qs.set('session_id', sp.get('session_id')!)
      if (sp.get('preview') === '1') qs.set('preview', '1')
      const res = await fetch(`/api/q/${encodeURIComponent(token)}${qs.toString() ? `?${qs}` : ''}`, { cache: 'no-store' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error || 'This quote couldn’t be loaded.'); return }
      setD(j)
      if (j.justPaid) setNotice('Thanks, your deposit is paid.')
      else if (sp.get('paid') === '1' && j.quote.deposit_status !== 'paid') setNotice('We’re confirming your payment. This can take a minute; refresh the page to check.')
      else if (sp.get('payment') === 'cancelled') setNotice('The payment was cancelled. You can pay the deposit below whenever you’re ready.')
      if (sp.get('session_id') || sp.get('paid') || sp.get('payment')) {
        const u = new URL(window.location.href); ['session_id', 'paid', 'payment'].forEach(k => u.searchParams.delete(k)); window.history.replaceState(null, '', u.toString())
      }
    } catch { setErr('This quote couldn’t be loaded. Check your connection and try again.') }
  }, [token])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (d?.customer?.name && !name) setName(d.customer.name) }, [d]) // eslint-disable-line react-hooks/exhaustive-deps

  const post = async (body: any) => {
    setBusy(true); setFormErr('')
    try {
      const res = await fetch(`/api/q/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setFormErr(j.error || 'That didn’t work. Please try again.'); return null }
      return j
    } catch { setFormErr('That didn’t work. Check your connection and try again.'); return null }
    finally { setBusy(false) }
  }
  const accept = async () => {
    if (name.trim().length < 2) { setFormErr('Please type your full name.'); return }
    if (!agree) { setFormErr('Please tick the box to agree to the quote and its terms.'); return }
    const j = await post({ action: 'accept', name, agree: true })
    if (!j) return
    if (j.depositUrl) { window.location.href = j.depositUrl; return }
    setD((x: any) => ({ ...x, ...j })); setNotice('Thanks, the quote is accepted. The business will be in touch to confirm the details.')
  }
  const decline = async () => {
    const j = await post({ action: 'decline', name, note })
    if (j) { setD((x: any) => ({ ...x, ...j })); setMode('view'); setNotice('Thanks for letting them know.') }
  }
  const payDeposit = async () => {
    const j = await post({ action: 'deposit' })
    if (j?.depositUrl) window.location.href = j.depositUrl
  }

  const accent = /^#[0-9a-f]{3,8}$/i.test(d?.business?.accent_color || '') ? d.business.accent_color : '#111111'

  if (err) return (
    <main className="pq"><style>{CSS}</style>
      <div className="pq-card pq-center"><h1>Quote not available</h1><p>{err}</p></div>
    </main>
  )
  if (!d) return (
    <main className="pq"><style>{CSS}</style>
      <div className="pq-card"><div className="pq-sk" style={{ width: '40%' }} /><div className="pq-sk" style={{ width: '70%', height: 34 }} /><div className="pq-sk" style={{ height: 180 }} /></div>
    </main>
  )

  const q = d.quote, b = d.business
  const gst = q.gst_registered && q.tax_rate > 0
  const open = q.status === 'sent' && !q.expired
  const depositDue = q.status === 'accepted' && q.deposit_cents > 0 && q.deposit_status !== 'paid'

  return (
    <main className="pq" style={{ ['--acc' as any]: accent }}>
      <style>{CSS}</style>
      <div className="pq-card">
        <header className="pq-head">
          <div className="pq-biz">
            {b.logo_url ? <img src={b.logo_url} alt="" className="pq-logo" /> : <span className="pq-mono" aria-hidden>{String(b.name || '?').slice(0, 1).toUpperCase()}</span>}
            <div><b>{b.name}</b>{b.abn && <span>ABN {b.abn}</span>}</div>
          </div>
          <div className="pq-no"><span>Quote</span><b>{q.label}</b></div>
        </header>

        {notice && <div className="pq-note good" role="status">{notice}</div>}
        {q.status === 'accepted' && !notice && <div className="pq-note good">Accepted{q.decided_name ? ` by ${q.decided_name}` : ''}{q.accepted_at ? ` on ${new Date(q.accepted_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}` : ''}. Thank you.</div>}
        {q.status === 'declined' && !notice && <div className="pq-note">You declined this quote. Contact {b.name} if you’d like a new one.</div>}
        {q.status === 'withdrawn' && <div className="pq-note">This quote has been replaced or withdrawn. Contact {b.name} for the latest one.</div>}
        {q.expired && <div className="pq-note warn">This quote expired on {fmtDate(q.valid_until)}. Contact {b.name} for an updated quote.</div>}

        <section className="pq-intro">
          <h1>{q.title || d.job.title}</h1>
          <div className="pq-facts">
            {d.customer?.name && <div><span>Prepared for</span><b>{d.customer.name}</b></div>}
            {d.job.address && <div><span>Address</span><b>{d.job.address}</b></div>}
            {d.job.scheduled_start && <div><span>Booked for</span><b>{fmtWhen(d.job.scheduled_start, d.timezone)}</b></div>}
            {q.valid_until && <div><span>Valid until</span><b>{fmtDate(q.valid_until)}</b></div>}
          </div>
          {q.intro && <p className="pq-pre">{q.intro}</p>}
        </section>

        <section>
          <table className="pq-items">
            <thead><tr><th>Item</th><th className="r">Qty</th><th className="r">Price</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {q.items.map((l: any) => (
                <tr key={l.id}>
                  <td><b>{l.description || LINE_KIND_LABEL[l.kind as LineKind]}</b>{gst && !l.taxable && <small>GST-free</small>}</td>
                  <td className="r">{qty(l.quantity)}{l.unit && l.unit !== 'each' ? ` ${l.unit}` : ''}</td>
                  <td className="r">{fmtMoney(l.unit_price_cents)}</td>
                  <td className="r">{fmtMoney(l.line_total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="pq-tot">
            {q.discount_cents > 0 && <><dt>Items</dt><dd>{fmtMoney(q.gross_cents)}</dd><dt>Discount</dt><dd>−{fmtMoney(q.discount_cents)}</dd></>}
            <dt>Subtotal{gst ? ' (excl. GST)' : ''}</dt><dd>{fmtMoney(q.subtotal_cents)}</dd>
            {gst && <><dt>GST ({q.tax_rate}%)</dt><dd>{fmtMoney(q.tax_cents)}</dd></>}
            <dt className="big">Total{gst ? ' (incl. GST)' : ''}</dt><dd className="big">{fmtMoney(q.total_cents)}</dd>
            {q.deposit_cents > 0 && <><dt>Deposit to confirm</dt><dd>{fmtMoney(q.deposit_cents)}{q.deposit_status === 'paid' ? ' · paid' : ''}</dd></>}
          </dl>
          {q.prices_include_tax && gst && <p className="pq-small">Prices include GST.</p>}
        </section>

        {q.terms && <section className="pq-terms"><h2>Terms</h2><p className="pq-pre">{q.terms}</p></section>}

        {open && mode === 'view' && (
          <section className="pq-act" aria-label="Accept this quote">
            <h2>Happy to go ahead?</h2>
            <label className="pq-lbl" htmlFor="pq-name">Your full name</label>
            <input id="pq-name" className="pq-in" value={name} onChange={e => setName(e.target.value)} autoComplete="name" maxLength={120} />
            <label className="pq-agree"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /> I accept this quote{q.terms ? ' and its terms' : ''}{q.deposit_cents > 0 ? `, and I’ll pay the ${fmtMoney(q.deposit_cents)} deposit to confirm` : ''}.</label>
            {formErr && <div className="pq-note bad" role="alert">{formErr}</div>}
            <div className="pq-btns">
              <button type="button" className="pq-btn go" onClick={accept} disabled={busy}>{busy ? 'One moment…' : q.deposit_cents > 0 && d.paymentsReady ? `Accept & pay ${fmtMoney(q.deposit_cents)} deposit` : 'Accept quote'}</button>
              <button type="button" className="pq-btn ghost" onClick={() => { setMode('decline'); setFormErr('') }}>Decline</button>
            </div>
          </section>
        )}
        {open && mode === 'decline' && (
          <section className="pq-act" aria-label="Decline this quote">
            <h2>Decline this quote</h2>
            <label className="pq-lbl" htmlFor="pq-note">Anything you’d like {b.name} to know? <span>(optional)</span></label>
            <textarea id="pq-note" className="pq-in" rows={3} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} placeholder="e.g. We’ve decided to wait until next year." />
            {formErr && <div className="pq-note bad" role="alert">{formErr}</div>}
            <div className="pq-btns">
              <button type="button" className="pq-btn danger" onClick={decline} disabled={busy}>{busy ? 'One moment…' : 'Decline quote'}</button>
              <button type="button" className="pq-btn ghost" onClick={() => setMode('view')}>Back</button>
            </div>
          </section>
        )}
        {depositDue && d.paymentsReady && (
          <section className="pq-act">
            <h2>Pay your deposit</h2>
            <p className="pq-small" style={{ marginTop: 0 }}>{fmtMoney(q.deposit_cents)} by card, to confirm the booking.</p>
            {formErr && <div className="pq-note bad" role="alert">{formErr}</div>}
            <button type="button" className="pq-btn go" onClick={payDeposit} disabled={busy}>{busy ? 'One moment…' : `Pay ${fmtMoney(q.deposit_cents)}`}</button>
          </section>
        )}

        <footer className="pq-foot">
          <div>
            <b>{b.name}</b>
            {b.phone && <a href={`tel:${b.phone}`}>{b.phone}</a>}
            {b.email && <a href={`mailto:${b.email}`}>{b.email}</a>}
            {b.address && <span>{b.address}</span>}
          </div>
          <button type="button" className="pq-btn ghost sm pq-print" onClick={() => window.print()}>Print or save as PDF</button>
        </footer>
      </div>
      {d?.accountUrl && <p className="pq-acct"><a href={d.accountUrl}>See all your quotes, jobs and payments in your account →</a></p>}
      <p className="pq-by">Sent with <a href="https://colvy.com" target="_blank" rel="noreferrer">Colvy</a></p>
    </main>
  )
}

const CSS = `
html,body{background:#f4f4f5}
.pq{min-height:100vh;padding:28px 16px 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;box-sizing:border-box}
.pq *{box-sizing:border-box}
.pq-card{max-width:760px;margin:0 auto;padding:28px;border-radius:24px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.05),0 8px 30px rgba(16,24,40,.06)}
.pq-center{text-align:center}.pq-center h1{margin:0 0 8px;font-size:22px}.pq-center p{margin:0;color:#52525b}
.pq-sk{height:16px;margin:0 0 14px;border-radius:10px;background:#f4f4f5}
.pq-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:20px;border-bottom:1px solid #ececee}
.pq-biz{display:flex;align-items:center;gap:12px;min-width:0}
.pq-logo{width:48px;height:48px;border-radius:12px;object-fit:contain}
.pq-biz .pq-mono{display:flex;font-size:20px;color:#fff;width:48px;height:48px;border-radius:12px;background:var(--acc);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;flex-shrink:0}
.pq-biz b{display:block;font-size:17px}
.pq-biz div span{display:block;font-size:12.5px;color:#71717a}
.pq-no{text-align:right;flex-shrink:0}
.pq-no span{display:block;font-size:12px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:.06em}
.pq-no b{font-size:17px;font-variant-numeric:tabular-nums}
.pq-note{margin:18px 0 0;padding:12px 15px;border-radius:14px;background:#f4f4f5;font-size:14px;line-height:1.5;color:#3f3f46}
.pq-note.good{background:#ecfdf3;color:#067647}.pq-note.warn{background:#fffbeb;color:#92400e}.pq-note.bad{background:#fef2f2;color:#b42318}
.pq-intro h1{margin:22px 0 14px;font-size:clamp(24px,4vw,30px);font-weight:750;letter-spacing:-.03em;line-height:1.15}
.pq-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:6px}
.pq-facts div{padding:11px 13px;border-radius:14px;background:#f8f8f9}
.pq-facts span{display:block;font-size:12px;color:#71717a}
.pq-facts b{display:block;margin-top:2px;font-size:14px;font-weight:600;overflow-wrap:anywhere}
.pq-pre{white-space:pre-wrap;font-size:14.5px;line-height:1.6;color:#3f3f46}
.pq-items{width:100%;margin-top:20px;border-collapse:collapse;font-size:14px}
.pq-items th{padding:9px 8px;text-align:left;font-size:12px;font-weight:600;color:#71717a;border-bottom:1px solid #ececee}
.pq-items td{padding:12px 8px;border-bottom:1px solid #f1f1f3;vertical-align:top;font-variant-numeric:tabular-nums}
.pq-items td b{font-weight:600}
.pq-items small{display:block;margin-top:2px;font-size:12px;color:#71717a}
.pq-items .r{text-align:right;white-space:nowrap}
.pq-tot{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 0;max-width:340px;margin:16px 0 0 auto;font-size:14px;font-variant-numeric:tabular-nums}
.pq-tot dt{color:#52525b}.pq-tot dd{margin:0;padding-left:18px;text-align:right}
.pq-tot .big{padding-top:10px;border-top:1px solid #ececee;font-size:18px;font-weight:750;color:#111}
.pq-small{margin:10px 0 0;font-size:12.5px;color:#71717a;text-align:right}
.pq-terms{margin-top:26px;padding-top:18px;border-top:1px solid #ececee}
.pq-terms h2,.pq-act h2{margin:0 0 8px;font-size:16px;font-weight:700}
.pq-act{margin-top:26px;padding:20px;border-radius:20px;background:#f8f8f9}
.pq-lbl{display:block;margin:10px 0 6px;font-size:13px;font-weight:600}
.pq-lbl span{font-weight:400;color:#71717a}
.pq-in{width:100%;min-height:46px;padding:11px 14px;border-radius:14px;border:1.5px solid #e4e4e7;background:#fff;font:inherit;font-size:15px;color:#111;outline:none}
.pq-in:focus{border-color:var(--acc)}
textarea.pq-in{resize:vertical;line-height:1.5}
.pq-agree{display:flex;align-items:flex-start;gap:10px;margin:14px 0 4px;font-size:14px;line-height:1.5;cursor:pointer}
.pq-agree input{width:18px;height:18px;margin-top:2px;flex-shrink:0;accent-color:var(--acc)}
.pq-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.pq-btn{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 20px;border:none;border-radius:999px;font:inherit;font-size:15px;font-weight:650;cursor:pointer;transition:filter .15s,transform .12s}
.pq-btn:active{transform:scale(.98)}
.pq-btn:disabled{opacity:.6;cursor:default}
.pq-btn.go{background:var(--acc);color:#fff}
.pq-btn.go:hover{filter:brightness(.94)}
.pq-btn.ghost{background:#fff;color:#111;box-shadow:0 0 0 1px rgba(0,0,0,.1)}
.pq-btn.danger{background:#b91c1c;color:#fff}
.pq-btn.sm{min-height:36px;padding:0 14px;font-size:13.5px}
.pq-foot{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:28px;padding-top:18px;border-top:1px solid #ececee;font-size:13.5px}
.pq-foot div{display:flex;flex-direction:column;gap:2px}
.pq-acct{text-align:center;margin:16px 0 0;font-size:14px}
.pq-acct a{color:#111;font-weight:650}
@media print{.pq-acct{display:none}}
.pq-foot a{color:#111}
.pq-foot span{color:#71717a}
.pq-by{max-width:760px;margin:16px auto 0;text-align:center;font-size:12px;color:#a1a1aa}
.pq-by a{color:inherit}
@media(max-width:560px){
  .pq{padding:12px 10px 28px}.pq-card{padding:20px 16px;border-radius:20px}
  .pq-items th:nth-child(2),.pq-items td:nth-child(2),.pq-items th:nth-child(3),.pq-items td:nth-child(3){display:none}
  .pq-tot{max-width:none}.pq-btns .pq-btn{flex:1}
}
@media print{
  html,body{background:#fff}.pq{padding:0}.pq-card{box-shadow:none;padding:0}
  .pq-act,.pq-print,.pq-by,.pq-note{display:none!important}
}
`
