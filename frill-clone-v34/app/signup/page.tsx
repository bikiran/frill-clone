'use client'

import { useState, useEffect, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function SignUpForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const addAccount = searchParams?.get('add') === '1'
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (!addAccount) {
      supabase.auth.getSession().then((data: any) => {
        if (data.data?.session) {
          router.push('/admin')
        }
      })
    }
  }, [router, addAccount])

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    try {
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name: name.trim() || email.split('@')[0] },
        },
      })

      if (err) {
        setError(err.message)
      } else if (data.user) {
        // Account created successfully
        alert('Account created! You can now sign in.')
        router.push('/signin')
      }
    } catch (err: any) {
      setError(err.message || 'Sign up failed')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--canvas)' }}>
      <div className="w-full max-w-md">
        <Link href="/landing" className="inline-flex items-center gap-2 mb-8 text-2xl font-bold">
          <span className="text-3xl">💭</span>
          <span style={{ color: 'var(--coral)' }}>Frill</span>
        </Link>

        <div className="bg-white rounded-2xl border p-8" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Create account</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--slate)' }}>
            {addAccount ? 'Create another account' : 'Join the feedback revolution'}
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#fee2e2', color: '#dc2626' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Full name (optional)</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                className="w-full px-4 py-2.5 rounded-lg border focus:outline-none"
                style={{ borderColor: 'var(--border)', fontSize: '16px' }}
              />
            </div>

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

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 6 characters"
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

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Confirm password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-lg border focus:outline-none"
                style={{ borderColor: 'var(--border)', fontSize: '16px' }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--coral)' }}
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm mt-6" style={{ color: 'var(--slate)' }}>
            Already have an account?{' '}
            <Link href="/signin" className="font-semibold hover:underline" style={{ color: 'var(--coral)' }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<div style={{ background: 'var(--canvas)' }} className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <SignUpForm />
    </Suspense>
  )
}
