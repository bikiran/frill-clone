'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Cross-subdomain session handoff. The sign-in page on colvy.com redirects here
// (on the target subdomain) with the access/refresh tokens in the URL hash.
// We explicitly call setSession() — which reliably stores the session in this
// origin's localStorage — then forward to the intended page. This replaces the
// flaky implicit-flow hash detection that left users stuck on the sign-in page.
export default function AuthHandoffPage() {
  const [status, setStatus] = useState('Signing you in…')

  useEffect(() => {
    const run = async () => {
      try {
        const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : ''
        const params = new URLSearchParams(hash)
        const access_token = params.get('access_token')
        const refresh_token = params.get('refresh_token')
        const next = params.get('next') || '/admin'

        if (!access_token || !refresh_token) {
          setStatus('Missing session tokens. Redirecting to sign in…')
          setTimeout(() => { window.location.href = '/signin' }, 1200)
          return
        }

        const { error } = await supabase.auth.setSession({ access_token, refresh_token })
        if (error) {
          setStatus('Could not restore session. Redirecting to sign in…')
          setTimeout(() => { window.location.href = '/signin' }, 1200)
          return
        }

        // Clean the tokens out of the URL, then forward
        window.history.replaceState(null, '', window.location.pathname)
        setStatus('Success! Redirecting…')
        window.location.href = next
      } catch {
        window.location.href = '/signin'
      }
    }
    run()
  }, [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fff', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ width: 34, height: 34, border: '3px solid #f0f0f0', borderTop: '3px solid #ff7a6b', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ marginTop: 18, fontSize: 15, color: '#6b6b70' }}>{status}</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
