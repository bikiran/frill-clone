'use client'

// A Colvy tax invoice (or receipt) on screen, ready to print or save as a PDF
// with the browser's print dialog (no PDF library). Drawn over the page in a
// portal, like the orders print preview (app/admin/orders PrintModal): when
// printing, everything else on the page is hidden and the document prints on
// A4. The document is lib/tax-invoice-render's HTML, escaped there. Used by
// Billing (app/admin/billing/tax-invoice) and super admin's company console.
// Shows an invoice (`doc`) or an adjustment note / refund receipt (`note`).

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { renderCreditNoteHtml, renderTaxInvoiceHtml } from '@/lib/tax-invoice-render'
import { docTitle, type TaxInvoiceDoc } from '@/lib/tax-invoice-core'
import { noteTitle, type CreditNoteDoc } from '@/lib/tax-credit-note-core'

export default function TaxInvoiceView({ doc, note, stored = true, onClose, closeLabel = 'Close' }: { doc?: TaxInvoiceDoc | null; note?: CreditNoteDoc | null; stored?: boolean; onClose?: () => void; closeLabel?: string }) {
  const title = note ? noteTitle(note) : doc ? docTitle(doc) : ''
  const number = note ? (note.number || note.reference) : doc ? (doc.number || doc.reference) : ''
  useEffect(() => {
    const prev = document.title
    document.title = `${title} ${number} · Colvy`
    return () => { document.title = prev }
  }, [title, number])
  useEffect(() => {
    if (!onClose) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  if (typeof document === 'undefined' || (!doc && !note)) return null
  const html = note ? renderCreditNoteHtml(note) : renderTaxInvoiceHtml(doc!)

  const btn: React.CSSProperties = { padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
  return createPortal(
    <div className="tax-invoice-portal" role="dialog" aria-modal="true" aria-label={title}
      style={{ position: 'fixed', inset: 0, zIndex: 4800, background: '#eef1f5', overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          html, body { background: #fff !important; }
          body > *:not(.tax-invoice-portal) { display: none !important; }
          .tax-invoice-portal { position: static !important; overflow: visible !important; background: #fff !important; }
          .tax-invoice-portal .no-print { display: none !important; }
          .tax-invoice-sheet { box-shadow: none !important; border: none !important; border-radius: 0 !important; margin: 0 !important; max-width: none !important; }
          .ti-doc { padding: 0 !important; max-width: none !important; }
        }
      `}</style>
      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#0f172a', color: '#fff', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title} {note ? (note.number || '') : (doc?.number || '')}</strong>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => window.print()} style={{ ...btn, border: 'none', background: '#ff7a6b', color: '#fff' }}>Download PDF</button>
        <button type="button" onClick={() => window.print()} style={{ ...btn, border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#fff' }}>Print</button>
        {onClose && <button type="button" onClick={onClose} style={{ ...btn, border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#fff' }}>{closeLabel}</button>}
      </div>
      <div style={{ padding: '16px 10px 32px' }}>
        <p className="no-print" style={{ maxWidth: 764, margin: '0 auto 10px', fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
          To save a PDF, choose Download PDF, then “Save as PDF” as the printer.
          {!stored && ' This document isn’t numbered yet: it shows the Stripe payment reference.'}
        </p>
        <div className="tax-invoice-sheet" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 8px 24px rgba(15,23,42,0.10)', margin: '0 auto', maxWidth: 764, overflow: 'hidden' }}
          dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>,
    document.body
  )
}
