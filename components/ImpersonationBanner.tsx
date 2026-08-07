'use client'

import { useEffect, useState } from 'react'

// Shown inside a customer workspace when a platform admin has entered it via
// the Super Admin console. It reads the impersonation session id from the URL
// (?imp=) or sessionStorage, verifies it's still active, counts down to expiry,
// and offers an immediate Exit. Only the admin who opened the workspace has the
// session id, so regular workspace users never see this.
export default function ImpersonationBanner() {
  const [sess, setSess] = useState<any>(null)
  const [id, setId] = useState<string | null>(null)
  const [remaining, setRemaining] = useState<number>(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    let sid: string | null = null
    try {
      const url = new URL(window.location.href)
      sid = url.searchParams.get('imp')
      if (sid) {
        try { sessionStorage.setItem('colvy:imp', sid) } catch {}
        url.searchParams.delete('imp')
        window.history.replaceState(null, '', url.pathname + url.search + url.hash)
      } else {
        try { sid = sessionStorage.getItem('colvy:imp') } catch {}
      }
    } catch {}
    if (!sid) return
    setId(sid)
    fetch(`/api/platform-admin/impersonate?id=${sid}`)
      .then(r => r.json())
      .then(d => {
        if (d.active && d.session) setSess(d.session)
        else { try { sessionStorage.removeItem('colvy:imp') } catch {} }
      })
      .catch(() => {})
  }, [])

  // Push the page down so the fixed bar never covers the workspace chrome.
  useEffect(() => {
    if (!sess) return
    const prev = document.body.style.paddingTop
    document.body.style.paddingTop = '40px'
    return () => { document.body.style.paddingTop = prev }
  }, [!!sess])

  const exit = async () => {
    try {
      if (id) await fetch('/api/platform-admin/impersonate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'end', id }),
      })
    } catch {}
    try { sessionStorage.removeItem('colvy:imp') } catch {}
    // The console lives at the bare host — the explicit /platform-admin path
    // 404s (admin.colvy.com root redirects/rewrites to the panel).
    window.location.href = 'https://admin.colvy.com'
  }

  // Countdown + auto-exit on expiry.
  useEffect(() => {
    if (!sess?.expires_at) return
    const tick = () => {
      const ms = new Date(sess.expires_at).getTime() - Date.now()
      setRemaining(ms)
      if (ms <= 0) exit()
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sess?.expires_at])

  if (!sess) return null
  const mins = Math.max(0, Math.floor(remaining / 60000))
  const secs = Math.max(0, Math.floor((remaining % 60000) / 1000))
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 40, zIndex: 100000, background: '#7c2d12', color: '#fff', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', fontSize: 13, boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24', flexShrink: 0 }} />
        Viewing {sess.company_name || sess.company_slug} as {sess.admin_email}{sess.mode === 'read_only' ? ' · read-only' : ''}
      </span>
      <span style={{ opacity: 0.8 }} className="hidden md:inline">· recorded in the audit log</span>
      <span style={{ marginLeft: 'auto', opacity: 0.85, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>expires {mins}:{String(secs).padStart(2, '0')}</span>
      <button onClick={exit} style={{ padding: '5px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>Exit</button>
    </div>
  )
}
