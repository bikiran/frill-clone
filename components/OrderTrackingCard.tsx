'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'

// Shipping settings → Order tracking. Switch ShipStation tracking on for this
// business, and look up any order to see exactly what Colvy (and its AI
// agents) can find: carrier, tracking, live status, and whether it looks normal.

const STAGE: Record<string, string> = {
  processing: 'Being prepared', on_hold: 'On hold', ready_for_pickup: 'Ready to collect', shipped: 'Shipped',
  in_transit: 'In transit', out_for_delivery: 'Out for delivery', delivered: 'Delivered', exception: 'Problem with delivery',
  cancelled: 'Cancelled', refunded: 'Refunded', unknown: 'Unknown',
}
const VERDICT: Record<string, { label: string; bg: string; fg: string }> = {
  normal: { label: 'Looks normal', bg: '#ecfdf3', fg: '#067647' },
  needs_attention: { label: 'Needs a look', bg: '#fffaeb', fg: '#b54708' },
  escalate: { label: 'Needs a person', bg: '#fef3f2', fg: '#b42318' },
}
const SOURCE: Record<string, string> = { colvy: 'Colvy labels', shipstation: 'ShipStation', woocommerce: 'WooCommerce' }
// ShipStation carrier codes (australia_post) → readable names (Australia Post).
const carrierName = (c?: string | null) => c ? (/[_-]/.test(c) || c === c.toLowerCase() ? c.replace(/[_-]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase()) : c) : 'Carrier'

export default function OrderTrackingCard({ companyId, accent }: { companyId: string; accent: string }) {
  const [settings, setSettings] = useState<{ shipstationConfigured: boolean; shipstationTracking: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const [num, setNum] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<any>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    authFetch(`/api/orders/tracking?companyId=${companyId}`).then(r => r.json()).then(d => d?.settings && setSettings(d.settings)).catch(() => {})
  }, [companyId])

  const toggle = async () => {
    if (!settings) return
    const next = !settings.shipstationTracking
    setSaving(true); setSettings({ ...settings, shipstationTracking: next })
    try {
      const r = await authFetch('/api/orders/tracking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, shipstationTracking: next }) })
      if (!r.ok) setSettings({ ...settings })
    } catch { setSettings({ ...settings }) } finally { setSaving(false) }
  }

  const check = async () => {
    const n = num.replace(/^#/, '').trim()
    if (!n) return
    setBusy(true); setErr(''); setRes(null)
    try {
      const r = await authFetch(`/api/orders/tracking?companyId=${companyId}&order=${encodeURIComponent(n)}`)
      const d = await r.json()
      if (!r.ok || d.error) setErr(d.error || 'Couldn’t check that order.')
      else setRes(d)
    } catch { setErr('Couldn’t reach Colvy. Try again.') } finally { setBusy(false) }
  }

  const card: React.CSSProperties = { background: 'var(--card,#fff)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginTop: 16 }
  const v = res ? VERDICT[res.assessment?.verdict] : null

  return (
    <div style={card}>
      <strong style={{ fontSize: 14, color: 'var(--ink)' }}>Order tracking</strong>
      <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.6 }}>
        Where Colvy and its AI agents find tracking for “where is my order?”: labels made in Colvy, ShipStation, and the tracking your store adds to each WooCommerce order.
      </p>

      {settings?.shipstationConfigured && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14, padding: '12px 14px', borderRadius: 11, border: '1px solid var(--border)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Use ShipStation tracking</div>
            <div style={{ fontSize: 12, color: 'var(--slate)', lineHeight: 1.5 }}>Looks up each order’s ShipStation labels and live carrier status. Only shipments whose recipient matches the order are used.</div>
          </div>
          <button type="button" role="switch" aria-checked={settings.shipstationTracking} aria-label="Use ShipStation tracking" onClick={toggle} disabled={saving}
            style={{ position: 'relative', width: 44, height: 26, flexShrink: 0, borderRadius: 999, border: 'none', cursor: 'pointer', background: settings.shipstationTracking ? accent : 'color-mix(in srgb, var(--slate) 28%, transparent)', transition: 'background .3s cubic-bezier(.22,1,.36,1)' }}>
            <span style={{ position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)', transform: settings.shipstationTracking ? 'translateX(18px)' : 'none', transition: 'transform .3s cubic-bezier(.22,1,.36,1)' }} />
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <input value={num} onChange={e => setNum(e.target.value)} onKeyDown={e => e.key === 'Enter' && check()} placeholder="Order number, e.g. 10432" aria-label="Order number"
          style={{ flex: '1 1 200px', minWidth: 0, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13.5, color: 'var(--ink)', outline: 'none' }} />
        <button type="button" onClick={check} disabled={busy || !num.trim()}
          style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: accent, color: '#fff', fontSize: 13.5, fontWeight: 800, cursor: busy ? 'default' : 'pointer', opacity: busy || !num.trim() ? 0.6 : 1 }}>
          {busy ? 'Checking…' : 'Check tracking'}
        </button>
      </div>
      {err && <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 9, background: '#fef3f2', color: '#b42318', fontSize: 12.5 }}>{err}</div>}

      {res && (
        <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: 'var(--canvas,#f6f7f9)', animation: 'otFade .4s cubic-bezier(.22,1,.36,1) both' }}>
          <style>{'@keyframes otFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}'}</style>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>#{res.order.number} · {res.order.customer || 'Customer'} — {STAGE[res.tracking.stage] || res.tracking.stage}</div>
            {v && <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: v.bg, color: v.fg }}>{v.label}</span>}
          </div>
          {(res.assessment?.reasons || []).map((r: string, i: number) => <div key={i} style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 4 }}>{r}</div>)}
          {res.tracking.shipments.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 8 }}>No tracking found yet.</div>}
          {res.tracking.shipments.map((s: any, i: number) => (
            <div key={i} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.6 }}>
              <div><b>{carrierName(s.carrier)}</b> · {s.trackingNumber || 'no tracking number'}{s.trackingUrl && <> · <a href={s.trackingUrl} target="_blank" rel="noreferrer" style={{ color: accent, fontWeight: 600 }}>Track</a></>}</div>
              <div style={{ color: 'var(--slate)' }}>
                {[s.statusText || s.status.replace(/_/g, ' '), s.shippedAt && `shipped ${s.shippedAt.slice(0, 10)}`, s.estimatedDelivery && `due ${s.estimatedDelivery.slice(0, 10)}`, s.deliveredAt && `delivered ${s.deliveredAt.slice(0, 10)}`].filter(Boolean).join(' · ')}
              </div>
              {s.lastEvent && <div style={{ color: 'var(--slate)' }}>Latest: {s.lastEvent.text}{s.lastEvent.place ? ` — ${s.lastEvent.place}` : ''}</div>}
              <div style={{ color: '#9aa0a6', fontSize: 11.5 }}>From {SOURCE[s.source] || s.source}</div>
            </div>
          ))}
          {(res.tracking.notes || []).map((n: string, i: number) => <div key={i} style={{ marginTop: 8, fontSize: 12, color: '#b54708' }}>{n}</div>)}
        </div>
      )}
    </div>
  )
}
