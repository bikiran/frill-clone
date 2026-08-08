'use client'

import { useEffect } from 'react'

// The SMS/Calls channel page moved to /admin/crm-settings/channels/calls (the
// old "telnyx" slug leaked the carrier). Forward any old link, preserving the
// query string.
export default function ChannelsTelnyxRedirect() {
  useEffect(() => {
    const qs = typeof window !== 'undefined' ? window.location.search : ''
    window.location.replace(`/admin/crm-settings/channels/calls${qs}`)
  }, [])
  return <div style={{ padding: 24, color: 'var(--slate)' }}>Redirecting…</div>
}
