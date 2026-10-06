'use client'

import { authFetch } from '@/lib/auth-fetch'

// Adds a members-only Connect ticket to a start URL (see lib/oauth-state.ts).
export async function withConnectTicket(url: string, companyId: string, purpose: 'meta' | 'instagram' | 'gmail' | 'google_reviews'): Promise<string> {
  const res = await authFetch('/api/oauth/ticket', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, purpose }),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok || !d?.ticket) throw new Error(d?.error || 'Could not start the connection — reload and try again.')
  return `${url}${url.includes('?') ? '&' : '?'}ticket=${encodeURIComponent(d.ticket)}`
}
