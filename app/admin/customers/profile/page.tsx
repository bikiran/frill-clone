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
  const [feedback, setFeedback] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [companyId, setCompanyId] = useState('')

  useEffect(() => {
    const init = async () => {
      try {
        if (!customerId) {
          setError('Missing customer ID')
          return
        }

        // Resolve company: ?slug= → hostname slug → owner. The ?slug= param is
        // often empty when navigating from the Users page on a subdomain.
        let resolvedCompanyId: string | null = null

        if (slug) {
          const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
          if (co) resolvedCompanyId = co.id
        }

        if (!resolvedCompanyId && typeof window !== 'undefined') {
          const h = window.location.hostname
          if (h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com') {
            const hostSlug = h.replace('.colvy.com', '')
            const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', hostSlug).maybeSingle()
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

        if (!resolvedCompanyId) {
          setError('Company not found')
          return
        }

        setCompanyId(resolvedCompanyId)
        const company = { id: resolvedCompanyId }

        // Get customer — maybeSingle never throws
        const { data: customerData } = await (supabase as any)
          .from('woocommerce_customers')
          .select('*')
          .eq('company_id', company.id)
          .eq('id', customerId)
          .maybeSingle()

        if (!customerData) {
          setError('Customer not found')
          return
        }

        setCustomer(customerData)

        // Get orders
        const { data: ordersData } = await supabase
          .from('woocommerce_orders')
          .select('*')
          .eq('company_id', company.id)
          .eq('woo_customer_id', customerData.woo_customer_id)
          .order('order_date', { ascending: false })

        setOrders(ordersData || [])

        // Get feedback/ideas from this customer
        // TODO: Link ideas to customers by email
        setFeedback([])
      } catch (err: any) {
        setError(err.message || 'Failed to load customer')
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [slug, customerId])

  if (loading) {
    return <div style={{ padding: '24px', color: '#666' }}>Loading customer profile...</div>
  }

  if (error) {
    return <div style={{ padding: '24px', color: '#d32f2f' }}>{error}</div>
  }

  if (!customer) {
    return <div style={{ padding: '24px', color: '#666' }}>Customer not found</div>
  }

  const rfmScore = SegmentationService.getRFMScore(customer)
  const rfmCategory = SegmentationService.getRFMCategory(rfmScore)

  const customerSinceDate = new Date(customer.first_order_date)
  const lastOrderDate = customer.last_order_date ? new Date(customer.last_order_date) : null
  const daysSinceLastOrder = lastOrderDate
    ? Math.floor((Date.now() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24))
    : 'N/A'

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--ink)' }}>
          {customer.first_name} {customer.last_name}
        </h1>
        <p style={{ margin: '0', fontSize: '14px', color: '#666' }}>
          {customer.email}
        </p>
      </div>

      {/* RFM Score & Segment */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>
        <div style={{
          borderRadius: '12px',
          border: '1px solid var(--border)',
          padding: '16px',
          background: '#fff'
        }}>
          <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>RFM Score</p>
          <p style={{ margin: '0 0 4px 0', fontSize: '24px', fontWeight: 700, color: 'var(--coral)' }}>
            {rfmScore}/9
          </p>
          <p style={{ margin: '0', fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
            {rfmCategory}
          </p>
        </div>

        <div style={{
          borderRadius: '12px',
          border: '1px solid var(--border)',
          padding: '16px',
          background: '#fff'
        }}>
          <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>Total Spend</p>
          <p style={{ margin: '0', fontSize: '24px', fontWeight: 700, color: 'var(--ink)' }}>
            ${customer.total_spend.toFixed(2)}
          </p>
        </div>

        <div style={{
          borderRadius: '12px',
          border: '1px solid var(--border)',
          padding: '16px',
          background: '#fff'
        }}>
          <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>Total Orders</p>
          <p style={{ margin: '0', fontSize: '24px', fontWeight: 700, color: 'var(--ink)' }}>
            {customer.total_orders}
          </p>
        </div>

        <div style={{
          borderRadius: '12px',
          border: '1px solid var(--border)',
          padding: '16px',
          background: '#fff'
        }}>
          <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>Avg Order Value</p>
          <p style={{ margin: '0', fontSize: '24px', fontWeight: 700, color: 'var(--ink)' }}>
            ${customer.average_order_value.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Contact Info */}
      <div style={{
        borderRadius: '12px',
        border: '1px solid var(--border)',
        padding: '16px',
        background: 'var(--peach)',
        marginBottom: '32px'
      }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 600, color: 'var(--ink)' }}>
          Contact Information
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          {customer.phone && (
            <div>
              <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>Phone</p>
              <p style={{ margin: '0', fontSize: '14px', fontWeight: 500, color: 'var(--ink)' }}>
                {customer.phone}
              </p>
            </div>
          )}

          {customer.address?.address_1 && (
            <div>
              <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>Address</p>
              <p style={{ margin: '0', fontSize: '14px', fontWeight: 500, color: 'var(--ink)' }}>
                {customer.address.address_1}
                {customer.address.address_2 && ` ${customer.address.address_2}`}
              </p>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#666' }}>
                {customer.address.city}, {customer.address.state} {customer.address.postcode}
              </p>
            </div>
          )}

          <div>
            <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>Customer Since</p>
            <p style={{ margin: '0', fontSize: '14px', fontWeight: 500, color: 'var(--ink)' }}>
              {customerSinceDate.toLocaleDateString()}
            </p>
          </div>

          <div>
            <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>Days Since Last Order</p>
            <p style={{ margin: '0', fontSize: '14px', fontWeight: 500, color: 'var(--ink)' }}>
              {daysSinceLastOrder === 'N/A' ? 'N/A' : `${daysSinceLastOrder} days`}
            </p>
          </div>
        </div>
      </div>

      {/* Products Purchased */}
      {customer.items_purchased && customer.items_purchased.length > 0 && (
        <div style={{
          borderRadius: '12px',
          border: '1px solid var(--border)',
          padding: '16px',
          background: '#fff',
          marginBottom: '32px'
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 600, color: 'var(--ink)' }}>
            Products Purchased ({customer.items_purchased.length})
          </h3>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {customer.items_purchased.map((item: string, idx: number) => (
              <div
                key={idx}
                style={{
                  padding: '6px 12px',
                  borderRadius: '20px',
                  background: 'var(--peach)',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--ink)'
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Order History */}
      <div style={{
        borderRadius: '12px',
        border: '1px solid var(--border)',
        padding: '16px',
        background: '#fff'
      }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 600, color: 'var(--ink)' }}>
          Order History ({orders.length})
        </h3>

        {orders.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {orders.map(order => (
              <div
                key={order.id}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <p style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                    Order #{order.woo_order_id}
                  </p>
                  <p style={{ margin: '0', fontSize: '12px', color: '#666' }}>
                    {new Date(order.order_date).toLocaleDateString()}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                    ${order.order_total.toFixed(2)}
                  </p>
                  <p
                    style={{
                      margin: '0',
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: '3px',
                      background: order.order_status === 'completed' ? '#dcfce7' : '#fef3c7',
                      color: order.order_status === 'completed' ? '#166534' : '#92400e',
                      display: 'inline-block'
                    }}
                  >
                    {order.order_status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: '0', fontSize: '13px', color: '#999' }}>No orders found</p>
        )}
      </div>
    </div>
  )
}
