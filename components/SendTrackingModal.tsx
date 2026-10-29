'use client'

import { useState } from 'react'
import { CARRIERS, carrierByKey } from '@/lib/carriers'
import { authFetch } from '@/lib/auth-fetch'

/**
 * Send a tracking link to the customer.
 *
 * The customer always receives a Colvy short link (so clicks are counted and
 * the link looks like it came from the business), which redirects to the
 * carrier's tracking page. The tracking number is included in the message text
 * as well — for carriers without a working deep link, that's how the customer
 * actually finds their parcel.
 */
export default function SendTrackingModal({
  companyId, conversationId, contactId, orderNumber, senderName,
  onClose, onSent,
}: {
  companyId: string
  conversationId: string
  contactId?: string | null
  orderNumber?: string | null
  senderName?: string
  onClose: () => void
  onSent: (info: { text: string; url: string; carrierLabel: string; number: string }) => void
}) {
  const [carrierKey, setCarrierKey] = useState('auspost')
  const [number, setNumber] = useState('')
  const [customUrl, setCustomUrl] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const carrier = carrierByKey(carrierKey)!
  const isManual = carrierKey === 'manual'

  const targetUrl = isManual
    ? customUrl.trim()
    : (number.trim() ? carrier.url(number.trim()) : '')

  const send = async () => {
    if (!number.trim()) { setError('Enter the tracking number.'); return }
    setSending(true); setError('')

    try {
      // Wrap the carrier URL in a Colvy short link so the customer sees a
      // branded link and we can count the clicks.
      let shortUrl = ''
      let shortCode = ''
      if (targetUrl) {
        const res = await authFetch('/api/short-links/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId,
            kind: 'redirect',
            url: targetUrl,
            label: `${carrier.label} tracking${orderNumber ? ` — order ${orderNumber}` : ''}`,
            conversationId,
            sentBy: senderName || null,
          }),
        })
        const d = await res.json()
        if (res.ok && d.url) {
          shortUrl = d.url
          shortCode = d.code || (d.url.split('/').pop() || '')
        } else {
          setError(d.error || 'Could not create the tracking link.')
          setSending(false)
          return
        }
      }

      // Record the shipment so the conversation keeps a history.
      try {
        await authFetch('/api/shipments/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId, conversationId, contactId, orderId: orderNumber || null,
            carrier: carrierKey, carrierLabel: carrier.label,
            trackingNumber: number.trim(), trackingUrl: targetUrl,
            shortCode, sentBy: senderName || null,
          }),
        })
      } catch { /* history is best-effort */ }

      // Message text. The number is always included — for carriers without a
      // deep link it's the only way the customer can find the parcel.
      const lines = [
        orderNumber ? `Your order ${orderNumber} has been dispatched.` : 'Your order has been dispatched.',
        '',
        `${carrier.label} tracking: ${number.trim()}`,
      ]
      if (shortUrl) lines.push('', shortUrl)
      onSent({ text: lines.join('\n'), url: shortUrl, carrierLabel: carrier.label, number: number.trim() })
    } catch (e: any) {
      setError(e.message || 'Could not send the tracking link.')
      setSending(false)
    }
  }

  // Where the link goes, shortened for the chip: host + a hint of the path.
  const dest = (() => { try { const u = new URL(targetUrl); return u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? u.pathname.slice(0, 18) + (u.pathname.length > 18 ? '…' : '') : '') } catch { return '' } })()

  return (
    <div className="trk-scrim" onClick={onClose}>
      <style>{TRK_CSS}</style>
      <div className="trk" role="dialog" aria-modal="true" aria-labelledby="trk-title" onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
        <div className="trk-head">
          <span className="trk-badge" aria-hidden>{TRUCK}</span>
          <div style={{ minWidth: 0 }}>
            <h3 id="trk-title">Send tracking</h3>
            <p>{orderNumber ? `Order ${orderNumber} · ` : ''}The customer gets a link that opens their parcel.</p>
          </div>
        </div>

        <span className="trk-lbl" id="trk-carrier">Carrier</span>
        <div className="trk-carriers" role="radiogroup" aria-labelledby="trk-carrier">
          {CARRIERS.map(c => {
            const on = carrierKey === c.key
            const m = MARK[c.key] || MARK.manual
            return (
              <button key={c.key} type="button" role="radio" aria-checked={on} className={`trk-carrier${on ? ' on' : ''}`}
                onClick={() => { setCarrierKey(c.key); setError('') }}>
                <span className="trk-mono" style={{ background: m.bg, color: m.fg }} aria-hidden>{m.t}</span>
                <span className="trk-carrier-t">{c.label}</span>
                <span className="trk-check" aria-hidden>{on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}</span>
              </button>
            )
          })}
        </div>

        <label className="trk-lbl" htmlFor="trk-number">Tracking number</label>
        <span className="trk-field">
          {BARCODE}
          <input id="trk-number" value={number} onChange={e => { setNumber(e.target.value); setError('') }}
            onKeyDown={e => { if (e.key === 'Enter' && number.trim() && !sending) send() }}
            placeholder="e.g. 33ABC123456789" autoFocus autoComplete="off" spellCheck={false} />
        </span>

        {isManual && (
          <>
            <label className="trk-lbl" htmlFor="trk-url">Tracking link <span className="trk-opt">optional</span></label>
            <span className="trk-field">
              {LINK}
              <input id="trk-url" value={customUrl} onChange={e => setCustomUrl(e.target.value)} placeholder="https://…" autoComplete="off" />
            </span>
          </>
        )}

        {carrier.note && <p className="trk-note">{carrier.note}</p>}

        {/* Where the link will point, so there are no surprises. */}
        {targetUrl && dest && (
          <a className="trk-dest" href={targetUrl} target="_blank" rel="noopener noreferrer" title={targetUrl}>
            {LINK}<span>Links to <b>{dest}</b></span>{EXTERNAL}
          </a>
        )}

        {error && <p className="trk-err" role="alert">{error}</p>}

        <div className="trk-actions">
          <button type="button" className="trk-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="trk-btn primary" onClick={send} disabled={sending || !number.trim()}>
            {sending ? 'Sending…' : 'Send tracking'}
          </button>
        </div>
      </div>
    </div>
  )
}

// A coloured monogram per carrier (their own colours), so the choices scan at a glance.
const MARK: Record<string, { t: string; bg: string; fg: string }> = {
  auspost: { t: 'AP', bg: '#DC1928', fg: '#fff' },
  aramex: { t: 'Ax', bg: '#E2231A', fg: '#fff' },
  tge: { t: 'TG', bg: '#00205B', fg: '#fff' },
  manual: { t: '…', bg: 'var(--trk-fill-2)', fg: 'var(--trk-muted)' },
}

const g = (d: React.ReactNode, s = 18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
const TRUCK = g(<><rect x="1" y="3" width="15" height="13" rx="1.5" /><path d="M16 8h4l3 3v5h-7z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></>, 20)
const BARCODE = g(<path d="M3 5v14M7 5v14M11 5v14M14 5v14M18 5v14M21 5v14" />, 17)
const LINK = g(<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>, 15)
const EXTERNAL = g(<><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>, 13)

const TRK_CSS = `
.trk-scrim{position:fixed;inset:0;z-index:500;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,15,20,.32);animation:trkFade .16s ease both}
.trk{--trk-fill:#f4f4f5;--trk-fill-2:#ececef;--trk-muted:#71717a;
  width:460px;max-width:100%;max-height:92vh;overflow-y:auto;background:var(--card,#fff);border-radius:26px;padding:24px;display:flex;flex-direction:column;
  box-shadow:0 0 0 1px rgba(0,0,0,.05),0 30px 80px -20px rgba(16,24,40,.35);animation:trkIn .28s cubic-bezier(.22,1,.36,1) both}
[data-theme="dark"] .trk{--trk-fill:#2a2a2e;--trk-fill-2:#333337;--trk-muted:#9a9aa0}
.trk button::before,.trk a::before{display:none!important}
.trk-head{display:flex;align-items:flex-start;gap:13px;margin-bottom:6px}
.trk-badge{width:44px;height:44px;flex-shrink:0;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;background:var(--peach,#fff4f1);color:var(--coral,#ff7a6b)}
.trk-head h3{margin:1px 0 0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:22px;font-weight:700;letter-spacing:-.03em;line-height:1.15;color:var(--ink)}
.trk-head p{margin:4px 0 0;font-size:13.5px;line-height:1.45;color:var(--trk-muted)}
.trk-lbl{display:flex;align-items:baseline;gap:6px;margin:18px 0 8px;font-size:13px;font-weight:600;color:var(--ink)}
.trk-opt{font-weight:400;color:var(--trk-muted)}
.trk-carriers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.trk-carrier{position:relative;display:flex;align-items:center;gap:10px;min-height:52px;padding:8px 12px 8px 9px;border:none;border-radius:16px;background:var(--trk-fill);font:inherit;text-align:left;color:var(--ink);cursor:pointer;transition:background .15s,box-shadow .15s}
.trk-carrier:hover{background:var(--trk-fill-2)}
.trk-carrier.on{background:var(--card,#fff);box-shadow:0 0 0 2px var(--ink)}
.trk-mono{width:34px;height:34px;flex-shrink:0;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:800;letter-spacing:-.02em}
.trk-carrier-t{flex:1;min-width:0;font-size:13.5px;font-weight:600;line-height:1.25}
.trk-check{width:20px;height:20px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 1.5px var(--trk-fill-2)}
.trk-carrier.on .trk-check{background:var(--ink);color:var(--card,#fff);box-shadow:none}
.trk-field{display:flex;align-items:center;gap:10px;height:52px;padding:0 15px;border-radius:16px;background:var(--trk-fill);color:var(--trk-muted);border:1.5px solid transparent;transition:background .15s,border-color .15s}
.trk-field:focus-within{background:var(--card,#fff);border-color:var(--trk-fill-2)}
.trk .trk-field input{flex:1;min-width:0;height:100%;border:none!important;outline:none;background:transparent!important;box-shadow:none!important;padding:0;font:inherit;font-size:16px;font-weight:500;letter-spacing:.02em;color:var(--ink)!important;font-variant-numeric:tabular-nums}
.trk .trk-field input::placeholder{color:var(--trk-muted);font-weight:400;letter-spacing:0}
.trk-note{margin:9px 2px 0;font-size:12.5px;line-height:1.5;color:var(--trk-muted)}
.trk-dest{align-self:flex-start;max-width:100%;display:inline-flex;align-items:center;gap:7px;margin-top:12px;padding:7px 12px;border-radius:999px;background:var(--trk-fill);color:var(--trk-muted);font-size:12.5px;text-decoration:none}
.trk-dest span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.trk-dest b{font-weight:600;color:var(--ink)}
.trk-dest:hover{background:var(--trk-fill-2)}
.trk-err{margin:12px 0 0;font-size:13px;font-weight:600;color:#dc2626}
.trk-actions{display:flex;gap:8px;margin-top:22px}
.trk-btn{flex:1;height:48px;border:none;border-radius:999px;background:var(--trk-fill);color:var(--ink);font:inherit;font-size:14.5px;font-weight:650;cursor:pointer;transition:background .15s,filter .15s,transform .12s}
.trk-btn:hover{background:var(--trk-fill-2)}
.trk-btn.primary{flex:2;background:var(--coral,#ff7a6b);color:#fff}
.trk-btn.primary:hover{filter:brightness(.95)}
.trk-btn:active{transform:scale(.985)}
.trk-btn:disabled{opacity:.45;cursor:not-allowed;transform:none;filter:none}
.trk :focus-visible{outline:2px solid var(--coral,#ff7a6b);outline-offset:2px}
@keyframes trkIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
@keyframes trkFade{from{opacity:0}to{opacity:1}}
@media (max-width:520px){.trk-scrim{align-items:flex-end;padding:0}.trk{border-radius:24px 24px 0 0;max-height:94vh}}
@media (prefers-reduced-motion:reduce){.trk,.trk-scrim{animation:none}}
`
