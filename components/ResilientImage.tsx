'use client'

import { useState, useEffect } from 'react'
import type { CSSProperties, ReactNode, MouseEvent } from 'react'

/**
 * An <img> that recovers from transient load failures instead of getting stuck
 * on a broken image forever. On error it retries a few times, cache-busting the
 * URL so the browser re-requests rather than replaying the cached failure; once
 * the retries are exhausted it renders `fallback` (a placeholder) instead of the
 * browser's broken-image glyph.
 */
export default function ResilientImage({
  src,
  alt = '',
  style,
  className,
  onClick,
  fallback,
  maxRetries = 3,
  retryDelay = 700,
}: {
  src?: string | null
  alt?: string
  style?: CSSProperties
  className?: string
  onClick?: (e: MouseEvent<HTMLImageElement>) => void
  fallback?: ReactNode
  maxRetries?: number
  retryDelay?: number
}) {
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)

  // A new source is a fresh start — clear any prior failure/retry state.
  useEffect(() => {
    setAttempt(0)
    setFailed(false)
  }, [src])

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
      loading="lazy"
      onError={() => {
        if (attempt < maxRetries) {
          // Small increasing back-off before re-requesting.
          setTimeout(() => setAttempt(a => a + 1), retryDelay * (attempt + 1))
        } else {
          setFailed(true)
        }
      }}
    />
  )
}
