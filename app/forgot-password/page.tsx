'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/confirm`,
      })
      if (err) throw err
      setSent(true)
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--peach)' }}>
      <div className="w-full max-w-md">
        <Link href="/landing" className="inline-block mb-8 text-2xl font-bold" style={{ color: 'var(--coral)' }}>
          Colvy
        </Link>

        <div className="bg-white rounded-2xl shadow-lg p-8" style={{ border: '1px solid var(--border)' }}>
          {sent ? (
            <div className="text-center">
              <div className="text-5xl mb-4">📬</div>
              <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Check your email</h2>
              <p className="text-sm mb-6" style={{ color: 'var(--slate)' }}>
                We sent a password reset link to <strong>{email}</strong>
              </p>
              <p className="text-xs mb-4" style={{ color: 'var(--slate)' }}>
                Didn't receive it? Check your spam folder or{' '}
                <button onClick={() => setSent(false)} className="underline cursor-pointer" style={{ color: 'var(--coral)' }}>
                  try again
                </button>
              </p>
              <Link href="/signin" className="text-sm font-semibold" style={{ color: 'var(--coral)' }}>
                ← Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Forgot password?</h2>
              <p className="text-sm mb-6" style={{ color: 'var(--slate)' }}>
                Enter your email and we'll send you a reset link.
              </p>

              {error && (
                <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#fee2e2', color: '#dc2626' }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Email address</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@company.com" required autoFocus
                    className="w-full px-4 py-2.5 rounded-xl border focus:outline-none"
                    style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                </div>
                <button type="submit" disabled={loading || !email}
                  className="w-full py-3 rounded-xl font-semibold text-white cursor-pointer disabled:opacity-50"
                  style={{ background: 'var(--coral)' }}>
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>

              <p className="text-center text-sm mt-6" style={{ color: 'var(--slate)' }}>
                Remember your password?{' '}
                <Link href="/signin" className="font-semibold hover:underline" style={{ color: 'var(--coral)' }}>
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
