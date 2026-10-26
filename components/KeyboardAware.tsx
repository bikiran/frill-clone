'use client'

// Phones: while the on-screen keyboard is up, mark <html class="kb-open"> so
// screens can make room above it. The bottom tabs and the banners step aside
// (globals.css) and the inbox's email box sheds its To row (inbox page). The
// root layout also asks the browser to shrink the page for the keyboard
// (viewport interactive-widget=resizes-content) instead of drawing it over the
// bottom of the page, where the reply box is.
//
// "Up" means a text field has focus AND the visible height has dropped well
// below what it is with the keyboard down, so closing the keyboard with the
// back button (the field keeps focus) brings everything back. Touch screens only.

import { useEffect } from 'react'

const KEYBOARD_PX = 150
// Input types that bring up a keyboard.
const TEXT = /^(text|search|email|url|tel|password|number)?$/

function typing(el: Element | null): boolean {
  if (!el) return false
  const h = el as HTMLElement
  if (h.getAttribute('inputmode') === 'none') return false
  if (h.isContentEditable) return true
  if (el.tagName === 'TEXTAREA') return !(el as HTMLTextAreaElement).readOnly
  if (el.tagName === 'INPUT') { const i = el as HTMLInputElement; return !i.readOnly && TEXT.test((i.getAttribute('type') || '').toLowerCase()) }
  return false
}

export default function KeyboardAware() {
  useEffect(() => {
    if (!window.matchMedia?.('(hover: none) and (pointer: coarse)').matches) return
    const root = document.documentElement
    const vv = window.visualViewport
    const height = () => vv?.height ?? window.innerHeight
    // The tallest the page has been at this width: the keyboard-down height
    // (per width, so turning the phone doesn't confuse it).
    const tallest = new Map<number, number>()
    let t: ReturnType<typeof setTimeout> | undefined
    const sync = () => {
      clearTimeout(t)
      // After the focus move settles (one field to the next shouldn't flicker).
      t = setTimeout(() => {
        const w = window.innerWidth, h = height()
        tallest.set(w, Math.max(tallest.get(w) || 0, h))
        const up = typing(document.activeElement) && (tallest.get(w)! - h) > KEYBOARD_PX
        root.classList.toggle('kb-open', up)
      }, 30)
    }
    sync()
    document.addEventListener('focusin', sync)
    document.addEventListener('focusout', sync)
    vv?.addEventListener('resize', sync)
    window.addEventListener('resize', sync)
    return () => {
      clearTimeout(t)
      document.removeEventListener('focusin', sync)
      document.removeEventListener('focusout', sync)
      vv?.removeEventListener('resize', sync)
      window.removeEventListener('resize', sync)
      root.classList.remove('kb-open')
    }
  }, [])
  return null
}
