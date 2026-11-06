'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Portal from '@/components/portal/Portal'
import { tenantSubdomain } from '@/components/booking/subdomain'

// colvy.com/account/<business> (on <business>.colvy.com the subdomain wins).
export default function AccountPage() {
  const params = useParams()
  const first = String(params?.slug || '')
  const [slug, setSlug] = useState<string | null>(null)
  useEffect(() => { setSlug(tenantSubdomain() || first) }, [first])
  if (!slug) return null
  return <Portal slug={slug} />
}
