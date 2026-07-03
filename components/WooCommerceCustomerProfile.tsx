'use client'

import { useState, useEffect } from 'react'

interface CustomerData {
  customer: {
    id: string
    wooId: number
    name: string
    email: string
    phone: string
    address: any
    totalSpend: number
    totalOrders: number
    averageOrderValue: number
    lastOrderDate: string
    firstOrderDate: string
    itemsPurchased: string[]
    orderStatuses: Record<string, number>
  }
  orders: Array<{
    id: string
    order_date: string
    order_total: number
    order_status: string
    items: any[]
  }>
}

interface Props {
  email: string
  companyId: string
}

export function WooCommerceCustomerProfile({ email, companyId }: Props) {
  const [data, setData] = useState<CustomerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchCustomer = async () => {
      try {
        const res = await fetch(`/api/woocommerce/customer?email=${encodeURIComponent(email)}&companyId=${companyId}`)
        const result = await res.json()

        if (result.found) {
          setData(result as CustomerData)
        } else {
          setError('No purchase history found')
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load customer data')
      } finally {
        setLoading(false)
      }
    }

    fetchCustomer()
  }, [email, companyId])

  if (loading) {
    return <div style={{ padding: '16px', color: '#666' }}>Loading purchase history...</div>
  }

  if (error) {
    return <div style={{ padding: '16px', color: '#888', fontSize: '13px' }}>{error}</div>
  }

  if (!data) {
    return null
  }

  const { customer, orders } = data

  return (
    <div style={{ 
      borderRadius: '12px',
      border: '1px solid var(--border)',
      padding: '16px',
      background: 'var(--peach)',
      marginBottom: '16px'
    }}>
      {/* Customer Header */}
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ margin: '0 0 8px 0', color: 'var(--ink)', fontSize: '15px', fontWeight: 700 }}>
          Customer Profile
        </h3>
        <p style={{ margin: '0', color: '#0d0d0d', fontSize: '13px', fontWeight: 500 }}>
          {customer.name}
        </p>
        <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '12px' }}>
          {customer.email}
        </p>
      </div>

      {/* Key Metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '12px',
        marginBottom: '16px'
      }}>
        <div style={{ 
          padding: '12px',
          background: '#fff',
          borderRadius: '8px',
          border: '1px solid var(--border)'
        }}>
          <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>Total Spend</p>
          <p style={{ margin: '0', fontSize: '16px', fontWeight: 700, color: 'var(--coral)' }}>
            ${customer.totalSpend.toFixed(2)}
          </p>
        </div>

        <div style={{ 
          padding: '12px',
          background: '#fff',
          borderRadius: '8px',
          border: '1px solid var(--border)'
        }}>
          <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>Orders</p>
          <p style={{ margin: '0', fontSize: '16px', fontWeight: 700, color: 'var(--ink)' }}>
            {customer.totalOrders}
          </p>
        </div>

        <div style={{ 
          padding: '12px',
          background: '#fff',
          borderRadius: '8px',
          border: '1px solid var(--border)'
        }}>
          <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>Avg Order Value</p>
          <p style={{ margin: '0', fontSize: '16px', fontWeight: 700, color: 'var(--ink)' }}>
            ${customer.averageOrderValue.toFixed(2)}
          </p>
        </div>

        <div style={{ 
          padding: '12px',
          background: '#fff',
          borderRadius: '8px',
          border: '1px solid var(--border)'
        }}>
          <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>Frequency</p>
          <p style={{ margin: '0', fontSize: '16px', fontWeight: 700, color: 'var(--ink)' }}>
            {customer.totalOrders > 0 
              ? ((customer.totalOrders / ((new Date(customer.lastOrderDate).getTime() - new Date(customer.firstOrderDate).getTime()) / (1000 * 60 * 60 * 24 * 30))) * 12).toFixed(1)
              : '0'} orders/year
          </p>
        </div>
      </div>

      {/* Contact Info */}
      {(customer.phone || customer.address) && (
        <div style={{
          padding: '12px',
          background: '#fff',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          marginBottom: '16px'
        }}>
          {customer.phone && (
            <p style={{ margin: '0 0 4px 0', fontSize: '12px' }}>
              <span style={{ color: '#666' }}>Phone:</span> {customer.phone}
            </p>
          )}
          {customer.address && (
            <p style={{ margin: '0', fontSize: '12px' }}>
              <span style={{ color: '#666' }}>Address:</span> {customer.address.address_1}
              {customer.address.city && `, ${customer.address.city}`}
            </p>
          )}
        </div>
      )}

      {/* Recent Orders */}
      {orders.length > 0 && (
        <div>
          <h4 style={{ 
            margin: '0 0 12px 0', 
            fontSize: '13px', 
            fontWeight: 600, 
            color: 'var(--ink)' 
          }}>
            Recent Orders ({orders.length})
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {orders.slice(0, 5).map(order => (
              <div 
                key={order.id}
                style={{
                  padding: '12px',
                  background: '#fff',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  fontSize: '12px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <p style={{ margin: '0 0 4px 0', fontWeight: 600, color: 'var(--ink)' }}>
                      ${order.order_total.toFixed(2)}
                    </p>
                    <p style={{ margin: '0', color: '#666', fontSize: '11px' }}>
                      {new Date(order.order_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    background: order.order_status === 'completed' ? '#dcfce7' : '#fef3c7',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: order.order_status === 'completed' ? '#166534' : '#92400e'
                  }}>
                    {order.order_status}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {orders.length > 5 && (
            <p style={{
              margin: '8px 0 0 0',
              fontSize: '12px',
              color: '#999',
              textAlign: 'center'
            }}>
              +{orders.length - 5} more order{orders.length - 5 !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
