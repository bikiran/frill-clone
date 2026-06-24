'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function ConfirmHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState('Processing...')
  const [error, setError] = useState('')

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get hash fragment tokens (used by password reset & magic link)
        const hash = window.location.hash
        const params = new URLSearchParams(hash.replace('#', ''))
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')
        const type = params.get('type')

        if (accessToken && refreshToken) {
          // Set the session from hash tokens
          const { data, error: sessionErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (sessionErr) throw sessionErr

          if (type === 'recovery') {
            setStatus('Redirecting to password reset...')
            router.push('/reset-password')
            return
          }

          if (type === 'signup') {
            setStatus('Account confirmed! Setting up your board...')
            router.push('/onboarding')
            return
          }

          setStatus('Signed in! Redirecting...')
          router.push('/admin')
          return
        }

        // Try PKCE code from query param (newer Supabase)
        const code = searchParams?.get('code')
        if (code) {
          const { data, error: codeErr } = await (supabase as any).auth.exchangeCodeForSession(code)
          if (codeErr) throw codeErr
          router.push('/admin')
          return
        }

        // Check if already have session
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          router.push('/admin')
          return
        }

        setError('Invalid or expired link. Please try again.')
      } catch (err: any) {
        setError(err.message || 'Something went wrong')
      }
    }

    handleCallback()
  }, [router, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--peach)' }}>
      <div className="text-center">
        {error ? (
          <>
            <div className="text-4xl mb-4">❌</div>
            <p className="font-bold mb-2" style={{ color: 'var(--ink)' }}>Link expired or invalid</p>
            <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>{error}</p>
            <a href="/forgot-password" className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white inline-block"
              style={{ background: 'var(--coral)' }}>
              Request new link
            </a>
          </>
        ) : (
          <>
            <div className="w-10 h-10 rounded-full border-2 animate-spin mx-auto mb-4"
              style={{ borderColor: 'var(--coral)', borderTopColor: 'transparent' }} />
            <p style={{ color: 'var(--ink)' }}>{status}</p>
          </>
        )}
      </div>
    </div>
  )
}

export default function AuthConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--peach)' }}>
        <div className="w-10 h-10 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--coral)', borderTopColor: 'transparent' }} />
      </div>
    }>
      <ConfirmHandler />
    </Suspense>
  )
}
