'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useEffect, useState } from 'react'
import { confirmDialog } from '@/components/ConfirmDialog'
import { refundedByLine, type OrderRefund } from '@/lib/order-refunds'

// Full, itemised refund for a WooCommerce order — the same capability the inbox
// order panel has, usable from the Orders board. Choose per-item quantities,
// optionally refund shipping, restock, and add a reason. Moves real money via
// the gateway (api_refund) — always confirms with the amount first.
// `refunded` is how many of the line earlier refunds already took back; only
// what's left can be chosen, so an item can't be refunded twice.
type RItem = { id: any; name: string; qty: number; unit: number; total: number; tax: number; taxId: any; refundQty: number; refunded: number; max: number }

export default function RefundOrderModal({
  companyId, order, accent = 'var(--coral)', onClose, onDone,
}: {
  companyId: string
  order: any
  accent?: string
  onClose: () => void
  onDone?: (amount: number, reason: string) => void
}) {
  // A Shopify order is refunded through Shopify — the routes recognise "shopify-<id>".
  const orderId = order.sales_channel === 'shopify' && order.external_order_id
    ? `shopify-${order.external_order_id}`
    : order.external_order_id || order.order_id || order.id
  const currency = order.currency || 'AUD'
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<RItem[]>([])
  const [shipping, setShipping] = useState(0)
  const [shippingMethod, setShippingMethod] = useState<string | null>(order.shipping_method || null)
  const [refundShipping, setRefundShipping] = useState(false)
  const [restock, setRestock] = useState(true)
  const [reason, setReason] = useState('')
  const [orderTotal, setOrderTotal] = useState(Number(order.total || 0))
  const [alreadyRefunded, setAlreadyRefunded] = useState(Math.abs(Number(order.total_refunded || 0)))
  const [shippingRefunded, setShippingRefunded] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const money = (n: number) => `$${(Number(n) || 0).toFixed(2)}`

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let rawItems = order.line_items || order.items || []
      let shippingTotal = Number(order.shipping_total || 0)
      let shopify = order.sales_channel === 'shopify'
      const integ = order.integration_id ? `&integrationId=${order.integration_id}` : ''
      // Earlier refunds, read alongside the order.
      const refundsP: Promise<OrderRefund[]> = authFetch(`/api/orders/refunds?companyId=${companyId}&orderId=${encodeURIComponent(orderId)}${integ}`)
        .then(r => r.ok ? r.json() : null).then(j => j?.refunds || []).catch(() => [])
      try {
        const res = await authFetch(`/api/orders/detail?companyId=${companyId}&orderId=${orderId}${integ}`)
        const d = await res.json().catch(() => ({}))
        if (res.ok && d.order) {
          if (d.order.channel === 'shopify') shopify = true
          if (Array.isArray(d.order.line_items) && d.order.line_items.length) rawItems = d.order.line_items
          if (d.order.shipping_total != null) shippingTotal = Number(d.order.shipping_total)
          if (d.order.shipping_method) setShippingMethod(d.order.shipping_method)
          if (d.order.total != null && Number(d.order.total)) setOrderTotal(Number(d.order.total))
          if (d.order.total_refunded != null) setAlreadyRefunded(Math.abs(Number(d.order.total_refunded)))
        }
      } catch { /* offer a full refund via the fallback rows */ }
      const refunds = await refundsP
      if (cancelled) return
      const byLine = refundedByLine(refunds)
      setShippingRefunded(refunds.reduce((s, r) => s + r.shipping, 0))
      const mapped: RItem[] = (rawItems || []).map((li: any, i: number) => {
        const qty = Number(li.quantity || li.qty || 1)
        const refunded = byLine.get(String(li.id ?? ''))?.qty || 0
        return {
          id: li.id ?? li.line_item_id ?? i,
          name: li.name || li.product_name || 'Item',
          qty,
          unit: Number(li.total || li.subtotal || li.price || 0) / Math.max(1, qty),
          total: Number(li.total || li.subtotal || 0),
          tax: Number(li.total_tax || li.tax || 0),
          taxId: li.taxId ?? li.taxes?.[0]?.id ?? null,
          refundQty: 0,
          refunded,
          // Shopify already gives the quantity left after refunds.
          max: shopify ? qty : Math.max(0, qty - refunded),
        }
      })
      setItems(mapped)
      setShipping(shippingTotal)
      setLoading(false)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setQty = (idx: number, delta: number) => setItems(its => {
    const next = [...its]
    next[idx] = { ...next[idx], refundQty: Math.max(0, Math.min(next[idx].max, next[idx].refundQty + delta)) }
    return next
  })

  const chosen = items.filter(it => it.refundQty > 0)
  const itemsTotal = chosen.reduce((s, it) => s + it.unit * it.refundQty + (it.qty > 0 ? (it.tax / it.qty) * it.refundQty : 0), 0)
  const shippingLeft = Math.max(0, +(shipping - shippingRefunded).toFixed(2))
  const noItems = !loading && items.length === 0
  const available = Math.max(0, orderTotal - alreadyRefunded)
  const fullyRefunded = !loading && orderTotal > 0 && available < 0.01
  // No line items to choose from → refund what's left, as one amount.
  const total = noItems ? available : itemsTotal + (refundShipping ? shippingLeft : 0)
  // Every item still refundable is chosen in full, and shipping too if any is left.
  const canChooseAll = !noItems && items.some(it => it.max > 0)
  const allChosen = canChooseAll && items.every(it => it.refundQty === it.max) && (shippingLeft <= 0 || refundShipping)
  const chooseEverything = () => {
    setItems(its => its.map(it => ({ ...it, refundQty: it.max })))
    setRefundShipping(shippingLeft > 0)
  }

  const submit = async () => {
    setError('')
    if (fullyRefunded) { setError('This order has already been refunded in full.'); return }
    if (!noItems && chosen.length === 0 && !(refundShipping && shippingLeft > 0)) { setError('Select at least one item or shipping to refund.'); return }
    if (total <= 0) { setError('Nothing to refund.'); return }
    if (orderTotal > 0 && total > available + 0.01) { setError(`At most ${money(available)} is left to refund on this order.`); return }
    // Only shipping ticked is an easy slip when the whole order was meant to go
    // back (items start at 0), so say plainly what is and isn't included.
    const shippingOnly = !noItems && chosen.length === 0 && refundShipping
    const question = shippingOnly
      ? `Refund ${money(total)} for shipping only on order #${order.order_number}?\n\nNo items are included, so they stay paid. To refund the whole order, choose “Refund everything”.`
      : `Refund ${money(total)} for order #${order.order_number}?\n\nThis returns money through the payment gateway and cannot be undone here.`
    if (!await confirmDialog(question)) return
    setBusy(true)
    try {
      const lineItems = chosen.map(it => ({
        id: it.id, qty: it.refundQty,
        total: +(it.unit * it.refundQty).toFixed(2),
        tax: it.qty > 0 ? +((it.tax / it.qty) * it.refundQty).toFixed(2) : 0,
        taxId: it.taxId,
      }))
      const res = await authFetch('/api/orders/refund', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, orderId, integrationId: order.integration_id || undefined,
          conversationId: order.conversation_id || undefined,
          ...(noItems ? { amount: +total.toFixed(2) } : {}),
          lineItems, shipping: refundShipping ? shippingLeft : 0, restock, reason: reason || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Refund failed')
      onDone?.(Number(data.amount || total), reason)
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Could not issue the refund'); setBusy(false)
    }
  }

  const box: React.CSSProperties = { width: 460, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', background: 'var(--card,#fff)', borderRadius: 16, padding: 22 }

  return (
    <div onClick={() => !busy && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 6400, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={box}>
        <h3 style={{ margin: '0 0 3px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Refund order #{order.order_number}</h3>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)' }}>Refund the whole order, or choose items and shipping. Restock is optional.</p>

        {loading ? (
          <p style={{ padding: '28px 0', textAlign: 'center', color: 'var(--slate)', fontSize: 13 }}>Loading order…</p>
        ) : (
          <>
            {fullyRefunded && (
              <div role="status" style={{ marginTop: 14, padding: '10px 12px', borderRadius: 11, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', fontSize: 13, fontWeight: 700 }}>
                This order has already been refunded in full ({money(alreadyRefunded)}).
              </div>
            )}
            {canChooseAll && !fullyRefunded && (
              <button type="button" onClick={chooseEverything} disabled={allChosen}
                style={{ marginTop: 14, width: '100%', padding: '10px 12px', borderRadius: 11, border: `1.5px solid ${accent}`, background: allChosen ? accent : 'var(--card,#fff)', color: allChosen ? '#fff' : accent, fontSize: 13.5, fontWeight: 800, cursor: allChosen ? 'default' : 'pointer' }}>
                {allChosen ? `✓ Everything selected · ${money(total)}` : `Refund everything · ${money(available)}`}
              </button>
            )}
            {noItems && !fullyRefunded && <p style={{ margin: '14px 0 0', fontSize: 13, color: 'var(--slate)' }}>No line items found — a refund of {money(available)} (what&rsquo;s left on the order) will be issued.</p>}
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((it, idx) => {
                const done = it.max <= 0
                return (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 11, border: '1px solid var(--border)', opacity: done ? 0.55 : 1 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</p>
                    <p style={{ margin: 0, fontSize: 11.5, color: 'var(--slate)' }}>
                      {money(it.unit)} each · qty {it.qty}
                      {it.refunded > 0 && <span style={{ color: '#b45309', fontWeight: 700 }}> · {done ? 'refunded' : `${it.refunded} already refunded`}</span>}
                    </p>
                  </div>
                  {done ? (
                    <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: '#b45309', background: '#fef3c7', padding: '3px 9px', borderRadius: 20 }}>Refunded</span>
                  ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <button type="button" aria-label={`One fewer ${it.name}`} onClick={() => setQty(idx, -1)} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card,#fff)', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>−</button>
                    <span style={{ width: 22, textAlign: 'center', fontSize: 13, fontWeight: 700 }}>{it.refundQty}</span>
                    <button type="button" aria-label={`One more ${it.name}`} onClick={() => setQty(idx, +1)} disabled={it.refundQty >= it.max} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card,#fff)', cursor: it.refundQty >= it.max ? 'default' : 'pointer', opacity: it.refundQty >= it.max ? 0.4 : 1, fontSize: 15, lineHeight: 1 }}>+</button>
                  </div>
                  )}
                  <span style={{ width: 66, textAlign: 'right', fontSize: 13, fontWeight: 700, color: it.refundQty > 0 ? 'var(--ink)' : 'var(--slate)' }}>{money(it.unit * it.refundQty)}</span>
                </div>
                )
              })}
            </div>

            {shipping > 0 && shippingLeft <= 0 && (
              <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>Shipping ({money(shipping)}) has already been refunded.</p>
            )}
            {shippingLeft > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, padding: '9px 11px', borderRadius: 11, border: '1px solid var(--border)', cursor: 'pointer' }}>
                <input type="checkbox" checked={refundShipping} onChange={e => setRefundShipping(e.target.checked)} style={{ accentColor: accent }} />
                <span style={{ flex: 1, fontSize: 13.5, color: 'var(--ink)' }}>Refund shipping{shippingMethod ? ` (${shippingMethod})` : ''}{shippingRefunded > 0 ? ' · rest of it' : ''}</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{money(shippingLeft)}</span>
              </label>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={restock} onChange={e => setRestock(e.target.checked)} style={{ accentColor: accent }} />
              <span style={{ fontSize: 13.5, color: 'var(--ink)' }}>Restock refunded items</span>
            </label>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--slate)', margin: '14px 0 6px' }}>Reason (optional)</label>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Damaged in transit"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, outline: 'none' }} />

            <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 11, background: 'var(--canvas)', fontSize: 12.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--slate)' }}>
                <span>Available to refund{alreadyRefunded > 0 ? ` (already ${money(alreadyRefunded)})` : ''}</span>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{money(available)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 14 }}>
                <span style={{ fontWeight: 800, color: 'var(--ink)' }}>Refund total</span>
                <span style={{ fontWeight: 800, color: accent }}>{money(total)}</span>
              </div>
            </div>

            {error && <p style={{ margin: '10px 0 0', fontSize: 13, color: '#dc2626' }}>{error}</p>}

            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button type="button" onClick={onClose} disabled={busy} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--slate)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={submit} disabled={busy || fullyRefunded} style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: accent, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: busy || fullyRefunded ? 'default' : 'pointer', opacity: busy || fullyRefunded ? 0.5 : 1 }}>
                {busy ? 'Refunding…' : fullyRefunded ? 'Nothing left to refund' : `Issue refund ${total > 0 ? money(total) : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
