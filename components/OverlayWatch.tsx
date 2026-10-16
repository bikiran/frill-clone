'use client'

import { useEffect } from 'react'

// Keeps the admin's floating bits out of the way of whatever is open on top.
//
// While any modal, drawer or sheet covers the screen it sets
// `data-colvy-overlay` on <html>. The rules below then hide the mobile bottom
// nav, the Colvy AI orb and the Feedback tab, so they can never sit over a
// modal's Save / Create / Cancel buttons (they used to: the nav is z-index 900
// and most modals are 50–500).
//
// There are dozens of modals across the admin, written as inline-styled
// `position: fixed; inset: 0` backdrops, Tailwind `fixed inset-0`, or their own
// classes, so rather than touching each one this looks for what they all have
// in common: a visible, clickable fixed element covering most of the viewport.
// Mark something `data-overlay-ignore` to leave it out.

const CANDIDATES = [
  '[style*="fixed"]', '.fixed', '[role="dialog"]', '[aria-modal="true"]', 'dialog[open]',
  '[class*="modal" i]', '[class*="overlay" i]', '[class*="backdrop" i]', '[class*="scrim" i]',
  '[class*="sheet" i]', '[class*="drawer" i]',
].join(',')

function coversScreen(el: Element): boolean {
  if (el.closest('[data-overlay-ignore]')) return false
  const cs = getComputedStyle(el)
  if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') return false
  if (cs.pointerEvents === 'none' || Number(cs.opacity) < 0.05) return false
  const r = el.getBoundingClientRect()
  const vw = window.innerWidth, vh = window.innerHeight
  return r.width >= vw * 0.9 && r.height >= vh * 0.6 && r.bottom > 0 && r.top < vh
}

export function anyOverlayOpen(): boolean {
  try {
    const els = document.querySelectorAll(CANDIDATES)
    for (let i = 0; i < els.length; i++) if (coversScreen(els[i])) return true
  } catch {}
  return false
}

export default function OverlayWatch() {
  useEffect(() => {
    const root = document.documentElement
    let timer: ReturnType<typeof setTimeout> | null = null
    let late: ReturnType<typeof setTimeout> | null = null
    const check = () => {
      timer = null
      const open = anyOverlayOpen()
      if (open !== root.hasAttribute('data-colvy-overlay')) root.toggleAttribute('data-colvy-overlay', open)
    }
    const schedule = () => {
      if (!timer) timer = setTimeout(check, 60)
      // Once more after fade-in/out transitions have settled.
      if (late) clearTimeout(late)
      late = setTimeout(check, 420)
    }
    const mo = new MutationObserver(schedule)
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'open', 'aria-hidden'] })
    window.addEventListener('resize', schedule)
    check()
    return () => {
      mo.disconnect(); window.removeEventListener('resize', schedule)
      if (timer) clearTimeout(timer); if (late) clearTimeout(late)
      root.removeAttribute('data-colvy-overlay')
    }
  }, [])

  return (
    <style>{`
      html[data-colvy-overlay] .colvy-mobile-nav,
      html[data-colvy-overlay] .colvy-ai-orb-wrap,
      html[data-colvy-overlay] .colvy-feedback-tab { display: none !important; }
      @media (max-width: 860px) {
        /* Page bottoms clear the nav bar and the AI orb above it, so the last
           button on a page can always be scrolled clear of both. Full-height
           app screens (the inbox) size themselves and are left alone. */
        .colvy-mobile-pad { padding-bottom: calc(58px + 76px + env(safe-area-inset-bottom)) !important; }
        .colvy-mobile-pad:has(.inbox-root) { padding-bottom: calc(58px + env(safe-area-inset-bottom)) !important; }
      }
    `}</style>
  )
}
