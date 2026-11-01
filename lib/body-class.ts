'use client'

import { useEffect } from 'react'

/**
 * Put a class on <body> while `on` is true. For "while X is open, change Y
 * elsewhere on the page" rules: `body.x-open .y` instead of `body:has(.x) .y`.
 * A `body:has(...)` rule makes the browser re-check the whole page on every
 * DOM change (each keystroke, each ticking timer), which was costing tens of
 * milliseconds a time across the admin.
 */
export function useBodyClass(className: string, on = true) {
  useEffect(() => {
    if (!on || typeof document === 'undefined') return
    document.body.classList.add(className)
    return () => { document.body.classList.remove(className) }
  }, [className, on])
}
