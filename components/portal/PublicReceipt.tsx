'use client'

// The page a receipt link opens (Send receipt): the business's name, a Print
// or save as PDF button, and the receipt itself (components/portal/ReceiptDoc,
// the same one customers see in their account).

import { useEffect, useState } from 'react'
import { Shell } from '@/components/booking/BookingFlow'
import ReceiptDoc, { RECEIPT_CSS } from '@/components/portal/ReceiptDoc'
import type { PortalReceipt } from '@/lib/portal/receipts'

type Data = { business: { name: string; slug: string; logoUrl: string | null; accent: string | null }; receipt: PortalReceipt }

export default function PublicReceipt({ token }: { token: string }) {
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let live = true
    fetch(`/api/receipt?t=${encodeURIComponent(token)}`).then(async r => {
      const x = await r.json().catch(() => ({}))
      if (!live) return
      if (r.ok && x.receipt) setD(x); else setErr(x.error || 'This receipt link isn’t valid.')
    }).catch(() => { if (live) setErr('Couldn’t load the receipt. Check your connection and try again.') })
    document.body.classList.add('pt-printing')
    return () => { live = false; document.body.classList.remove('pt-printing') }
  }, [token])
  const accent = d?.business.accent && /^#[0-9a-f]{6}$/i.test(d.business.accent) ? d.business.accent : '#ff7a6b'
  return (
    <Shell accent={accent}>
      <style>{RECEIPT_CSS + RC_PAGE_CSS}</style>
      <div className="rcp">
        <div className="rcp-top">
          {/* The receipt names the business too, so on a phone only a logo stays up here. */}
          {d ? (d.business.logoUrl ? <img src={d.business.logoUrl} alt={d.business.name} /> : <b className="rcp-name">{d.business.name}</b>) : <span />}
          {d && (
            <button type="button" className="bk-primary rcp-print" onClick={() => window.print()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
              <span className="rcp-l">Print or save as PDF</span><span className="rcp-s">Save or print</span>
            </button>
          )}
        </div>
        {!d && !err && <div className="pt-rc"><div className="bk-skel" style={{ height: 30, width: '50%' }} /><div className="bk-skel" style={{ height: 180, marginTop: 24, borderRadius: 12 }} /></div>}
        {err && <div className="pt-rc rcp-err"><b>Receipt not available</b><span>{err}</span></div>}
        {d && <ReceiptDoc r={d.receipt} />}
      </div>
    </Shell>
  )
}

const RC_PAGE_CSS = `
.rcp{position:relative;z-index:1;max-width:640px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
.rcp-top{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;padding:0 4px}
.rcp-top img{height:34px;max-width:170px;object-fit:contain}
.rcp-top>b{font-size:17px;font-weight:800;color:#1f2937}
.rcp-print{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;margin-left:auto;box-shadow:0 6px 18px -8px rgba(0,0,0,.35)}
.rcp-s{display:none}
.rcp-print svg{width:16px;height:16px}
.rcp-err{display:flex;flex-direction:column;gap:6px;text-align:center;color:#6b7280}
.rcp-err b{color:#111;font-size:18px}
@media(max-width:560px){.rcp-print{padding:9px 14px;font-size:13.5px}.rcp-l,.rcp-name{display:none}.rcp-s{display:inline}}
`
