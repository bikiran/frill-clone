// One receipt / tax invoice, as the customer sees it: in their customer
// account (components/portal/Portal's receipt sheet) and on a receipt link the
// team sent them (app/receipt/[token]). Printing shows only this (#pt-receipt);
// the page adds the body class pt-printing.

import type { PortalReceipt } from '@/lib/portal/receipts'

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()

export default function ReceiptDoc({ r }: { r: PortalReceipt }) {
  // A receipt always shows cents ($12.00, not $12).
  const m = (c: number) => { try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: String(r?.currency || 'aud').toUpperCase(), minimumFractionDigits: 2 }).format((c || 0) / 100) } catch { return `$${((c || 0) / 100).toFixed(2)}` } }
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : '')
  const at = (iso: string | null) => (iso ? `${day(iso)}, ${time(iso)}` : '')
  return (
    <article className="pt-rc" id="pt-receipt">
      <header className="pt-rc-head">
        <div className="pt-rc-biz">
          {r.business.logoUrl ? <img src={r.business.logoUrl} alt={r.business.name} /> : <b>{r.business.name}</b>}
          <span>
            {r.business.logoUrl && <><b>{r.business.name}</b><br /></>}
            {r.business.abn && <>ABN {r.business.abn}<br /></>}
            {r.business.address && <>{r.business.address}<br /></>}
            {[r.business.phone, r.business.email].filter(Boolean).join(' · ')}
            {r.business.website && <><br />{r.business.website.replace(/^https?:\/\//, '')}</>}
          </span>
        </div>
        <div className="pt-rc-title">
          <h2>{r.title}</h2>
          <span>No. <b>{r.number}</b></span>
          {r.ref && <span>{r.ref}</span>}
          <span>{at(r.date)}</span>
        </div>
      </header>
      {(r.customer || r.where) && (
        <div className="pt-rc-meta">
          {r.customer && <div><small>Customer</small><b>{r.customer}</b></div>}
          {r.where && <div><small>Where</small><b>{r.where}</b></div>}
        </div>
      )}
      <table className="pt-rc-t">
        <thead><tr><th>Item</th><th className="n">Qty</th><th className="n">Amount</th></tr></thead>
        <tbody>
          {r.lines.map((l, i) => <tr key={i}><td>{l.name}</td><td className="n">{l.qty}</td><td className="n">{l.cents == null ? '' : m(l.cents)}</td></tr>)}
        </tbody>
      </table>
      <div className="pt-rc-sum">
        {r.adjustments.map((a, i) => <div key={i}><span>{a.label}</span><span>{a.cents < 0 ? `−${m(-a.cents)}` : m(a.cents)}</span></div>)}
        <div className="tot"><span>Total{r.currency !== 'AUD' ? ` (${r.currency})` : ''}</span><span>{m(r.totalCents)}</span></div>
        {r.gstCents ? <div className="gst"><span>Includes GST of</span><span>{m(r.gstCents)}</span></div> : null}
      </div>
      <div className={`pt-rc-paid ${r.status}`}>
        <b>{r.statusLabel}</b>
        <span>{[r.paymentMethod, r.paidAt && r.status === 'paid' ? `on ${day(r.paidAt)}` : ''].filter(Boolean).join(' ')}</span>
      </div>
      {(r.shopUrl || r.cardReceiptUrl) && (
        <p className="pt-rc-links">
          {r.shopUrl && <a href={r.shopUrl} target="_blank" rel="noreferrer">Returns or changes: this order in the shop ↗</a>}
          {r.cardReceiptUrl && <a href={r.cardReceiptUrl} target="_blank" rel="noreferrer">Card receipt from Stripe ↗</a>}
        </p>
      )}
      <footer className="pt-rc-foot">Thank you for your business{r.business.name ? `, from everyone at ${r.business.name}` : ''}.</footer>
    </article>
  )
}

export const RECEIPT_CSS = `
.pt-rc-wrap{position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px;overflow-y:auto;background:rgba(17,17,17,.45);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:ptFade .2s ease}
@keyframes ptFade{from{opacity:0}}
.pt-rc-bar{width:100%;max-width:640px;display:flex;justify-content:space-between;gap:10px;position:sticky;top:0;z-index:1}
.pt-rc-bar .pt-btn,.pt-rc-bar .bk-primary{box-shadow:0 6px 18px -8px rgba(0,0,0,.35)}
.pt-rc-bar .bk-primary svg{width:16px;height:16px}
.pt-rc{width:100%;max-width:640px;box-sizing:border-box;background:#fff;border-radius:18px;padding:30px 32px 26px;color:#111;box-shadow:0 30px 70px -30px rgba(0,0,0,.45);animation:ptRise .28s cubic-bezier(.22,1,.36,1)}
@keyframes ptRise{from{opacity:0;transform:translateY(10px)}}
.pt-rc-head{display:flex;justify-content:space-between;gap:20px;padding-bottom:18px;border-bottom:2px solid var(--bk-accent,#111)}
.pt-rc-biz{display:flex;flex-direction:column;gap:8px;min-width:0}
.pt-rc-biz img{height:40px;max-width:170px;object-fit:contain;object-position:left}
.pt-rc-biz>b{font-size:19px;font-weight:800}
.pt-rc-biz span{font-size:12.5px;line-height:1.55;color:#4b5563}
.pt-rc-biz span b{color:#111;font-size:13.5px}
.pt-rc-title{display:flex;flex-direction:column;align-items:flex-end;gap:3px;text-align:right;flex-shrink:0}
.pt-rc-title h2{margin:0 0 4px;font-size:22px;font-weight:800;letter-spacing:-.01em;text-transform:uppercase}
.pt-rc-title span{font-size:12.5px;color:#4b5563;font-variant-numeric:tabular-nums}
.pt-rc-title span b{color:#111}
.pt-rc-meta{display:flex;gap:28px;flex-wrap:wrap;padding:14px 0 4px}
.pt-rc-meta div{display:flex;flex-direction:column;gap:2px}
.pt-rc-meta small{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#9ca3af}
.pt-rc-meta b{font-size:14px}
.pt-rc-t{width:100%;border-collapse:collapse;margin-top:14px;font-size:14px}
.pt-rc-t th{padding:8px 0;border-bottom:1px solid #111;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#6b7280;text-align:left}
.pt-rc-t td{padding:10px 0;border-bottom:1px solid #f0f0f2;vertical-align:top}
.pt-rc-t .n{text-align:right;white-space:nowrap;padding-left:14px;font-variant-numeric:tabular-nums}
.pt-rc-sum{margin:10px 0 0 auto;max-width:300px;display:flex;flex-direction:column;gap:6px;font-size:14px;font-variant-numeric:tabular-nums}
.pt-rc-sum div{display:flex;justify-content:space-between;gap:16px;color:#4b5563}
.pt-rc-sum .tot{margin-top:4px;padding-top:10px;border-top:2px solid #111;color:#111;font-size:18px;font-weight:800}
.pt-rc-sum .gst{font-size:13px}
.pt-rc-paid{display:flex;align-items:center;gap:10px;margin-top:20px;padding:12px 14px;border-radius:12px;background:#ecfdf5;color:#065f46;font-size:13.5px}
.pt-rc-paid b{font-size:14px}
.pt-rc-paid.unpaid{background:#fff7ed;color:#9a3412}
.pt-rc-paid.refunded,.pt-rc-paid.cancelled{background:#f4f4f5;color:#3f3f46}
.pt-rc-links{display:flex;flex-direction:column;gap:6px;margin:16px 0 0;font-size:13.5px}
.pt-rc-links a{color:#111;font-weight:650}
.pt-rc-foot{margin-top:22px;padding-top:14px;border-top:1px solid #f0f0f2;font-size:12.5px;color:#6b7280;text-align:center}
@media print{
  body.pt-printing *{visibility:hidden!important}
  body.pt-printing #pt-receipt,body.pt-printing #pt-receipt *{visibility:visible!important}
  body.pt-printing #pt-receipt{position:absolute;left:0;top:0;width:100%;max-width:none;box-shadow:none;border-radius:0;padding:0;animation:none}
  body.pt-printing .pt-rc-links{display:none}
  .pt-rc-wrap{position:static;background:none;padding:0;overflow:visible}
}
@media(max-width:560px){
  .pt-rc{padding:22px 18px 20px;border-radius:16px}
  .pt-rc-head{flex-direction:column}
  .pt-rc-title{align-items:flex-start;text-align:left}
}
`
