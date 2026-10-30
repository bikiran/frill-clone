'use client'

import { useEffect, useRef, useState } from 'react'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import { StoreLogo, platformName } from '@/components/StoreLogo'
import ProductResults, { useProductSearch } from '@/components/ProductResults'
import { authFetch } from '@/lib/auth-fetch'
import { supabase } from '@/lib/supabase'
import { deliverToCustomer } from '@/lib/deliver-to-customer'
import { SkClose, SkIcon, SkStyle } from '@/components/ui/SheetKit'

type Item = {
  key: string
  product_id?: number
  variation_id?: number
  name: string
  sku?: string
  price: string
  custom_price?: string
  custom_price_reason?: string
  quantity: number
  image?: string | null
  stock_status?: string
}

const GST_RATE = 0.10 // Australia

export default function CreateOrderPanel({ companyId, conversationId, contactId, contact, staffName, staffId, prefillCart, draft, channel, channelLabel, onDeliver, onClose, onCreated, onDraftSaved }: {
  companyId: string
  conversationId?: string | null
  contactId?: string | null
  contact?: any
  staffName?: string
  staffId?: string
  prefillCart?: any
  // A saved draft (order_drafts row) to reopen and keep editing.
  draft?: any
  channel?: string | null
  channelLabel?: string | null
  onDeliver?: (opts: { body: string; url?: string | null; subject?: string }) => Promise<string>
  onClose: () => void
  onCreated?: (order: any) => void
  onDraftSaved?: (draft: any) => void
}) {
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [sendMsg, setSendMsg] = useState('')
  // Source picker
  const [sources, setSources] = useState<any[]>([])
  const [source, setSource] = useState<any>(null)
  const [shippingMethods, setShippingMethods] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [pickupLocationId, setPickupLocationId] = useState('')

  // Customer (pre-filled, editable)
  const [editingCustomer, setEditingCustomer] = useState(false)
  const nameParts = (contact?.name || '').split(' ')
  const [cust, setCust] = useState({
    first_name: nameParts[0] || '', last_name: nameParts.slice(1).join(' ') || '',
    email: contact?.email || '', phone: contact?.phone || '',
    address_1: contact?.address || '', city: '', state: '', postcode: '', company: contact?.company || '',
    ship_same: true, ship_address_1: '', ship_city: '', ship_state: '', ship_postcode: '',
    // On by default: tie the order to a real customer account so the pay link
    // works even when the store has guest checkout turned off.
    createAccount: true,
  })

  // Products
  const [items, setItems] = useState<Item[]>([])
  const [search, setSearch] = useState('')

  // Customer search (contacts in this workspace)
  const [custQuery, setCustQuery] = useState('')
  const [custResults, setCustResults] = useState<any[]>([])
  const [custSearching, setCustSearching] = useState(false)
  const [picked, setPicked] = useState<any>(contact || null)

  // Drafts
  const [draftId, setDraftId] = useState<string | null>(draft?.id || null)
  const [draftState, setDraftState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [draftMsg, setDraftMsg] = useState('')

  // Discounts / fees / shipping
  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null)
  const [couponError, setCouponError] = useState('')
  const [orderDiscType, setOrderDiscType] = useState<'fixed' | 'percent'>('fixed')
  const [orderDiscAmount, setOrderDiscAmount] = useState('')
  const [orderDiscLabel, setOrderDiscLabel] = useState('')
  const [fees, setFees] = useState<{ name: string; amount: string }[]>([])
  const [shipMethod, setShipMethod] = useState('flat')
  const [shipLabel, setShipLabel] = useState('Shipping')
  const [shipCost, setShipCost] = useState('')

  // Notes / status
  const [customerNote, setCustomerNote] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [status, setStatus] = useState('pending')

  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)
  const [stockWarnings, setStockWarnings] = useState<string[]>([])

  const [sourcesLoading, setSourcesLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      setSourcesLoading(true)
      try {
        const res = await authFetch(`/api/orders/sources?companyId=${companyId}`)
        const data = await res.json()
        setSources(data.sources || [])
        setLocations(data.locations || [])
        const firstWoo = (data.sources || []).find((s: any) => s.platform === 'woocommerce')
        const fromDraft = draft?.payload?.source_id ? (data.sources || []).find((s: any) => s.id === draft.payload.source_id) : null
        const chosen = fromDraft || firstWoo || (data.sources || [])[0] || null
        setSource(chosen)
        // Fetch shipping methods in the background — don't block the panel.
        if (chosen?.platform === 'woocommerce') {
          authFetch(`/api/orders/shipping?companyId=${companyId}&integrationId=${chosen.id}`)
            .then(r => r.json()).then(d => setShippingMethods(d.shippingMethods || [])).catch(() => {})
        }
      } catch {} finally { setSourcesLoading(false) }
    })()
  }, [companyId])

  // Seed from an abandoned cart, if provided.
  useEffect(() => {
    if (!prefillCart) return
    if (Array.isArray(prefillCart.items) && prefillCart.items.length) {
      setItems(prefillCart.items.map((it: any, i: number) => ({
        key: `pre-${i}-${Date.now()}`,
        product_id: it.product_id || undefined,
        variation_id: it.variation_id || undefined,
        name: it.name || 'Item',
        sku: it.sku || undefined,
        price: String(it.price ?? '0'),
        quantity: it.quantity || 1,
        image: null,
      })))
    }
    if (prefillCart.coupon) setCouponCode(prefillCart.coupon)
    if (prefillCart.notes) setCustomerNote(prefillCart.notes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillCart])

  // Reopen a saved draft exactly as it was left.
  const restored = useRef(false)
  useEffect(() => {
    if (!draft?.payload || restored.current) return
    restored.current = true
    const d = draft.payload
    if (d.cust) setCust((c: any) => ({ ...c, ...d.cust }))
    if (Array.isArray(d.items)) setItems(d.items)
    if (d.picked) setPicked(d.picked)
    setCouponCode(d.couponCode || ''); setAppliedCoupon(d.appliedCoupon || null)
    setOrderDiscType(d.orderDiscType || 'fixed'); setOrderDiscAmount(d.orderDiscAmount || ''); setOrderDiscLabel(d.orderDiscLabel || '')
    setFees(Array.isArray(d.fees) ? d.fees : [])
    setShipMethod(d.shipMethod || 'flat'); setShipLabel(d.shipLabel || 'Shipping'); setShipCost(d.shipCost || '')
    setPickupLocationId(d.pickupLocationId || '')
    setCustomerNote(d.customerNote || ''); setInternalNote(d.internalNote || '')
    if (d.status) setStatus(d.status)
  }, [draft])

  // Products: searched on the device from the synced catalogue.
  const productSearchOn = !!source && ['woocommerce', 'shopify'].includes(source.platform)
  const { results, loading: searching } = useProductSearch(companyId, search, { integrationId: source?.id || null, enabled: productSearchOn })

  const addProduct = (p: any, v?: any) => {
    if (v) {
      setItems(prev => [...prev, { key: `${p.id}-${v.id}-${Date.now()}`, product_id: p.id, variation_id: v.id, name: v.attributes ? `${p.name} (${v.attributes})` : p.name, sku: v.sku || p.sku, price: v.price || '0', quantity: 1, image: v.image || p.image, stock_status: v.stock_status }])
    } else {
      setItems(prev => [...prev, { key: `${p.id}-${Date.now()}`, product_id: p.id, name: p.name, sku: p.sku, price: p.price || '0', quantity: 1, image: p.image, stock_status: p.stock_status }])
    }
    setSearch('')
  }

  // Customer search: name, email or phone, from this workspace's contacts.
  useEffect(() => {
    const q = custQuery.trim().replace(/[%,()]/g, ' ').trim()
    if (q.length < 2) { setCustResults([]); setCustSearching(false); return }
    setCustSearching(true)
    const t = setTimeout(async () => {
      try {
        const digits = q.replace(/\D/g, '')
        const ors = [`name.ilike.%${q}%`, `email.ilike.%${q}%`]
        if (digits.length >= 3) ors.push(`phone.ilike.%${digits.slice(-9)}%`)
        const { data } = await (supabase as any).from('contacts')
          .select('id, name, email, phone, address, city, suburb, state, postcode, woo_customer_id')
          .eq('company_id', companyId).or(ors.join(',')).order('updated_at', { ascending: false }).limit(8)
        setCustResults(data || [])
      } catch { setCustResults([]) } finally { setCustSearching(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [custQuery, companyId])

  const pickCustomer = (c: any) => {
    const parts = String(c.name || '').trim().split(/\s+/)
    setPicked(c)
    setCust(prev => ({
      ...prev,
      first_name: parts[0] || '', last_name: parts.slice(1).join(' '),
      email: c.email || '', phone: c.phone || '',
      address_1: c.address || '', city: c.suburb || c.city || '', state: c.state || '', postcode: c.postcode || '',
    }))
    setCustQuery(''); setCustResults([])
  }

  const addCustomItem = () => {
    setItems(prev => [...prev, { key: `custom-${Date.now()}`, name: '', price: '0', custom_price: '0', quantity: 1 }])
  }

  const updateItem = (key: string, patch: Partial<Item>) => setItems(prev => prev.map(it => it.key === key ? { ...it, ...patch } : it))
  const removeItem = (key: string) => setItems(prev => prev.filter(it => it.key !== key))

  const lineTotal = (it: Item) => (parseFloat(it.custom_price != null && it.custom_price !== '' ? it.custom_price : it.price) || 0) * it.quantity
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0)

  const orderDiscountValue = (() => {
    if (!orderDiscAmount) return 0
    const amt = parseFloat(orderDiscAmount) || 0
    return orderDiscType === 'percent' ? subtotal * (amt / 100) : amt
  })()
  const feesTotal = fees.reduce((s, f) => s + (parseFloat(f.amount) || 0), 0)
  const isQuote = shipMethod === 'quote_later'
  const shippingValue = ['free', 'pickup', 'quote_later', 'none'].includes(shipMethod) ? 0 : (parseFloat(shipCost) || 0)
  const taxableBase = Math.max(0, subtotal - orderDiscountValue) + feesTotal + shippingValue
  const gst = taxableBase * GST_RATE / (1 + GST_RATE) // GST-inclusive display estimate
  const total = Math.max(0, subtotal - orderDiscountValue) + feesTotal + shippingValue

  const applyCoupon = async () => {
    if (!couponCode.trim()) return
    setCouponError('')
    try {
      const res = await authFetch('/api/orders/coupon', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, integrationId: source?.id, code: couponCode.trim(), subtotal, email: cust.email, productIds: items.map(i => i.product_id).filter(Boolean) }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) { setCouponError(data.error || 'Invalid coupon'); setAppliedCoupon(null); return }
      setAppliedCoupon(data.coupon)
    } catch (e: any) { setCouponError(e.message) }
  }

  const create = async (withPaymentLink: boolean, ignoreStock = false, statusOverride?: string) => {
    if (items.length === 0) { setError('Add at least one product.'); return }
    setCreating(true); setError(''); setStockWarnings([])
    try {
      const billing = { first_name: cust.first_name, last_name: cust.last_name, email: cust.email, phone: cust.phone, address_1: cust.address_1, city: cust.city, state: cust.state, postcode: cust.postcode, company: cust.company, country: 'AU' }
      const shipping = cust.ship_same ? billing : { first_name: cust.first_name, last_name: cust.last_name, address_1: cust.ship_address_1, city: cust.ship_city, state: cust.ship_state, postcode: cust.ship_postcode, country: 'AU' }
      const res = await authFetch('/api/orders/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, integrationId: source?.id, conversationId, contactId: picked?.id || contactId, source: source?.platform,
          customer: { existingId: source?.platform === 'woocommerce' ? (picked?.woo_customer_id ?? contact?.woo_customer_id) : undefined, createAccount: cust.createAccount, email: cust.email, first_name: cust.first_name, last_name: cust.last_name, phone: cust.phone, billing, shipping },
          items: items.map(it => ({ product_id: it.product_id, variation_id: it.variation_id, quantity: it.quantity, name: it.name, price: it.price, custom_price: it.custom_price, custom_name: it.product_id ? undefined : it.name })),
          coupons: appliedCoupon ? [appliedCoupon.code] : [],
          orderDiscount: orderDiscAmount ? { type: 'fixed', amount: orderDiscountValue.toFixed(2), label: orderDiscLabel || 'Discount' } : null,
          fees, shipping: {
            method: shipMethod.startsWith('zone:') ? 'flat' : shipMethod,
            label: shipMethod === 'pickup' && pickupLocationId ? `Pickup — ${(locations.find((l: any) => l.id === pickupLocationId)?.label || 'location')}` : shipLabel,
            cost: shipCost,
            pickup_location_id: shipMethod === 'pickup' ? pickupLocationId : undefined,
          },
          isQuote,
          customerNote, internalNote,
          status: statusOverride || (isQuote ? 'draft' : (withPaymentLink ? 'pending' : status)),
          setPaid: false,
          createdByName: staffName, staffId,
          ignoreStockWarnings: ignoreStock,
        }),
      })
      const data = await res.json()
      if (res.status === 409 && data.stockWarning) { setStockWarnings(data.problems || []); setCreating(false); return }
      if (!res.ok) throw new Error(data.error || 'Could not create order')
      setResult({ ...data.order, withPaymentLink })
      onCreated?.(data.order)
      // "Create & send payment link" sends it straight away.
      if (withPaymentLink && data.order?.pay_link) void sendLink(data.order)
      // The draft became a real order.
      if (draftId) { try { await (supabase as any).from('order_drafts').delete().eq('id', draftId) } catch {} }
    } catch (e: any) { setError(e.message) } finally { setCreating(false) }
  }

  // Send the payment link to the customer: on the conversation's channel when
  // opened from a chat, otherwise by SMS and/or email to the order's customer.
  const sendLink = async (order: any) => {
    setSendState('sending'); setSendMsg('')
    const subject = `Your order #${order.number} from us`
    const body = `Here's your order #${order.number} for ${order.currency || 'AUD'} $${(parseFloat(order.total) || 0).toFixed(2)}. Pay securely here:`
    try {
      if (onDeliver) {
        setSendMsg(await onDeliver({ subject, body, url: order.pay_link }))
      } else {
        const r = await deliverToCustomer(
          { companyId, contactId: picked?.id || contactId || null, conversationId: conversationId || null, name: `${cust.first_name} ${cust.last_name}`.trim(), email: cust.email, phone: cust.phone },
          { subject, body, url: order.pay_link, staffName },
        )
        setSendMsg(r.summary)
      }
      setSendState('sent')
    } catch (e: any) { setSendState('error'); setSendMsg(e?.message || 'Could not send the link') }
  }

  // Keep the half-built order in Colvy (Orders → Drafts) to finish later.
  const saveDraft = async () => {
    setDraftState('saving'); setDraftMsg('')
    const name = `${cust.first_name} ${cust.last_name}`.trim()
    const row: any = {
      company_id: companyId, contact_id: picked?.id || contactId || null, conversation_id: conversationId || null,
      customer_name: name || null, customer_email: cust.email || null,
      item_count: items.reduce((n, it) => n + (it.quantity || 1), 0), total: Number(total.toFixed(2)),
      payload: {
        source_id: source?.id || null, cust, items, picked: picked ? { id: picked.id, name: picked.name, email: picked.email, phone: picked.phone, woo_customer_id: picked.woo_customer_id ?? null } : null,
        couponCode, appliedCoupon, orderDiscType, orderDiscAmount, orderDiscLabel, fees,
        shipMethod, shipLabel, shipCost, pickupLocationId, customerNote, internalNote, status,
      },
      updated_by_name: staffName || null, updated_at: new Date().toISOString(),
    }
    try {
      const q = draftId
        ? (supabase as any).from('order_drafts').update(row).eq('id', draftId).select().single()
        : (supabase as any).from('order_drafts').insert({ ...row, created_by: staffId || null, created_by_name: staffName || null }).select().single()
      const { data, error } = await q
      if (error) throw error
      setDraftId(data.id); setDraftState('saved'); setDraftMsg('Draft saved. Find it under Orders → Drafts.')
      onDraftSaved?.(data)
    } catch (e: any) {
      setDraftState('error')
      setDraftMsg(/order_drafts/.test(String(e?.message || '')) ? 'Drafts need a one-time database update (COLVY_V346_ORDER_DRAFTS.sql).' : `Could not save the draft: ${e?.message || 'try again'}`)
    }
  }

  const money = (n: number) => `$${n.toFixed(2)}`
  const itemCount = items.reduce((n, it) => n + (it.quantity || 1), 0)
  const canSend = onDeliver ? (channel || contact?.email) : (cust.email || cust.phone)
  const formOpen = !result && !sourcesLoading && !!source
  const STATUSES: [string, string][] = [['draft', 'Draft'], ['pending', 'Pending payment'], ['processing', 'Processing'], ['on-hold', 'On hold'], ['completed', 'Completed']]

  return (
    <div className="sk-scrim side" style={{ '--sk-z': 10000 } as React.CSSProperties} onClick={onClose}>
      <SkStyle />
      <div className="sk side co" role="dialog" aria-modal="true" aria-labelledby="co-title" style={{ '--sk-w': '520px' } as React.CSSProperties} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
        <div className="sk-head">
          <span className="sk-badge" aria-hidden>{SkIcon.cart}</span>
          <div style={{ minWidth: 0 }}>
            <h2 id="co-title">{draft ? 'Edit draft order' : 'Create order'}</h2>
            <p className="sk-sub">{result ? 'All done. Send the customer their payment link.' : 'Pick the customer and what they’re buying. It goes straight to your store.'}</p>
          </div>
          <SkClose onClick={onClose} />
        </div>

        <div className="sk-body">
          {result ? (
            <div className="co-done">
              <span className="co-done-tick" aria-hidden>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </span>
              <p className="co-done-t">Order #{result.number} created</p>
              <p className="co-done-s">{result.currency || 'AUD'} {money(parseFloat(result.total) || 0)} · {result.status}</p>
              {result.withPaymentLink && result.pay_link && (
                <div style={{ marginTop: 20, textAlign: 'left' }}>
                  <span className="sk-lbl" style={{ marginTop: 0 }}>Payment link</span>
                  <div className="sk-field">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                    <input readOnly value={result.pay_link} onFocus={e => e.currentTarget.select()} aria-label="Payment link" style={{ fontSize: 13.5 }} />
                  </div>
                  <p className="sk-note">
                    {source?.platform === 'shopify' ? 'Opens Shopify’s checkout for this order.' : 'Opens your WooCommerce checkout for this order, with your store’s payment options.'} Once paid, the order moves from Awaiting Payment to Awaiting Shipment by itself.
                  </p>
                  <div className="sk-actions" style={{ flexWrap: 'wrap', marginTop: 14 }}>
                    <button type="button" className="sk-btn" onClick={() => { navigator.clipboard?.writeText(result.pay_link) }}>Copy link</button>
                    {/* Sent automatically by "Create & send payment link"; resend or send here. */}
                    {canSend && (
                      <button type="button" className={`sk-btn ${sendState === 'sent' ? 'co-sent' : 'dark'}`} disabled={sendState === 'sending'} onClick={() => sendLink(result)} style={{ flex: 2 }}>
                        {sendState === 'sending' ? 'Sending…'
                          : sendState === 'sent' ? `${sendMsg} · Send again`
                          : `Send to customer${onDeliver ? (channelLabel ? ` on ${channelLabel}` : (contact?.email ? ' by email' : '')) : ''}`}
                      </button>
                    )}
                  </div>
                  {sendState === 'error' && <p className="sk-err" role="alert">{sendMsg}</p>}
                </div>
              )}
              <button type="button" className="sk-btn primary" onClick={onClose} style={{ width: '100%', marginTop: 22 }}>Done</button>
            </div>
          ) : sourcesLoading ? (
            <div className="co-loading">
              <span className="co-spin" aria-hidden />
              <p>Loading your store…</p>
            </div>
          ) : !source ? (
            <div className="sk-card" style={{ marginTop: 14, textAlign: 'center', padding: '26px 18px' }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>No store connected yet</p>
              <p className="sk-note" style={{ margin: '6px 0 0' }}>Connect WooCommerce or Shopify first, then orders go straight to it.</p>
            </div>
          ) : (
            <>
              {error && <p className="sk-err" role="alert" style={{ marginBottom: 4 }}>{error}</p>}

              {/* Store: the store's own logo with its platform badge */}
              <span className="sk-lbl">Store</span>
              <StorePicker sources={sources} value={source} onChange={next => {
                setSource(next); setSearch(''); setShippingMethods([]); setAppliedCoupon(null)
                // Store shipping methods are WooCommerce's; Shopify uses the options below.
                if (next?.platform === 'woocommerce') authFetch(`/api/orders/shipping?companyId=${companyId}&integrationId=${next.id}`).then(r => r.json()).then(d => setShippingMethods(d.shippingMethods || [])).catch(() => {})
              }} />
              {source.platform === 'shopify' && (
                <p className="co-tip">An unpaid order is saved as a Shopify draft and its payment link opens Shopify’s checkout. When the customer pays, it becomes a Shopify order in this chat.</p>
              )}

              {/* Customer */}
              <div className="sk-lbl-row">
                <span className="sk-lbl">Customer</span>
                <button type="button" className="co-link" onClick={() => setEditingCustomer(v => !v)}>{editingCustomer ? 'Done' : (cust.first_name || cust.email ? 'Edit' : 'New customer')}</button>
              </div>
              <div style={{ position: 'relative' }}>
                <div className="sk-field">
                  {SkIcon.search}
                  <input value={custQuery} onChange={e => setCustQuery(e.target.value)} placeholder="Search by name, email or phone" aria-label="Search customers" />
                  {custQuery && <button type="button" className="co-clear" onClick={() => setCustQuery('')} aria-label="Clear">×</button>}
                </div>
                {custQuery.trim().length >= 2 && (
                  <div className="co-pop co-float">
                    {custSearching && custResults.length === 0 && <p className="co-pop-msg">Searching…</p>}
                    {!custSearching && custResults.length === 0 && (
                      <button type="button" onClick={() => { const q = custQuery.trim(); setCust(c => ({ ...c, ...(q.includes('@') ? { email: q, first_name: '', last_name: '' } : /^[+\d\s()-]+$/.test(q) ? { phone: q, first_name: '', last_name: '' } : { first_name: q.split(' ')[0], last_name: q.split(' ').slice(1).join(' '), email: '', phone: '' }) })); setPicked(null); setCustQuery(''); setEditingCustomer(true) }}
                        className="co-opt co-opt-new">
                        <span className="co-av" aria-hidden>{SkIcon.plus}</span>
                        <span>New customer &ldquo;{custQuery.trim()}&rdquo;</span>
                      </button>
                    )}
                    {custResults.map(c => (
                      <button type="button" key={c.id} onClick={() => pickCustomer(c)} className="co-opt">
                        <span className="co-av" aria-hidden>{String(c.name || c.email || '?').trim().charAt(0).toUpperCase()}</span>
                        <span className="sk-item-t">
                          <b>{c.name || c.email || c.phone}</b>
                          <small style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[c.email, c.phone].filter(Boolean).join(' · ') || 'No contact details'}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {!editingCustomer ? (
                (cust.first_name || cust.last_name || cust.email || cust.phone) ? (
                  <div className="sk-item" style={{ marginTop: 8 }}>
                    <span className="co-av big" aria-hidden>{String(cust.first_name || cust.email || '?').trim().charAt(0).toUpperCase()}</span>
                    <span className="sk-item-t">
                      <b>{`${cust.first_name} ${cust.last_name}`.trim() || cust.email}</b>
                      <small style={{ overflowWrap: 'anywhere' }}>{cust.email || 'No email'}{cust.phone ? ` · ${cust.phone}` : ''}</small>
                      {(cust.address_1 || cust.city) && <small style={{ overflowWrap: 'anywhere' }}>{[cust.address_1, cust.city, cust.state, cust.postcode].filter(Boolean).join(', ')}</small>}
                    </span>
                  </div>
                ) : <p className="sk-note">Search for a customer, or add a new one.</p>
              ) : (
                <div className="sk-card co-cust">
                  <div className="sk-row">
                    <div><label className="sk-lbl" htmlFor="co-fn">First name</label><input id="co-fn" className="sk-in" value={cust.first_name} onChange={e => setCust({ ...cust, first_name: e.target.value })} /></div>
                    <div><label className="sk-lbl" htmlFor="co-ln">Last name</label><input id="co-ln" className="sk-in" value={cust.last_name} onChange={e => setCust({ ...cust, last_name: e.target.value })} /></div>
                  </div>
                  <label className="sk-lbl" htmlFor="co-em">Email</label><input id="co-em" className="sk-in" type="email" value={cust.email} onChange={e => setCust({ ...cust, email: e.target.value })} />
                  <label className="sk-lbl" htmlFor="co-ph">Phone</label><input id="co-ph" className="sk-in" type="tel" value={cust.phone} onChange={e => setCust({ ...cust, phone: e.target.value })} />
                  <span className="sk-lbl">Billing address</span>
                  <AddressAutocomplete
                    value={cust.address_1}
                    onChange={(v) => setCust({ ...cust, address_1: v })}
                    onSelect={(parts) => setCust({
                      ...cust,
                      address_1: parts.line1 || parts.formatted,
                      city: parts.city || cust.city,
                      state: parts.state || cust.state,
                      postcode: parts.postcode || cust.postcode,
                    })}
                    className="sk-in"
                    placeholder="Start typing an address…"
                  />
                  <div className="sk-row co-addr" style={{ marginTop: 8 }}>
                    <input className="sk-in" value={cust.city} onChange={e => setCust({ ...cust, city: e.target.value })} placeholder="City" aria-label="City" />
                    <input className="sk-in" value={cust.state} onChange={e => setCust({ ...cust, state: e.target.value })} placeholder="State" aria-label="State" />
                    <input className="sk-in" value={cust.postcode} onChange={e => setCust({ ...cust, postcode: e.target.value })} placeholder="Postcode" aria-label="Postcode" inputMode="numeric" />
                  </div>
                  <label className="sk-check" style={{ alignItems: 'flex-start' }}>
                    <input type="checkbox" checked={cust.createAccount} onChange={e => setCust({ ...cust, createAccount: e.target.checked })} />
                    <span>Match or create a customer account <span style={{ color: 'var(--sk-muted)' }}>(recommended, as a guest order can&rsquo;t be paid via the link if the store has guest checkout off)</span></span>
                  </label>
                </div>
              )}

              {/* Products */}
              <span className="sk-lbl">Products</span>
              <div className="sk-field">
                {SkIcon.search}
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products by name or SKU" aria-label="Search products" />
                {search && <button type="button" className="co-clear" onClick={() => setSearch('')} aria-label="Clear">×</button>}
              </div>
              {search.trim().length >= 2 && (
                <div className="co-pop" style={{ marginTop: 8, maxHeight: 340 }}>
                  {searching && results.length === 0 && <p className="co-pop-msg">Searching…</p>}
                  {!searching && results.length === 0 && <p className="co-pop-msg">No products found.</p>}
                  <ProductResults dense results={results} companyId={companyId} integrationId={source?.id || null}
                    addedIds={new Set(items.flatMap(it => [it.variation_id, !it.variation_id ? it.product_id : undefined]).filter(x => x != null).map(String))}
                    onAdd={addProduct} />
                </div>
              )}

              {/* Added items */}
              {items.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  {items.map(it => {
                    const changed = it.product_id && it.custom_price != null && it.custom_price !== '' && parseFloat(it.custom_price) !== parseFloat(it.price)
                    return (
                      <div key={it.key} className="sk-item co-line">
                        <div className="co-line-top">
                          {it.image
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={it.image} alt="" className="co-thumb" />
                            : <span className="co-thumb" aria-hidden>{SkIcon.box}</span>}
                          {it.product_id ? (
                            <span className="sk-item-t"><b style={{ whiteSpace: 'normal' }}>{it.name}</b>{it.sku && <small>SKU {it.sku}</small>}</span>
                          ) : (
                            <input className="sk-in co-mini" style={{ flex: 1 }} placeholder="Custom item name" value={it.name} onChange={e => updateItem(it.key, { name: e.target.value })} aria-label="Custom item name" />
                          )}
                          <button type="button" className="sk-icon-btn danger" onClick={() => removeItem(it.key)} aria-label={`Remove ${it.name || 'item'}`}>{SkIcon.trash}</button>
                        </div>
                        <div className="co-line-bot">
                          <span className="sk-stepper">
                            <button type="button" aria-label="One fewer" onClick={() => updateItem(it.key, { quantity: Math.max(1, it.quantity - 1) })} disabled={it.quantity <= 1}>−</button>
                            <span>{it.quantity}</span>
                            <button type="button" aria-label="One more" onClick={() => updateItem(it.key, { quantity: it.quantity + 1 })}>+</button>
                          </span>
                          <label className="co-price">
                            <span>$</span>
                            <input inputMode="decimal" value={it.custom_price != null ? it.custom_price : it.price} onChange={e => updateItem(it.key, { custom_price: e.target.value })} aria-label="Price each" />
                            <small>each</small>
                          </label>
                          <span className="sk-amt" style={{ marginLeft: 'auto' }}>{money(lineTotal(it))}</span>
                        </div>
                        {changed && (
                          <input className="sk-in co-mini" style={{ marginTop: 8, background: 'var(--card,#fff)' }} placeholder="Reason for the price change (e.g. damaged box)" value={it.custom_price_reason || ''} onChange={e => updateItem(it.key, { custom_price_reason: e.target.value })} aria-label="Reason for the price change" />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              <button type="button" className="sk-add" onClick={addCustomItem}>{SkIcon.plus} Add custom item</button>

              <div className="sk-sep" />

              {/* Discounts */}
              <label className="sk-lbl" htmlFor="co-coupon">Coupon code <span className="sk-opt">optional</span></label>
              <div className="sk-row co-apply">
                <input id="co-coupon" className="sk-in" value={couponCode} onChange={e => setCouponCode(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon() } }} placeholder="e.g. WELCOME10" />
                <button type="button" className="sk-btn dark" onClick={applyCoupon} disabled={!couponCode.trim()}>Apply</button>
              </div>
              {couponError && <p className="sk-err" role="alert">{couponError}</p>}
              {appliedCoupon && <p className="co-ok">✓ Coupon {appliedCoupon.code} applies ({appliedCoupon.discount_type === 'percent' ? `${appliedCoupon.amount}%` : `$${appliedCoupon.amount}`})</p>}

              <span className="sk-lbl">Order discount <span className="sk-opt">optional</span></span>
              <div className="sk-row co-disc">
                <div className="sk-seg" role="group" aria-label="Discount type">
                  <button type="button" className={orderDiscType === 'fixed' ? 'on' : ''} aria-pressed={orderDiscType === 'fixed'} onClick={() => setOrderDiscType('fixed')}>$</button>
                  <button type="button" className={orderDiscType === 'percent' ? 'on' : ''} aria-pressed={orderDiscType === 'percent'} onClick={() => setOrderDiscType('percent')}>%</button>
                </div>
                <input className="sk-in" inputMode="decimal" value={orderDiscAmount} onChange={e => setOrderDiscAmount(e.target.value)} placeholder="0" aria-label="Discount amount" />
                <input className="sk-in" value={orderDiscLabel} onChange={e => setOrderDiscLabel(e.target.value)} placeholder="Label (e.g. Goodwill)" aria-label="Discount label" />
              </div>

              {/* Fees */}
              <span className="sk-lbl">Additional charges <span className="sk-opt">optional</span></span>
              {fees.map((f, i) => (
                <div key={i} className="sk-row co-fee" style={{ marginBottom: 8 }}>
                  <input className="sk-in" value={f.name} onChange={e => setFees(fees.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Fee name" aria-label="Fee name" />
                  <input className="sk-in" inputMode="decimal" value={f.amount} onChange={e => setFees(fees.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} placeholder="$" aria-label="Fee amount" />
                  <button type="button" className="sk-icon-btn danger" onClick={() => setFees(fees.filter((_, j) => j !== i))} aria-label="Remove fee" style={{ alignSelf: 'center' }}>{SkIcon.trash}</button>
                </div>
              ))}
              <button type="button" className="sk-add" style={{ marginTop: fees.length ? 0 : -2 }} onClick={() => setFees([...fees, { name: '', amount: '' }])}>{SkIcon.plus} Add a fee</button>

              {/* Shipping */}
              <label className="sk-lbl" htmlFor="co-ship">Shipping or pickup</label>
              <select id="co-ship" className="sk-in" value={shipMethod} onChange={e => { setShipMethod(e.target.value); const m = shippingMethods.find(sm => `zone:${sm.method_id}:${sm.title}` === e.target.value); if (m) { setShipLabel(m.title); setShipCost(m.cost || '') } }}>
                {/* Real WooCommerce methods */}
                {shippingMethods.length > 0 && <optgroup label="From your store">
                  {shippingMethods.map((m, i) => (
                    <option key={i} value={`zone:${m.method_id}:${m.title}`}>{m.title}{m.zone ? ` — ${m.zone}` : ''}{m.cost ? ` ($${m.cost})` : ''}</option>
                  ))}
                </optgroup>}
                <optgroup label="Other">
                  <option value="flat">Flat rate (custom)</option>
                  <option value="free">Free shipping</option>
                  <option value="pickup">Pickup at location</option>
                  <option value="quote_later">Quote later (send as quote)</option>
                  <option value="none">No shipping</option>
                </optgroup>
              </select>
              {(shipMethod === 'flat' || shipMethod?.startsWith('zone:')) && (
                <div className="sk-row co-fee" style={{ marginTop: 8 }}>
                  <input className="sk-in" value={shipLabel} onChange={e => setShipLabel(e.target.value)} placeholder="Label" aria-label="Shipping label" />
                  <input className="sk-in" inputMode="decimal" value={shipCost} onChange={e => setShipCost(e.target.value)} placeholder={shipMethod === 'flat' ? '$' : '$ (override)'} aria-label="Shipping cost" />
                </div>
              )}
              {shipMethod === 'pickup' && (
                locations.length > 0 ? (
                  <select className="sk-in" style={{ marginTop: 8 }} value={pickupLocationId} onChange={e => setPickupLocationId(e.target.value)} aria-label="Pickup location">
                    <option value="">Choose a pickup location…</option>
                    {locations.map((loc: any) => (
                      <option key={loc.id} value={loc.id}>{loc.label || loc.suburb || 'Location'}{loc.state ? ` — ${loc.state}` : ''}</option>
                    ))}
                  </select>
                ) : (
                  <p className="sk-note">No business locations yet. Add them in Settings → Locations.</p>
                )
              )}
              {shipMethod === 'quote_later' && (
                <p className="sk-note">Sent as a quote (a draft order). No payment is asked for until you confirm shipping.</p>
              )}

              {/* Notes */}
              <label className="sk-lbl" htmlFor="co-cn">Note to the customer <span className="sk-opt">they&rsquo;ll see this</span></label>
              <textarea id="co-cn" className="sk-in co-ta" value={customerNote} onChange={e => setCustomerNote(e.target.value)} placeholder="e.g. Please call before delivery." />
              <label className="sk-lbl" htmlFor="co-in">Internal note <span className="sk-opt">staff only</span></label>
              <textarea id="co-in" className="sk-in co-ta" value={internalNote} onChange={e => setInternalNote(e.target.value)} placeholder="Anything the team should know" />

              {/* Status */}
              <span className="sk-lbl">Order status</span>
              <div className="sk-chips" role="radiogroup" aria-label="Order status">
                {STATUSES.map(([v, label]) => (
                  <button key={v} type="button" role="radio" aria-checked={status === v} className={`sk-chip${status === v ? ' on' : ''}`} onClick={() => setStatus(v)}><span>{label}</span></button>
                ))}
              </div>

              {/* Summary */}
              <div className="sk-sum">
                <div className="sk-sum-r"><span>Subtotal{itemCount ? ` · ${itemCount} item${itemCount === 1 ? '' : 's'}` : ''}</span><b>{money(subtotal)}</b></div>
                {orderDiscountValue > 0 && <div className="sk-sum-r"><span>Discount{orderDiscType === 'percent' ? ` (${orderDiscAmount}%)` : ''}</span><b style={{ color: '#dc2626' }}>-{money(orderDiscountValue)}</b></div>}
                {shippingValue > 0 && <div className="sk-sum-r"><span>Shipping</span><b>{money(shippingValue)}</b></div>}
                {feesTotal !== 0 && <div className="sk-sum-r"><span>Fees</span><b>{money(feesTotal)}</b></div>}
                <div className="sk-sum-r"><span>Incl. GST (10%)</span><b style={{ color: 'var(--sk-muted)', fontWeight: 500 }}>{money(gst)}</b></div>
                <div className="sk-sum-r total"><span>Total</span><b>{money(total)}</b></div>
              </div>

              {stockWarnings.length > 0 && (
                <div className="co-warn" role="alert">
                  <strong>Stock changed while you were building this order</strong>
                  <ul>{stockWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                  <button type="button" className="sk-btn sm" onClick={() => create(false, true)}>Create anyway</button>
                </div>
              )}

              <p className="sk-note" style={{ marginTop: 14 }}>
                {source.platform === 'shopify'
                  ? 'Unpaid orders are Shopify drafts until the customer pays; “Processing” or “Completed” records it as paid. GST shown is an inclusive estimate, and Shopify works out the tax from your store’s settings.'
                  : 'Orders are created unpaid. GST shown is an inclusive estimate, and WooCommerce works out the final tax from your store’s tax settings.'}
              </p>
            </>
          )}
        </div>

        {formOpen && (
          <div className="sk-foot">
            {draftMsg && <p className={`co-draft-msg${draftState === 'error' ? ' err' : ''}`} role="status">{draftMsg}</p>}
            <div className="co-acts">
              <button type="button" className="sk-btn ghost co-draft" onClick={saveDraft} disabled={creating || draftState === 'saving' || (items.length === 0 && !cust.first_name && !cust.email)}
                title="Keep this order in Colvy to finish later. Nothing is sent to the store.">
                {draftState === 'saving' ? 'Saving…' : draftId ? 'Save draft' : 'Save as draft'}
              </button>
              <button type="button" className="sk-btn dark" onClick={() => create(true)} disabled={creating || items.length === 0}>Create &amp; send pay link</button>
            </div>
            <button type="button" className="sk-btn primary co-go" onClick={() => create(false)} disabled={creating || items.length === 0}>
              {creating ? 'Creating…' : items.length ? <>Create order<span className="co-go-total">{money(total)}</span></> : 'Create order'}
            </button>
          </div>
        )}
      </div>
      <style>{CO_CSS}</style>
    </div>
  )
}

const CO_CSS = `
.co .sk-body{padding-top:0}
.co .sk-lbl-row+div .sk-field,.co .sk-field{min-width:0}
.co-link{border:none;background:none;padding:2px 0;font:inherit;font-size:13.5px;font-weight:650;color:var(--coral,#ff7a6b);cursor:pointer}
.co-link:hover{text-decoration:underline}
.co-clear{border:none;background:var(--sk-fill-2);width:24px;height:24px;border-radius:50%;cursor:pointer;color:var(--sk-muted);font-size:16px;line-height:1;padding:0;flex-shrink:0}
.co-tip{margin:10px 0 0;padding:12px 14px;border-radius:16px;background:#ecfdf5;color:#166534;font-size:13px;line-height:1.5}
[data-theme="dark"] .co-tip{background:rgba(16,185,129,.12);color:#6ee7b7}
.co-pop{padding:5px;border-radius:18px;background:var(--card,#fff);box-shadow:0 0 0 1px var(--sk-line),0 18px 44px -12px rgba(16,24,40,.22);overflow-y:auto;animation:coPop .22s cubic-bezier(.32,.72,0,1)}
.co-float{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:5;max-height:280px}
.co-pop-msg{margin:0;padding:11px 12px;font-size:13px;color:var(--sk-muted)}
.co-opt{display:flex;align-items:center;gap:11px;width:100%;padding:8px 10px;border:none;border-radius:13px;background:none;text-align:left;font:inherit;cursor:pointer;color:var(--ink)}
.co-opt:hover{background:var(--sk-fill)}
.co-opt-new{font-size:14px;font-weight:650;color:var(--coral,#ff7a6b)}
.co-av{width:32px;height:32px;flex-shrink:0;border-radius:50%;background:var(--peach,#fff4f1);color:var(--coral,#ff7a6b);display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:800}
.co-av.big{width:40px;height:40px;font-size:15px;background:var(--card,#fff)}
.co-cust{margin-top:8px;padding:2px 16px 16px}
.co-cust .sk-lbl{margin-top:14px}
.co-cust .sk-in{background:var(--card,#fff)}
.co-cust .sk-in:focus{border-color:var(--sk-fill-2)}
[data-theme="dark"] .sk .co-cust .sk-in,[data-theme="dark"] .sk .sk-in.co-mini{background:var(--card,#1c1c1f)!important}
.co-addr>input:nth-child(2){flex:0 0 78px}
.co-addr>input:nth-child(3){flex:0 0 104px}
.co-line{flex-direction:column;align-items:stretch;gap:10px}
.co-line-top{display:flex;align-items:center;gap:12px;min-width:0}
.co-line-top .sk-item-t b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;white-space:normal}
.co-thumb{width:44px;height:44px;flex-shrink:0;border-radius:12px;object-fit:cover;background:var(--card,#fff);color:var(--sk-muted);display:inline-flex;align-items:center;justify-content:center}
.co-line-bot{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.co-price{display:inline-flex;align-items:center;gap:4px;height:36px;padding:0 12px;border-radius:999px;background:var(--card,#fff);box-shadow:0 0 0 1px var(--sk-fill-2);font-size:14px;font-weight:600;color:var(--sk-muted);cursor:text}
.co-price:focus-within{box-shadow:0 0 0 2px color-mix(in srgb,var(--coral,#ff7a6b) 45%,transparent)}
.co .co-price input{width:64px;border:none!important;outline:none;background:transparent!important;box-shadow:none!important;padding:0;font:inherit;font-size:14px;font-weight:700;color:var(--ink)!important;font-variant-numeric:tabular-nums}
.co-price small{font-size:12px;font-weight:500}
.co .sk-in.co-mini{height:42px;border-radius:14px;font-size:14px;background:var(--card,#fff)}
.co-apply>.sk-btn{flex:0 0 auto;padding:0 22px}
.co-disc .sk-seg{flex:0 0 104px;height:50px;box-sizing:border-box}
.co-disc .sk-seg button{height:42px}
.co-disc>input:nth-child(2){flex:0 0 92px}
.co-fee>input:nth-child(2){flex:0 0 110px}
.co-fee>.sk-icon-btn{flex:0 0 34px}
.co .sk-in.co-ta{min-height:64px}
.co-ok{margin:8px 2px 0;font-size:13px;font-weight:600;color:#059669}
.co-warn{margin-top:14px;padding:14px 16px;border-radius:18px;background:#fff7ed;color:#9a3412;font-size:13px;line-height:1.5}
.co-warn ul{margin:6px 0 10px;padding-left:18px}
.co-warn .sk-btn{background:#9a3412;color:#fff}
[data-theme="dark"] .co-warn{background:rgba(234,88,12,.12);color:#fdba74}
.co-acts{display:flex;gap:8px}
.co-acts .sk-btn{height:44px;padding:0 16px;font-size:14px}
.co-acts .sk-btn.ghost{flex:1}
.co-acts .sk-btn.dark{flex:1.3}
.sk-btn.co-go{width:100%;margin-top:8px;justify-content:space-between;padding:0 10px 0 22px}
.co-go-total{display:inline-flex;align-items:center;height:34px;padding:0 14px;border-radius:999px;background:rgba(255,255,255,.2);font-variant-numeric:tabular-nums}
.co-draft-msg{margin:0 0 10px;font-size:12.5px;font-weight:600;color:#059669;text-align:center}
.co-draft-msg.err{color:#dc2626}
.co-done{text-align:center;padding:18px 2px 6px}
.co-done-tick{width:64px;height:64px;margin:0 auto 14px;border-radius:50%;background:#dcfce7;color:#15803d;display:flex;align-items:center;justify-content:center;animation:coTick .5s cubic-bezier(.34,1.56,.64,1) both}
.co-done-t{margin:0;font-family:var(--font-display),-apple-system,sans-serif;font-size:22px;font-weight:700;letter-spacing:-.02em;color:var(--ink)}
.co-done-s{margin:4px 0 0;font-size:14px;color:var(--sk-muted)}
.sk-btn.co-sent{background:#dcfce7;color:#15803d}
.co-loading{padding:56px 6px;text-align:center;color:var(--sk-muted);font-size:14px}
.co-spin{display:block;width:30px;height:30px;margin:0 auto 12px;border:3px solid var(--sk-fill-2);border-top-color:var(--coral,#ff7a6b);border-radius:50%;animation:coSpin .8s linear infinite}
@keyframes coSpin{to{transform:rotate(360deg)}}
@keyframes coPop{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@keyframes coTick{from{transform:scale(.4);opacity:0}to{transform:none;opacity:1}}
@media (max-width:560px){
  .co-acts .sk-btn{padding:0 12px;font-size:13.5px}
  .co-addr{flex-wrap:wrap}
  .co-addr>input:first-child{flex:1 1 100%}
  .co-addr>input:nth-child(2),.co-addr>input:nth-child(3){flex:1 1 0}
  .co-disc{flex-wrap:wrap}
  .co-disc>input:last-child{flex:1 1 100%}
  .co-disc>input:nth-child(2){flex:1 1 0}
}
@media (prefers-reduced-motion:reduce){.co-pop,.co-done-tick,.co-spin{animation:none}}
`

function StorePicker({ sources, value, onChange }: { sources: any[]; value: any; onChange: (s: any) => void }) {
  const [open, setOpen] = useState(false)
  const many = sources.length > 1
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => { if (!(e.target as HTMLElement)?.closest?.('[data-store-picker]')) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key) }
  }, [open])
  const row = (s: any, selected: boolean) => (
    <>
      <StoreLogo domain={s.domain} name={s.label} platform={s.platform} size={38} />
      <span style={{ flex: 1, minWidth: 0, marginLeft: 4 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[platformName(s.platform), s.domain].filter(Boolean).join(' · ')}</span>
      </span>
      {selected && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M20 6 9 17l-5-5" /></svg>}
    </>
  )
  if (!value) return null
  return (
    <div data-store-picker style={{ position: 'relative' }}>
      <button type="button" onClick={() => many && setOpen(o => !o)} aria-expanded={open} className="co-store"
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 15px 11px 11px', borderRadius: 18, border: '1.5px solid transparent', background: open ? 'var(--card,#fff)' : 'var(--sk-fill,#f4f4f5)', cursor: many ? 'pointer' : 'default', textAlign: 'left', fontFamily: 'inherit', boxShadow: open ? '0 0 0 3px color-mix(in srgb, var(--coral) 14%, transparent), 0 0 0 1px var(--sk-fill-2,#ececef)' : 'none', transition: 'box-shadow .2s ease, background .2s ease' }}>
        <StoreLogo domain={value.domain} name={value.label} platform={value.platform} size={38} />
        <span style={{ flex: 1, minWidth: 0, marginLeft: 4 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.label}</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[platformName(value.platform), value.domain].filter(Boolean).join(' · ')}</span>
        </span>
        {many && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .3s cubic-bezier(.32,.72,0,1)' }}><path d="m6 9 6 6 6-6" /></svg>}
      </button>
      {open && (
        <div className="co-store-pop" role="listbox" style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 6px)', zIndex: 6, background: 'var(--card,#fff)', borderRadius: 18, boxShadow: '0 0 0 1px var(--sk-line,#f0f0f2), 0 18px 44px -12px rgba(16,24,40,.22)', padding: 5 }}>
          {sources.map(s => (
            <button key={s.id} type="button" role="option" aria-selected={s.id === value.id} className="co-store-opt" onClick={() => { onChange(s); setOpen(false) }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px 9px 8px', borderRadius: 13, border: 'none', background: s.id === value.id ? 'var(--peach)' : 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
              {row(s, s.id === value.id)}
            </button>
          ))}
        </div>
      )}
      <style>{`.co-store-pop{animation:coStorePop .22s cubic-bezier(.32,.72,0,1);transform-origin:top center}@keyframes coStorePop{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:none}}.co-store-opt{transition:background .15s ease}.co-store-opt:hover{background:color-mix(in srgb, var(--slate) 7%, transparent)}.co-store:active{transform:scale(.995)}@media (prefers-reduced-motion: reduce){.co-store-pop{animation:none}}`}</style>
    </div>
  )
}
