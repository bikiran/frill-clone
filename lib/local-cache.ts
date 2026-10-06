'use client'

// Last data a page rendered, kept on this device so a revisit (even after a
// reload) paints instantly and refreshes in the background. Scoped to the
// signed-in user and this workspace's hostname so another account on the same
// browser never sees it. Storage can be full, blocked or wiped at any time, so
// every call is best-effort and a miss just means a normal load.

type Entry<T> = { host: string; userId: string; companyId: string; at: number; data: T }

const PREFIX = 'colvy-cache:'

export function readLocal<T>(key: string, userId: string | null | undefined, maxAgeMs = 7 * 864e5): { companyId: string; data: T; at: number } | null {
  if (!userId || typeof window === 'undefined') return null
  try {
    const e = JSON.parse(localStorage.getItem(PREFIX + key) || 'null') as Entry<T> | null
    if (!e || e.userId !== userId || e.host !== window.location.hostname || Date.now() - e.at > maxAgeMs) return null
    return { companyId: e.companyId, data: e.data, at: e.at }
  } catch { return null }
}

export function writeLocal<T>(key: string, userId: string | null | undefined, companyId: string, data: T): void {
  if (!userId || typeof window === 'undefined') return
  const entry: Entry<T> = { host: window.location.hostname, userId, companyId, at: Date.now(), data }
  try { localStorage.setItem(PREFIX + key, JSON.stringify(entry)) }
  catch { try { localStorage.removeItem(PREFIX + key) } catch {} }
}
