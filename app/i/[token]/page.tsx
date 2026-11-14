'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { fmtMoney, LINE_KIND_LABEL, type LineKind } from '@/lib/jobs/quote-math'

// The customer's invoice (/i/<token>): the business (with its ABN), what was
// done, GST, a deposit already paid, what's been paid since, and what's left,
// with a Pay button (card, through Stripe) and the business's other payment
// details. A payment only shows as paid once the server has checked with
// Stripe. It prints (or saves as PDF) as a clean tax invoice.

const fmtDate = (ymd: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '')
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
}
const qty = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000))
const METHOD: Record<string, string> = { card: 'Card', cash: 'Cash', bank_transfer: 'Bank transfer', cheque: 'Cheque', other: 'Payment' }

export default function PublicInvoicePage() {
  const { token } = useParams() as { token: string }
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const sp = new URLSearchParams(window.location.search)
      const qs = new URLSearchParams()
      if (sp.get('session_id')) qs.set('session_id', sp.get('session_id')!)
      if (sp.get('preview') === '1') qs.set('preview', '1')
      const res = await fetch(`/api/i/${encodeURIComponent(token)}${qs.toString() ? `?${qs}` : ''}`, { cache: 'no-store' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error || 'This invoice couldn’t be loaded.'); return }
      setD(j)
      if (j.justPaid) setNotice(j.invoice.balance_cents > 0 ? 'Thanks, your payment went through.' : 'Thanks, your payment went through. This invoice is paid.')
      else if (sp.get('paid') === '1' && j.invoice.status !== 'paid') setNotice('We’re confirming your payment. This can take a minute; refresh the page to check.')
      else if (sp.get('payment') === 'cancelled') setNotice('The payment was cancelled. You can pay whenever you’re ready.')
      if (sp.get('session_id') || sp.get('paid') || sp.get('payment')) {
        const u = new URL(window.location.href); ['session_id', 'paid', 'payment'].forEach(k => u.searchParams.delete(k)); window.history.replaceState(null, '', u.toString())
      }
    } catch { setErr('This invoice couldn’t be loaded. Check your connection and try again.') }
  }, [token])
  useEffect(() => { load() }, [load])

  const pay = async () => {
    setBusy(true); setFormErr('')
    try {
      const res = await fetch(`/api/i/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pay' }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setFormErr(j.error || 'That didn’t work. Please try again.'); return }
      if (j.payUrl) window.location.href = j.payUrl
    } catch { setFormErr('That didn’t work. Check your connection and try again.') }
    finally { setBusy(false) }
  }

  const accent = /^#[0-9a-f]{3,8}$/i.test(d?.business?.accent_color || '') ? d.business.accent_color : '#111111'

  if (err) return (
    <main className="pi"><style>{CSS}</style>
      <div className="pi-card pi-center"><h1>Invoice not available</h1><p>{err}</p></div>
    </main>
  )
  if (!d) return (
    <main className="pi"><style>{CSS}</style>
      <div className="pi-card"><div className="pi-sk" style={{ width: '40%' }} /><div className="pi-sk" style={{ width: '70%', height: 34 }} /><div className="pi-sk" style={{ height: 180 }} /></div>
    </main>
  )

  const v = d.invoice, b = d.business
  const gst = !!v.tax_invoice
  const open = v.status === 'sent' && v.balance_cents > 0
  const canPay = open && d.paymentsReady && v.balance_cents >= 50

  return (
    <main className="pi" style={{ ['--acc' as any]: accent }}>
      <style>{CSS}</style>
      <div className="pi-card">
        <header className="pi-head">
          <div className="pi-biz">
            {b.logo_url ? <img src={b.logo_url} alt="" className="pi-logo" /> : <span className="pi-mono" aria-hidden>{String(b.name || '?').slice(0, 1).toUpperCase()}</span>}
            <div><b>{b.name}</b>{b.abn && <span>ABN {b.abn}</span>}</div>
          </div>
          <div className="pi-no"><span>{gst ? 'Tax invoice' : 'Invoice'}</span><b>{v.label}</b></div>
        </header>

        {notice && <div className="pi-note good" role="status">{notice}</div>}
        {v.status === 'paid' && !notice && <div className="pi-note good">Paid{v.paid_at ? ` on ${new Date(v.paid_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}. Thank you.</div>}
        {v.status === 'void' && <div className="pi-note">This invoice has been cancelled, so there’s nothing to pay. Contact {b.name} if you have any questions.</div>}
        {v.overdue && <div className="pi-note warn">This invoice was due on {fmtDate(v.due_date)}. Please pay {fmtMoney(v.balance_cents)} as soon as you can.</div>}

        <section className="pi-intro">
          <h1>{v.title || d.job.title}</h1>
          <div className="pi-facts">
            {d.customer?.name && <div><span>Billed to</span><b>{d.customer.name}</b></div>}
            {d.job.address && <div><span>Job address</span><b>{d.job.address}</b></div>}
            {v.issue_date && <div><span>Invoice date</span><b>{fmtDate(v.issue_date)}</b></div>}
            {v.due_date && v.status !== 'void' && <div><span>Due</span><b>{fmtDate(v.due_date)}</b></div>}
          </div>
          {v.intro && <p className="pi-pre">{v.intro}</p>}
        </section>

        <section>
          <table className="pi-items">
            <thead><tr><th>Item</th><th className="r">Qty</th><th className="r">Price</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {v.items.map((l: any) => (
                <tr key={l.id}>
                  <td><b>{l.description || LINE_KIND_LABEL[l.kind as LineKind]}</b>{gst && !l.taxable && <small>GST-free</small>}</td>
                  <td className="r">{qty(l.quantity)}{l.unit && l.unit !== 'each' ? ` ${l.unit}` : ''}</td>
                  <td className="r">{fmtMoney(l.unit_price_cents)}</td>
                  <td className="r">{fmtMoney(l.line_total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="pi-tot">
            {v.discount_cents > 0 && <><dt>Items</dt><dd>{fmtMoney(v.gross_cents)}</dd><dt>Discount</dt><dd>−{fmtMoney(v.discount_cents)}</dd></>}
            <dt>Subtotal{gst ? ' (excl. GST)' : ''}</dt><dd>{fmtMoney(v.subtotal_cents)}</dd>
            {gst && <><dt>GST ({v.tax_rate}%)</dt><dd>{fmtMoney(v.tax_cents)}</dd></>}
            <dt className="mid">Total{gst ? ' (incl. GST)' : ''}</dt><dd className="mid">{fmtMoney(v.total_cents)}</dd>
            {v.credit_cents > 0 && <><dt>{v.credit_label || 'Deposit paid'}</dt><dd>−{fmtMoney(v.credit_cents)}</dd></>}
            {v.paid_cents > 0 && <><dt>Paid</dt><dd>−{fmtMoney(v.paid_cents)}</dd></>}
            <dt className="big">{v.status === 'void' ? 'Amount due' : v.balance_cents > 0 ? 'Amount due' : 'Balance'}</dt><dd className="big">{fmtMoney(v.status === 'void' ? 0 : v.balance_cents)}</dd>
          </dl>
          {gst && v.prices_include_tax && <p className="pi-small">Prices include GST.</p>}
          {!gst && <p className="pi-small">No GST has been charged.</p>}
        </section>

        {canPay && (
          <section className="pi-act" aria-label="Pay this invoice">
            <h2>Pay online</h2>
            <p className="pi-small" style={{ marginTop: 0, textAlign: 'left' }}>{fmtMoney(v.balance_cents)} by card. It’s secure, and you’ll get a receipt.</p>
            {formErr && <div className="pi-note bad" role="alert">{formErr}</div>}
            <button type="button" className="pi-btn go" onClick={pay} disabled={busy}>{busy ? 'One moment…' : `Pay ${fmtMoney(v.balance_cents)}`}</button>
          </section>
        )}

        {v.terms && v.status !== 'void' && <section className="pi-terms"><h2>{open ? (canPay ? 'Other ways to pay' : 'How to pay') : 'Notes'}</h2><p className="pi-pre">{v.terms}</p></section>}

        {v.payments.length > 0 && (
          <section className="pi-terms">
            <h2>Payments</h2>
            <ul className="pi-pays">{v.payments.map((p: any, i: number) => <li key={i}><span>{METHOD[p.method] || 'Payment'} · {fmtDate(p.paid_on)}</span><b>{fmtMoney(p.amount_cents)}</b></li>)}</ul>
          </section>
        )}

        <footer className="pi-foot">
          <div>
            <b>{b.name}</b>
            {b.abn && <span>ABN {b.abn}</span>}
            {b.phone && <a href={`tel:${b.phone}`}>{b.phone}</a>}
            {b.email && <a href={`mailto:${b.email}`}>{b.email}</a>}
            {b.address && <span>{b.address}</span>}
          </div>
          <button type="button" className="pi-btn ghost sm pi-print" onClick={() => window.print()}>Print or save as PDF</button>
        </footer>
      </div>
      {d?.accountUrl && <p className="pi-acct"><a href={d.accountUrl}>See all your quotes, jobs and invoices in your account →</a></p>}
      <p className="pi-by">Sent with <a href="https://colvy.com" target="_blank" rel="noreferrer">Colvy</a></p>
    </main>
  )
}

const CSS = `
html,body{background:#f4f4f5}
.pi{min-height:100vh;padding:28px 16px 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;box-sizing:border-box}
.pi *{box-sizing:border-box}
.pi-card{max-width:760px;margin:0 auto;padding:28px;border-radius:24px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.05),0 8px 30px rgba(16,24,40,.06)}
.pi-center{text-align:center}.pi-center h1{margin:0 0 8px;font-size:22px}.pi-center p{margin:0;color:#52525b}
.pi-sk{height:16px;margin:0 0 14px;border-radius:10px;background:#f4f4f5}
.pi-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:20px;border-bottom:1px solid #ececee}
.pi-biz{display:flex;align-items:center;gap:12px;min-width:0}
.pi-logo{width:48px;height:48px;border-radius:12px;object-fit:contain}
.pi-mono{width:48px;height:48px;border-radius:12px;background:var(--acc);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;flex-shrink:0}
.pi-biz b{display:block;font-size:17px}
.pi-biz div span{display:block;font-size:12.5px;color:#71717a}
.pi-no{text-align:right;flex-shrink:0}
.pi-no span{display:block;font-size:12px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:.06em}
.pi-no b{font-size:17px;font-variant-numeric:tabular-nums}
.pi-note{margin:18px 0 0;padding:12px 15px;border-radius:14px;background:#f4f4f5;font-size:14px;line-height:1.5;color:#3f3f46}
.pi-note.good{background:#ecfdf3;color:#067647}.pi-note.warn{background:#fffbeb;color:#92400e}.pi-note.bad{background:#fef2f2;color:#b42318}
.pi-intro h1{margin:22px 0 14px;font-size:clamp(24px,4vw,30px);font-weight:750;letter-spacing:-.03em;line-height:1.15}
.pi-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:6px}
.pi-facts div{padding:11px 13px;border-radius:14px;background:#f8f8f9}
.pi-facts span{display:block;font-size:12px;color:#71717a}
.pi-facts b{display:block;margin-top:2px;font-size:14px;font-weight:600;overflow-wrap:anywhere}
.pi-pre{white-space:pre-wrap;font-size:14.5px;line-height:1.6;color:#3f3f46}
.pi-items{width:100%;margin-top:20px;border-collapse:collapse;font-size:14px}
.pi-items th{padding:9px 8px;text-align:left;font-size:12px;font-weight:600;color:#71717a;border-bottom:1px solid #ececee}
.pi-items td{padding:12px 8px;border-bottom:1px solid #f1f1f3;vertical-align:top;font-variant-numeric:tabular-nums}
.pi-items td b{font-weight:600}
.pi-items small{display:block;margin-top:2px;font-size:12px;color:#71717a}
.pi-items .r{text-align:right;white-space:nowrap}
.pi-tot{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 0;max-width:360px;margin:16px 0 0 auto;font-size:14px;font-variant-numeric:tabular-nums}
.pi-tot dt{color:#52525b}.pi-tot dd{margin:0;padding-left:18px;text-align:right}
.pi-tot .mid{padding-top:8px;border-top:1px solid #ececee;font-weight:650;color:#111}
.pi-tot .big{padding-top:10px;border-top:1px solid #ececee;font-size:18px;font-weight:750;color:#111}
.pi-small{margin:10px 0 0;font-size:12.5px;color:#71717a;text-align:right}
.pi-terms{margin-top:26px;padding-top:18px;border-top:1px solid #ececee}
.pi-terms h2,.pi-act h2{margin:0 0 8px;font-size:16px;font-weight:700}
.pi-act{margin-top:26px;padding:20px;border-radius:20px;background:#f8f8f9}
.pi-pays{list-style:none;margin:0;padding:0;font-size:14px}
.pi-pays li{display:flex;justify-content:space-between;gap:12px;padding:8px 0;font-variant-numeric:tabular-nums}
.pi-pays li+li{border-top:1px solid #f1f1f3}
.pi-pays span{color:#52525b}
.pi-btn{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 22px;border:none;border-radius:999px;font:inherit;font-size:15px;font-weight:650;cursor:pointer;transition:filter .15s,transform .12s}
.pi-btn:active{transform:scale(.98)}
.pi-btn:disabled{opacity:.6;cursor:default}
.pi-btn.go{background:var(--acc);color:#fff;margin-top:6px}
.pi-btn.go:hover{filter:brightness(.94)}
.pi-btn.ghost{background:#fff;color:#111;box-shadow:0 0 0 1px rgba(0,0,0,.1)}
.pi-btn.sm{min-height:36px;padding:0 14px;font-size:13.5px}
.pi-foot{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:28px;padding-top:18px;border-top:1px solid #ececee;font-size:13.5px}
.pi-foot div{display:flex;flex-direction:column;gap:2px}
.pi-foot a{color:#111}
.pi-foot span{color:#71717a}
.pi-acct{text-align:center;margin:16px 0 0;font-size:14px}
.pi-acct a{color:#111;font-weight:650}
.pi-by{max-width:760px;margin:16px auto 0;text-align:center;font-size:12px;color:#a1a1aa}
.pi-by a{color:inherit}
@media(max-width:560px){
  .pi{padding:12px 10px 28px}.pi-card{padding:20px 16px;border-radius:20px}
  .pi-items th:nth-child(2),.pi-items td:nth-child(2),.pi-items th:nth-child(3),.pi-items td:nth-child(3){display:none}
  .pi-tot{max-width:none}.pi-act .pi-btn{width:100%}
}
@media print{
  html,body{background:#fff}.pi{padding:0}.pi-card{box-shadow:none;padding:0}
  .pi-act,.pi-print,.pi-by,.pi-acct,.pi-note{display:none!important}
}
`
