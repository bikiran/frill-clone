'use client'

import { useEffect, useState } from 'react'
import BookingFlow from '@/components/booking/BookingFlow'
import { tenantSubdomain } from '@/components/booking/subdomain'

// <company>.colvy.com/book — the company comes from the subdomain.
export default function BookRoot() {
  const [slug, setSlug] = useState<string | null | undefined>(undefined)
  useEffect(() => { setSlug(tenantSubdomain()) }, [])
  if (slug === undefined) return null
  if (!slug) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', color: '#6b7280', padding: 24, textAlign: 'center' }}>
        Booking pages live at colvy.com/book/&lt;business&gt;.
      </div>
    )
  }
  return <BookingFlow slug={slug} />
}
