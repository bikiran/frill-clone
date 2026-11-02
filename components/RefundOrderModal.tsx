'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useEffect, useState } from 'react'
import { SkClose, SkIcon, SkStyle } from '@/components/ui/SheetKit'
import { confirmDialog } from '@/components/ConfirmDialog'
import { refundedByLine, type OrderRefund } from '@/lib/order-refunds'
import { useRefundAccess, RefundPinField, RefundNotAllowed, isPinError } from '@/components/RefundPin'

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
  // Who may refund, and the workspace's refund PIN (the server checks both).
  const access = useRefundAccess(companyId)
  const [pin, setPin] = useState('')

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
    if (!access.canRefund) { setError('You don’t have permission to issue refunds.'); return }
    if (access.pinSet && pin.length < 4) { setError('Enter the refund PIN.'); return }
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
          ...(pin ? { refundPin: pin } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (isPinError(data.code)) setPin('')
        throw new Error(data.error || 'Refund failed')
      }
      onDone?.(Number(data.amount || total), reason)
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Could not issue the refund'); setBusy(false)
    }
  }

  return (
    <div className="sk-scrim" style={{ '--sk-z': 6400 } as React.CSSProperties} onClick={() => !busy && onClose()}>
      <SkStyle />
      <div className="sk" role="dialog" aria-modal="true" aria-labelledby="rf-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape' && !busy) onClose() }}>
        <div className="sk-head">
          <span className="sk-badge" aria-hidden>{SkIcon.refund}</span>
          <div style={{ minWidth: 0 }}>
            <h3 id="rf-title">Refund order #{order.order_number}</h3>
            <p className="sk-sub">The whole order, or pick items and shipping. Restocking is up to you.</p>
          </div>
          <SkClose onClick={() => !busy && onClose()} />
        </div>

        {loading ? (
          <p className="sk-note" style={{ padding: '28px 0', textAlign: 'center' }}>Loading order…</p>
        ) : (
          <>
            {fullyRefunded && (
              <p role="status" className="sk-card" style={{ margin: '14px 0 0', background: '#ecfdf5', color: '#047857', fontSize: 13.5, fontWeight: 650 }}>
                This order has already been refunded in full ({money(alreadyRefunded)}).
              </p>
            )}
            {canChooseAll && !fullyRefunded && (
              <button type="button" className={`rf-all${allChosen ? ' on' : ''}`} onClick={chooseEverything} disabled={allChosen}>
                <span className="rf-all-ic" aria-hidden>{allChosen ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> : SkIcon.refund}</span>
                <span className="rf-all-t">{allChosen ? 'Everything selected' : 'Refund everything'}<small>{allChosen ? 'Every item and the shipping' : 'Every item and the shipping'}</small></span>
                <b>{money(allChosen ? total : available)}</b>
              </button>
            )}
            {noItems && !fullyRefunded && <p className="sk-note">No line items found. A refund of {money(available)} (what&rsquo;s left on the order) will be issued.</p>}

            {items.length > 0 && <span className="sk-lbl">Items</span>}
            {items.map((it, idx) => {
              const done = it.max <= 0
              return (
                <div key={idx} className="sk-item" style={{ opacity: done ? 0.55 : 1 }}>
                  <span className="sk-item-t">
                    <b>{it.name}</b>
                    <small>
                      {money(it.unit)} each · qty {it.qty}
                      {it.refunded > 0 && <span style={{ color: '#b45309', fontWeight: 650 }}> · {done ? 'refunded' : `${it.refunded} already refunded`}</span>}
                    </small>
                  </span>
                  {done ? (
                    <span className="rf-tag">Refunded</span>
                  ) : (
                    <span className="sk-stepper">
                      <button type="button" aria-label={`One fewer ${it.name}`} onClick={() => setQty(idx, -1)} disabled={it.refundQty <= 0}>−</button>
                      <span>{it.refundQty}</span>
                      <button type="button" aria-label={`One more ${it.name}`} onClick={() => setQty(idx, +1)} disabled={it.refundQty >= it.max}>+</button>
                    </span>
                  )}
                  <span className="sk-amt" style={{ minWidth: 62, textAlign: 'right', color: it.refundQty > 0 ? 'var(--ink)' : 'var(--sk-muted)' }}>{money(it.unit * it.refundQty)}</span>
                </div>
              )
            })}

            {shipping > 0 && shippingLeft <= 0 && <p className="sk-note">Shipping ({money(shipping)}) has already been refunded.</p>}
            {shippingLeft > 0 && (
              <label className="sk-check box">
                <input type="checkbox" checked={refundShipping} onChange={e => setRefundShipping(e.target.checked)} />
                <span style={{ flex: 1, minWidth: 0 }}>Refund shipping{shippingMethod ? <span style={{ color: 'var(--sk-muted)' }}> · {shippingMethod}</span> : ''}{shippingRefunded > 0 ? ' · rest of it' : ''}</span>
                <span className="sk-amt">{money(shippingLeft)}</span>
              </label>
            )}

            <label className="sk-check">
              <input type="checkbox" checked={restock} onChange={e => setRestock(e.target.checked)} />
              <span>Put refunded items back in stock</span>
            </label>

            <label className="sk-lbl" htmlFor="rf-reason">Reason <span className="sk-opt">optional</span></label>
            <input id="rf-reason" className="sk-in" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Damaged in transit" />

            <div className="sk-sum">
              <div className="sk-sum-r"><span>Available to refund{alreadyRefunded > 0 ? ` (already ${money(alreadyRefunded)})` : ''}</span><b>{money(available)}</b></div>
              <div className="sk-sum-r total"><span>Refund total</span><b style={{ color: total > 0 ? accent : undefined }}>{money(total)}</b></div>
            </div>

            {!access.loading && !access.canRefund && <RefundNotAllowed />}
            {access.canRefund && access.pinSet && !fullyRefunded && <RefundPinField value={pin} onChange={setPin} id="rf-pin" />}

            {error && <p className="sk-err" role="alert">{error}</p>}

            <div className="sk-actions">
              <button type="button" className="sk-btn" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="button" className="sk-btn primary" onClick={submit} disabled={busy || fullyRefunded || total <= 0 || (!access.loading && !access.canRefund)}>
                {busy ? 'Refunding…' : fullyRefunded ? 'Nothing left to refund' : total > 0 ? `Refund ${money(total)}` : 'Choose what to refund'}
              </button>
            </div>
          </>
        )}
      </div>
      <style>{RF_CSS}</style>
    </div>
  )
}

const RF_CSS = `
.rf-all{display:flex;align-items:center;gap:12px;width:100%;margin-top:16px;padding:12px 14px;border:none;border-radius:18px;background:var(--peach,#fff4f1);color:var(--ink);font:inherit;text-align:left;cursor:pointer;box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--coral,#ff7a6b) 35%,transparent);transition:box-shadow .15s,background .15s}
.rf-all:hover:not(:disabled){box-shadow:inset 0 0 0 2px var(--coral,#ff7a6b)}
.rf-all.on{background:var(--coral,#ff7a6b);color:#fff;box-shadow:none;cursor:default}
.rf-all-ic{width:36px;height:36px;flex-shrink:0;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;background:var(--card,#fff);color:var(--coral,#ff7a6b)}
.rf-all.on .rf-all-ic{background:rgba(255,255,255,.22);color:#fff}
.rf-all-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;font-size:14.5px;font-weight:700}
.rf-all-t small{font-size:12.5px;font-weight:500;opacity:.75}
.rf-all b{font-size:16px;font-weight:800;font-variant-numeric:tabular-nums}
.rf-tag{flex-shrink:0;padding:4px 10px;border-radius:999px;background:#fef3c7;color:#b45309;font-size:11.5px;font-weight:700}
`
