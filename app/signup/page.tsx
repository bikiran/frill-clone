'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { INDUSTRIES, getIndustryById } from '@/lib/industryPresets'

export default function SignUp() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [industry, setIndustry] = useState('saas')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    // Don't redirect if coming from "add new account" — user was already signed out
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    const isAddAccount = params?.get('add') === '1'
    if (!isAddAccount) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) router.push('/')
      })
    }
  }, [router])

  const seedIndustryData = async (industryId: string) => {
    const preset = getIndustryById(industryId)
    try {
      // Save preferences
      if (typeof window !== 'undefined') {
        localStorage.setItem('site_settings', JSON.stringify({
          companyName: companyName || 'YourApp',
          industry: industryId,
        }))
        localStorage.setItem('user_industry', industryId)
      }
      // Seed statuses
      for (let i = 0; i < preset.statuses.length; i++) {
        const s = preset.statuses[i]
        await supabase.from('statuses').upsert({ key: s.key, label: s.label, color: s.color, bg: s.bg, order_index: i })
      }
      // Seed sample ideas
      for (const idea of preset.sampleIdeas) {
        await supabase.from('ideas').insert({
          title: idea.title,
          description: idea.description,
          status: idea.status,
          votes: idea.votes,
          created_by_name: 'Sample',
          topics: [preset.topics[0]],
          show_on_roadmap: true,
        })
      }
    } catch (e) {
      console.error('Seed error:', e)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    try {
      const redirectTo = typeof window !== 'undefined' 
        ? `${window.location.origin}/auth/callback` 
        : undefined

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo },
      })

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      // If session is returned, user is auto-signed in
      if (data.session) {
        await seedIndustryData(industry)
        router.push('/')
        router.refresh()
      } else {
        // Email confirmation required - save industry choice in localStorage for later seeding
        if (typeof window !== 'undefined') {
          localStorage.setItem('pending_industry', industry)
          localStorage.setItem('pending_company_name', companyName)
        }
        setSent(true)
        setLoading(false)
      }
    } catch (err: any) {
      setError(err.message || 'Sign up failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--peach)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6 text-2xl font-bold" style={{ color: 'var(--coral)' }}>
            YourApp
          </Link>
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Create your account</h1>
          <p style={{ color: 'var(--slate)' }}>Start collecting feedback in minutes</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8" style={{ border: '1px solid var(--border)' }}>
          {sent ? (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">✉️</div>
              <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--ink)' }}>Confirm your email</h2>
              <p style={{ color: 'var(--slate)' }}>
                We sent a confirmation link to <strong style={{ color: 'var(--ink)' }}>{email}</strong>. Click it to activate your account.
              </p>
              <Link
                href="/signin"
                className="inline-block mt-6 text-sm font-medium transition-smooth"
                style={{ color: 'var(--coral)' }}>
                ← Back to sign in
              </Link>
            </div>
          ) : step === 1 ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>
                  Company name
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Inc."
                  className="w-full px-4 py-2.5 rounded-lg focus:outline-none transition-smooth"
                  style={{ border: '1px solid var(--border)', fontSize: '16px' }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ink)' }}>
                  What's your business?
                </label>
                <p className="text-xs mb-3" style={{ color: 'var(--slate)' }}>
                  We'll customize topics, statuses, and sample data for you.
                </p>
                <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
                  {INDUSTRIES.map(ind => (
                    <button
                      key={ind.id}
                      type="button"
                      onClick={() => setIndustry(ind.id)}
                      className="text-left p-3 rounded-xl border-2 transition-smooth cursor-pointer hover:shadow-md"
                      style={{
                        borderColor: industry === ind.id ? 'var(--coral)' : 'var(--border)',
                        background: industry === ind.id ? 'var(--peach)' : 'white',
                      }}>
                      <div className="text-2xl mb-1">{ind.icon}</div>
                      <div className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{ind.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!industry}
                className="w-full py-2.5 rounded-lg font-semibold text-white text-sm transition-smooth press-effect disabled:opacity-50 cursor-pointer"
                style={{ background: 'var(--coral)' }}>
                Continue →
              </button>
            </div>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs font-medium cursor-pointer hover:opacity-70"
                style={{ color: 'var(--coral)' }}>
                ← Back
              </button>
              
              <div className="p-3 rounded-lg" style={{ background: 'var(--peach)' }}>
                <p className="text-xs" style={{ color: 'var(--coral)' }}>
                  <strong>{getIndustryById(industry).icon} {getIndustryById(industry).label}</strong> selected
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>
                  Email
                </label>
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

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  minLength={6}
                  className="w-full px-4 py-2.5 rounded-lg focus:outline-none transition-smooth"
                  style={{ border: '1px solid var(--border)', fontSize: '16px' }}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>
                  Confirm password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  minLength={6}
                  className="w-full px-4 py-2.5 rounded-lg focus:outline-none transition-smooth"
                  style={{ border: '1px solid var(--border)', fontSize: '16px' }}
                  required
                />
              </div>

              {error && (
                <div className="p-3 rounded-lg text-sm animate-fade-in-up" style={{ background: '#fee2e2', color: '#dc2626' }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email || !password || !confirmPassword}
                className="w-full py-3 rounded-lg font-semibold text-white transition-smooth press-effect futuristic-btn disabled:opacity-50"
                style={{ background: 'var(--coral)' }}>
                {loading ? 'Creating account…' : '✨ Create account'}
              </button>

              <p className="text-xs text-center" style={{ color: 'var(--slate)' }}>
                By signing up, you agree to our Terms of Service and Privacy Policy.
              </p>
            </form>
          )}
        </div>

        <p className="text-center mt-6" style={{ color: 'var(--slate)' }}>
          Already have an account?{' '}
          <Link href="/signin" className="font-semibold transition-smooth hover:opacity-70" style={{ color: 'var(--coral)' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
