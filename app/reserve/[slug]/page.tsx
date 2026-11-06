'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import ReserveFlow from '@/components/restaurant/ReserveFlow'
import { tenantSubdomain } from '@/components/booking/subdomain'

// colvy.com/reserve/<restaurant> (on <restaurant>.colvy.com the subdomain wins).
export default function ReservePage() {
  const params = useParams()
  const first = String(params?.slug || '')
  const [slug, setSlug] = useState<string | null>(null)
  useEffect(() => { setSlug(tenantSubdomain() || first) }, [first])
  if (!slug) return null
  return <ReserveFlow slug={slug} />
}
