// Smart links on Colvy's own public pages (the booking page, forms): the
// tracked click a visitor arrived through (?clv=, added by the /l/ redirect),
// remembered in this browser for 7 days so a booking made after looking
// around — or on a second visit — is still credited to the Reel or poster.
//
// The server decides whether the click counts (it must belong to the same
// business); this only carries it.

import { cleanClickRef } from '@/lib/link-channels'

const KEY = 'colvy_clv'
const KEEP_MS = 7 * 86_400_000

export function captureClickRef(): string | null {
  if (typeof window === 'undefined') return null
  let fromUrl: string | null = null
  try { fromUrl = cleanClickRef(new URLSearchParams(window.location.search).get('clv')) } catch { /* no URL */ }
  if (fromUrl) {
    try { localStorage.setItem(KEY, JSON.stringify({ id: fromUrl, ts: Date.now() })) } catch { /* private browsing */ }
    return fromUrl
  }
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
    const id = cleanClickRef(saved?.id)
    if (id && Date.now() - Number(saved.ts) < KEEP_MS) return id
  } catch { /* nothing remembered */ }
  return null
}
