'use client'

import { useEffect, useRef, useState } from 'react'

// A number that counts up the first time it appears in a session and glides
// to its new value when it changes. Shown at once for people who prefer less
// motion. `id` names the figure so returning to a page doesn't replay it.
const played = new Set<string>()

export default function CountUp({ id, value, format = n => String(Math.round(n)), duration = 750 }: {
  id: string; value: number; format?: (n: number) => string; duration?: number
}) {
  const [n, setN] = useState(() => (played.has(id) ? value : 0))
  const from = useRef(played.has(id) ? value : 0)

  useEffect(() => {
    played.add(id)
    const target = Number.isFinite(value) ? value : 0
    if (from.current === target) { setN(target); return }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { from.current = target; setN(target); return }
    const a = from.current, start = performance.now()
    let raf = requestAnimationFrame(function step(t) {
      const k = Math.min(1, (t - start) / duration)
      const v = a + (target - a) * (1 - Math.pow(1 - k, 3))
      from.current = v
      setN(v)
      if (k < 1) raf = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(raf)
  }, [id, value, duration])

  return <>{format(n)}</>
}
