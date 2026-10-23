'use client'

import { useEffect, useState } from 'react'
import { resolveCompanyUser, peekCompanyUser } from '@/lib/client-cache'
import { NeedsYouView } from '@/components/NeedsYouPage'

// Agents → Needs you: everything waiting on a person, most urgent first (Phase 10).
export default function NeedsYouPage() {
  const [companyId, setCompanyId] = useState<string | null>(peekCompanyUser()?.companyId || null)
  useEffect(() => { resolveCompanyUser().then(r => setCompanyId(r.companyId)).catch(() => {}) }, [])
  return <NeedsYouView companyId={companyId} />
}
