'use client'

import { useState, useEffect } from 'react'

interface FormField {
  name: string
  label: string
  value: string
  placeholder: string
  disabled?: boolean
  autofilled?: boolean
}

interface FormAutoFillProps {
  email: string
  companyId: string
  onFieldsLoad?: (fields: FormField[]) => void
}

export function FormAutoFill({ email, companyId, onFieldsLoad }: FormAutoFillProps) {
  const [customer, setCustomer] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [fields, setFields] = useState<FormField[]>([])

  useEffect(() => {
    const fetchCustomer = async () => {
      if (!email || !companyId) {
        setLoading(false)
        return
      }

      try {
        const res = await fetch(
          `/api/woocommerce/customer?email=${encodeURIComponent(email)}&companyId=${companyId}`
        )
        const result = await res.json()

        if (result.found) {
          setCustomer(result.customer)
          
          // Build auto-fill fields
          const autoFilledFields: FormField[] = [
            {
              name: 'first_name',
              label: 'First Name',
              value: result.customer.name.split(' ')[0] || '',
              placeholder: 'First Name',
              autofilled: !!result.customer.name
            },
            {
              name: 'last_name',
              label: 'Last Name',
              value: result.customer.name.split(' ').slice(1).join(' ') || '',
              placeholder: 'Last Name',
              autofilled: !!result.customer.name
            },
            {
              name: 'phone',
              label: 'Phone',
              value: result.customer.phone || '',
              placeholder: '+1-555-123-4567',
              autofilled: !!result.customer.phone
            },
            {
              name: 'address',
              label: 'Address',
              value: result.customer.address?.address_1 || '',
              placeholder: '123 Main St',
              autofilled: !!result.customer.address?.address_1
            },
            {
              name: 'city',
              label: 'City',
              value: result.customer.address?.city || '',
              placeholder: 'City',
              autofilled: !!result.customer.address?.city
            },
            {
              name: 'state',
              label: 'State',
              value: result.customer.address?.state || '',
              placeholder: 'State',
              autofilled: !!result.customer.address?.state
            },
            {
              name: 'zip',
              label: 'Zip Code',
              value: result.customer.address?.postcode || '',
              placeholder: '12345',
              autofilled: !!result.customer.address?.postcode
            }
          ]

          setFields(autoFilledFields)
          onFieldsLoad?.(autoFilledFields)
        }
      } catch (err) {
        console.error('Failed to fetch customer:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchCustomer()
  }, [email, companyId, onFieldsLoad])

  if (loading) {
    return null
  }

  if (!customer) {
    return null
  }

  return (
    <div style={{
      borderRadius: '12px',
      border: '1px solid var(--border)',
      padding: '16px',
      background: '#f9fafb',
      marginBottom: '16px'
    }}>
      <p style={{
        fontSize: '13px',
        fontWeight: 600,
        color: 'var(--ink)',
        margin: '0 0 12px 0'
      }}>
        ✓ Customer info pre-filled
      </p>

      <div style={{
        padding: '12px',
        background: '#fff',
        borderRadius: '8px',
        fontSize: '13px',
        marginBottom: '12px'
      }}>
        <p style={{ margin: '0 0 4px 0', fontWeight: 600, color: 'var(--ink)' }}>
          {customer.name}
        </p>
        <p style={{ margin: '0', color: '#666' }}>
          💰 Total Spend: ${customer.totalSpend.toFixed(2)} • 📦 Orders: {customer.totalOrders}
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '8px',
        fontSize: '11px',
        color: '#666'
      }}>
        {fields.filter(f => f.autofilled).map(field => (
          <div key={field.name} style={{
            padding: '6px 8px',
            background: '#dcfce7',
            borderRadius: '4px',
            color: '#166534'
          }}>
            <span style={{ fontWeight: 500 }}>{field.label}:</span> {field.value}
          </div>
        ))}
      </div>
    </div>
  )
}
