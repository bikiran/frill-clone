'use client'

import { useEffect, useState } from 'react'
import Portal from '@/components/portal/Portal'
import { tenantSubdomain } from '@/components/booking/subdomain'

// <business>.colvy.com/account — the business's "Your account" page for its
// customers (components/portal/Portal). The business comes from the subdomain.
export default function AccountRoot() {
  const [slug, setSlug] = useState<string | null | undefined>(undefined)
  useEffect(() => { setSlug(tenantSubdomain()) }, [])
  if (slug === undefined) return null
  if (!slug) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', color: '#6b7280', padding: 24, textAlign: 'center' }}>
        Customer account pages live at colvy.com/account/&lt;business&gt;.
      </div>
    )
  }
  return <Portal slug={slug} />
}
