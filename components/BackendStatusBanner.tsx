'use client'

import { useEffect, useRef, useState } from 'react'
import { fetchWithLimit } from '@/lib/net-timeout'

// Connection status, quietly. lib/net-timeout reports when reads give up or
// the network fails (`colvy:backend` down) and when answers come back (up);
// the browser reports going offline and online. Shown only after a short
// grace so one slow request doesn't flash it; when the connection returns it
// says "Back online" for a moment and slides away. "Retry now" checks the
// connection without reloading the page (nothing typed is lost).

type State = 'down' | 'offline' | 'back' | null

export default function BackendStatusBanner() {
  const [state, setState] = useState<State>(null)
  const [checking, setChecking] = useState(false)
  const shown = useRef<State>(null)
  shown.current = state

  useEffect(() => {
    let grace: any = null, hide: any = null
    const recovered = () => {
      clearTimeout(grace)
      if (shown.current === 'down' || shown.current === 'offline') {
        setState('back')
        clearTimeout(hide); hide = setTimeout(() => setState(s => (s === 'back' ? null : s)), 2600)
      }
    }
    const onBackend = (e: Event) => {
      const s = (e as CustomEvent).detail?.state
      if (s === 'down') {
        if (shown.current === 'offline') return
        clearTimeout(grace); grace = setTimeout(() => { clearTimeout(hide); setState('down') }, 1500)
      } else recovered()
    }
    const onOffline = () => { clearTimeout(grace); clearTimeout(hide); setState('offline') }
    const onOnline = () => recovered()
    window.addEventListener('colvy:backend', onBackend)
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    if (typeof navigator !== 'undefined' && navigator.onLine === false) setState('offline')
    return () => {
      clearTimeout(grace); clearTimeout(hide)
      window.removeEventListener('colvy:backend', onBackend)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  // A tiny request to the database; its answer (or not) updates the banner.
  const retry = async () => {
    if (checking) return
    setChecking(true)
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (url) await fetchWithLimit(`${url}/auth/v1/health`, { headers: key ? { apikey: key } : {}, cache: 'no-store' }, 8000)
    } catch {} finally { setChecking(false) }
  }

  if (!state) return null
  const back = state === 'back'
  const text = back ? 'Back online.'
    : state === 'offline' ? 'You’re offline. Some things won’t load or save until you’re back.'
    : 'Reconnecting to Colvy. Some things may not load or save until it’s back.'
  return (
    <div role={back ? 'status' : 'alert'} aria-live="polite" className="cv-netbar">
      <style>{`
        .cv-netbar { position: fixed; left: 50%; top: calc(env(safe-area-inset-top, 0px) + 12px); transform: translateX(-50%); z-index: 100002; width: min(480px, calc(100vw - 24px)); display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 16px; background: rgba(255,255,255,0.86); -webkit-backdrop-filter: blur(18px) saturate(180%); backdrop-filter: blur(18px) saturate(180%); border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 10px 30px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04); color: #3a3a3c; font-size: 13.5px; line-height: 1.4; animation: cvNetIn .28s cubic-bezier(.2,.8,.2,1); }
        @media (max-width: 899px) { .cv-netbar { top: calc(env(safe-area-inset-top, 0px) + 68px); } }
        @keyframes cvNetIn { from { opacity: 0; transform: translate(-50%, -8px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @media (prefers-reduced-motion: reduce) { .cv-netbar { animation: none; } }
      `}</style>
      <span aria-hidden="true" style={{ display: 'flex', flexShrink: 0, color: back ? '#34c759' : '#8e8e93' }}>
        {back ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><circle cx="12" cy="20" r="1" fill="currentColor" /></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 5.17-2.39" /><path d="M1.42 9a16 16 0 0 1 4.7-2.88" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><path d="M16.72 11.06A11 11 0 0 1 19 12.55" /><path d="M10.71 5.05A16 16 0 0 1 22.58 9" /><circle cx="12" cy="20" r="1" fill="currentColor" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>{text}</span>
      {!back && (
        <button type="button" onClick={retry} disabled={checking}
          style={{ flexShrink: 0, border: 'none', background: 'none', padding: '4px 2px', color: '#1c1c1e', fontSize: 13.5, fontWeight: 600, cursor: checking ? 'wait' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: checking ? 0.5 : 1 }}>
          {checking ? 'Checking…' : 'Retry now'}
        </button>
      )}
    </div>
  )
}
