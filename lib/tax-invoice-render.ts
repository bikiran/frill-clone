// A Colvy tax invoice (or receipt) as a printable HTML fragment. Pure, so the
// Billing page, super admin and the tests render exactly the same document.
// Everything from the document is escaped here. A4 when printed (the page
// around it sets @page); reads on a 390px phone (the table shrinks, long
// words wrap).

import { formatAbn } from '@/lib/abn'
import { BUYER_ID_THRESHOLD_CENTS, docTitle, fmtAud, fmtInvoiceDate, type TaxInvoiceDoc } from '@/lib/tax-invoice-core'

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const STYLE = `
.ti-doc{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#0f172a;background:#fff;max-width:764px;margin:0 auto;padding:32px;box-sizing:border-box;font-size:13px;line-height:1.5;overflow-wrap:anywhere}
.ti-doc *{box-sizing:border-box}
.ti-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;border-bottom:2px solid #0f172a;padding-bottom:16px;margin-bottom:20px}
.ti-title{font-size:26px;font-weight:800;letter-spacing:-0.01em;margin:0}
.ti-meta{text-align:right;font-size:12.5px;color:#334155}
.ti-meta b{color:#0f172a}
.ti-parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:22px}
.ti-label{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;margin:0 0 4px}
.ti-name{font-weight:700;font-size:14px;margin:0}
.ti-p{margin:0;color:#334155}
.ti-table{width:100%;border-collapse:collapse;margin-bottom:14px}
.ti-table th{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;text-align:left;padding:8px 6px;border-bottom:1px solid #cbd5e1}
.ti-table td{padding:9px 6px;border-bottom:1px solid #e2e8f0;vertical-align:top}
.ti-num{text-align:right;white-space:nowrap}
.ti-totals{margin-left:auto;width:100%;max-width:320px}
.ti-row{display:flex;justify-content:space-between;gap:12px;padding:4px 0}
.ti-total{font-size:16px;font-weight:800;border-top:2px solid #0f172a;margin-top:4px;padding-top:8px}
.ti-gst{font-weight:700}
.ti-box{border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-top:18px;background:#f8fafc}
.ti-warn{border-color:#fcd34d;background:#fffbeb}
.ti-foot{margin-top:24px;font-size:11.5px;color:#64748b}
@media (max-width:520px){.ti-doc{padding:18px 14px;font-size:12.5px}.ti-title{font-size:21px}.ti-parties{grid-template-columns:1fr;gap:14px}.ti-meta{text-align:left}.ti-hide-sm{display:none}.ti-table th,.ti-table td{padding:7px 3px}}
`

function partyHtml(label: string, p: TaxInvoiceDoc['customer']): string {
  return `<div><p class="ti-label">${esc(label)}</p>
<p class="ti-name">${esc(p.name)}</p>
${p.abn ? `<p class="ti-p">ABN ${esc(formatAbn(p.abn))}</p>` : ''}
${p.address.map(l => `<p class="ti-p">${esc(l)}</p>`).join('')}
${p.email ? `<p class="ti-p">${esc(p.email)}</p>` : ''}</div>`
}

export function renderTaxInvoiceHtml(doc: TaxInvoiceDoc, o: { withStyle?: boolean } = {}): string {
  const title = docTitle(doc)
  const isTax = title === 'Tax Invoice'
  const lines = doc.lines.map(l => `<tr>
<td>${esc(l.description)}</td>
<td class="ti-num">${esc(l.quantity)}</td>
<td class="ti-num ti-hide-sm">${esc(fmtAud(l.unitCents))}</td>
<td class="ti-num">${esc(fmtAud(l.amountCents))}</td></tr>`).join('')

  const paidLine = doc.amountPaidCents > 0
    ? `Paid ${esc(fmtAud(doc.amountPaidCents))}${doc.paidAt ? ` on ${esc(fmtInvoiceDate(doc.paidAt))}` : ''}${doc.paymentMethod ? ` by ${esc(doc.paymentMethod)}` : ''}.`
    : `Paid${doc.paidAt ? ` on ${esc(fmtInvoiceDate(doc.paidAt))}` : ''}${doc.paymentMethod ? ` by ${esc(doc.paymentMethod)}` : ''}.`
  const credit = doc.creditAppliedCents > 0 ? ` ${esc(fmtAud(doc.creditAppliedCents))} was paid from your Colvy account credit.` : ''

  const refunds = doc.refundedCents > 0
    ? `<div class="ti-box ti-warn"><p class="ti-label">Adjustment</p>
<p class="ti-p">${doc.status === 'refunded' ? 'This payment was refunded in full' : 'Part of this payment was refunded'}: ${esc(fmtAud(doc.refundedCents))}${doc.refunds.length ? ` (${doc.refunds.map(r => `${esc(fmtAud(r.amountCents))}${r.at ? ` on ${esc(fmtInvoiceDate(r.at))}` : ''}`).join('; ')})` : ''}.
 GST included in the refund: ${esc(fmtAud(Math.round(doc.refundedCents / 11)))}. Net amount after refunds: ${esc(fmtAud(doc.totalCents - doc.refundedCents))}.</p></div>`
    : ''

  const needBuyer = isTax && doc.totalCents >= BUYER_ID_THRESHOLD_CENTS && !doc.customer.abn && (!doc.customer.name || doc.customer.name === 'Customer')
  const notTax = !isTax
    ? `<div class="ti-box ti-warn"><p class="ti-p"><b>This receipt is not a tax invoice.</b> Contact ${esc(doc.supplier.email || 'us')} if you need a tax invoice for this payment.</p></div>`
    : ''

  const body = `<div class="ti-doc">
<div class="ti-head">
<div><p class="ti-title">${esc(title)}</p>
<p class="ti-p" style="margin-top:6px"><b>${esc(doc.supplier.name)}</b></p>
${doc.supplier.abn ? `<p class="ti-p">ABN ${esc(formatAbn(doc.supplier.abn))}</p>` : ''}
${doc.supplier.address.map(l => `<p class="ti-p">${esc(l)}</p>`).join('')}
${doc.supplier.email ? `<p class="ti-p">${esc(doc.supplier.email)}</p>` : ''}</div>
<div class="ti-meta">
<p class="ti-p">${doc.number ? `${isTax ? 'Invoice' : 'Receipt'} number <b>${esc(doc.number)}</b>` : `Reference <b>${esc(doc.reference)}</b>`}</p>
<p class="ti-p">Date of issue <b>${esc(fmtInvoiceDate(doc.issuedAt))}</b></p>
${doc.number && doc.reference ? `<p class="ti-p">Payment reference ${esc(doc.reference)}</p>` : ''}
<p class="ti-p">Status <b>${doc.status === 'refunded' ? 'Refunded' : doc.status === 'partially_refunded' ? 'Paid, partly refunded' : 'Paid'}</b></p>
</div></div>
<div class="ti-parties">
${partyHtml('Billed to', doc.customer)}
<div><p class="ti-label">Payment</p><p class="ti-p">${paidLine}${credit}</p></div>
</div>
<table class="ti-table"><thead><tr><th>Description</th><th class="ti-num">Qty</th><th class="ti-num ti-hide-sm">Unit price (incl. GST)</th><th class="ti-num">Amount (incl. GST)</th></tr></thead>
<tbody>${lines}</tbody></table>
<div class="ti-totals">
${doc.discountCents > 0 ? `<div class="ti-row"><span>Subtotal</span><span>${esc(fmtAud(doc.subtotalCents))}</span></div><div class="ti-row"><span>Discount</span><span>-${esc(fmtAud(doc.discountCents))}</span></div>` : ''}
<div class="ti-row ti-total"><span>Total (${esc(doc.currency.toUpperCase())})</span><span>${esc(fmtAud(doc.totalCents))}</span></div>
<div class="ti-row ti-gst"><span>Total includes GST of</span><span>${esc(fmtAud(doc.gstCents))}</span></div>
</div>
${refunds}
${notTax}
${needBuyer ? `<div class="ti-box ti-warn"><p class="ti-p">Add your business name or ABN under Billing → Business details so invoices of A$1,000 or more identify you.</p></div>` : ''}
<p class="ti-foot">${isTax ? 'Prices are in Australian dollars and include GST.' : 'Prices are in Australian dollars.'} Questions about this ${isTax ? 'invoice' : 'receipt'}? Email ${esc(doc.supplier.email || '')}.</p>
</div>`
  return (o.withStyle === false ? '' : `<style>${STYLE}</style>`) + body
}

/** A whole HTML page (for downloads and email attachments in future). */
export function renderTaxInvoicePage(doc: TaxInvoiceDoc): string {
  const title = `${docTitle(doc)} ${doc.number || doc.reference}`
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>@page{size:A4;margin:14mm}body{margin:0;background:#fff}</style></head><body>${renderTaxInvoiceHtml(doc)}</body></html>`
}
