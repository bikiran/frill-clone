'use client'

import { useState, useEffect, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signInWithGoogle, signInWithGitHub } from '@/lib/auth'

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextUrl = searchParams?.get('next') || '/'
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [showPassword, setShowPassword] = useState(false)
  const [oauthLoading, setOAuthLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.push(nextUrl)
      }
    })
  }, [router, nextUrl])

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        setLoading(false)
      } else {
        router.push(nextUrl)
        router.refresh()
      }
    } catch (err: any) {
      setError(err.message || 'Sign in failed')
      setLoading(false)
    }
  }

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${nextUrl}` }
      })
      if (error) {
        setError(error.message)
      } else {
        alert('Check your email for the sign-in link!')
      }
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  const handleOAuthSignIn = async (provider: 'google' | 'github') => {
    setOAuthLoading(true)
    setError('')
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${nextUrl}` }
      })
      if (error) setError(error.message)
    } catch (err: any) {
      setError(err.message)
    }
    setOAuthLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--canvas)' }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2">
            <div className="text-3xl font-black" style={{ color: 'var(--coral)' }}>💭</div>
            <h1 className="text-2xl font-black" style={{ color: 'var(--ink)' }}>FrillClone</h1>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border p-8" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Welcome back</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--slate)' }}>Sign in to your feedback board</p>

          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#fee2e2', color: '#dc2626' }}>
              {error}
            </div>
          )}

          {/* SSO Buttons */}
          <div className="space-y-3 mb-6">
            <button
              onClick={() => handleOAuthSignIn('google')}
              disabled={oauthLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border font-medium cursor-pointer hover:bg-gray-50 transition-smooth disabled:opacity-50"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="16">G</text>
              </svg>
              Google
            </button>
            <button
              onClick={() => handleOAuthSignIn('github')}
              disabled={oauthLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border font-medium cursor-pointer hover:bg-gray-50 transition-smooth disabled:opacity-50"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v 3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              GitHub
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4 mb-6">
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            <span style={{ color: 'var(--slate)', fontSize: '12px' }}>Or continue with email</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>

          {/* Mode Toggle */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setMode('password')}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-smooth cursor-pointer"
              style={{
                background: mode === 'password' ? 'var(--peach)' : 'var(--canvas)',
                color: mode === 'password' ? 'var(--coral)' : 'var(--slate)',
              }}
            >
              Password
            </button>
            <button
              onClick={() => setMode('magic')}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-smooth cursor-pointer"
              style={{
                background: mode === 'magic' ? 'var(--peach)' : 'var(--canvas)',
                color: mode === 'magic' ? 'var(--coral)' : 'var(--slate)',
              }}
            >
              Magic Link
            </button>
          </div>

          {/* Form */}
          <form onSubmit={mode === 'password' ? handlePasswordSignIn : handleMagicLink} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-2.5 rounded-lg border focus:outline-none"
                style={{ borderColor: 'var(--border)', fontSize: '16px' }}
              />
            </div>

            {mode === 'password' && (
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 rounded-lg border focus:outline-none"
                    style={{ borderColor: 'var(--border)', fontSize: '16px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                    style={{ color: 'var(--slate)' }}
                  >
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || oauthLoading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--coral)' }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-sm mt-6" style={{ color: 'var(--slate)' }}>
            Don't have an account?{' '}
            <Link href="/signup" className="font-semibold hover:underline" style={{ color: 'var(--coral)' }}>
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div style={{ background: 'var(--canvas)' }} className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <SignInForm />
    </Suspense>
  )
}
