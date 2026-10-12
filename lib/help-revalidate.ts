'use client'

import { authFetch } from './auth-fetch'

// Tell the server the public help centre changed, so its short-lived cache
// (lib/help-public) is refreshed now rather than within the minute. Callers
// usually fire and forget; await it before reloading a live preview. Never
// throws — the cache expires on its own anyway, so a failure here is harmless.
export async function refreshPublicHelp(companyId: string | null | undefined, articleIds: string[] = []): Promise<void> {
  if (!companyId) return
  try {
    await authFetch('/api/help/revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, articleIds }),
      keepalive: true,
    })
  } catch {}
}
