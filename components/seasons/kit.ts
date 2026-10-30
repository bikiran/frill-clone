'use client'

// Shared by the seasonal themes (Halloween, Christmas): timers that clear
// themselves, and where the scene sits (under the app bar, beside the rail).

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

export const rnd = (a: number, b: number) => a + Math.random() * (b - a)

/** setTimeout that's cleared when the theme goes away. */
export function useLater() {
  const timers = useRef(new Set<number>())
  useEffect(() => { const set = timers.current; return () => { set.forEach(clearTimeout); set.clear() } }, [])
  return useCallback((fn: () => void, ms: number) => {
    const t = window.setTimeout(() => { timers.current.delete(t); fn() }, ms)
    timers.current.add(t)
    return t
  }, [])
}

/** The app bar's bottom and the main column's left edge (the admin rail), kept up to date. */
export function useSceneFrame() {
  const pathname = usePathname()
  const later = useLater()
  const [frame, setFrame] = useState({ top: 56, left: 0, width: 1200 })
  useEffect(() => {
    const measure = () => {
      const h = document.querySelector('header.cv-app-header')
      const main = document.querySelector('.admin-main')
      const top = Math.round(h ? Math.max(0, h.getBoundingClientRect().bottom) : 0)
      const left = Math.round(main ? Math.max(0, main.getBoundingClientRect().left) : 0)
      const width = window.innerWidth - left
      setFrame(f => (f.top === top && f.left === left && f.width === width ? f : { top, left, width }))
    }
    measure()
    const t = later(measure, 900)
    window.addEventListener('resize', measure)
    return () => { clearTimeout(t); window.removeEventListener('resize', measure) }
  }, [pathname, later])
  return frame
}
