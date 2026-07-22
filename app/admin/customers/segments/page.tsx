'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { SegmentationService, CustomerSegment } from '@/lib/segmentation-service'

export default function CustomerSegmentationPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const slug = searchParams.get('slug') || ''

  const [companyId, setCompanyId] = useState('')
  const [customers, setCustomers] = useState<any[]>([])
  const [segments, setSegments] = useState<CustomerSegment[]>(SegmentationService.getSegments())
  const [selectedSegment, setSelectedSegment] = useState<CustomerSegment | null>(null)
  const [segmentedCustomers, setSegmentedCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const init = async () => {
      try {
        const { data: company } = await (supabase as any)
          .from('companies')
          .select('id')
          .eq('slug', slug)
          .single()

        if (!company) {
          setError('Company not found')
          return
        }

        setCompanyId(company.id)

        // Fetch all customers
        const { data: customersData } = await (supabase as any)
          .from('woocommerce_customers')
          .select('*')
          .eq('company_id', company.id)
          .order('total_spend', { ascending: false })

        setCustomers(customersData || [])
      } catch (err: any) {
        setError(err.message || 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [slug])

  const handleSelectSegment = (segment: CustomerSegment) => {
    setSelectedSegment(segment)
    const filtered = SegmentationService.filterBySegment(customers, segment)
    setSegmentedCustomers(filtered)
  }

  if (loading) {
    return <div style={{ padding: '24px', color: '#666' }}>Loading customer segments...</div>
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '8px', color: 'var(--ink)' }}>
        Customer Segmentation
      </h1>
      <p style={{ fontSize: '14px', color: '#666', marginBottom: '24px' }}>
        Analyze your customers by value, frequency, and behavior patterns
      </p>

      {error && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: '#fee2e2',
          color: '#991b1b',
          marginBottom: '16px'
        }}>
          {error}
        </div>
      )}

      {/* Segment Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>
        {segments.map(segment => {
          const count = SegmentationService.filterBySegment(customers, segment).length
          const isSelected = selectedSegment?.id === segment.id

          return (
            <div
              key={segment.id}
              onClick={() => handleSelectSegment(segment)}
              style={{
                borderRadius: '12px',
                border: isSelected ? '2px solid var(--coral)' : '1px solid var(--border)',
                padding: '16px',
                background: isSelected ? 'var(--peach)' : '#fff',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <p style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>
                {segment.name}
              </p>
              <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#666' }}>
                {segment.description}
              </p>
              <p style={{ margin: '0', fontSize: '20px', fontWeight: 700, color: 'var(--coral)' }}>
                {count} customers
              </p>
            </div>
          )
        })}
      </div>

      {/* RFM Matrix */}
      <div style={{
        borderRadius: '12px',
        border: '1px solid var(--border)',
        padding: '16px',
        background: '#fff',
        marginBottom: '32px'
      }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: 'var(--ink)' }}>
          RFM Analysis
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '12px'
        }}>
          {['Champions', 'Loyal Customers', 'Potential Loyalists', 'At Risk', 'Lost'].map(category => {
            const count = customers.filter(c => 
              SegmentationService.getRFMCategory(SegmentationService.getRFMScore(c)) === category
            ).length

            return (
              <div
                key={category}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'var(--peach)',
                  textAlign: 'center'
                }}
              >
                <p style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>
                  {category}
                </p>
                <p style={{ margin: '0', fontSize: '18px', fontWeight: 700, color: 'var(--coral)' }}>
                  {count}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected Segment Results */}
      {selectedSegment && (
        <div style={{
          borderRadius: '12px',
          border: '1px solid var(--border)',
          padding: '16px',
          background: '#fff'
        }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: 'var(--ink)' }}>
            {selectedSegment.name} ({segmentedCustomers.length})
          </h2>

          {segmentedCustomers.length > 0 ? (
            <div style={{
              overflowX: 'auto'
            }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '13px'
              }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 600, color: 'var(--ink)' }}>
                      Name
                    </th>
                    <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 600, color: 'var(--ink)' }}>
                      Email
                    </th>
                    <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: 600, color: 'var(--ink)' }}>
                      Spend
                    </th>
                    <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: 600, color: 'var(--ink)' }}>
                      Orders
                    </th>
                    <th style={{ textAlign: 'center', padding: '12px 8px', fontWeight: 600, color: 'var(--ink)' }}>
                      RFM
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {segmentedCustomers.slice(0, 50).map(customer => (
                    <tr
                      key={customer.id}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      onClick={() => router.push(`/admin/customers/profile?slug=${slug}&id=${customer.id}`)}
                    >
                      <td style={{ padding: '12px 8px', color: 'var(--ink)', fontWeight: 500 }}>
                        {customer.first_name} {customer.last_name}
                      </td>
                      <td style={{ padding: '12px 8px', color: '#666' }}>
                        {customer.email}
                      </td>
                      <td style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--ink)', fontWeight: 600 }}>
                        ${customer.total_spend.toFixed(0)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--ink)' }}>
                        {customer.total_orders}
                      </td>
                      <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: 'var(--peach)',
                          color: 'var(--ink)',
                          fontWeight: 600
                        }}>
                          {SegmentationService.getRFMScore(customer)}/9
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {segmentedCustomers.length > 50 && (
                <p style={{ margin: '16px 0 0 0', fontSize: '12px', color: '#999', textAlign: 'center' }}>
                  Showing 50 of {segmentedCustomers.length} customers
                </p>
              )}
            </div>
          ) : (
            <p style={{ margin: '0', fontSize: '13px', color: '#999' }}>
              No customers match this segment
            </p>
          )}
        </div>
      )}
    </div>
  )
}
