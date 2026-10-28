'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// Default customer-facing DOA messages. The business can override these in
// CRM settings → Order Automation → "DOA claim messages"; {amount} and {code}
// are filled in per claim.
const DOA_DEFAULTS: Record<string, string> = {
  refund: "We're sorry your order arrived damaged. We've refunded {amount} — it should appear on your original payment method within 3–5 business days.",
  coupon: "We're sorry your order arrived damaged. We've issued you {amount} in store credit — use code {code} at checkout.",
  resend: "We're sorry your order arrived damaged. A replacement is on its way at no charge — we'll send tracking once it ships.",
}

// The DOA claim panel. Pre-fills name/phone/email from the chat contact, looks
// up the order by number from WooCommerce, lets the agent select items or an
// amount, and processes a refund / store credit / resend.
export default function DoaPanel({ companyId, conversationId, contactId, contact, channel, channelLabel, onDeliver, onClose, onDone }: {
  companyId: string
  conversationId?: string | null
  contactId?: string | null
  contact?: any
  channel?: string | null
  channelLabel?: string | null
  onDeliver?: (opts: { body: string; url?: string | null; subject?: string }) => Promise<string>
  onClose: () => void
  onDone?: (msg: string) => void
}) {
  const [orderNumber, setOrderNumber] = useState('')
  const [order, setOrder] = useState<any>(null)
  const [looking, setLooking] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Record<number, boolean>>({})
  const [refundShipping, setRefundShipping] = useState(false)
  const [customAmount, setCustomAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<string>('')
  const [recentOrders, setRecentOrders] = useState<any[]>([])
  const [loadingRecent, setLoadingRecent] = useState(false)
  // Notify the customer on their channel by default; the agent can untick for a
  // delicate case they'd rather handle by hand.
  const [notify, setNotify] = useState(true)
  const canNotify = !!(onDeliver && (channel || contact?.email))

  // The business's DOA message templates (CRM settings → Order Automation).
  const [doaTemplates, setDoaTemplates] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      try {
        const { data } = await (supabase as any).from('companies').select('order_chat_automation').eq('id', companyId).maybeSingle()
        setDoaTemplates(data?.order_chat_automation?.doa || {})
      } catch { /* fall back to defaults */ }
    })()
  }, [companyId])

  // Load the customer's recent orders so the agent can pick one without knowing
  // the number (the most recent is tagged RECENT). Search still works too.
  useEffect(() => {
    const email = contact?.email
    if (!email || !companyId) return
    setLoadingRecent(true)
    authFetch(`/api/orders/list?companyId=${companyId}&email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(d => {
        const list = (d.orders || []).slice().sort((a: any, b: any) => new Date(b.date_created || b.created_at || 0).getTime() - new Date(a.date_created || a.created_at || 0).getTime())
        setRecentOrders(list)
      })
      .catch(() => {})
      .finally(() => setLoadingRecent(false))
  }, [companyId, contact?.email])

  // Takes the number to look up: picking one of the recent orders used to set
  // the field and then call this from the same render, which still saw the old
  // (empty) number, so the first click did nothing.
  const [picking, setPicking] = useState<string | null>(null)
  const lookup = async (num: string = orderNumber) => {
    const n = String(num).trim()
    if (!n) return
    setLooking(true); setError(''); setOrder(null)
    try {
      const res = await authFetch(`/api/doa/order?companyId=${companyId}&order=${encodeURIComponent(n)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Order not found')
      setOrder(data.order)
      // Auto-select all items by default
      const sel: Record<number, boolean> = {}
      ;(data.order.items || []).forEach((it: any) => { sel[it.id] = true })
      setSelected(sel)
    } catch (e: any) { setError(e.message) } finally { setLooking(false); setPicking(null) }
  }
  const pick = (num: string) => { setOrderNumber(num); setPicking(num); lookup(num) }

  const selectedItems = order ? (order.items || []).filter((it: any) => selected[it.id]) : []
  const selectedTotal = selectedItems.reduce((s: number, it: any) => s + (parseFloat(it.total) || 0), 0)
  const shippingTotal = order ? (parseFloat(order.shipping_total) || 0) : 0
  const shipRefund = refundShipping ? shippingTotal : 0
  const refundDefault = selectedTotal + shipRefund

  const process = async (resolution: 'refund' | 'coupon' | 'resend') => {
    if (!order) return
    setProcessing(true); setError('')
    try {
      const amount = customAmount ? customAmount : (resolution === 'refund' ? refundDefault.toFixed(2) : undefined)
      const res = await authFetch('/api/doa/process', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, conversationId, contactId, order, resolution,
          selectedItems: resolution === 'refund' && !customAmount ? selectedItems : undefined,
          shipping: resolution === 'refund' && !customAmount ? shipRefund : 0,
          amount, notes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not process')

      // Notify the customer on their channel, matching the resolution.
      if (notify && canNotify) {
        const amt = amount ? `$${parseFloat(amount).toFixed(2)}` : ''
        let url: string | null = null
        if (resolution === 'coupon') url = (data.shop_url as string) || null
        // Use the business's template if set, else the default, and fill in the
        // per-claim {amount} / {code}.
        const tpl = (doaTemplates[resolution]?.trim()) || DOA_DEFAULTS[resolution]
        const body = tpl.replace(/\{amount\}/g, amt).replace(/\{code\}/g, data.code || '')
        try {
          const how = await onDeliver!({ subject: `About your order #${order.number || order.id}`, body, url })
          setResult(`${data.message || 'Done'} · ${how}`)
        } catch (e: any) {
          setResult(`${data.message || 'Done'} · couldn't message the customer: ${e.message}`)
        }
      } else {
        setResult(data.message || 'Done')
      }
      onDone?.(data.message)
    } catch (e: any) { setError(e.message) } finally { setProcessing(false) }
  }

  const money = (v: any) => `$${(parseFloat(v) || 0).toFixed(2)}`
  const STATUS_TONE: Record<string, string> = { completed: '#16a34a', processing: '#2563eb', 'on-hold': '#d97706', pending: '#ea580c', refunded: '#7c3aed', cancelled: '#dc2626', failed: '#dc2626' }
  const statusTag = (st: string) => st ? (
    <span className="doa-tag" style={{ ['--tag' as any]: STATUS_TONE[String(st).toLowerCase()] || '#71717a' }}><span className="doa-tag-dot" />{String(st).replace(/-/g, ' ')}</span>
  ) : null
  const ic = (d: React.ReactNode, size = 17) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>

  return (
    <div className="doa-scrim" onClick={onClose}>
      <style>{`
        .doa-scrim { position: fixed; inset: 0; z-index: 10000; display: flex; justify-content: flex-end; background: rgba(17,17,20,.32); animation: doaFade .2s ease both; }
        .doa-sheet { width: 460px; max-width: 100%; height: 100%; overflow-y: auto; background: #fff; box-shadow: -16px 0 48px rgba(0,0,0,.16); animation: doaIn .32s cubic-bezier(.22,1,.36,1) both; }
        @keyframes doaFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes doaIn { from { transform: translateX(24px); opacity: .6 } to { transform: none; opacity: 1 } }
        .doa-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 22px 24px 14px; background: rgba(255,255,255,.96); backdrop-filter: blur(8px); }
        .doa-x { width: 36px; height: 36px; flex-shrink: 0; border: none; border-radius: 999px; background: #f4f4f5; color: #52525b; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background .15s; }
        .doa-x:hover { background: #ececef; color: #18181b; }
        .doa-body { padding: 4px 24px 28px; }
        .doa-who { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; background: #f6f6f7; }
        .doa-av { width: 38px; height: 38px; flex-shrink: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--coral) 14%, #fff); color: var(--coral); font-weight: 700; font-size: 15px; }
        .doa-label { display: block; margin: 20px 0 8px; font-size: 13.5px; font-weight: 600; color: #18181b; }
        .doa-input { width: 100%; box-sizing: border-box; height: 42px; padding: 0 14px; border: 1.5px solid transparent; border-radius: 12px; background: #f4f4f5; font: inherit; font-size: 14px; color: #111; outline: none; transition: background .15s, border-color .15s, box-shadow .15s; }
        textarea.doa-input { height: auto; min-height: 64px; padding: 11px 14px; resize: vertical; line-height: 1.45; }
        .doa-input:focus { background: #fff; border-color: #d4d4d8; box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 16%, transparent); }
        .doa-input::placeholder { color: #a1a1aa; }
        .doa-orders { display: flex; flex-direction: column; gap: 8px; }
        .doa-order { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 14px; border: none; border-radius: 14px; background: #fff; box-shadow: 0 0 0 1px #ececf0; font: inherit; text-align: left; cursor: pointer; transition: box-shadow .15s, background .15s, transform .1s; }
        .doa-order:hover { background: #fafafa; box-shadow: 0 0 0 1px #e4e4e7, 0 4px 14px rgba(0,0,0,.05); }
        .doa-order:active { transform: scale(.99); }
        .doa-order:focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }
        .doa-order:disabled { cursor: default; }
        .doa-tag { display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 8px 0 7px; border-radius: 999px; background: color-mix(in srgb, var(--tag) 9%, #fff); color: color-mix(in srgb, var(--tag) 88%, #000); font-size: 11.5px; font-weight: 600; text-transform: capitalize; white-space: nowrap; }
        .doa-tag-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--tag); }
        .doa-spin { width: 16px; height: 16px; border-radius: 50%; border: 2px solid #e4e4e7; border-top-color: var(--coral); animation: doaSpin .7s linear infinite; flex-shrink: 0; }
        @keyframes doaSpin { to { transform: rotate(360deg) } }
        .doa-skel { height: 62px; border-radius: 14px; background: linear-gradient(90deg, #f4f4f5 25%, #fafafa 50%, #f4f4f5 75%); background-size: 200% 100%; animation: doaShim 1.2s ease-in-out infinite; }
        @keyframes doaShim { from { background-position: 200% 0 } to { background-position: -200% 0 } }
        .doa-card { margin-top: 18px; border-radius: 16px; box-shadow: 0 0 0 1px #ececf0; overflow: hidden; }
        .doa-item { display: flex; align-items: center; gap: 12px; padding: 9px 0; cursor: pointer; font-size: 13.5px; color: #18181b; }
        .doa-item input { width: 17px; height: 17px; margin: 0; accent-color: var(--coral); flex-shrink: 0; }
        .doa-link { display: inline-flex; align-items: center; gap: 4px; padding: 0; border: none; background: none; font: inherit; font-size: 13px; font-weight: 600; color: var(--coral); cursor: pointer; }
        .doa-act { width: 100%; height: 46px; font-size: 14.5px; }
        .doa-act svg { color: currentColor !important; }
        @media (prefers-reduced-motion: reduce) { .doa-scrim, .doa-sheet, .doa-skel { animation: none; } }
      `}</style>
      <div className="doa-sheet" role="dialog" aria-modal="true" aria-label="DOA claim" onClick={e => e.stopPropagation()}>
        <div className="doa-head">
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: '#111' }}>DOA claim</h2>
            <p style={{ margin: '3px 0 0', fontSize: 13.5, color: '#71717a' }}>Dead on arrival or faulty item</p>
          </div>
          <button type="button" className="doa-x" onClick={onClose} aria-label="Close">{ic(<path d="M6 6l12 12M18 6 6 18" />, 16)}</button>
        </div>

        <div className="doa-body">
          {result ? (
            <div style={{ textAlign: 'center', padding: '36px 8px' }}>
              <div style={{ width: 64, height: 64, margin: '0 auto 16px', borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {ic(<polyline points="20 6 9 17 4 12" />, 30)}
              </div>
              <p style={{ margin: 0, fontSize: 15, color: '#18181b', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{result.replace(/\*\*/g, '')}</p>
              <button type="button" onClick={onClose} className="cv-btn cv-btn-primary" style={{ marginTop: 22, padding: '0 28px' }}>Done</button>
            </div>
          ) : (
            <>
              {/* Who it's for, from the chat */}
              {contact && (
                <div className="doa-who">
                  <span className="doa-av" aria-hidden>{String(contact.name || contact.email || '?').charAt(0).toUpperCase()}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 650, color: '#18181b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.name || 'Customer'}</div>
                    <div style={{ fontSize: 12.5, color: '#71717a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[contact.phone, contact.email].filter(Boolean).join(' · ') || 'From this chat'}</div>
                  </div>
                </div>
              )}

              {error && <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 12, background: '#fef2f2', fontSize: 13, color: '#b91c1c' }}>{error}</div>}

              {!order && (
                <>
                  {/* Look an order up by number… */}
                  <label className="doa-label" htmlFor="doa-num">Order number</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input id="doa-num" className="doa-input" style={{ flex: 1 }} value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="e.g. 1234" inputMode="numeric" onKeyDown={e => { if (e.key === 'Enter') lookup() }} />
                    <button type="button" onClick={() => lookup()} disabled={looking || !orderNumber.trim()} className="cv-btn cv-btn-dark" style={{ height: 42, flexShrink: 0 }}>
                      {looking && !picking ? <span className="doa-spin" style={{ borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }} /> : 'Look up'}
                    </button>
                  </div>

                  {/* …or pick one of theirs */}
                  {(loadingRecent || recentOrders.length > 0) && <span className="doa-label">Their recent orders</span>}
                  {loadingRecent && <div className="doa-orders">{[0, 1, 2].map(i => <div key={i} className="doa-skel" />)}</div>}
                  {!loadingRecent && recentOrders.length > 0 && (
                    <div className="doa-orders">
                      {recentOrders.map((o, i) => {
                        const num = String(o.number || o.order_number || o.id)
                        const items = o.line_items?.length || 0
                        return (
                          <button key={num} type="button" className="doa-order" onClick={() => pick(num)} disabled={looking}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 14.5, fontWeight: 700, color: '#18181b' }}>#{num}</span>
                                {statusTag(o.status)}
                                {i === 0 && <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--coral)' }}>Most recent</span>}
                              </div>
                              <div style={{ marginTop: 3, fontSize: 12.5, color: '#71717a' }}>
                                {[o.date_created ? new Date(o.date_created).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '', items ? `${items} item${items > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')}
                              </div>
                            </div>
                            <span style={{ fontSize: 14.5, fontWeight: 700, color: '#18181b' }}>{o.currency_symbol || '$'}{o.total}</span>
                            {picking === num ? <span className="doa-spin" /> : <span style={{ color: '#a1a1aa', display: 'flex' }}>{ic(<polyline points="9 18 15 12 9 6" />, 16)}</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </>
              )}

              {order && (
                <>
                  {(recentOrders.length > 0 || orderNumber) && (
                    <button type="button" className="doa-link" style={{ marginTop: 18 }} onClick={() => { setOrder(null); setError(''); setCustomAmount('') }}>
                      {ic(<polyline points="15 18 9 12 15 6" />, 15)} Choose another order
                    </button>
                  )}
                  {/* The order */}
                  <div className="doa-card">
                    <div style={{ padding: '14px 16px', background: '#fafafa' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 15.5, fontWeight: 750, color: '#111' }}>Order #{order.order_number}</span>
                        {statusTag(order.status)}
                      </div>
                      <p style={{ margin: '6px 0 0', fontSize: 13, color: '#52525b', lineHeight: 1.5 }}>
                        {[`${order.first_name || ''} ${order.last_name || ''}`.trim(), order.email].filter(Boolean).join(' · ')}
                        {order.phone ? <><br />{order.phone}</> : null}
                        {order.address ? <><br />{order.address}</> : null}
                      </p>
                      {order.payment_method && <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#8e8e93' }}>Paid via {order.payment_method}</p>}
                    </div>

                    {/* Items to refund */}
                    <div style={{ padding: '10px 16px 6px' }}>
                      <p style={{ margin: '2px 0 4px', fontSize: 12.5, fontWeight: 500, color: '#8e8e93' }}>Items to refund</p>
                      {(order.items || []).map((it: any) => (
                        <label key={it.id} className="doa-item">
                          <input type="checkbox" checked={!!selected[it.id]} onChange={e => setSelected(s => ({ ...s, [it.id]: e.target.checked }))} />
                          <span style={{ flex: 1, minWidth: 0 }}>{it.name} <span style={{ color: '#8e8e93' }}>× {it.quantity}</span></span>
                          <span style={{ fontWeight: 600 }}>{money(it.total)}</span>
                        </label>
                      ))}
                      {shippingTotal > 0 && (
                        <label className="doa-item" style={{ borderTop: '1px solid #f0f0f2', marginTop: 2 }}>
                          <input type="checkbox" checked={refundShipping} onChange={e => setRefundShipping(e.target.checked)} />
                          <span style={{ flex: 1 }}>Shipping{order.shipping_method ? <span style={{ color: '#8e8e93' }}> · {order.shipping_method}</span> : null}</span>
                          <span style={{ fontWeight: 600 }}>{money(order.shipping_total)}</span>
                        </label>
                      )}
                    </div>

                    {/* Totals */}
                    <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f2', fontSize: 13, color: '#71717a', display: 'grid', gap: 3 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Shipping</span><span>{money(order.shipping_total)}</span></div>
                      {parseFloat(order.already_refunded) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626' }}><span>Already refunded</span><span>-{money(order.already_refunded)}</span></div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 750, fontSize: 14, color: '#111', marginTop: 3 }}><span>Order total</span><span>{money(order.total)}</span></div>
                    </div>
                  </div>

                  {/* Refund amount override */}
                  <label className="doa-label" htmlFor="doa-amt">Refund amount</label>
                  <input id="doa-amt" className="doa-input" value={customAmount} onChange={e => setCustomAmount(e.target.value)} inputMode="decimal" placeholder={refundDefault.toFixed(2)} />
                  <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#8e8e93' }}>Leave blank to refund the ticked items{refundShipping ? ' and shipping' : ''}: {money(refundDefault)}</p>

                  <label className="doa-label" htmlFor="doa-notes">Reason</label>
                  <textarea id="doa-notes" className="doa-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Arrived cracked, customer sent photos." />

                  {/* Notify the customer on their channel */}
                  {canNotify && (
                    <label className="doa-item" style={{ marginTop: 10 }}>
                      <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} />
                      <span>Message the customer{channelLabel ? ` on ${channelLabel}` : (contact?.email ? ' by email' : '')}</span>
                    </label>
                  )}

                  {/* What to do */}
                  <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button type="button" onClick={() => process('refund')} disabled={processing} className="cv-btn cv-btn-primary doa-act">
                      {processing ? <span className="doa-spin" style={{ borderColor: 'rgba(255,255,255,.35)', borderTopColor: '#fff' }} /> : ic(<><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19" /></>)}
                      {processing ? 'Processing…' : `Refund ${order.currency && order.currency !== 'AUD' ? order.currency + ' ' : ''}$${customAmount || refundDefault.toFixed(2)} to their card`}
                    </button>
                    <button type="button" onClick={() => process('coupon')} disabled={processing} className="cv-btn doa-act">
                      {ic(<><path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 0 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z" /><path d="M13 5v2M13 11v2M13 17v2" /></>)}
                      Store credit (one-time coupon)
                    </button>
                    <button type="button" onClick={() => process('resend')} disabled={processing} className="cv-btn doa-act">
                      {ic(<><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>)}
                      Resend or replace the item
                    </button>
                  </div>
                  <p style={{ fontSize: 12, color: '#8e8e93', marginTop: 12, lineHeight: 1.55 }}>
                    Refunds go back to the original payment method through WooCommerce. Store credit is a one-time coupon locked to the customer’s email.
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
