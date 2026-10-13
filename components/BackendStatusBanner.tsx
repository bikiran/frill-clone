'use client'

import { useEffect, useState } from 'react'

// "Can't reach Colvy" banner. lib/net-timeout reports when reads give up or the
// network fails (`colvy:backend` down) and when answers come back (up). Shown
// only after a short grace so one slow request doesn't flash it; it clears by
// itself once anything answers again.
export default function BackendStatusBanner() {
  const [down, setDown] = useState(false)
  useEffect(() => {
    let timer: any = null
    const on = (e: Event) => {
      const state = (e as CustomEvent).detail?.state
      clearTimeout(timer)
      if (state === 'down') timer = setTimeout(() => setDown(true), 1500)
      else setDown(false)
    }
    window.addEventListener('colvy:backend', on)
    return () => { clearTimeout(timer); window.removeEventListener('colvy:backend', on) }
  }, [])
  if (!down) return null
  return (
    <div role="alert" style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 100002, maxWidth: 'calc(100vw - 32px)', width: 520, display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 12, background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', fontSize: 13, fontWeight: 600, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', lineHeight: 1.45 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9.5v4M12 17h.01" /></svg>
      <span style={{ flex: 1, minWidth: 0 }}>Can&rsquo;t reach Colvy&rsquo;s database right now, so some things may not load or save. It&rsquo;ll recover by itself; you can also try again in a minute.</span>
      <button type="button" onClick={() => window.location.reload()} style={{ flexShrink: 0, border: '1px solid #fdba74', background: '#fff', color: '#9a3412', borderRadius: 8, padding: '5px 10px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Retry</button>
    </div>
  )
}
