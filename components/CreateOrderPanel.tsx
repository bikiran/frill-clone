'use client'

import { useEffect, useState, useCallback } from 'react'

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

export default function CreateOrderPanel({ companyId, conversationId, contactId, contact, staffName, staffId, onClose, onCreated }: {
  companyId: string
  conversationId?: string | null
  contactId?: string | null
  contact?: any
  staffName?: string
  staffId?: string
  onClose: () => void
  onCreated?: (order: any) => void
}) {
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
    createAccount: false,
  })

  // Products
  const [items, setItems] = useState<Item[]>([])
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [variationFor, setVariationFor] = useState<any>(null)
  const [variations, setVariations] = useState<any[]>([])

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

  useEffect(() => {
    ;(async () => {
      const res = await fetch(`/api/orders/sources?companyId=${companyId}`)
      const data = await res.json()
      setSources(data.sources || [])
      setShippingMethods(data.shippingMethods || [])
      setLocations(data.locations || [])
      const firstWoo = (data.sources || []).find((s: any) => s.platform === 'woocommerce')
      setSource(firstWoo || (data.sources || [])[0] || null)
    })()
  }, [companyId])

  // Debounced product search
  useEffect(() => {
    if (!source || source.platform !== 'woocommerce') return
    if (search.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/orders/products?companyId=${companyId}&integrationId=${source.id}&q=${encodeURIComponent(search.trim())}`)
        const data = await res.json()
        setResults(data.products || [])
      } catch {} finally { setSearching(false) }
    }, 350)
    return () => clearTimeout(t)
  }, [search, source, companyId])

  const addProduct = async (p: any) => {
    if (p.has_variations) {
      setVariationFor(p)
      const res = await fetch(`/api/orders/products?companyId=${companyId}&integrationId=${source.id}&productId=${p.id}`)
      const data = await res.json()
      setVariations(data.variations || [])
      return
    }
    setItems(prev => [...prev, { key: `${p.id}-${Date.now()}`, product_id: p.id, name: p.name, sku: p.sku, price: p.price || '0', quantity: 1, image: p.image, stock_status: p.stock_status }])
    setSearch(''); setResults([])
  }

  const addVariation = (v: any) => {
    setItems(prev => [...prev, { key: `${variationFor.id}-${v.id}-${Date.now()}`, product_id: variationFor.id, variation_id: v.id, name: `${variationFor.name} (${v.attributes})`, sku: v.sku, price: v.price || '0', quantity: 1, image: v.image || variationFor.image, stock_status: v.stock_status }])
    setVariationFor(null); setVariations([]); setSearch(''); setResults([])
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
      const res = await fetch('/api/orders/coupon', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, integrationId: source?.id, code: couponCode.trim(), subtotal, email: cust.email, productIds: items.map(i => i.product_id).filter(Boolean) }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) { setCouponError(data.error || 'Invalid coupon'); setAppliedCoupon(null); return }
      setAppliedCoupon(data.coupon)
    } catch (e: any) { setCouponError(e.message) }
  }

  const create = async (withPaymentLink: boolean, ignoreStock = false) => {
    if (items.length === 0) { setError('Add at least one product.'); return }
    setCreating(true); setError(''); setStockWarnings([])
    try {
      const billing = { first_name: cust.first_name, last_name: cust.last_name, email: cust.email, phone: cust.phone, address_1: cust.address_1, city: cust.city, state: cust.state, postcode: cust.postcode, company: cust.company, country: 'AU' }
      const shipping = cust.ship_same ? billing : { first_name: cust.first_name, last_name: cust.last_name, address_1: cust.ship_address_1, city: cust.ship_city, state: cust.ship_state, postcode: cust.ship_postcode, country: 'AU' }
      const res = await fetch('/api/orders/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, integrationId: source?.id, conversationId, contactId, source: source?.platform,
          customer: { existingId: contact?.woo_customer_id, createAccount: cust.createAccount, email: cust.email, first_name: cust.first_name, last_name: cust.last_name, phone: cust.phone, billing, shipping },
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
          status: isQuote ? 'draft' : (withPaymentLink ? 'pending' : status),
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
    } catch (e: any) { setError(e.message) } finally { setCreating(false) }
  }

  const L: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 4, marginTop: 12 }
  const I: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box', fontFamily: 'inherit' }
  const money = (n: number) => `$${n.toFixed(2)}`

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 480, maxWidth: '100%', height: '100%', background: '#fff', overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff', zIndex: 3 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>🛒 Create Order</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--slate)' }}>✕</button>
        </div>

        <div style={{ padding: 20 }}>
          {result ? (
            <div style={{ textAlign: 'center', padding: '20px 6px' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🛒</div>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Order #{result.number} created</p>
              <p style={{ fontSize: 13.5, color: 'var(--slate)', marginTop: 4 }}>{result.currency || 'AUD'} {money(parseFloat(result.total) || 0)} · {result.status}</p>
              {result.withPaymentLink && result.pay_link && (
                <div style={{ marginTop: 16 }}>
                  <input readOnly value={result.pay_link} style={{ ...I, fontSize: 12 }} onFocus={e => e.currentTarget.select()} />
                  <button onClick={() => { navigator.clipboard?.writeText(result.pay_link) }} style={{ marginTop: 8, padding: '9px 18px', borderRadius: 9, background: 'var(--peach)', color: 'var(--coral)', border: '1px solid var(--coral)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Copy payment link</button>
                </div>
              )}
              <button onClick={onClose} style={{ marginTop: 18, padding: '10px 24px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'block', width: '100%' }}>Done</button>
            </div>
          ) : !source ? (
            <p style={{ color: 'var(--slate)', fontSize: 13.5 }}>No e-commerce store connected. Connect WooCommerce first.</p>
          ) : (
            <>
              {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, padding: '9px 12px', marginBottom: 10, fontSize: 12.5, color: '#dc2626' }}>{error}</div>}

              {/* Source picker */}
              {sources.length > 1 && (
                <>
                  <label style={L}>Store</label>
                  <select value={source.id} onChange={e => setSource(sources.find(s => s.id === e.target.value))} style={I}>
                    {sources.map(s => <option key={s.id} value={s.id} disabled={s.unsupported}>{s.label}{s.platform === 'shopify' ? ' (Shopify — not yet supported)' : ''}</option>)}
                  </select>
                </>
              )}
              {source.platform === 'shopify' && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 9, padding: 12, marginTop: 10, fontSize: 12.5, color: '#9a3412' }}>
                  Order creation currently supports WooCommerce. Shopify order writing is coming next.
                </div>
              )}

              {/* Customer */}
              <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase' }}>Customer</p>
                  <button onClick={() => setEditingCustomer(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--coral)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>{editingCustomer ? 'Done' : 'Edit'}</button>
                </div>
                {!editingCustomer ? (
                  <div style={{ marginTop: 6, fontSize: 13.5, color: 'var(--ink)' }}>
                    <div style={{ fontWeight: 600 }}>{cust.first_name} {cust.last_name}</div>
                    <div style={{ color: 'var(--slate)', fontSize: 12.5 }}>{cust.email || 'no email'}{cust.phone ? ` · ${cust.phone}` : ''}</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1 }}><label style={L}>First name</label><input style={I} value={cust.first_name} onChange={e => setCust({ ...cust, first_name: e.target.value })} /></div>
                      <div style={{ flex: 1 }}><label style={L}>Last name</label><input style={I} value={cust.last_name} onChange={e => setCust({ ...cust, last_name: e.target.value })} /></div>
                    </div>
                    <label style={L}>Email</label><input style={I} value={cust.email} onChange={e => setCust({ ...cust, email: e.target.value })} />
                    <label style={L}>Phone</label><input style={I} value={cust.phone} onChange={e => setCust({ ...cust, phone: e.target.value })} />
                    <label style={L}>Billing address</label><input style={I} value={cust.address_1} onChange={e => setCust({ ...cust, address_1: e.target.value })} placeholder="Street" />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <input style={I} value={cust.city} onChange={e => setCust({ ...cust, city: e.target.value })} placeholder="City" />
                      <input style={{ ...I, width: 90 }} value={cust.state} onChange={e => setCust({ ...cust, state: e.target.value })} placeholder="State" />
                      <input style={{ ...I, width: 100 }} value={cust.postcode} onChange={e => setCust({ ...cust, postcode: e.target.value })} placeholder="Postcode" />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13 }}>
                      <input type="checkbox" checked={cust.createAccount} onChange={e => setCust({ ...cust, createAccount: e.target.checked })} />
                      Create a customer account (otherwise a guest order)
                    </label>
                  </div>
                )}
              </div>

              {/* Products */}
              <label style={L}>Products</label>
              <input style={I} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search WooCommerce products by name or SKU…" />
              {searching && <p style={{ fontSize: 12, color: 'var(--slate)', marginTop: 4 }}>Searching…</p>}
              {results.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
                  {results.map(p => (
                    <button key={p.id} onClick={() => addProduct(p)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', border: 'none', borderBottom: '1px solid var(--border)', background: '#fff', cursor: 'pointer', textAlign: 'left' }}>
                      {p.image ? <img src={p.image} alt="" style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover' }} /> : <div style={{ width: 34, height: 34, borderRadius: 6, background: 'var(--canvas)' }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--slate)' }}>{p.sku ? `${p.sku} · ` : ''}${p.price}{p.has_variations ? ' · has options' : ''}{p.stock_status === 'outofstock' ? ' · out of stock' : ''}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Variation picker */}
              {variationFor && (
                <div style={{ border: '1px solid var(--coral)', borderRadius: 10, marginTop: 8, padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700 }}>Choose a variation of {variationFor.name}</span>
                    <button onClick={() => { setVariationFor(null); setVariations([]) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)' }}>✕</button>
                  </div>
                  {variations.map(v => (
                    <button key={v.id} onClick={() => addVariation(v)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6, background: '#fff', cursor: 'pointer', fontSize: 12.5 }}>
                      {v.attributes} — ${v.price} {v.stock_status === 'outofstock' ? '(out of stock)' : ''}
                    </button>
                  ))}
                </div>
              )}

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
              </div>
              <p style={{ fontSize: 11, color: 'var(--slate)', marginTop: 10, lineHeight: 1.5 }}>
                Orders are created unpaid (set_paid: false). GST shown is an inclusive estimate — WooCommerce calculates the authoritative tax based on your store's tax settings.
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
