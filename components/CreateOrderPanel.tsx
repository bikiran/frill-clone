'use client'

import { useEffect, useRef, useState } from 'react'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import ProductResults, { useProductSearch } from '@/components/ProductResults'
import { authFetch } from '@/lib/auth-fetch'
import { supabase } from '@/lib/supabase'

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
      // The draft became a real order.
      if (draftId) { try { await (supabase as any).from('order_drafts').delete().eq('id', draftId) } catch {} }
    } catch (e: any) { setError(e.message) } finally { setCreating(false) }
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

  const L: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 4, marginTop: 12 }
  const I: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box', fontFamily: 'inherit' }
  const money = (n: number) => `$${n.toFixed(2)}`

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 480, maxWidth: '100%', height: '100%', background: '#fff', overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff', zIndex: 3 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>{draft ? 'Edit draft order' : 'Create Order'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--slate)' }}>✕</button>
        </div>

        <div style={{ padding: 20 }}>
          {result ? (
            <div style={{ textAlign: 'center', padding: '20px 6px' }}>
              <div style={{ width: 56, height: 56, margin: '0 auto 12px', borderRadius: '50%', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Order #{result.number} created</p>
              <p style={{ fontSize: 13.5, color: 'var(--slate)', marginTop: 4 }}>{result.currency || 'AUD'} {money(parseFloat(result.total) || 0)} · {result.status}</p>
              {result.withPaymentLink && result.pay_link && (
                <div style={{ marginTop: 16 }}>
                  <input readOnly value={result.pay_link} style={{ ...I, fontSize: 12 }} onFocus={e => e.currentTarget.select()} />
                  <button onClick={() => { navigator.clipboard?.writeText(result.pay_link) }} style={{ marginTop: 8, padding: '9px 18px', borderRadius: 9, background: 'var(--peach)', color: 'var(--coral)', border: '1px solid var(--coral)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Copy payment link</button>

                  {/* Send the pay link straight to the customer on their channel. */}
                  {onDeliver && (channel || contact?.email) && (
                    <button
                      disabled={sendState === 'sending' || sendState === 'sent'}
                      onClick={async () => {
                        setSendState('sending')
                        try {
                          const how = await onDeliver({
                            subject: `Your order #${result.number} from us`,
                            body: `Here's your order #${result.number} for ${result.currency || 'AUD'} ${money(parseFloat(result.total) || 0)}. Pay securely here:`,
                            url: result.pay_link,
                          })
                          setSendState('sent'); setSendMsg(how)
                        } catch (e: any) { setSendState('error'); setSendMsg(e.message) }
                      }}
                      style={{ marginTop: 8, marginLeft: 8, padding: '9px 18px', borderRadius: 9, background: sendState === 'sent' ? '#dcfce7' : 'var(--coral)', color: sendState === 'sent' ? '#15803d' : '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: sendState === 'sent' ? 'default' : 'pointer' }}>
                      {sendState === 'sending' ? 'Sending…'
                        : sendState === 'sent' ? `✓ ${sendMsg}`
                        : `Send to customer${channelLabel ? ` on ${channelLabel}` : (contact?.email ? ' by email' : '')}`}
                    </button>
                  )}
                  {sendState === 'error' && <p style={{ fontSize: 11.5, color: '#dc2626', marginTop: 6 }}>{sendMsg}</p>}
                </div>
              )}
              <button onClick={onClose} style={{ marginTop: 18, padding: '10px 24px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'block', width: '100%' }}>Done</button>
            </div>
          ) : sourcesLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 6px', color: 'var(--slate)' }}>
              <div style={{ width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: 'var(--coral)', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
              <p style={{ fontSize: 13.5 }}>Loading your store…</p>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          ) : !source ? (
            <p style={{ color: 'var(--slate)', fontSize: 13.5 }}>No e-commerce store connected. Connect WooCommerce or Shopify first.</p>
          ) : (
            <>
              {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, padding: '9px 12px', marginBottom: 10, fontSize: 12.5, color: '#dc2626' }}>{error}</div>}

              {/* Source picker */}
              {sources.length > 1 && (
                <>
                  <label style={L}>Store</label>
                  <select value={source.id} onChange={e => {
                    const next = sources.find(s => s.id === e.target.value)
                    setSource(next); setSearch(''); setShippingMethods([]); setAppliedCoupon(null)
                    // Store shipping methods are WooCommerce's; Shopify uses the options below.
                    if (next?.platform === 'woocommerce') authFetch(`/api/orders/shipping?companyId=${companyId}&integrationId=${next.id}`).then(r => r.json()).then(d => setShippingMethods(d.shippingMethods || [])).catch(() => {})
                  }} style={I}>
                    {sources.map(s => <option key={s.id} value={s.id}>{s.label}{s.platform === 'shopify' ? ' (Shopify)' : ''}</option>)}
                  </select>
                </>
              )}
              {source.platform === 'shopify' && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 9, padding: 12, marginTop: 10, fontSize: 12.5, color: '#166534', lineHeight: 1.5 }}>
                  An unpaid order is saved as a Shopify draft and its payment link opens Shopify’s checkout. When the customer pays, it becomes a Shopify order in this chat.
                </div>
              )}

              {/* Customer */}
              <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase' }}>Customer</p>
                  <button onClick={() => setEditingCustomer(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--coral)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>{editingCustomer ? 'Done' : (cust.first_name || cust.email ? 'Edit' : 'New customer')}</button>
                </div>
                <div style={{ position: 'relative', marginTop: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 10, padding: '8px 11px', background: '#fff' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                    <input value={custQuery} onChange={e => setCustQuery(e.target.value)} placeholder="Search customers by name, email or phone…"
                      style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13.5, background: 'transparent', color: 'var(--ink)', fontFamily: 'inherit', minWidth: 0 }} />
                    {custQuery && <button type="button" onClick={() => setCustQuery('')} aria-label="Clear" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--slate)', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>}
                  </div>
                  {custQuery.trim().length >= 2 && (
                    <div className="co-pop" style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 6px)', zIndex: 5, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,.12)', padding: 4, maxHeight: 280, overflowY: 'auto' }}>
                      {custSearching && custResults.length === 0 && <p style={{ margin: 0, padding: '10px 12px', fontSize: 12.5, color: 'var(--slate)' }}>Searching…</p>}
                      {!custSearching && custResults.length === 0 && (
                        <button type="button" onClick={() => { const q = custQuery.trim(); setCust(c => ({ ...c, ...(q.includes('@') ? { email: q, first_name: '', last_name: '' } : /^[+\d\s()-]+$/.test(q) ? { phone: q, first_name: '', last_name: '' } : { first_name: q.split(' ')[0], last_name: q.split(' ').slice(1).join(' '), email: '', phone: '' }) })); setPicked(null); setCustQuery(''); setEditingCustomer(true) }}
                          className="prd-row" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', background: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--coral)' }}>
                          + New customer &ldquo;{custQuery.trim()}&rdquo;
                        </button>
                      )}
                      {custResults.map(c => (
                        <button type="button" key={c.id} onClick={() => pickCustomer(c)} className="prd-row"
                          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', background: 'none', borderRadius: 8, cursor: 'pointer' }}>
                          <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, flexShrink: 0 }}>{String(c.name || c.email || '?').trim().charAt(0).toUpperCase()}</span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || c.email || c.phone}</span>
                            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[c.email, c.phone].filter(Boolean).join(' · ') || 'No contact details'}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {!editingCustomer ? (
                  (cust.first_name || cust.last_name || cust.email || cust.phone) ? (
                    <div style={{ marginTop: 10, fontSize: 13.5, color: 'var(--ink)' }}>
                      <div style={{ fontWeight: 600 }}>{cust.first_name} {cust.last_name}</div>
                      <div style={{ color: 'var(--slate)', fontSize: 12.5 }}>{cust.email || 'No email'}{cust.phone ? ` · ${cust.phone}` : ''}</div>
                      {(cust.address_1 || cust.city) && <div style={{ color: 'var(--slate)', fontSize: 12.5 }}>{[cust.address_1, cust.city, cust.state, cust.postcode].filter(Boolean).join(', ')}</div>}
                    </div>
                  ) : <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>Search for a customer, or add a new one.</p>
                ) : (
                  <div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1 }}><label style={L}>First name</label><input style={I} value={cust.first_name} onChange={e => setCust({ ...cust, first_name: e.target.value })} /></div>
                      <div style={{ flex: 1 }}><label style={L}>Last name</label><input style={I} value={cust.last_name} onChange={e => setCust({ ...cust, last_name: e.target.value })} /></div>
                    </div>
                    <label style={L}>Email</label><input style={I} value={cust.email} onChange={e => setCust({ ...cust, email: e.target.value })} />
                    <label style={L}>Phone</label><input style={I} value={cust.phone} onChange={e => setCust({ ...cust, phone: e.target.value })} />
                    <label style={L}>Billing address</label>
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
                      style={I as any}
                      placeholder="Start typing an address…"
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <input style={I} value={cust.city} onChange={e => setCust({ ...cust, city: e.target.value })} placeholder="City" />
                      <input style={{ ...I, width: 90 }} value={cust.state} onChange={e => setCust({ ...cust, state: e.target.value })} placeholder="State" />
                      <input style={{ ...I, width: 100 }} value={cust.postcode} onChange={e => setCust({ ...cust, postcode: e.target.value })} placeholder="Postcode" />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, fontSize: 13 }}>
                      <input type="checkbox" checked={cust.createAccount} onChange={e => setCust({ ...cust, createAccount: e.target.checked })} style={{ marginTop: 2 }} />
                      <span>Match or create a customer account <span style={{ color: 'var(--slate)' }}>(recommended — a guest order can't be paid via the link if the store has guest checkout off)</span></span>
                    </label>
                  </div>
                )}
              </div>

              {/* Products */}
              <label style={L}>Products</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 10, padding: '9px 11px', background: '#fff' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products by name or SKU…"
                  style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13.5, background: 'transparent', color: 'var(--ink)', fontFamily: 'inherit', minWidth: 0 }} />
                {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--slate)', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>}
              </div>
              {search.trim().length >= 2 && (
                <div className="co-pop" style={{ border: '1px solid var(--border)', borderRadius: 12, marginTop: 6, maxHeight: 340, overflowY: 'auto', padding: 4, background: '#fff' }}>
                  {searching && results.length === 0 && <p style={{ margin: 0, padding: '10px 12px', fontSize: 12.5, color: 'var(--slate)' }}>Searching…</p>}
                  {!searching && results.length === 0 && <p style={{ margin: 0, padding: '10px 12px', fontSize: 12.5, color: 'var(--slate)' }}>No products found.</p>}
                  <ProductResults dense results={results} companyId={companyId} integrationId={source?.id || null}
                    addedIds={new Set(items.flatMap(it => [it.variation_id, !it.variation_id ? it.product_id : undefined]).filter(x => x != null).map(String))}
                    onAdd={addProduct} />
                </div>
              )}
              <style>{`.co-pop{animation:coPop .22s cubic-bezier(.32,.72,0,1)}@keyframes coPop{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion: reduce){.co-pop{animation:none}}`}</style>

              {/* Added items */}
              {items.length > 0 && (
                <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  {items.map(it => (
                    <div key={it.key} style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {it.product_id ? (
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{it.name}</span>
                        ) : (
                          <input style={{ ...I, flex: 1 }} placeholder="Custom item name" value={it.name} onChange={e => updateItem(it.key, { name: e.target.value })} />
                        )}
                        <button onClick={() => removeItem(it.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16 }}>×</button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                        <label style={{ fontSize: 11.5, color: 'var(--slate)' }}>Qty</label>
                        <input type="number" min={1} value={it.quantity} onChange={e => updateItem(it.key, { quantity: Math.max(1, parseInt(e.target.value) || 1) })} style={{ ...I, width: 60, padding: '5px 8px' }} />
                        <label style={{ fontSize: 11.5, color: 'var(--slate)' }}>Price</label>
                        <input value={it.custom_price != null ? it.custom_price : it.price} onChange={e => updateItem(it.key, { custom_price: e.target.value })} style={{ ...I, width: 80, padding: '5px 8px' }} />
                        <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700 }}>{money(lineTotal(it))}</span>
                      </div>
                      {it.product_id && it.custom_price != null && it.custom_price !== '' && parseFloat(it.custom_price) !== parseFloat(it.price) && (
                        <input style={{ ...I, marginTop: 6, fontSize: 12 }} placeholder="Reason for price change (e.g. damaged box)" value={it.custom_price_reason || ''} onChange={e => updateItem(it.key, { custom_price_reason: e.target.value })} />
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button onClick={addCustomItem} style={{ fontSize: 12.5, color: 'var(--coral)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ Add custom item</button>
              </div>

              {/* Discounts */}
              <label style={L}>Coupon code</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...I, flex: 1 }} value={couponCode} onChange={e => setCouponCode(e.target.value)} placeholder="Coupon code" />
                <button onClick={applyCoupon} style={{ padding: '0 16px', borderRadius: 9, background: 'var(--ink)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Apply</button>
              </div>
              {couponError && <p style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>{couponError}</p>}
              {appliedCoupon && <p style={{ fontSize: 12, color: '#059669', marginTop: 4 }}>✓ Coupon {appliedCoupon.code} valid ({appliedCoupon.discount_type === 'percent' ? `${appliedCoupon.amount}%` : `$${appliedCoupon.amount}`})</p>}

              <label style={L}>Order discount</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={orderDiscType} onChange={e => setOrderDiscType(e.target.value as any)} style={{ ...I, width: 90 }}>
                  <option value="fixed">$</option>
                  <option value="percent">%</option>
                </select>
                <input style={{ ...I, width: 90 }} value={orderDiscAmount} onChange={e => setOrderDiscAmount(e.target.value)} placeholder="0" />
                <input style={{ ...I, flex: 1 }} value={orderDiscLabel} onChange={e => setOrderDiscLabel(e.target.value)} placeholder="Label (e.g. Goodwill)" />
              </div>

              {/* Fees */}
              <label style={L}>Additional charges</label>
              {fees.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input style={{ ...I, flex: 1 }} value={f.name} onChange={e => setFees(fees.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Fee name" />
                  <input style={{ ...I, width: 90 }} value={f.amount} onChange={e => setFees(fees.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} placeholder="$" />
                  <button onClick={() => setFees(fees.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>×</button>
                </div>
              ))}
              <button onClick={() => setFees([...fees, { name: '', amount: '' }])} style={{ fontSize: 12.5, color: 'var(--coral)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ Add custom fee</button>

              {/* Shipping */}
              <label style={L}>Shipping / fulfilment</label>
              <select value={shipMethod} onChange={e => { setShipMethod(e.target.value); const m = shippingMethods.find(sm => `zone:${sm.method_id}:${sm.title}` === e.target.value); if (m) { setShipLabel(m.title); setShipCost(m.cost || '') } }} style={I}>
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
              {shipMethod === 'flat' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input style={{ ...I, flex: 1 }} value={shipLabel} onChange={e => setShipLabel(e.target.value)} placeholder="Label" />
                  <input style={{ ...I, width: 90 }} value={shipCost} onChange={e => setShipCost(e.target.value)} placeholder="$" />
                </div>
              )}
              {shipMethod === 'pickup' && (
                <div style={{ marginTop: 8 }}>
                  {locations.length > 0 ? (
                    <select value={pickupLocationId} onChange={e => setPickupLocationId(e.target.value)} style={I}>
                      <option value="">Select a pickup location…</option>
                      {locations.map((loc: any) => (
                        <option key={loc.id} value={loc.id}>{loc.label || loc.suburb || 'Location'}{loc.state ? ` — ${loc.state}` : ''}</option>
                      ))}
                    </select>
                  ) : (
                    <p style={{ fontSize: 12, color: 'var(--slate)' }}>No business locations set. Add them in Settings → Locations.</p>
                  )}
                </div>
              )}
              {shipMethod === 'quote_later' && (
                <p style={{ fontSize: 12, color: 'var(--slate)', marginTop: 6 }}>This will be sent as a quote (draft order) — no payment is requested until you confirm shipping.</p>
              )}
              {shipMethod?.startsWith('zone:') && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input style={{ ...I, flex: 1 }} value={shipLabel} onChange={e => setShipLabel(e.target.value)} placeholder="Label" />
                  <input style={{ ...I, width: 90 }} value={shipCost} onChange={e => setShipCost(e.target.value)} placeholder="$ (override)" />
                </div>
              )}

              {/* Notes */}
              <label style={L}>Customer note (shown to customer)</label>
              <textarea style={{ ...I, minHeight: 44, resize: 'vertical' }} value={customerNote} onChange={e => setCustomerNote(e.target.value)} placeholder="e.g. Please call before delivery." />
              <label style={L}>Internal note (staff only)</label>
              <textarea style={{ ...I, minHeight: 44, resize: 'vertical' }} value={internalNote} onChange={e => setInternalNote(e.target.value)} placeholder="Staff-only context" />

              {/* Summary */}
              <div style={{ marginTop: 16, background: 'var(--canvas)', borderRadius: 12, padding: 14, fontSize: 13 }}>
                <Row label="Subtotal" value={money(subtotal)} />
                {orderDiscountValue > 0 && <Row label={`Discount${orderDiscType === 'percent' ? ` (${orderDiscAmount}%)` : ''}`} value={`-${money(orderDiscountValue)}`} color="#dc2626" />}
                {shippingValue > 0 && <Row label="Shipping" value={money(shippingValue)} />}
                {feesTotal !== 0 && <Row label="Fees" value={money(feesTotal)} />}
                <Row label="Incl. GST (10%)" value={money(gst)} muted />
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
                  <Row label="Total" value={money(total)} bold />
                </div>
              </div>

              {/* Status */}
              <label style={L}>Order status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} style={I}>
                <option value="draft">Draft</option>
                <option value="pending">Pending payment</option>
                <option value="processing">Processing</option>
                <option value="on-hold">On hold</option>
                <option value="completed">Completed</option>
              </select>

              {stockWarnings.length > 0 && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 9, padding: 12, marginTop: 12, fontSize: 12.5, color: '#9a3412' }}>
                  <strong>Stock changed while you were building this order:</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{stockWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                  <button onClick={() => create(false, true)} style={{ marginTop: 8, padding: '7px 14px', borderRadius: 8, background: '#9a3412', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Create anyway</button>
                </div>
              )}

              {/* Actions */}
              <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={() => create(false)} disabled={creating || items.length === 0}
                  style={{ padding: '12px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  {creating ? 'Creating…' : 'Create order'}
                </button>
                <button onClick={() => create(true)} disabled={creating || items.length === 0}
                  style={{ padding: '12px', borderRadius: 10, background: '#fff', color: 'var(--ink)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Create & send payment link
                </button>
                <button onClick={saveDraft} disabled={creating || draftState === 'saving' || (items.length === 0 && !cust.first_name && !cust.email)}
                  title="Keep this order in Colvy to finish later — nothing is sent to the store"
                  style={{ padding: '12px', borderRadius: 10, background: '#fff', color: 'var(--slate)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  {draftState === 'saving' ? 'Saving…' : draftId ? 'Save draft' : 'Save as draft'}
                </button>
                {draftMsg && <p style={{ margin: 0, fontSize: 12, color: draftState === 'error' ? '#dc2626' : '#059669', textAlign: 'center' }}>{draftMsg}</p>}
              </div>
              <p style={{ fontSize: 11, color: 'var(--slate)', marginTop: 10, lineHeight: 1.5 }}>
                {source.platform === 'shopify'
                  ? 'Unpaid orders are Shopify drafts until the customer pays; “Processing” or “Completed” records it as paid. GST shown is an inclusive estimate — Shopify calculates the tax from your store’s settings.'
                  : 'Orders are created unpaid (set_paid: false). GST shown is an inclusive estimate — WooCommerce calculates the authoritative tax based on your store\'s tax settings.'}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, bold, muted, color }: { label: string; value: string; bold?: boolean; muted?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontWeight: bold ? 800 : 500, color: color || (muted ? 'var(--slate)' : 'var(--ink)'), fontSize: bold ? 15 : 13 }}>
      <span>{label}</span><span>{value}</span>
    </div>
  )
}
