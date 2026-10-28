'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin } from '@/lib/redirect'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import ColvyLogo from '@/components/ColvyLogo'
import { StatusMark } from '@/components/StatusMark'

// After a magic link: owners to their admin, staff to this workspace's admin,
// everyone else (people who use the board) to the board.
async function landSignedIn(userId: string) {
  const { data: owns } = await (supabase as any).from('companies').select('id').eq('owner_id', userId).limit(1)
  if (owns?.length) return redirectToUserAdmin(userId)
  const { data: roles } = await (supabase as any).from('team_members').select('role').eq('user_id', userId)
  const staff = (roles || []).some((r: any) => !r.role || String(r.role).toLowerCase() !== 'viewer')
  window.location.href = staff ? '/admin' : '/'
}

// Left on this device by the sign-in page when it sent a magic link: the page they
// were on (a path on this site only). Read once. It's also how we know a sign-in
// was a magic link when Supabase has already taken the tokens out of the URL.
function takeMagicLink(): { next: string } | null {
  try {
    const raw = localStorage.getItem('colvy_signin_next')
    localStorage.removeItem('colvy_signin_next')
    const v = raw ? JSON.parse(raw) : null
    if (!v || Date.now() - Number(v.at) > 24 * 3600e3) return null
    const next = typeof v.next === 'string' && v.next.startsWith('/') && !v.next.startsWith('//') ? v.next : ''
    return { next }
  } catch { return null }
}

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
            setStatus('Account confirmed. Setting up your workspace…')
            router.push('/onboarding')
            return
          }

          setStatus('Signed in! Redirecting...')
          // A magic link: back to the page they were signing in from, else by who they are.
          const magic = takeMagicLink()
          if (magic?.next) { window.location.href = magic.next; return }
          if ((magic || type === 'magiclink') && data?.user?.id) { await landSignedIn(data.user.id); return }
          if (data?.user?.id) {
            await redirectToUserAdmin(data.user.id)
          } else {
            router.push('/admin')
          }
          return
        }

        // Try PKCE code from query param (newer Supabase)
        const code = searchParams?.get('code')
        if (code) {
          const { data, error: codeErr } = await (supabase as any).auth.exchangeCodeForSession(code)
          if (codeErr) throw codeErr
          if (data?.user?.id) await redirectToUserAdmin(data.user.id)
          else router.push('/admin')
          return
        }

        // Check if already have session
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user?.id) {
          // Supabase may have read the link's tokens before we did.
          const magic = takeMagicLink()
          if (magic?.next) { window.location.href = magic.next; return }
          if (magic) { await landSignedIn(session.user.id); return }
          await redirectToUserAdmin(session.user.id)
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
        <ColvyLogo size={34} fontSize={22} style={{ marginBottom: 28 }} />
        {error ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><StatusMark kind="cancelled" size={56} /></div>
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
