'use client'

import { useEffect, useRef, useState } from 'react'

// A stat that counts up to its value the first time it's shown, like
// "~42 min" or "$1,662". The number inside the text animates; anything around
// it (prefix, suffix) stays put. Non-numbers and reduced motion show as is.

const NUM = /(\d[\d,]*(?:\.\d+)?)/

export default function CountUp({ value, ms = 900 }: { value: string; ms?: number }) {
  const m = value.match(NUM)
  const target = m ? Number(m[1].replace(/,/g, '')) : null
  const decimals = m && m[1].includes('.') ? m[1].split('.')[1].length : 0
  // Starts from 0 straight away (no flash of the final number first).
  const [shown, setShown] = useState<number | null>(() => target != null && typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : null)
  const done = useRef(false)

  useEffect(() => {
    if (target == null || done.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { done.current = true; return }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms)
      if (p < 1) { setShown(target * (1 - Math.pow(1 - p, 3))); raf = requestAnimationFrame(tick) }
      else { done.current = true; setShown(null) }
    }
    raf = requestAnimationFrame(tick)
    // Stopped part way (e.g. the value changed): the next run starts over.
    return () => cancelAnimationFrame(raf)
  }, [target, ms])

  if (!m || shown == null) return <>{value}</>
  const grouped = m[1].includes(',')
  const n = decimals ? shown.toFixed(decimals) : Math.round(shown).toString()
  const text = grouped ? Number(n).toLocaleString('en-AU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : n
  return <>{value.slice(0, m.index)}{text}{value.slice((m.index || 0) + m[1].length)}</>
}
