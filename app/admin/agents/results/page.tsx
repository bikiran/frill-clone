'use client'

import { useEffect, useState } from 'react'
import { resolveCompanyUser, peekCompanyUser } from '@/lib/client-cache'
import { ResultsView } from '@/components/AgentResults'

// Agents → Results: what the agents achieved, what they brought to the team,
// and what they've earned the trust to do on their own (Phase 9).
export default function AgentResultsPage() {
  const [companyId, setCompanyId] = useState<string | null>(peekCompanyUser()?.companyId || null)
  useEffect(() => { resolveCompanyUser().then(r => setCompanyId(r.companyId)).catch(() => {}) }, [])
  return <ResultsView companyId={companyId} />
}
