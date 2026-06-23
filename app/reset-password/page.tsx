'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function ResetPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/update-password` : undefined,
      })
      if (error) {
        setError(error.message)
      } else {
        setSent(true)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--peach)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6 text-2xl font-bold" style={{ color: 'var(--coral)' }}>
            YourApp
          </Link>
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Reset your password</h1>
          <p style={{ color: 'var(--slate)' }}>We'll email you a link to set a new one</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8" style={{ border: '1px solid var(--border)' }}>
          {sent ? (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">✉️</div>
              <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--ink)' }}>Check your email</h2>
              <p style={{ color: 'var(--slate)' }}>
                If an account exists for <strong style={{ color: 'var(--ink)' }}>{email}</strong>, a reset link is on its way.
              </p>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-2.5 rounded-lg focus:outline-none transition-smooth"
                  style={{ border: '1px solid var(--border)', fontSize: '16px' }}
                  required
                  autoFocus
                />
              </div>

              {error && (
                <div className="p-3 rounded-lg text-sm animate-fade-in-up" style={{ background: '#fee2e2', color: '#dc2626' }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email}
                className="w-full py-3 rounded-lg font-semibold text-white transition-smooth press-effect futuristic-btn disabled:opacity-50"
                style={{ background: 'var(--coral)' }}>
                {loading ? 'Sending…' : '✉️ Send reset link'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center mt-6" style={{ color: 'var(--slate)' }}>
          Remembered it?{' '}
          <Link href="/signin" className="font-semibold transition-smooth hover:opacity-70" style={{ color: 'var(--coral)' }}>
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
