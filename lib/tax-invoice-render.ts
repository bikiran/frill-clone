// A Colvy tax invoice (or receipt) as a printable HTML fragment. Pure, so the
// Billing page, super admin and the tests render exactly the same document.
// Everything from the document is escaped here. A4 when printed (the page
// around it sets @page); reads on a 390px phone (the table shrinks, long
// words wrap). Styled like the orders packing slip.

import { formatAbn } from '@/lib/abn'
import { BUYER_ID_THRESHOLD_CENTS, docTitle, fmtAud, fmtInvoiceDate, type TaxInvoiceDoc } from '@/lib/tax-invoice-core'
import { noteTitle, type CreditNoteDoc } from '@/lib/tax-credit-note-core'
import { barcodeSVG } from '@/lib/barcode'

/** A credit: "−A$50.00" (a true minus sign). */
const asCredit = (cents: number) => `\u2212${fmtAud(Math.abs(Math.round(Number(cents) || 0)))}`

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const CORAL = '#ff6a4d'
// Colvy's app icon (public/icon-192.png at 60px), inlined so the document
// prints and saves with its logo even offline or from an email.
const LOGO = 'data:image/png;base64,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'

// Same look as the orders packing slip (components/OrderPrintDoc): logo and
// sender on the left, the document type in capitals with its number, date and
// barcode on the right, a coloured rule, two label columns, a ruled table and
// a totals block.
const STYLE = `
.ti-doc{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#0f172a;background:#fff;max-width:720px;margin:0 auto;padding:26px 24px 28px;box-sizing:border-box;font-size:13px;line-height:1.5;overflow-wrap:anywhere}
.ti-doc *{box-sizing:border-box}
.ti-doc p{margin:0}
.ti-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding-bottom:14px;border-bottom:3px solid ${CORAL}}
.ti-from{display:flex;align-items:flex-start;gap:12px;min-width:0}
.ti-logo{width:44px;height:44px;flex-shrink:0}
.ti-logo img{width:44px;height:44px;display:block;border-radius:10px}
.ti-sender{font-size:17px;font-weight:800}
.ti-small{font-size:11.5px;color:#64748b}
.ti-right{text-align:right;flex-shrink:0}
.ti-title{font-size:20px;font-weight:800;letter-spacing:-0.02em;text-transform:uppercase;line-height:1.2}
.ti-number{font-size:13px;font-weight:700;color:${CORAL};margin-top:2px}
.ti-barcode{margin-top:8px;display:inline-block;width:200px}
.ti-barcode svg{width:100%;height:40px;display:block}
.ti-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;font-weight:700;letter-spacing:0.12em}
.ti-cols{display:flex;gap:24px;margin-top:18px}
.ti-col{flex:1;min-width:0}
.ti-label{font-size:10.5px;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;font-weight:700}
.ti-block{margin-top:6px;font-size:13px;line-height:1.6}
.ti-name{font-weight:700}
.ti-p{color:#334155}
.ti-kv{margin-top:6px;font-size:12.5px;line-height:1.7}
.ti-kv span{color:#64748b}
.ti-table{width:100%;border-collapse:collapse;margin-top:18px}
.ti-table th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;font-weight:700;padding:8px 8px;border-bottom:2px solid #0f172a}
.ti-table td{font-size:13px;padding:9px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}
.ti-num{text-align:right;white-space:nowrap}
.ti-table th.ti-num{text-align:right}
.ti-strong{font-weight:600}
.ti-totals{display:flex;justify-content:flex-end;margin-top:12px}
.ti-totals table{min-width:280px;border-collapse:collapse}
.ti-totals td{padding:6px 10px;font-size:12.5px;border-top:1px solid #e2e8f0}
.ti-totals td:first-child{color:#64748b;font-weight:500}
.ti-totals td:last-child{text-align:right;font-weight:600;white-space:nowrap}
.ti-totals tr.ti-total td{border-top:2px solid #0f172a;font-size:14px;font-weight:800;color:#0f172a}
.ti-totals tr.ti-gst td{font-weight:700;color:#0f172a}
.ti-box{margin-top:16px;padding:9px 12px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;line-height:1.55}
.ti-box .ti-label{margin-bottom:3px}
.ti-warn{background:#fff7ed;border-color:#fed7aa;color:#9a3412}
.ti-warn .ti-p,.ti-warn .ti-label{color:#9a3412}
.ti-foot{margin-top:22px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:11.5px;color:#64748b}
@media (max-width:520px){.ti-doc{padding:18px 14px;font-size:12.5px}.ti-head{flex-direction:column;gap:12px}.ti-right{text-align:left}.ti-title{font-size:18px}.ti-barcode{width:170px}.ti-cols{flex-direction:column;gap:14px}.ti-hide-sm{display:none}.ti-table th,.ti-table td{padding:7px 4px}.ti-totals table{min-width:0;width:100%}}
`

/** The header both documents share: Colvy on the left; title, number, date and barcode on the right. */
function headHtml(supplier: TaxInvoiceDoc['supplier'], title: string, numberLine: string, dateLine: string, code: string | null): string {
  const bar = code ? barcodeSVG(code, { moduleWidth: 1.5, height: 52 }) : ''
  return `<div class="ti-head">
<div class="ti-from"><div class="ti-logo"><img src="${esc(LOGO)}" alt=""></div>
<div><p class="ti-sender">${esc(supplier.name)}</p>
${supplier.abn ? `<p class="ti-small">ABN ${esc(formatAbn(supplier.abn))}</p>` : ''}
${supplier.address.map(l => `<p class="ti-small">${esc(l)}</p>`).join('')}
${supplier.email ? `<p class="ti-small">${esc(supplier.email)}</p>` : ''}</div></div>
<div class="ti-right"><p class="ti-title">${esc(title)}</p>
<p class="ti-number">${numberLine}</p>
<p class="ti-small" style="margin-top:2px">${dateLine}</p>
${bar ? `<div class="ti-barcode">${bar}</div><p class="ti-code">${esc(code)}</p>` : ''}</div>
</div>`
}

function partyHtml(label: string, p: TaxInvoiceDoc['customer']): string {
  return `<div class="ti-col"><p class="ti-label">${esc(label)}</p>
<div class="ti-block"><p class="ti-name">${esc(p.name)}</p>
${p.abn ? `<p>ABN ${esc(formatAbn(p.abn))}</p>` : ''}
${p.address.map(l => `<p>${esc(l)}</p>`).join('')}
${p.email ? `<p class="ti-p">${esc(p.email)}</p>` : ''}</div></div>`
}

export function renderTaxInvoiceHtml(doc: TaxInvoiceDoc, o: { withStyle?: boolean } = {}): string {
  const title = docTitle(doc)
  const isTax = title === 'Tax Invoice'
  const lines = doc.lines.map(l => `<tr>
<td>${esc(l.description)}</td>
<td class="ti-num">${esc(l.quantity)}</td>
<td class="ti-num ti-hide-sm">${esc(fmtAud(l.unitCents))}</td>
<td class="ti-num ti-strong">${esc(fmtAud(l.amountCents))}</td></tr>`).join('')

  const paidLine = doc.amountPaidCents > 0
    ? `Paid ${esc(fmtAud(doc.amountPaidCents))}${doc.paidAt ? ` on ${esc(fmtInvoiceDate(doc.paidAt))}` : ''}${doc.paymentMethod ? ` by ${esc(doc.paymentMethod)}` : ''}.`
    : `Paid${doc.paidAt ? ` on ${esc(fmtInvoiceDate(doc.paidAt))}` : ''}${doc.paymentMethod ? ` by ${esc(doc.paymentMethod)}` : ''}.`
  const credit = doc.creditAppliedCents > 0 ? ` ${esc(fmtAud(doc.creditAppliedCents))} was paid from your Colvy account credit.` : ''

  // Adjustment notes issued against it (V406): each referenced by number.
  // Refunds without one yet (or before V406) keep the plain wording.
  const notes = (doc.adjustments || []).filter(a => a.status !== 'void')
  const noted = notes.reduce((s, a) => s + a.amountCents, 0)
  const notedGst = notes.reduce((s, a) => s + a.gstCents, 0)
  const unnoted = Math.max(0, doc.refundedCents - noted)
  const adjustments = notes.length
    ? `<div class="ti-box ti-warn"><p class="ti-label">Adjustment</p>
${notes.map(a => `<p class="ti-p">Adjusted by ${esc(a.number)} on ${esc(fmtInvoiceDate(a.issuedAt))}: ${esc(asCredit(a.amountCents))} (GST ${esc(asCredit(a.gstCents))}).</p>`).join('')}
${unnoted > 0 ? `<p class="ti-p">Also refunded, adjustment note to follow: ${esc(fmtAud(unnoted))}.</p>` : ''}
<p class="ti-p"><b>Net amount after adjustments: ${esc(fmtAud(Math.max(0, doc.totalCents - noted - unnoted)))}</b> (GST ${esc(fmtAud(Math.max(0, doc.gstCents - notedGst - Math.round(unnoted / 11))))}).</p></div>`
    : ''
  const refunds = adjustments || (doc.refundedCents > 0
    ? `<div class="ti-box ti-warn"><p class="ti-label">Adjustment</p>
<p class="ti-p">${doc.status === 'refunded' ? 'This payment was refunded in full' : 'Part of this payment was refunded'}: ${esc(fmtAud(doc.refundedCents))}${doc.refunds.length ? ` (${doc.refunds.map(r => `${esc(fmtAud(r.amountCents))}${r.at ? ` on ${esc(fmtInvoiceDate(r.at))}` : ''}`).join('; ')})` : ''}.
 GST included in the refund: ${esc(fmtAud(Math.round(doc.refundedCents / 11)))}. Net amount after refunds: ${esc(fmtAud(doc.totalCents - doc.refundedCents))}.</p></div>`
    : '')

  const needBuyer = isTax && doc.totalCents >= BUYER_ID_THRESHOLD_CENTS && !doc.customer.abn && (!doc.customer.name || doc.customer.name === 'Customer')
  const notTax = !isTax
    ? `<div class="ti-box ti-warn"><p class="ti-p"><b>This receipt is not a tax invoice.</b> Contact ${esc(doc.supplier.email || 'us')} if you need a tax invoice for this payment.</p></div>`
    : ''

  const statusWord = doc.status === 'refunded' ? 'Refunded' : doc.status === 'partially_refunded' ? 'Paid, partly refunded' : 'Paid'
  const body = `<div class="ti-doc">
${headHtml(doc.supplier, title,
    doc.number ? `${isTax ? 'Invoice' : 'Receipt'} ${esc(doc.number)}` : `Reference ${esc(doc.reference)}`,
    `Issued ${esc(fmtInvoiceDate(doc.issuedAt))}`,
    doc.number || null)}
<div class="ti-cols">
${partyHtml('Billed to', doc.customer)}
<div class="ti-col"><p class="ti-label">${isTax ? 'Invoice' : 'Receipt'} details</p>
<div class="ti-kv">
<p>${doc.number ? `<span>${isTax ? 'Invoice' : 'Receipt'} number:</span> <b>${esc(doc.number)}</b>` : `<span>Reference:</span> <b>${esc(doc.reference)}</b>`}</p>
<p><span>Date of issue:</span> ${esc(fmtInvoiceDate(doc.issuedAt))}</p>
<p><span>Status:</span> <b>${statusWord}</b></p>
${doc.number && doc.reference ? `<p><span>Payment reference:</span> ${esc(doc.reference)}</p>` : ''}
<p><span>Payment:</span> ${paidLine}${credit}</p>
</div></div>
</div>
<table class="ti-table"><thead><tr><th>Description</th><th class="ti-num">Qty</th><th class="ti-num ti-hide-sm">Unit price (incl. GST)</th><th class="ti-num">Amount (incl. GST)</th></tr></thead>
<tbody>${lines}</tbody></table>
<div class="ti-totals"><table><tbody>
${doc.discountCents > 0 ? `<tr><td>Subtotal</td><td>${esc(fmtAud(doc.subtotalCents))}</td></tr><tr><td>Discount</td><td>-${esc(fmtAud(doc.discountCents))}</td></tr>` : ''}
<tr class="ti-total"><td>Total (${esc(doc.currency.toUpperCase())})</td><td>${esc(fmtAud(doc.totalCents))}</td></tr>
<tr class="ti-gst"><td>Total includes GST of</td><td>${esc(fmtAud(doc.gstCents))}</td></tr>
</tbody></table></div>
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

// ── adjustment notes (credit notes) ─────────────────────────────────────────

/**
 * An adjustment note (or, without Colvy's ABN or a tax invoice to adjust, a
 * refund receipt) as a printable fragment, in the same look as the invoice:
 * the title, Colvy's identity and ABN, its number and date, the original tax
 * invoice's number and date, who it's for, what's credited (as credits), the
 * GST adjustment and the reason.
 */
export function renderCreditNoteHtml(n: CreditNoteDoc, o: { withStyle?: boolean } = {}): string {
  const title = noteTitle(n)
  const isNote = title !== 'Refund Receipt'
  const origWord = n.original.docType === 'tax_invoice' ? 'tax invoice' : 'receipt'
  const origRef = n.original.number || n.original.reference
  const origDate = fmtInvoiceDate(n.original.issuedAt)
  const lines = n.lines.map(l => `<tr>
<td>${esc(l.description)}</td>
<td class="ti-num">${esc(l.quantity)}</td>
<td class="ti-num ti-hide-sm">${esc(asCredit(l.unitCents))}</td>
<td class="ti-num ti-strong">${esc(asCredit(l.amountCents))}</td></tr>`).join('')
  const net = Math.max(0, n.original.totalCents - n.priorAdjustedCents - n.amountCents)
  const needBuyer = isNote && n.original.totalCents >= BUYER_ID_THRESHOLD_CENTS && !n.customer.abn && (!n.customer.name || n.customer.name === 'Customer')
  const voided = n.status === 'void'
    ? `<div class="ti-box ti-warn"><p class="ti-p"><b>This ${isNote ? 'adjustment note' : 'refund receipt'} is void</b>${n.voidedAt ? ` (voided ${esc(fmtInvoiceDate(n.voidedAt))})` : ''}: the refund didn’t go through, so nothing was credited.</p></div>`
    : ''
  const notTax = !isNote
    ? `<div class="ti-box ti-warn"><p class="ti-p"><b>This refund receipt is not an adjustment note</b> (it isn’t a tax document). Contact ${esc(n.supplier.email || 'us')} if you need an adjustment note for this refund.</p></div>`
    : ''
  const body = `<div class="ti-doc">
${headHtml(n.supplier, title,
    n.number ? `${isNote ? 'Note' : 'Receipt'} ${esc(n.number)}` : `Reference ${esc(n.reference)}`,
    `Issued ${esc(fmtInvoiceDate(n.issuedAt))} · adjusts ${esc(origRef)}`,
    n.number || null)}
<div class="ti-cols">
${partyHtml('Issued to', n.customer)}
<div class="ti-col"><p class="ti-label">${isNote ? 'Adjustment' : 'Refund'} details</p>
<div class="ti-kv">
<p>${n.number ? `<span>${isNote ? 'Adjustment note' : 'Refund receipt'} number:</span> <b>${esc(n.number)}</b>` : `<span>Reference:</span> <b>${esc(n.reference)}</b>`}</p>
<p><span>Date of issue:</span> ${esc(fmtInvoiceDate(n.issuedAt))}</p>
<p><span>Original ${esc(origWord)}:</span> <b>${esc(origRef)}</b>${origDate ? ` dated <b>${esc(origDate)}</b>` : ''}</p>
${n.number && n.reference ? `<p><span>Refund reference:</span> ${esc(n.reference)}</p>` : ''}
<p><span>Status:</span> <b>${n.status === 'void' ? 'Void' : 'Credited'}</b></p>
<p><span>Reason:</span> ${esc(n.reason || 'Refund')}.</p>
</div></div>
</div>
<div class="ti-box"><p class="ti-p">Adjusts ${esc(origWord)} ${esc(origRef)}${origDate ? ` of ${esc(origDate)}` : ''}: total ${esc(fmtAud(n.original.totalCents))}${isNote ? ` including GST of ${esc(fmtAud(n.original.gstCents))}` : ''}.</p></div>
<table class="ti-table"><thead><tr><th>Description</th><th class="ti-num">Qty</th><th class="ti-num ti-hide-sm">Unit credit (incl. GST)</th><th class="ti-num">Credit (incl. GST)</th></tr></thead>
<tbody>${lines}</tbody></table>
<div class="ti-totals"><table><tbody>
<tr class="ti-total"><td>Total credited (${esc(n.currency.toUpperCase())})</td><td>${esc(asCredit(n.amountCents))}</td></tr>
${isNote ? `<tr class="ti-gst"><td>GST adjustment</td><td>${esc(asCredit(n.gstCents))}</td></tr>` : ''}
<tr><td>${esc(origRef)} after adjustments</td><td>${esc(fmtAud(net))}</td></tr>
</tbody></table></div>
${isNote ? `<div class="ti-box"><p class="ti-p">GST adjustment ${esc(fmtAud(n.gstCents))}: this note reduces the GST on ${esc(origWord)} ${esc(origRef)} by ${esc(fmtAud(n.gstCents))}. Keep it with that invoice for your records.</p></div>` : ''}
${voided}
${notTax}
${needBuyer ? `<div class="ti-box ti-warn"><p class="ti-p">Add your business name or ABN under Billing → Business details so documents of A$1,000 or more identify you.</p></div>` : ''}
<p class="ti-foot">${isNote ? 'Amounts are in Australian dollars and include GST.' : 'Amounts are in Australian dollars.'} Questions about this ${isNote ? 'adjustment note' : 'refund'}? Email ${esc(n.supplier.email || '')}.</p>
</div>`
  return (o.withStyle === false ? '' : `<style>${STYLE}</style>`) + body
}

export function renderCreditNotePage(n: CreditNoteDoc): string {
  const title = `${noteTitle(n)} ${n.number || n.reference}`
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>@page{size:A4;margin:14mm}body{margin:0;background:#fff}</style></head><body>${renderCreditNoteHtml(n)}</body></html>`
}
