'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'

// A short-lived token for a conversation's email attachment links (see
// /api/email/attachment/token), cached per conversation for the session.
const cache = new Map<string, { token: string; at: number }>()
const inflight = new Map<string, Promise<string | null>>()
const TTL = 5 * 60 * 60 * 1000

async function fetchToken(conversationId: string): Promise<string | null> {
  const hit = cache.get(conversationId)
  if (hit && Date.now() - hit.at < TTL) return hit.token
  if (!inflight.has(conversationId)) {
    inflight.set(conversationId, (async () => {
      try {
        const res = await authFetch('/api/email/attachment/token', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId }),
        })
        const d = await res.json().catch(() => ({}))
        if (res.ok && d?.token) { cache.set(conversationId, { token: d.token, at: Date.now() }); return d.token as string }
      } catch {}
      return null
    })().finally(() => inflight.delete(conversationId)))
  }
  return inflight.get(conversationId)!
}

export function useAttachmentToken(conversationId?: string | null): string | null {
  const [token, setToken] = useState<string | null>(() => (conversationId && cache.get(conversationId)?.token) || null)
  useEffect(() => {
    if (!conversationId) { setToken(null); return }
    let live = true
    fetchToken(conversationId).then(t => { if (live) setToken(t) })
    return () => { live = false }
  }, [conversationId])
  return token
}
