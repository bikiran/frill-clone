'use client'

// Super admin → a company's console → Tax invoices. The Colvy tax invoices
// (and receipts) issued to this business, each opening the same printable
// document the business sees; a warning when Colvy's ABN isn't set (documents
// then say "Receipt"); and "Issue missing" to backfill documents for older
// payments in their Stripe history. Uses /api/platform-admin/tax-invoices.

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { fmtAud, fmtInvoiceDate, SOURCE_LABEL, type InvoiceSource, type TaxInvoiceDoc } from '@/lib/tax-invoice-core'
import TaxInvoiceView from '@/components/billing/TaxInvoiceView'

const AMBER = '#d97706'
const card: React.CSSProperties = { background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 12, padding: 14, minWidth: 0 }
const btn = (color: string, filled = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 13px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
  border: filled ? 'none' : '1px solid var(--sa-border)', background: filled ? color : 'var(--sa-card)', color: filled ? '#fff' : color, whiteSpace: 'nowrap',
})

export default function CompanyTaxInvoices({ companyId }: { companyId: string }) {
  const [d, setD] = useState<any>(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [open, setOpen] = useState<{ doc: TaxInvoiceDoc; stored: boolean } | null>(null)

  const [reload, setReload] = useState(0)
  const load = () => setReload(n => n + 1)
  useEffect(() => {
    let alive = true
    authFetch(`/api/platform-admin/tax-invoices?companyId=${encodeURIComponent(companyId)}`)
      .then(r => r.json()).then(j => { if (alive) setD(j) })
      .catch(() => { if (alive) setD({ error: 'Couldn’t load tax invoices.' }) })
    return () => { alive = false }
  }, [companyId, reload])

  const view = async (ref: string) => {
    setBusy(ref); setMsg(null)
    try {
      const r = await authFetch(`/api/platform-admin/tax-invoices?companyId=${encodeURIComponent(companyId)}&ref=${encodeURIComponent(ref)}`)
      const j = await r.json()
      if (!r.ok || !j.invoice) setMsg({ tone: 'bad', text: j.error || 'Couldn’t open it.' })
      else setOpen({ doc: j.invoice, stored: j.stored !== false })
    } catch { setMsg({ tone: 'bad', text: 'Couldn’t open it.' }) }
    finally { setBusy('') }
  }

  const backfill = async () => {
    setBusy('backfill'); setMsg(null)
    try {
      const r = await authFetch('/api/platform-admin/tax-invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action: 'backfill' }) })
      const j = await r.json()
      if (!r.ok) setMsg({ tone: 'bad', text: j.error || 'Backfill failed.' })
      else { setMsg({ tone: 'ok', text: j.issued ? `Issued ${j.issued} document${j.issued === 1 ? '' : 's'}${j.failed ? ` (${j.failed} couldn’t be issued)` : ''}.` : j.failed ? `${j.failed} payment${j.failed === 1 ? '' : 's'} couldn’t be issued.` : 'Every paid payment already has a document.' }); load() }
    } catch { setMsg({ tone: 'bad', text: 'Backfill failed.' }) }
    finally { setBusy('') }
  }

  if (!d) return <p style={{ color: 'var(--sa-muted)', fontSize: 13 }}>Loading…</p>
  if (d.error) return <p style={{ color: '#dc2626', fontSize: 13 }}>{d.error}</p>
  const abn = (d.supplier?.checks || []).find((c: any) => c.envVar === 'COLVY_ABN')
  const rows: any[] = d.invoices || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {abn && abn.state !== 'ok' && (
        <div style={{ ...card, borderColor: AMBER, background: '#fffbeb' }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#92400e' }}>Colvy’s ABN isn’t {abn.state === 'missing' ? 'set' : 'valid'}</p>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#92400e', lineHeight: 1.5 }}>Documents are issued as “Receipt”, not “Tax Invoice”, until COLVY_ABN is set in Vercel. Once it is, opening one turns it into a tax invoice with the same number.</p>
        </div>
      )}
      {d.unavailable && (
        <div style={card}><p style={{ margin: 0, fontSize: 12.5, color: 'var(--sa-muted)', lineHeight: 1.5 }}>Tax invoices aren’t stored yet: run migrations/COLVY_V404_TAX_INVOICES.sql. Until then the business sees unnumbered documents built from Stripe.</p></div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--sa-muted)' }}>{rows.length} document{rows.length === 1 ? '' : 's'} issued</p>
        <button onClick={backfill} disabled={!!busy || d.unavailable} style={{ ...btn('#ff7a6b'), opacity: busy || d.unavailable ? 0.6 : 1 }}>{busy === 'backfill' ? 'Issuing…' : 'Issue missing from Stripe'}</button>
      </div>
      {msg && <p style={{ margin: 0, fontSize: 12.5, color: msg.tone === 'ok' ? '#059669' : '#dc2626' }}>{msg.text}</p>}
      {rows.length > 0 && (
        <div style={{ border: '1px solid var(--sa-border)', borderRadius: 12, overflow: 'hidden' }}>
          {rows.map((r, i) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: i ? '1px solid var(--sa-border)' : 'none', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--sa-text)' }}>
                  {r.number} <span style={{ fontWeight: 500, color: 'var(--sa-muted)' }}>· {r.doc_type === 'tax_invoice' ? 'Tax invoice' : 'Receipt'} · {SOURCE_LABEL[r.source as InvoiceSource] || r.source}</span>
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--sa-muted)' }}>
                  {fmtInvoiceDate(r.issued_at)} · {fmtAud(r.total_cents)} (GST {fmtAud(r.gst_cents)}){r.refunded_cents > 0 ? ` · refunded ${fmtAud(r.refunded_cents)}` : ''}{r.customer?.abn ? ' · has ABN' : ''}{r.emailed_at ? ' · emailed' : ''}
                </p>
              </div>
              <button onClick={() => view(r.id)} disabled={!!busy} style={btn('var(--sa-text)')}>{busy === r.id ? 'Opening…' : 'View'}</button>
            </div>
          ))}
        </div>
      )}
      {open && <TaxInvoiceView doc={open.doc} stored={open.stored} onClose={() => setOpen(null)} />}
    </div>
  )
}
