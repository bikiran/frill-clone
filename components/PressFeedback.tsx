'use client'

import { useEffect } from 'react'

// Gives every button a small press (see "Touch response" in globals.css).
// On pointer-down it marks the button and works out how far it should sink:
// about 6px across whatever its width, between 94% and 98.5%. Buttons inside
// [data-no-press] are left alone.
export default function PressFeedback() {
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      const el = (e.target as Element | null)?.closest?.('button, [role="button"]') as HTMLElement | null
      if (!el || (el as HTMLButtonElement).disabled || el.closest('[data-no-press]')) return
      const w = el.offsetWidth || 1
      el.style.setProperty('--press', Math.max(0.94, Math.min(0.985, 1 - 6 / w)).toFixed(3))
      if (!el.hasAttribute('data-press')) el.setAttribute('data-press', '')
    }
    document.addEventListener('pointerdown', down, { capture: true, passive: true })
    return () => document.removeEventListener('pointerdown', down, { capture: true })
  }, [])
  return null
}
