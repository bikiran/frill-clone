'use client'

import { useState } from 'react'
import { CARRIERS, carrierByKey } from '@/lib/carriers'

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
    if (isManual && !customUrl.trim()) { setError('Enter the tracking URL, or pick a carrier.'); return }
    setSending(true); setError('')

    try {
      // Wrap the carrier URL in a Colvy short link so the customer sees a
      // branded link and we can count the clicks.
      let shortUrl = ''
      let shortCode = ''
      if (targetUrl) {
        const res = await fetch('/api/short-links/create', {
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
        await fetch('/api/shipments/create', {
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

  const L: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--slate)', display: 'block', margin: '14px 0 6px' }
  const I: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box' }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 420, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 18, padding: 24 }}>
        <h3 style={{ margin: '0 0 2px', fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Send tracking</h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)' }}>
          {orderNumber ? `Order ${orderNumber}` : 'The customer gets a Colvy link that opens the carrier’s tracking page.'}
        </p>

        <label style={L}>Carrier</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
          {CARRIERS.map(c => {
            const on = carrierKey === c.key
            return (
              <button key={c.key} type="button" onClick={() => { setCarrierKey(c.key); setError('') }}
                style={{ padding: '10px 0', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  border: '1px solid ' + (on ? 'var(--coral)' : 'var(--border)'),
                  background: on ? 'var(--peach)' : '#fff', color: on ? 'var(--coral)' : 'var(--slate)' }}>
                {c.label}
              </button>
            )
          })}
        </div>

        <label style={L}>Tracking number</label>
        <input value={number} onChange={e => { setNumber(e.target.value); setError('') }}
          placeholder="e.g. 33ABC123456789" style={I} autoFocus />

        {isManual && (
          <>
            <label style={L}>Tracking URL</label>
            <input value={customUrl} onChange={e => setCustomUrl(e.target.value)}
              placeholder="https://…" style={I} />
          </>
        )}

        {carrier.note && (
          <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--slate)', lineHeight: 1.45 }}>
            {carrier.note}
          </p>
        )}

        {/* Show exactly where the link will point, so there are no surprises. */}
        {targetUrl && (
          <div style={{ marginTop: 12, padding: '9px 11px', borderRadius: 9, background: 'var(--canvas)', fontSize: 11, color: 'var(--slate)', wordBreak: 'break-all', lineHeight: 1.4 }}>
            <span style={{ fontWeight: 700 }}>Links to:</span> {targetUrl}
          </div>
        )}

        {error && <p style={{ margin: '12px 0 0', fontSize: 13, color: '#dc2626' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button type="button" onClick={send} disabled={sending || !number.trim()}
            style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: sending || !number.trim() ? 0.6 : 1 }}>
            {sending ? 'Sending…' : 'Send tracking'}
          </button>
        </div>
      </div>
    </div>
  )
}
