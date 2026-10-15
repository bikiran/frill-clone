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

/**
 * Embedded on the business's own website (the booking or form embed code),
 * the ?clv= is on the host page, not ours, and our storage there is separate.
 * Ask the host page: widget.js (and the booking / form embed code) answer with
 * the click the visitor arrived through. Calls `onRef` at most once; returns a
 * cleanup function.
 */
export function askHostForClickRef(onRef: (id: string) => void): () => void {
  if (typeof window === 'undefined' || window.parent === window) return () => {}
  let done = false
  const onMessage = (e: MessageEvent) => {
    if (done || e.source !== window.parent || !e.data?.colvy || e.data.type !== 'clv') return
    const id = cleanClickRef(e.data.clv)
    if (!id) return
    done = true
    onRef(id)
  }
  window.addEventListener('message', onMessage)
  // Again a little later, in case the host's widget.js loads after us.
  const ask = () => { if (!done) try { window.parent.postMessage({ colvy: true, type: 'clv_request' }, '*') } catch { /* no host */ } }
  ask()
  const timers = [setTimeout(ask, 1500), setTimeout(ask, 4000)]
  return () => { done = true; window.removeEventListener('message', onMessage); timers.forEach(clearTimeout) }
}
