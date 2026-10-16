// Browser helpers for the public poll and survey pages.

import { cleanClickRef } from '@/lib/link-channels'
import type { EngageKind } from '@/lib/engage-core'

/**
 * The campaign / QR click this visit came through (?clv=). It's taken off the
 * address bar straight away, so a copied or shared link doesn't carry it, and
 * kept only for this tab's visit (sessionStorage), not for days.
 */
export function takeClickRef(kind: EngageKind, id: string): string | null {
  if (typeof window === 'undefined') return null
  const key = `colvy_clv:${kind}:${id}`
  let ref: string | null = null
  try {
    const url = new URL(window.location.href)
    ref = cleanClickRef(url.searchParams.get('clv'))
    if (url.searchParams.has('clv')) {
      url.searchParams.delete('clv')
      window.history.replaceState(window.history.state, '', url.toString())
    }
  } catch { /* no URL */ }
  try {
    if (ref) sessionStorage.setItem(key, ref)
    else ref = cleanClickRef(sessionStorage.getItem(key))
  } catch { /* storage blocked */ }
  return ref
}

/**
 * Inside an embed iframe: tell the host page how tall the content is, so the
 * embed code can size the iframe (it only listens to messages from our origin).
 */
export function reportEmbedHeight(kind: EngageKind, id: string): () => void {
  if (typeof window === 'undefined' || window.parent === window || typeof ResizeObserver === 'undefined') return () => {}
  let last = 0
  const send = () => {
    const h = Math.ceil(document.documentElement.scrollHeight)
    if (Math.abs(h - last) < 2) return
    last = h
    try { window.parent.postMessage({ colvy: true, type: 'colvy-embed-height', kind, id, height: h }, '*') } catch { /* no host */ }
  }
  const ro = new ResizeObserver(send)
  ro.observe(document.body)
  send()
  return () => ro.disconnect()
}
