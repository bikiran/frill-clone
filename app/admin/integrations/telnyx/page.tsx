'use client'

import { useEffect } from 'react'

// The Calls & SMS page moved to /admin/integrations/calls (the old "telnyx"
// slug leaked the carrier name). This stub forwards any old link — bookmarks,
// and in-flight Stripe return URLs that still point here — preserving the query
// string so provisioning still finalizes.
export default function TelnyxRedirect() {
  useEffect(() => {
    const qs = typeof window !== 'undefined' ? window.location.search : ''
    window.location.replace(`/admin/integrations/calls${qs}`)
  }, [])
  return <div style={{ padding: 24, color: 'var(--slate)' }}>Redirecting…</div>
}
