'use client'

import { useEffect, useState } from 'react'
import ReserveFlow from '@/components/restaurant/ReserveFlow'
import { tenantSubdomain } from '@/components/booking/subdomain'

// <company>.colvy.com/reserve — the restaurant comes from the subdomain.
export default function ReserveRoot() {
  const [slug, setSlug] = useState<string | null | undefined>(undefined)
  useEffect(() => { setSlug(tenantSubdomain()) }, [])
  if (slug === undefined) return null
  if (!slug) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', color: '#6b7280', padding: 24, textAlign: 'center' }}>
        Table booking pages live at colvy.com/reserve/&lt;restaurant&gt;.
      </div>
    )
  }
  return <ReserveFlow slug={slug} />
}
