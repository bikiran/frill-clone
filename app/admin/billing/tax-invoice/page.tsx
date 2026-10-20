'use client'

// Billing → Billing history → Tax invoice: one Colvy tax invoice (or receipt)
// to view, print or save as a PDF. Opened from the billing history (?ref=, the
// Stripe invoice or payment) or the email sent when it was issued (?id=).
// The document comes from /api/billing/tax-invoices, which issues it the
// first time it's opened if the webhook hasn't already. ?note= opens one of
// the adjustment notes (credit notes) issued for a refund instead.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authFetch } from '@/lib/auth-fetch'
import { resolveCompanyUser } from '@/lib/client-cache'
import TaxInvoiceView from '@/components/billing/TaxInvoiceView'
import type { TaxInvoiceDoc } from '@/lib/tax-invoice-core'
import type { CreditNoteDoc } from '@/lib/tax-credit-note-core'

export default function TaxInvoicePage() {
  const router = useRouter()
  const [doc, setDoc] = useState<TaxInvoiceDoc | null>(null)
  const [note, setNote] = useState<CreditNoteDoc | null>(null)
  const [isNote, setIsNote] = useState(false)
  const [stored, setStored] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const p = new URLSearchParams(window.location.search)
      const noteRef = p.get('note') || ''
      const ref = noteRef || p.get('ref') || p.get('id') || ''
      const what = noteRef ? 'adjustment note' : 'invoice'
      if (alive) setIsNote(!!noteRef)
      let companyId = p.get('company') || ''
      if (!companyId) { try { companyId = (await resolveCompanyUser()).companyId || '' } catch {} }
      if (!ref || !companyId) { if (alive) setError(`We couldn’t tell which ${what} to open. Go back to Billing and choose it from the billing history.`); return }
      try {
        const res = await authFetch(`/api/billing/tax-invoices?companyId=${encodeURIComponent(companyId)}&${noteRef ? 'note' : 'ref'}=${encodeURIComponent(ref)}`)
        const d = await res.json().catch(() => ({}))
        if (!alive) return
        if (!res.ok || !(noteRef ? d.note : d.invoice)) { setError(d.error || `We couldn’t open this ${what}. Try again in a minute.`); return }
        if (noteRef) setNote(d.note); else setDoc(d.invoice)
        setStored(d.stored !== false)
      } catch { if (alive) setError(`We couldn’t open this ${what}. Check your connection and try again.`) }
    })()
    return () => { alive = false }
  }, [])

  const back = () => router.push('/admin/billing')

  if (doc || note) return <TaxInvoiceView doc={doc} note={note} stored={stored} onClose={back} closeLabel="Back to Billing" />
  return (
    <div className="w-full px-4 md:px-8 py-8">
      <div className="bg-white rounded-2xl border p-6 max-w-xl" style={{ borderColor: 'var(--border)' }}>
        <h1 className="font-bold" style={{ color: 'var(--ink)' }}>{isNote ? 'Adjustment note' : 'Tax invoice'}</h1>
        <p className="text-sm mt-2" style={{ color: error ? '#b42318' : 'var(--slate)', lineHeight: 1.5 }} role={error ? 'alert' : 'status'}>
          {error || (isNote ? 'Preparing your adjustment note…' : 'Preparing your invoice…')}
        </p>
        {error && (
          <button type="button" onClick={back} className="mt-4 text-sm font-semibold cursor-pointer hover:underline" style={{ color: 'var(--coral)' }}>Back to Billing</button>
        )}
      </div>
    </div>
  )
}
