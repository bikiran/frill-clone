'use client'

import { useState, useEffect, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) { setError('Passwords do not match'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }

    setLoading(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password })
      if (err) throw err
      setDone(true)
      setTimeout(() => router.push('/admin'), 2000)
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
          {done ? (
            <div className="text-center">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Password updated!</h2>
              <p style={{ color: 'var(--slate)' }}>Redirecting you to the dashboard...</p>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Set new password</h2>
              <p className="text-sm mb-6" style={{ color: 'var(--slate)' }}>Choose a strong password for your account.</p>

              {error && (
                <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#fee2e2', color: '#dc2626' }}>{error}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>New password</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={password}
                      onChange={e => setPassword(e.target.value)} placeholder="Min. 6 characters" required autoFocus
                      className="w-full px-4 py-2.5 rounded-xl border focus:outline-none"
                      style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-sm cursor-pointer" style={{ color: 'var(--slate)' }}>
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Confirm password</label>
                  <input type={showPassword ? 'text' : 'password'} value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)} required
                    className="w-full px-4 py-2.5 rounded-xl border focus:outline-none"
                    style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                </div>
                <button type="submit" disabled={loading || !password}
                  className="w-full py-3 rounded-xl font-semibold text-white cursor-pointer disabled:opacity-50"
                  style={{ background: 'var(--coral)' }}>
                  {loading ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--peach)' }}>Loading...</div>}>
      <ResetPasswordForm />
    </Suspense>
  )
}
