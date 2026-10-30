'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { PlatformLogo } from '@/components/StoreLogo'
import { SkClose, SkIcon, SkStyle } from '@/components/ui/SheetKit'

// Default customer-facing DOA messages. The business can override these in
// CRM settings → Order Automation → "DOA claim messages"; {amount} and {code}
// are filled in per claim.
const DOA_DEFAULTS: Record<string, string> = {
  refund: "We're sorry your order arrived damaged. We've refunded {amount} — it should appear on your original payment method within 3–5 business days.",
  coupon: "We're sorry your order arrived damaged. We've issued you {amount} in store credit — use code {code} at checkout.",
  resend: "We're sorry your order arrived damaged. A replacement is on its way at no charge — we'll send tracking once it ships.",
}

type Resolution = 'refund' | 'coupon' | 'resend'

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
  // How to put it right; the footer button does it.
  const [resolution, setResolution] = useState<Resolution>('refund')
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

  const process = async (resolution: Resolution) => {
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
  const cur = order?.currency && order.currency !== 'AUD' ? order.currency + ' ' : ''
  const creditAmount = customAmount || (parseFloat(order?.total) || 0).toFixed(2)
  const RESOLUTIONS: { key: Resolution; title: string; sub: string; tint: string; icon: React.ReactNode }[] = [
    { key: 'refund', title: 'Refund', sub: 'Back to the card they paid with', tint: '#10b981', icon: ic(<><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19" /></>) },
    { key: 'coupon', title: 'Store credit', sub: 'A one-time coupon for their email', tint: '#f59e0b', icon: ic(<><path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 0 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z" /><path d="M13 5v2M13 11v2M13 17v2" /></>) },
    { key: 'resend', title: 'Replace it', sub: 'Send a new one at no charge', tint: '#0ea5e9', icon: ic(<><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>) },
  ]
  const goLabel = resolution === 'refund' ? `Refund ${cur}$${customAmount || refundDefault.toFixed(2)}`
    : resolution === 'coupon' ? `Send ${cur}$${creditAmount} store credit` : 'Send a replacement'

  return (
    <div className="sk-scrim side" style={{ '--sk-z': 10000 } as React.CSSProperties} onClick={onClose}>
      <SkStyle />
      <style>{DOA_CSS}</style>
      <div className="sk side doa" role="dialog" aria-modal="true" aria-labelledby="doa-title" style={{ '--sk-w': '480px' } as React.CSSProperties}
        onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape' && !processing) onClose() }}>
        <div className="sk-head">
          <span className="sk-badge" aria-hidden>{ic(<><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v3.5M12 19h.01" /></>, 21)}</span>
          <div style={{ minWidth: 0 }}>
            <h2 id="doa-title">DOA claim</h2>
            <p className="sk-sub">Dead on arrival or faulty. Refund it, credit it or send a new one.</p>
          </div>
          <SkClose onClick={onClose} />
        </div>

        <div className="sk-body">
          {result ? (
            <div className="doa-done">
              <span className="doa-done-tick" aria-hidden>{ic(<polyline points="20 6 9 17 4 12" />, 30)}</span>
              <p className="doa-done-t">Claim sorted</p>
              <p className="doa-done-s">{result.replace(/\*\*/g, '')}</p>
              <button type="button" onClick={onClose} className="sk-btn primary" style={{ width: '100%', marginTop: 24 }}>Done</button>
            </div>
          ) : (
            <>
              {/* Who it's for, from the chat */}
              {contact && (
                <div className="sk-item" style={{ marginTop: 10 }}>
                  <span className="doa-av" aria-hidden>{String(contact.name || contact.email || '?').charAt(0).toUpperCase()}</span>
                  <span className="sk-item-t">
                    <b>{contact.name || 'Customer'}</b>
                    <small style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[contact.phone, contact.email].filter(Boolean).join(' · ') || 'From this chat'}</small>
                  </span>
                </div>
              )}

              {error && <p className="sk-err" role="alert">{error}</p>}

              {!order && (
                <>
                  {/* Look an order up by number… */}
                  <label className="sk-lbl" htmlFor="doa-num">Order number</label>
                  <div className="sk-row doa-find">
                    <div className="sk-field">
                      {SkIcon.search}
                      <input id="doa-num" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="e.g. 1234" inputMode="numeric" onKeyDown={e => { if (e.key === 'Enter') lookup() }} />
                    </div>
                    <button type="button" onClick={() => lookup()} disabled={looking || !orderNumber.trim()} className="sk-btn dark">
                      {looking && !picking ? <span className="doa-spin light" aria-label="Looking it up" /> : 'Look up'}
                    </button>
                  </div>

                  {/* …or pick one of theirs */}
                  {(loadingRecent || recentOrders.length > 0) && <span className="sk-lbl">Their recent orders</span>}
                  {loadingRecent && <div className="doa-orders">{[0, 1, 2].map(i => <div key={i} className="doa-skel" style={{ animationDelay: `${i * 110}ms` }} />)}</div>}
                  {!loadingRecent && recentOrders.length > 0 && (
                    <div className="doa-orders">
                      {recentOrders.map((o, i) => {
                        const num = String(o.number || o.order_number || o.id)
                        const items = o.items?.length || o.line_items?.length || 0
                        const prexty = o.pos_source === 'prexty'
                        return (
                          <button key={num} type="button" className="doa-order" onClick={() => pick(num)} disabled={looking}>
                            <span className="doa-logo" title={prexty ? 'Prexty in-store sale' : 'WooCommerce order'}><PlatformLogo platform={prexty ? 'prexty' : 'woocommerce'} size={36} /></span>
                            <span className="sk-item-t">
                              <span className="doa-order-t">
                                <b>#{num}</b>
                                {statusTag(o.status)}
                                {i === 0 && <span className="doa-recent">Most recent</span>}
                              </span>
                              <small>
                                {[prexty ? (o.pos_sale_id ? `In store · ${o.pos_sale_id}` : 'In store') : '', (o.date || o.date_created) ? new Date(o.date || o.date_created).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '', items ? `${items} item${items > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')}
                              </small>
                            </span>
                            <span className="sk-amt">{o.currency_symbol || '$'}{o.total}</span>
                            {picking === num ? <span className="doa-spin" /> : <span className="doa-chev">{ic(<polyline points="9 18 15 12 9 6" />, 16)}</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {!loadingRecent && !recentOrders.length && !contact?.email && (
                    <p className="sk-note">Add an email to this contact to see their recent orders here.</p>
                  )}
                </>
              )}

              {order && (
                <>
                  {(recentOrders.length > 0 || orderNumber) && (
                    <button type="button" className="doa-back" onClick={() => { setOrder(null); setError(''); setCustomAmount('') }}>
                      {ic(<polyline points="15 18 9 12 15 6" />, 15)} Choose another order
                    </button>
                  )}
                  {/* The order */}
                  <div className="sk-card doa-card">
                    <div className="doa-card-top">
                      <span className="doa-card-t">Order #{order.order_number}</span>
                      {statusTag(order.status)}
                    </div>
                    <p className="doa-card-s">
                      {[`${order.first_name || ''} ${order.last_name || ''}`.trim(), order.email].filter(Boolean).join(' · ')}
                      {order.phone ? <><br />{order.phone}</> : null}
                      {order.address ? <><br />{order.address}</> : null}
                    </p>
                    {order.payment_method && <p className="doa-card-s" style={{ marginTop: 4 }}>Paid via {order.payment_method}</p>}
                  </div>

                  {/* What arrived damaged */}
                  <span className="sk-lbl">What arrived damaged?</span>
                  {(order.items || []).map((it: any) => (
                    <label key={it.id} className={`sk-check box doa-line${selected[it.id] ? ' on' : ''}`}>
                      <input type="checkbox" checked={!!selected[it.id]} onChange={e => setSelected(s => ({ ...s, [it.id]: e.target.checked }))} />
                      <span style={{ flex: 1, minWidth: 0 }}>{it.name} <span style={{ color: 'var(--sk-muted)' }}>× {it.quantity}</span></span>
                      <span className="sk-amt">{money(it.total)}</span>
                    </label>
                  ))}
                  {shippingTotal > 0 && (
                    <label className={`sk-check box doa-line${refundShipping ? ' on' : ''}`}>
                      <input type="checkbox" checked={refundShipping} onChange={e => setRefundShipping(e.target.checked)} />
                      <span style={{ flex: 1, minWidth: 0 }}>Shipping{order.shipping_method ? <span style={{ color: 'var(--sk-muted)' }}> · {order.shipping_method}</span> : null}</span>
                      <span className="sk-amt">{money(order.shipping_total)}</span>
                    </label>
                  )}

                  <div className="sk-sum">
                    <div className="sk-sum-r"><span>Subtotal</span><b>{money(order.subtotal)}</b></div>
                    <div className="sk-sum-r"><span>Shipping</span><b>{money(order.shipping_total)}</b></div>
                    {parseFloat(order.already_refunded) > 0 && <div className="sk-sum-r"><span>Already refunded</span><b style={{ color: '#dc2626' }}>-{money(order.already_refunded)}</b></div>}
                    <div className="sk-sum-r total"><span>Order total</span><b>{money(order.total)}</b></div>
                  </div>

                  {/* How to put it right */}
                  <span className="sk-lbl">How do you want to fix it?</span>
                  <div className="doa-fixes" role="radiogroup" aria-label="How to fix it">
                    {RESOLUTIONS.map(r => (
                      <button key={r.key} type="button" role="radio" aria-checked={resolution === r.key} className={`doa-fix${resolution === r.key ? ' on' : ''}`}
                        style={{ '--tint': r.tint } as React.CSSProperties} onClick={() => setResolution(r.key)}>
                        <span className="doa-fix-ic" aria-hidden>{r.icon}</span>
                        <b>{r.title}</b>
                        <small>{r.sub}</small>
                      </button>
                    ))}
                  </div>

                  {resolution !== 'resend' && (
                    <>
                      <label className="sk-lbl" htmlFor="doa-amt">{resolution === 'refund' ? 'Refund amount' : 'Credit amount'} <span className="sk-opt">optional</span></label>
                      <div className="sk-field">
                        <span className="sk-pre">$</span>
                        <input id="doa-amt" value={customAmount} onChange={e => setCustomAmount(e.target.value)} inputMode="decimal" placeholder={resolution === 'refund' ? refundDefault.toFixed(2) : (parseFloat(order.total) || 0).toFixed(2)} />
                      </div>
                      <p className="sk-note">
                        {resolution === 'refund'
                          ? `Leave blank to refund the ticked items${refundShipping ? ' and shipping' : ''}: ${money(refundDefault)}.`
                          : `Leave blank for the order total: ${money(order.total)}.`}
                      </p>
                    </>
                  )}

                  <label className="sk-lbl" htmlFor="doa-notes">Reason <span className="sk-opt">optional</span></label>
                  <textarea id="doa-notes" className="sk-in" style={{ minHeight: 72 }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Arrived cracked, customer sent photos." />

                  {/* Notify the customer on their channel */}
                  {canNotify && (
                    <label className="sk-check box" style={{ marginTop: 12 }}>
                      <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} />
                      <span>Message the customer{channelLabel ? ` on ${channelLabel}` : (contact?.email ? ' by email' : '')}</span>
                    </label>
                  )}

                  <p className="sk-note">
                    Refunds go back to the original payment method through your store. Store credit is a one-time coupon locked to the customer&rsquo;s email.
                  </p>
                </>
              )}
            </>
          )}
        </div>

        {order && !result && (
          <div className="sk-foot">
            <div className="sk-actions" style={{ marginTop: 0 }}>
              <button type="button" className="sk-btn" onClick={onClose} disabled={processing}>Cancel</button>
              <button type="button" className="sk-btn primary" onClick={() => process(resolution)} disabled={processing}>
                {processing ? <><span className="doa-spin light" aria-hidden /> Processing…</> : goLabel}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const DOA_CSS = `
.doa .sk-body{padding-top:0}
.doa-av{width:40px;height:40px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--card,#fff);color:var(--coral,#ff7a6b);font-weight:800;font-size:15px}
.doa-find>.sk-field{flex:1}
.doa-find>.sk-btn{flex:0 0 auto;min-width:104px}
.doa-orders{display:flex;flex-direction:column;gap:8px}
.doa-order{display:flex;align-items:center;gap:12px;width:100%;padding:11px 12px 11px 11px;border:none;border-radius:18px;background:var(--sk-fill);font:inherit;text-align:left;color:var(--ink);cursor:pointer;transition:background .15s,transform .12s}
.doa-order:hover{background:var(--sk-fill-2)}
.doa-order:active{transform:scale(.99)}
.doa-order:disabled{cursor:default}
.doa-order-t{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.doa-order-t b{font-size:14.5px;font-weight:700}
.doa-recent{font-size:11.5px;font-weight:650;color:var(--coral,#ff7a6b)}
.doa-logo{display:inline-flex;flex-shrink:0;border-radius:10px;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.doa-chev{display:flex;color:var(--sk-muted)}
.doa-tag{display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 8px 0 7px;border-radius:999px;background:color-mix(in srgb,var(--tag) 11%,var(--card,#fff));color:color-mix(in srgb,var(--tag) 85%,var(--ink));font-size:11.5px;font-weight:600;text-transform:capitalize;white-space:nowrap}
.doa-tag-dot{width:6px;height:6px;border-radius:50%;background:var(--tag)}
.doa-spin{width:16px;height:16px;flex-shrink:0;border-radius:50%;border:2px solid var(--sk-fill-2);border-top-color:var(--coral,#ff7a6b);animation:doaSpin .7s linear infinite}
.doa-spin.light{border-color:rgba(255,255,255,.35);border-top-color:#fff}
.doa-skel{height:62px;border-radius:18px;background:linear-gradient(90deg,var(--sk-fill) 25%,var(--sk-fill-2) 50%,var(--sk-fill) 75%);background-size:200% 100%;animation:doaShim 1.2s ease-in-out infinite}
.doa-back{display:inline-flex;align-items:center;gap:4px;margin-top:14px;padding:0;border:none;background:none;font:inherit;font-size:13.5px;font-weight:650;color:var(--coral,#ff7a6b);cursor:pointer}
.doa-card{margin-top:12px}
.doa-card-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.doa-card-t{font-family:var(--font-display),-apple-system,sans-serif;font-size:17px;font-weight:700;letter-spacing:-.02em;color:var(--ink)}
.doa-card-s{margin:6px 0 0;font-size:13px;line-height:1.5;color:var(--sk-muted);overflow-wrap:anywhere}
.doa-line{transition:box-shadow .15s,background .15s}
.doa-line.on{background:var(--card,#fff);box-shadow:inset 0 0 0 1.5px var(--sk-fill-2)}
.doa-fixes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.doa-fix{display:flex;flex-direction:column;align-items:flex-start;gap:3px;padding:12px;border:none;border-radius:18px;background:var(--sk-fill);font:inherit;text-align:left;color:var(--ink);cursor:pointer;box-shadow:inset 0 0 0 1.5px transparent;transition:box-shadow .15s,background .15s}
.doa-fix:hover{background:var(--sk-fill-2)}
.doa-fix.on{background:var(--card,#fff);box-shadow:inset 0 0 0 2px var(--tint)}
.doa-fix-ic{width:34px;height:34px;margin-bottom:6px;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;color:var(--tint);background:color-mix(in srgb,var(--tint) 14%,transparent)}
.doa-fix b{font-size:14px;font-weight:700}
.doa-fix small{font-size:12px;line-height:1.35;color:var(--sk-muted)}
.doa-done{text-align:center;padding:30px 4px 6px}
.doa-done-tick{width:68px;height:68px;margin:0 auto 16px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#dcfce7;color:#16a34a;animation:doaTick .5s cubic-bezier(.34,1.56,.64,1) both}
.doa-done-t{margin:0;font-family:var(--font-display),-apple-system,sans-serif;font-size:22px;font-weight:700;letter-spacing:-.02em;color:var(--ink)}
.doa-done-s{margin:8px 0 0;font-size:14.5px;line-height:1.55;color:var(--sk-muted);white-space:pre-wrap}
[data-theme="dark"] .doa-done-tick{background:rgba(22,163,74,.16);color:#4ade80}
@keyframes doaSpin{to{transform:rotate(360deg)}}
@keyframes doaShim{from{background-position:200% 0}to{background-position:-200% 0}}
@keyframes doaTick{from{transform:scale(.4);opacity:0}to{transform:none;opacity:1}}
@media (max-width:420px){
  .doa-fixes{grid-template-columns:1fr}
  .doa-fix{flex-direction:row;align-items:center;gap:12px;flex-wrap:wrap}
  .doa-fix-ic{margin:0}
  .doa-fix b{flex:1}
  .doa-fix small{flex-basis:100%;padding-left:46px;margin-top:-8px}
}
@media (prefers-reduced-motion:reduce){.doa-skel,.doa-spin,.doa-done-tick{animation:none}}
`
