'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import BookingFlow from '@/components/booking/BookingFlow'
import { tenantSubdomain } from '@/components/booking/subdomain'

// colvy.com/book/<company>[/<service>]  — or, on <company>.colvy.com,
// /book/<service> (the first segment is then the service, not the company).
export default function BookPage() {
  const params = useParams()
  const first = String(params?.slug || '')
  const rest = (params?.service as string[] | undefined) || []
  const [target, setTarget] = useState<{ slug: string; service: string | null } | null>(null)
  useEffect(() => {
    const sub = tenantSubdomain()
    setTarget(sub && sub !== first ? { slug: sub, service: first || null } : { slug: first, service: rest[0] || null })
  }, [first, rest[0]]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!target) return null
  return <BookingFlow slug={target.slug} initialService={target.service} />
}
