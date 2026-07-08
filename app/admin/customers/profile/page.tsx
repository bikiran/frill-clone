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

        const { data: customerData } = await (supabase as any)
          .from('woocommerce_customers').select('*')
          .eq('company_id', resolvedCompanyId).eq('id', customerId).maybeSingle()

        if (!customerData) { setError('Customer not found'); return }
        setCustomer(customerData)

        // Load order history — woocommerce_orders may not exist yet
        try {
          const { data: ordersData } = await (supabase as any)
            .from('woocommerce_orders').select('*')
            .eq('company_id', resolvedCompanyId)
            .eq('woo_customer_id', customerData.woo_customer_id)
            .order('order_date', { ascending: false })
          setOrders(ordersData || [])
        } catch { setOrders([]) }
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
        {stat('Total Orders', String(customer.total_orders || orders.length || 0))}
        {stat('Avg Order Value', customer.average_order_value > 0 ? `$${parseFloat(customer.average_order_value).toFixed(2)}` : (orders.length > 0 ? `$${(ordersSpendTotal / orders.length).toFixed(2)}` : 'N/A'))}
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
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>
                {[addr.address_1, addr.address_2, addr.city, addr.state, addr.postcode, addr.country].filter(Boolean).join(', ')}
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 480, overflowY: 'auto' }}>
            {filteredProducts.length === 0 && <p style={{ color: '#888', fontSize: 13 }}>No products match your search.</p>}
            {filteredProducts.map((item: any, idx: number) => {
              const name = item.name || item.product_name || `Product ${idx + 1}`
              const category = item.category || item.categories?.[0]?.name || ''
              const image = item.image || item.images?.[0]?.src || item.thumbnail || ''
              const price = item.price || item.total || item.subtotal || ''
              const qty = item.quantity || item.qty || ''
              const description = item.description || item.short_description || ''
              const isOpen = expandedProducts.has(idx)
              return (
                <div key={idx} style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const next = new Set(expandedProducts)
                      if (isOpen) next.delete(idx); else next.add(idx)
                      setExpandedProducts(next)
                    }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', minHeight: 52, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    {image ? (
                      <img src={image} alt={name} style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} onError={(e: any) => { e.target.style.display = 'none' }} />
                    ) : (
                      <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--peach)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
                      {category && <p style={{ margin: '2px 0 0 0', fontSize: 11, color: '#888' }}>{category}</p>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                      {qty && <span style={{ fontSize: 12, color: '#888' }}>×{qty}</span>}
                      {price && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>${parseFloat(price).toFixed(2)}</span>}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="6 9 12 15 18 9"/></svg>
                    </div>
                  </button>
                  {isOpen && description && (
                    <div style={{ padding: '0 12px 12px 58px', fontSize: 13, color: '#555', lineHeight: 1.5, borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 0 }}>
                      {description.replace(/<[^>]+>/g, '')}
                    </div>
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
            <p style={{ margin: '0 0 6px 0' }}>No orders synced yet.</p>
            <p style={{ margin: 0, fontSize: 12 }}>Run <strong>Sync Now</strong> in WooCommerce integration to load order history.</p>
          </div>
        )}
      </div>
    </div>
  )
}
