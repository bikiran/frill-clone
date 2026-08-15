'use client'

import { useState, useEffect } from 'react'
import type { CSSProperties, ReactNode, MouseEvent } from 'react'

/**
 * An <img> that loads eagerly (so it appears as soon as its source is known)
 * and recovers on its own from a failed OR silently-stalled load — no page
 * reload needed:
 *
 *  - onError → retry with a cache-busting URL (so the browser re-requests
 *    instead of replaying the cached failure), up to maxRetries, then fall back
 *    to `fallback`.
 *  - a watchdog retries the same way if an attempt neither loads nor errors
 *    within `stallMs` (the "it just stopped" case — a hung request that never
 *    fires either event).
 */
export default function ResilientImage({
  src,
  alt = '',
  style,
  className,
  onClick,
  fallback,
  maxRetries = 4,
  retryDelay = 400,
  stallMs = 4000,
}: {
  src?: string | null
  alt?: string
  style?: CSSProperties
  className?: string
  onClick?: (e: MouseEvent<HTMLImageElement>) => void
  fallback?: ReactNode
  maxRetries?: number
  retryDelay?: number
  stallMs?: number
}) {
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // A new source is a fresh start — clear any prior failure/retry/loaded state.
  useEffect(() => {
    setAttempt(0)
    setFailed(false)
    setLoaded(false)
  }, [src])

  // Watchdog: if the current attempt hasn't loaded (or errored) within stallMs,
  // treat it as stalled and re-request. This re-activates a load that silently
  // stopped, without a page reload.
  useEffect(() => {
    if (!src || failed || loaded) return
    const t = setTimeout(() => {
      if (attempt < maxRetries) setAttempt(attempt + 1)
      else setFailed(true)
    }, stallMs)
    return () => clearTimeout(t)
  }, [src, attempt, failed, loaded, maxRetries, stallMs])

  if (!src || failed) {
    return <>{fallback ?? <div style={style} className={className} />}</>
  }

  // First attempt uses the clean URL; retries append a cache-buster so the
  // browser actually re-fetches instead of serving the cached error.
  const url = attempt === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}_r=${attempt}`

  return (
    <img
      key={attempt}
      src={url}
      alt={alt}
      style={style}
      className={className}
      onClick={onClick}
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => {
        if (attempt < maxRetries) {
          setTimeout(() => setAttempt(a => a + 1), retryDelay * (attempt + 1))
        } else {
          setFailed(true)
        }
      }}
    />
  )
}
