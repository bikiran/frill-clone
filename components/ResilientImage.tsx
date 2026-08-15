'use client'

import { useState, useEffect, useMemo } from 'react'
import type { CSSProperties, ReactNode, MouseEvent } from 'react'

// Upgrade http:// (and protocol-relative //) to https:// so the image isn't
// blocked as mixed content on our https page.
const httpsify = (u: string) => u.replace(/^http:\/\//i, 'https://').replace(/^\/\//, 'https://')
// Route through our same-origin proxy — bypasses mixed content, hotlink
// protection and CORS, and is cached for instant repeat loads.
const proxied = (u: string) => `/api/img?src=${encodeURIComponent(u)}`
const bust = (u: string) => `${u}${u.includes('?') ? '&' : '?'}_r=1`

/**
 * An <img> that actually loads — and recovers on its own, no page reload.
 *
 * It walks an escalation ladder of source URLs, advancing whenever an attempt
 * errors OR silently stalls (a hung request that never fires load/error):
 *   1. direct https   2. direct + cache-buster
 *   3. same-origin proxy   4. proxy + cache-buster
 * The proxy step is what fixes the common "blank thumbnail" cases (http image
 * on an https page, hotlink protection). It loads eagerly so it paints as soon
 * as the source is known; when the ladder is exhausted it shows `fallback`.
 */
export default function ResilientImage({
  src,
  alt = '',
  style,
  className,
  onClick,
  fallback,
  stallMs = 4000,
  retryDelay = 400,
}: {
  src?: string | null
  alt?: string
  style?: CSSProperties
  className?: string
  onClick?: (e: MouseEvent<HTMLImageElement>) => void
  fallback?: ReactNode
  stallMs?: number
  retryDelay?: number
}) {
  const candidates = useMemo(() => {
    if (!src) return [] as string[]
    const https = httpsify(src)
    return Array.from(new Set([https, bust(https), proxied(src), bust(proxied(src))]))
  }, [src])

  const [i, setI] = useState(0)
  const [loaded, setLoaded] = useState(false)

  // A new source restarts the ladder.
  useEffect(() => { setI(0); setLoaded(false) }, [src])

  const exhausted = i >= candidates.length

  // Watchdog: if the current candidate hasn't loaded within stallMs (and hasn't
  // errored — that path advances on its own), move to the next one. Re-activates
  // a load that just stopped, without a page reload.
  useEffect(() => {
    if (!candidates.length || loaded || exhausted) return
    const t = setTimeout(() => setI(x => x + 1), stallMs)
    return () => clearTimeout(t)
  }, [i, loaded, exhausted, candidates.length, stallMs])

  if (!candidates.length || exhausted) {
    return <>{fallback ?? <div style={style} className={className} />}</>
  }

  return (
    <img
      key={i}
      src={candidates[i]}
      alt={alt}
      style={style}
      className={className}
      onClick={onClick}
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => setTimeout(() => setI(x => x + 1), retryDelay)}
    />
  )
}
