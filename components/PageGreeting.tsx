'use client'

import { useEffect, useState } from 'react'

/**
 * A short, personal line for a page header — "Good morning, Bikiran · 3 due
 * today". Deliberately one line rather than a banner: on a working screen a
 * greeting should be a small warm touch, not something you have to scroll past
 * every time you open the page.
 *
 * Renders nothing until mounted so the server and client agree — the hour is
 * only known in the browser, and rendering a guess first causes a hydration
 * mismatch and a visible flicker.
 */
export function timeGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  if (hour >= 17 && hour < 21) return 'Good evening'
  return 'Working late'
}

export default function PageGreeting({
  name, detail, style,
}: {
  name?: string | null
  /** Something true about this page right now, e.g. "3 due today". */
  detail?: string | null
  style?: React.CSSProperties
}) {
  const [mounted, setMounted] = useState(false)
  const [greeting, setGreeting] = useState('')

  useEffect(() => {
    setGreeting(timeGreeting(new Date().getHours()))
    setMounted(true)
    // Re-check on the hour so a tab left open overnight doesn't still say
    // "Good morning" at midnight.
    const id = setInterval(() => setGreeting(timeGreeting(new Date().getHours())), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  if (!mounted) return null

  const first = (name || '').trim().split(/\s+/)[0] || ''

  return (
    <p className="rise" style={{
      margin: 0, fontSize: 13, color: 'var(--slate)', fontWeight: 500,
      display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap',
      ...style,
    }}>
      <span>{greeting}{first ? `, ${first}` : ''}</span>
      {detail && (
        <>
          <span aria-hidden style={{ opacity: 0.4 }}>·</span>
          <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{detail}</span>
        </>
      )}
    </p>
  )
}
