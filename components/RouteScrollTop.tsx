'use client'

import { useLayoutEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

// Opens every admin page at the top.
//
// The router only scrolls to the top on navigation when the new page's first
// element is off-screen. Most admin pages first render a short skeleton, so
// at that moment the document is short, the check passes and nothing scrolls;
// once the real content arrives the browser puts the old scroll offset back.
// The new page then opened part-way down, with its title tucked under the
// sticky app header (and blurred through it). So on every forward navigation
// to a new path we go to the top ourselves.
//
// Left alone: the first load (the browser restores a reload), back/forward
// (the browser restores those too), and links to a #fragment.
export default function RouteScrollTop() {
  const pathname = usePathname()
  const prev = useRef(pathname)
  // The path a back/forward navigation is heading to.
  const poppedTo = useRef<string | null>(null)

  useLayoutEffect(() => {
    const onPop = () => { poppedTo.current = window.location.pathname }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useLayoutEffect(() => {
    if (prev.current === pathname) return
    prev.current = pathname
    const popped = poppedTo.current === pathname
    poppedTo.current = null
    if (popped || window.location.hash) return
    if (window.scrollY > 0) window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname])

  return null
}
