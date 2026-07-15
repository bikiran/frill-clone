'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { SegmentationService } from '@/lib/segmentation-service'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function CustomerProfilePage() {
  const searchParams = useSearchParams()
  const customerId = searchParams.get('id')
  const slug = searchParams.get('slug')

  const [customer, setCustomer] = useState<any>(null)
  const [orders, setOrders] = useState<any[]>([])
  const [calls, setCalls] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [expandedProducts, setExpandedProducts] = useState<Set<number>>(new Set())

  useEffect(() => {
    const init = async () => {
      try {
        if (!customerId) { setError('Missing customer ID'); return }

        // Three-strategy company resolution
        let resolvedCompanyId: string | null = null
        if (slug) {
          const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
          if (co) resolvedCompanyId = co.id
        }
        if (!resolvedCompanyId && typeof window !== 'undefined') {
          const h = window.location.hostname
          if (h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com') {
            const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
            if (co) resolvedCompanyId = co.id
          }
        }
        if (!resolvedCompanyId) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            const { data: ownCo } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
            if (ownCo?.id) resolvedCompanyId = ownCo.id
          }
        }
        if (!resolvedCompanyId) { setError('Company not found'); return }

        // The id param may be a woocommerce_customers.id OR a contacts.id
        // (the inbox links with the contact id). Try both, then fall back to
        // matching by email.
        let customerData: any = null

        // 1. Direct woocommerce_customers lookup
        const { data: byId } = await (supabase as any)
          .from('woocommerce_customers').select('*')
          .eq('company_id', resolvedCompanyId).eq('id', customerId).maybeSingle()
        if (byId) customerData = byId

        // 2. Maybe it's a contact id — resolve the email, then find the woo customer
        let contactEmail: string | null = null
        if (!customerData) {
          const { data: contact } = await (supabase as any)
            .from('contacts').select('*').eq('id', customerId).maybeSingle()
          if (contact) {
            contactEmail = contact.email
            if (contact.email) {
              const { data: byEmail } = await (supabase as any)
                .from('woocommerce_customers').select('*')
                .eq('company_id', resolvedCompanyId).ilike('email', contact.email).maybeSingle()
              if (byEmail) customerData = byEmail
            }
            // No matching woo customer — show the contact as a minimal customer
            if (!customerData) {
              customerData = {
                id: contact.id, email: contact.email,
                first_name: (contact.name || '').split(' ')[0] || '',
                last_name: (contact.name || '').split(' ').slice(1).join(' ') || '',
                phone: contact.phone, total_orders: 0, total_spend: 0,
                items_purchased: [], is_contact_only: true,
              }
            }
          }
        }

        if (!customerData) { setError('Customer not found'); return }
        setCustomer(customerData)

        // Load order history — match by woo_customer_id OR email (guest orders
        // often have customer_id 0 but the same billing email)
        try {
          const email = customerData.email || contactEmail
          let ordersData: any[] = []
          if (customerData.woo_customer_id) {
            const { data: byCust } = await (supabase as any)
              .from('woocommerce_orders').select('*')
              .eq('company_id', resolvedCompanyId)
              .eq('woo_customer_id', customerData.woo_customer_id)
              .order('order_date', { ascending: false })
            ordersData = byCust || []
          }
          if (email) {
            const { data: byEmailOrders } = await (supabase as any)
              .from('woocommerce_orders').select('*')
              .eq('company_id', resolvedCompanyId)
              .ilike('customer_email', email.replace(/[%_]/g, (m: string) => '\\' + m))
              .order('order_date', { ascending: false })
            // Merge, dedupe by woo_order_id
            const seen = new Set(ordersData.map((o: any) => o.woo_order_id))
            for (const o of byEmailOrders || []) {
              if (!seen.has(o.woo_order_id)) { ordersData.push(o); seen.add(o.woo_order_id) }
            }
          }
          ordersData.sort((a: any, b: any) => (b.order_date || '').localeCompare(a.order_date || ''))

          // Live fallback: if nothing has synced yet, pull orders straight from
          // WooCommerce (same as the inbox sidebar does), so the profile isn't
          // blank just because the background sync hasn't caught up.
          if (ordersData.length === 0 && email) {
            try {
              const res = await fetch(`/api/orders/list?companyId=${resolvedCompanyId}&email=${encodeURIComponent(email)}`)
              const live = await res.json()
              if (live.orders?.length) {
                ordersData = live.orders.map((o: any) => ({
                  woo_order_id: o.id, order_number: o.number, status: o.status, total: o.total,
                  currency: o.currency, order_date: o.date, customer_email: email,
                  line_items: o.items, _live: true,
                }))
              }
            } catch {}
          }
          setOrders(ordersData)
        } catch { setOrders([]) }

        // Load call history for this contact
        try {
          const cid = customerData.is_contact_only ? customerData.id : customerData.contact_id
          if (cid) {
            const { data: callData } = await (supabase as any)
              .from('calls').select('*')
              .eq('company_id', resolvedCompanyId)
              .eq('contact_id', cid)
              .order('created_at', { ascending: false }).limit(20)
            setCalls(callData || [])
          }
        } catch { setCalls([]) }
      } catch (err: any) {
        setError(err.message || 'Failed to load customer')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [slug, customerId])

  if (loading) return <div style={{ padding: '24px', color: '#666', display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 18, height: 18, border: '2px solid var(--border)', borderTopColor: 'var(--coral)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />Loading customer profile...</div>
  if (error) return <div style={{ padding: '24px', color: '#d32f2f' }}>{error}</div>
  if (!customer) return <div style={{ padding: '24px', color: '#666' }}>Customer not found</div>

  const rfmScore = SegmentationService.getRFMScore(customer)
  const rfmCategory = SegmentationService.getRFMCategory(rfmScore)
  const firstOrderDate = customer.first_order_date ? new Date(customer.first_order_date) : null
  const lastOrderDate = customer.last_order_date ? new Date(customer.last_order_date) : null
  const daysSinceLast = lastOrderDate ? Math.floor((Date.now() - lastOrderDate.getTime()) / 864e5) : null

  // Total spend: prefer the stored value, but if $0 fall back to summing orders
  const totalSpend = parseFloat(customer.total_spend) || 0
  const ordersSpendTotal = orders.reduce((s, o) => s + (parseFloat(o.total || o.order_total || 0)), 0)
  const displaySpend = totalSpend > 0 ? totalSpend : ordersSpendTotal

  // Products: items_purchased can be string[] or object[] from WooCommerce line items
  const rawItems: any[] = (() => {
    let ip: any = customer.items_purchased
    if (!ip) return []
    // May arrive as a JSON string, a comma-joined string, or a JSONB array
    if (typeof ip === 'string') {
      try { ip = JSON.parse(ip) } catch { ip = ip.split(',').map((s: string) => s.trim()) }
    }
    if (!Array.isArray(ip)) return []
    return ip
      .map((x: any) => {
        if (x == null) return null
        if (typeof x === 'string') return x.trim() ? { name: x.trim() } : null
        if (typeof x === 'object') {
          const name = x.name || x.product_name || x.title || x.label || ''
          if (!name && Object.keys(x).length === 0) return null
          return { ...x, name: name || 'Unnamed product' }
        }
        return { name: String(x) }
      })
      .filter(Boolean)
  })()

  const filteredProducts = rawItems.filter((item: any) => {
    if (!productSearch) return true
    const name = (item.name || item.product_name || '').toLowerCase()
    const cat = (item.category || '').toLowerCase()
    return name.includes(productSearch.toLowerCase()) || cat.includes(productSearch.toLowerCase())
  })

  const addr = customer.address || {}

  // Order-based fallback stats (used when aggregated totals are missing/zero)
  const computedOrders = orders.length
  const displayOrders = customer.total_orders || computedOrders || 0
  const displayAov = displayOrders > 0 ? displaySpend / displayOrders : 0
  const orderItems: any[] = orders.flatMap((o: any) => Array.isArray(o.line_items) ? o.line_items : [])

  const stat = (label: string, value: string, color?: string) => (
    <div style={{ borderRadius: 12, border: '1px solid var(--border)', padding: 16, background: '#fff' }}>
      <p style={{ margin: '0 0 6px 0', fontSize: 12, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
      <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: color || 'var(--ink)' }}>{value}</p>
    </div>
  )

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 30, fontWeight: 700, margin: '0 0 6px 0', color: 'var(--ink)' }}>
          {customer.first_name} {customer.last_name}
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: '#888' }}>{customer.email}</p>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 28 }}>
        <div style={{ borderRadius: 12, border: '1px solid var(--border)', padding: 16, background: '#fff' }}>
          <p style={{ margin: '0 0 6px 0', fontSize: 12, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>RFM Score</p>
          <p style={{ margin: '0 0 2px 0', fontSize: 24, fontWeight: 700, color: 'var(--coral)' }}>{rfmScore}/9</p>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{rfmCategory}</p>
        </div>
        {stat('Total Spend', displaySpend > 0 ? `$${displaySpend.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A')}
        {stat('Total Orders', String(displayOrders))}
        {stat('Avg Order Value', displayAov > 0 ? `$${displayAov.toFixed(2)}` : 'N/A')}
      </div>

      {/* Contact Information */}
      <div style={{ borderRadius: 12, border: '1px solid var(--border)', padding: 20, background: 'var(--peach)', marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Contact Information</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <div>
            <p style={{ margin: '0 0 3px 0', fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase' }}>Email</p>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>
              <a href={`mailto:${customer.email}`} style={{ color: 'var(--coral)', textDecoration: 'none' }}>{customer.email}</a>
            </p>
          </div>
          {customer.phone && (
            <div>
              <p style={{ margin: '0 0 3px 0', fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase' }}>Phone</p>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{customer.phone}</p>
            </div>
          )}
          {(addr.address_1 || addr.city) && (
            <div>
              <p style={{ margin: '0 0 3px 0', fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase' }}>Address</p>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.5 }}>
                {/* Australian standard: street lines, then SUBURB STATE POSTCODE, then country */}
                {[addr.address_1, addr.address_2].filter(Boolean).join(', ')}
                {(addr.address_1 || addr.address_2) && <br />}
                {[addr.city, (addr.state || '').toUpperCase(), addr.postcode].filter(Boolean).join(' ')}
                {(addr.city || addr.state || addr.postcode) && addr.country && <br />}
                {addr.country}
              </p>
            </div>
          )}
          {firstOrderDate && (
            <div>
              <p style={{ margin: '0 0 3px 0', fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase' }}>Customer Since</p>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{firstOrderDate.toLocaleDateString()}</p>
            </div>
          )}
          {daysSinceLast !== null && (
            <div>
              <p style={{ margin: '0 0 3px 0', fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase' }}>Days Since Last Order</p>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{daysSinceLast} days</p>
            </div>
          )}
          {lastOrderDate && (
            <div>
              <p style={{ margin: '0 0 3px 0', fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase' }}>Last Order Date</p>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{lastOrderDate.toLocaleDateString()}</p>
            </div>
          )}
        </div>
      </div>

      {/* Products Purchased — searchable accordion list */}
      {rawItems.length > 0 && (
        <div style={{ borderRadius: 12, border: '1px solid var(--border)', padding: 20, background: '#fff', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
              Products Purchased ({rawItems.length})
            </h3>
            <input
              type="text" placeholder="Search products..."
              value={productSearch} onChange={e => setProductSearch(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none', minWidth: 200 }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 520, overflowY: 'auto', paddingRight: 4 }}>
            {filteredProducts.length === 0 && <p style={{ color: '#888', fontSize: 13 }}>No products match your search.</p>}
            {filteredProducts.map((item: any, idx: number) => {
              // WooCommerce line items vary in shape depending on how they were
              // synced. Be generous about where the name/price/qty might live —
              // previously an unrecognised shape rendered as an empty grey bar.
              const name =
                item.name || item.product_name || item.title ||
                item.parent_name || item.product?.name ||
                (item.sku ? `SKU ${item.sku}` : '') ||
                (item.product_id ? `Product #${item.product_id}` : '') ||
                'Unnamed product'
              const category = item.category || item.categories?.[0]?.name || ''
              const rawImage = item.image?.src || item.image || item.images?.[0]?.src || item.thumbnail || ''
              const image = typeof rawImage === 'string' ? rawImage : ''
              const rawPrice = item.price ?? item.total ?? item.subtotal ?? item.line_total ?? ''
              const price = typeof rawPrice === 'object' ? '' : rawPrice
              const qty = item.quantity ?? item.qty ?? ''
              const description = item.description || item.short_description || ''
              const sku = item.sku || ''
              const isOpen = expandedProducts.has(idx)
              return (
                <div key={idx} style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', background: isOpen ? 'var(--canvas)' : '#fff' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const next = new Set(expandedProducts)
                      if (isOpen) next.delete(idx); else next.add(idx)
                      setExpandedProducts(next)
                    }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', minHeight: 60, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    {image ? (
                      <img src={image} alt={name} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} onError={(e: any) => { e.target.style.display = 'none' }} />
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--peach)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
                      {category && <p style={{ margin: '2px 0 0 0', fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{category}</p>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                      {qty && <span style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>×{qty}</span>}
                      {price !== '' && !isNaN(parseFloat(price)) && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>${parseFloat(price).toFixed(2)}</span>}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
                    </div>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '10px 14px 14px', borderTop: '1px solid var(--border)', fontSize: 13, color: '#555', lineHeight: 1.5 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: description ? 10 : 0 }}>
                        {qty && <div><span style={{ fontSize: 10.5, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Quantity</span>{qty}</div>}
                        {price !== '' && !isNaN(parseFloat(price)) && <div><span style={{ fontSize: 10.5, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Price</span>${parseFloat(price).toFixed(2)}</div>}
                        {category && <div><span style={{ fontSize: 10.5, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Category</span>{category}</div>}
                        {sku && <div><span style={{ fontSize: 10.5, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>SKU</span>{sku}</div>}
                      </div>
                      {description ? <p style={{ margin: 0 }}>{description.replace(/<[^>]+>/g, '')}</p> : (!qty && !price && !category && !sku && <p style={{ margin: 0, color: '#9ca3af' }}>No further details available for this product.</p>)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Call History */}
      {calls.length > 0 && (
        <div style={{ borderRadius: 12, border: '1px solid var(--border)', padding: 20, background: '#fff', marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
            Call History ({calls.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {calls.map((call: any) => {
              const dur = call.duration_seconds || 0
              const durStr = dur > 0 ? `${Math.floor(dur / 60)}m ${dur % 60}s` : (call.status === 'completed' ? 'No answer' : call.status)
              return (
                <div key={call.id} style={{ borderRadius: 8, border: '1px solid var(--border)', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15 }}>{call.direction === 'inbound' ? '📥' : '📤'}</span>
                      <div>
                        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>
                          {call.direction === 'inbound' ? 'Incoming' : 'Outgoing'} call · {durStr}
                        </p>
                        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--slate)' }}>
                          {call.created_at ? new Date(call.created_at).toLocaleString('en-AU') : ''}
                          {call.agent_name ? ` · ${call.agent_name}` : ''}
                        </p>
                      </div>
                    </div>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 600, background: call.status === 'answered' || call.status === 'completed' ? '#dcfce7' : '#fef3c7', color: call.status === 'answered' || call.status === 'completed' ? '#059669' : '#d97706', textTransform: 'capitalize' }}>{call.status}</span>
                  </div>
                  {call.ai_summary && (
                    <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: '#faf5ff', fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.5 }}>
                      ✨ {call.ai_summary}
                    </div>
                  )}
                  {call.recording_url && !call.ai_summary && (
                    <button onClick={async () => {
                      const res = await fetch('/api/telnyx/call-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: call.id }) })
                      const d = await res.json()
                      if (d.summary) setCalls(cs => cs.map(c => c.id === call.id ? { ...c, ai_summary: d.summary } : c))
                    }} style={{ marginTop: 8, fontSize: 12, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                      ✨ Generate AI summary
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Order History */}
      <div style={{ borderRadius: 12, border: '1px solid var(--border)', padding: 20, background: '#fff' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
          Order History ({customer.total_orders || orders.length || 0})
        </h3>
        {orders.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orders.map((order: any) => {
              const orderTotal = parseFloat(order.total || order.order_total || 0)
              const lineItems: any[] = order.line_items || []
              return (
                <div key={order.id} style={{ borderRadius: 8, border: '1px solid var(--border)', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <p style={{ margin: '0 0 3px 0', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Order #{order.woo_order_id}</p>
                      <p style={{ margin: 0, fontSize: 12, color: '#888' }}>
                        {order.order_date ? new Date(order.order_date).toLocaleDateString() : 'Date unknown'}
                        {lineItems.length > 0 && ` • ${lineItems.length} item${lineItems.length !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
                        {orderTotal > 0 ? `$${orderTotal.toFixed(2)}` : '—'}
                      </p>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: order.status === 'completed' ? '#dcfce7' : order.status === 'processing' ? '#dbeafe' : '#fef3c7', color: order.status === 'completed' ? '#166534' : order.status === 'processing' ? '#1e40af' : '#92400e' }}>
                        {order.status || order.order_status || 'unknown'}
                      </span>
                    </div>
                  </div>
                  {lineItems.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                      {lineItems.slice(0, 3).map((li: any, i: number) => (
                        <span key={i}>{i > 0 ? ', ' : ''}{li.name || li.product_name}{li.quantity > 1 ? ` ×${li.quantity}` : ''}</span>
                      ))}
                      {lineItems.length > 3 && <span style={{ color: '#9ca3af' }}> +{lineItems.length - 3} more</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#888', fontSize: 13 }}>
            {displayOrders > 0 ? (
              <>
                <p style={{ margin: '0 0 6px 0' }}>This customer has {displayOrders} orders, but the detailed order history hasn&rsquo;t finished syncing.</p>
                <p style={{ margin: 0, fontSize: 12 }}>Run <strong>Sync Now</strong> in the WooCommerce integration — the order sync now runs in the background until it completes.</p>
              </>
            ) : (
              <>
                <p style={{ margin: '0 0 6px 0' }}>No orders synced yet.</p>
                <p style={{ margin: 0, fontSize: 12 }}>Run <strong>Sync Now</strong> in WooCommerce integration to load order history.</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
