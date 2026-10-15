'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

// Cloudflare Turnstile widget. Renders nothing when no site key is set (the
// server check is off then too — see lib/turnstile). Calls onToken with a fresh
// token, or '' when it expires; reset() gets a new one after a failed submit,
// since each token can be checked only once.

declare global {
  interface Window { turnstile?: any; __turnstileLoading?: Promise<void> }
}

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''

function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (window.__turnstileLoading) return window.__turnstileLoading
  window.__turnstileLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true; s.defer = true
    s.onload = () => resolve()
    s.onerror = () => { window.__turnstileLoading = undefined; reject(new Error('Turnstile failed to load')) }
    document.head.appendChild(s)
  })
  return window.__turnstileLoading
}

export type TurnstileHandle = { reset: () => void }

const Turnstile = forwardRef<TurnstileHandle, { onToken: (token: string) => void; action?: string }>(
  function Turnstile({ onToken, action }, ref) {
    const box = useRef<HTMLDivElement>(null)
    const widget = useRef<string | null>(null)
    const cb = useRef(onToken)
    cb.current = onToken

    useImperativeHandle(ref, () => ({
      reset: () => { cb.current(''); try { if (widget.current != null) window.turnstile?.reset(widget.current) } catch {} },
    }), [])

    useEffect(() => {
      if (!TURNSTILE_SITE_KEY) return
      let cancelled = false
      loadScript().then(() => {
        if (cancelled || !box.current || !window.turnstile) return
        widget.current = window.turnstile.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          appearance: 'interaction-only',   // invisible unless Cloudflare needs a click
          callback: (t: string) => cb.current(t),
          'expired-callback': () => cb.current(''),
          'error-callback': () => cb.current(''),
        })
      }).catch(() => {})
      return () => {
        cancelled = true
        try { if (widget.current != null) window.turnstile?.remove(widget.current) } catch {}
        widget.current = null
      }
    }, [action])

    if (!TURNSTILE_SITE_KEY) return null
    return <div ref={box} style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 10px' }} />
  },
)

export default Turnstile
