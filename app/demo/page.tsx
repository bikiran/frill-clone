'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Public entry to the Colvy showcase. Mints a demo session server-side (the
// password never touches the client), then drops the visitor into the Harbour &
// Bean workspace. Cross-subdomain uses /auth/handoff; same-origin (preview/local)
// sets the session directly.
export default function DemoEntry() {
  const [status, setStatus] = useState('Loading the Colvy demo…')

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/demo/session', { method: 'POST' })
        const d = await res.json()
        if (!res.ok || !d.access_token) {
          setStatus(d.error || 'The demo is warming up — please refresh in a moment.')
          return
        }
        const slug = d.slug || 'demo'
        const host = typeof window !== 'undefined' ? window.location.hostname : ''
        const onDemoSub = host === `${slug}.colvy.com`
        if (host.endsWith('colvy.com') && !onDemoSub) {
          // Cross-subdomain: establish the session on the demo subdomain.
          window.location.href = `https://${slug}.colvy.com/auth/handoff#access_token=${encodeURIComponent(d.access_token)}&refresh_token=${encodeURIComponent(d.refresh_token)}&next=${encodeURIComponent('/admin')}`
        } else {
          // Same origin (preview / localhost / already on the demo subdomain).
          await supabase.auth.setSession({ access_token: d.access_token, refresh_token: d.refresh_token })
          window.location.href = '/admin'
        }
      } catch {
        setStatus('Something went wrong starting the demo. Please try again.')
      }
    })()
  }, [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fff', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', padding: 24, textAlign: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #f0f0f0', borderTopColor: '#ff7a6b', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ marginTop: 20, fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>Harbour &amp; Bean Café</p>
      <p style={{ marginTop: 4, fontSize: 14, color: '#6b6b70' }}>{status}</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
