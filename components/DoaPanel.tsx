'use client'

import { useState, useEffect } from 'react'

// The DOA claim panel. Pre-fills name/phone/email from the chat contact, looks
// up the order by number from WooCommerce, lets the agent select items or an
// amount, and processes a refund / store credit / resend.
export default function DoaPanel({ companyId, conversationId, contactId, contact, onClose, onDone }: {
  companyId: string
  conversationId?: string | null
  contactId?: string | null
  contact?: any
  onClose: () => void
  onDone?: (msg: string) => void
}) {
  const [orderNumber, setOrderNumber] = useState('')
  const [order, setOrder] = useState<any>(null)
  const [looking, setLooking] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Record<number, boolean>>({})
  const [customAmount, setCustomAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<string>('')
  const [recentOrders, setRecentOrders] = useState<any[]>([])
  const [loadingRecent, setLoadingRecent] = useState(false)

  // Load the customer's recent orders so the agent can pick one without knowing
  // the number (the most recent is tagged RECENT). Search still works too.
  useEffect(() => {
    const email = contact?.email
    if (!email || !companyId) return
    setLoadingRecent(true)
    fetch(`/api/orders/list?companyId=${companyId}&email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(d => {
        const list = (d.orders || []).slice().sort((a: any, b: any) => new Date(b.date_created || b.created_at || 0).getTime() - new Date(a.date_created || a.created_at || 0).getTime())
        setRecentOrders(list)
      })
      .catch(() => {})
      .finally(() => setLoadingRecent(false))
  }, [companyId, contact?.email])

  const lookup = async () => {
    if (!orderNumber.trim()) return
    setLooking(true); setError(''); setOrder(null)
    try {
      const res = await fetch(`/api/doa/order?companyId=${companyId}&order=${encodeURIComponent(orderNumber.trim())}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Order not found')
      setOrder(data.order)
      // Auto-select all items by default
      const sel: Record<number, boolean> = {}
      ;(data.order.items || []).forEach((it: any) => { sel[it.id] = true })
      setSelected(sel)
    } catch (e: any) { setError(e.message) } finally { setLooking(false) }
  }

  const selectedItems = order ? (order.items || []).filter((it: any) => selected[it.id]) : []
  const selectedTotal = selectedItems.reduce((s: number, it: any) => s + (parseFloat(it.total) || 0), 0)

  const process = async (resolution: 'refund' | 'coupon' | 'resend') => {
    if (!order) return
    setProcessing(true); setError('')
    try {
      const amount = customAmount ? customAmount : (resolution === 'refund' ? selectedTotal.toFixed(2) : undefined)
      const res = await fetch('/api/doa/process', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, conversationId, contactId, order, resolution,
          selectedItems: resolution === 'refund' && !customAmount ? selectedItems : undefined,
          amount, notes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not process')
      setResult(data.message || 'Done')
      onDone?.(data.message)
    } catch (e: any) { setError(e.message) } finally { setProcessing(false) }
  }

  const L: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 4, marginTop: 12 }
  const I: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: '100%', height: '100%', background: '#fff', overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>DOA Claim</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>Dead-on-arrival / faulty item claim</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--slate)' }}>✕</button>
        </div>

        <div style={{ padding: 20 }}>
          {result ? (
            <div style={{ textAlign: 'center', padding: '30px 10px' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <p style={{ fontSize: 14.5, color: 'var(--ink)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{result.replace(/\*\*/g, '')}</p>
              <button onClick={onClose} style={{ marginTop: 20, padding: '10px 24px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Done</button>
            </div>
          ) : (
            <>
              {/* Pre-filled contact */}
              {contact && (
                <div style={{ background: 'var(--peach)', borderRadius: 10, padding: 12, marginBottom: 8, fontSize: 12.5, color: 'var(--ink)' }}>
                  <strong>From chat:</strong> {contact.name || '—'}{contact.phone ? ` · ${contact.phone}` : ''}{contact.email ? ` · ${contact.email}` : ''}
                </div>
              )}

              {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, padding: '9px 12px', margin: '10px 0', fontSize: 12.5, color: '#dc2626' }}>{error}</div>}

              {/* Order lookup */}
              <label style={L}>Order number</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...I, flex: 1 }} value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="e.g. 1234" onKeyDown={e => e.key === 'Enter' && lookup()} />
                <button onClick={lookup} disabled={looking} style={{ padding: '0 16px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{looking ? '…' : 'Look up'}</button>
              </div>

              {/* Recent orders for this customer — pick without knowing the number */}
              {!order && (
                <div style={{ marginTop: 14 }}>
                  <label style={L}>{loadingRecent ? 'Loading orders…' : recentOrders.length ? 'Recent orders' : ''}</label>
                  {recentOrders.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
                      {recentOrders.map((o, i) => {
                        const num = o.number || o.order_number || o.id
                        return (
                          <button key={num} onClick={() => { setOrderNumber(String(num)); setTimeout(() => lookup(), 0) }}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', textAlign: 'left' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>#{num}</span>
                                {i === 0 && <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.05em', padding: '2px 6px', borderRadius: 5, background: 'var(--coral)', color: '#fff' }}>RECENT</span>}
                                <span style={{ fontSize: 11, color: 'var(--slate)', textTransform: 'capitalize' }}>{o.status}</span>
                              </div>
                              <div style={{ fontSize: 11.5, color: 'var(--slate)', marginTop: 2 }}>{o.date_created ? new Date(o.date_created).toLocaleDateString() : ''}{o.line_items?.length ? ` · ${o.line_items.length} item${o.line_items.length > 1 ? 's' : ''}` : ''}</div>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{o.currency_symbol || '$'}{o.total}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {order && (
                <>
                  {/* Order summary */}
                  <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 14px', background: 'var(--canvas)', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
                        <span>Order #{order.order_number}</span>
                        <span style={{ textTransform: 'capitalize', fontSize: 11, color: 'var(--slate)' }}>{order.status}</span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--slate)' }}>
                        {order.first_name} {order.last_name} · {order.email}<br />{order.phone}<br />{order.address}
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--slate)' }}>Paid via {order.payment_method}</p>
                    </div>

                    {/* Items with selection */}
                    <div style={{ padding: '8px 14px' }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', margin: '4px 0 8px' }}>Select items to refund</p>
                      {(order.items || []).map((it: any) => (
                        <label key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', cursor: 'pointer' }}>
                          <input type="checkbox" checked={!!selected[it.id]} onChange={e => setSelected(s => ({ ...s, [it.id]: e.target.checked }))} />
                          <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{it.name} <span style={{ color: 'var(--slate)' }}>× {it.quantity}</span></span>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>${it.total}</span>
                        </label>
                      ))}
                    </div>

                    {/* Totals */}
                    <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', fontSize: 12.5, color: 'var(--slate)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>${order.subtotal}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Shipping</span><span>${order.shipping_total}</span></div>
                      {parseFloat(order.already_refunded) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626' }}><span>Already refunded</span><span>-${order.already_refunded}</span></div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}><span>Order total</span><span>${order.total}</span></div>
                    </div>
                  </div>

                  {/* Refund amount override */}
                  <label style={L}>Refund amount (leave blank to refund selected items: ${selectedTotal.toFixed(2)})</label>
                  <input style={I} value={customAmount} onChange={e => setCustomAmount(e.target.value)} placeholder={`${selectedTotal.toFixed(2)}`} />

                  <label style={L}>Notes (reason)</label>
                  <textarea style={{ ...I, minHeight: 54, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Arrived cracked, customer sent photos." />

                  {/* Actions */}
                  <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button onClick={() => process('refund')} disabled={processing}
                      style={{ padding: '12px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                      {processing ? 'Processing…' : `💳 Refund to original payment (${order.currency || 'AUD'} $${customAmount || selectedTotal.toFixed(2)})`}
                    </button>
                    <button onClick={() => process('coupon')} disabled={processing}
                      style={{ padding: '12px', borderRadius: 10, background: '#fff', color: 'var(--ink)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      🎟️ Issue store credit (one-time coupon)
                    </button>
                    <button onClick={() => process('resend')} disabled={processing}
                      style={{ padding: '12px', borderRadius: 10, background: '#fff', color: 'var(--ink)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      📦 Resend / replace item
                    </button>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--slate)', marginTop: 10, lineHeight: 1.5 }}>
                    Refunds go back to the original payment method via WooCommerce. Store credit creates a one-time coupon locked to the customer's email.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
