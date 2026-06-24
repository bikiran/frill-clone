'use client'

import { useState, useEffect, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { signInWithGoogle, signInWithGitHub } from '@/lib/auth'
import { isValidSlug, isSlugAvailable } from '@/lib/board'
import { redirectToUserAdmin } from '@/lib/redirect'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const INDUSTRIES = ['SaaS', 'E-commerce', 'Healthcare', 'Education', 'Finance',
  'Logistics', 'Manufacturing', 'Media & Entertainment', 'Travel & Hospitality',
  'Retail', 'Real Estate', 'Other']

function SignUpForm() {
  const router = useRouter()
  const [step, setStep] = useState(1)

  // Step 1
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Step 2
  const [companyName, setCompanyName] = useState('')
  const [slug, setSlug] = useState('')
  const [industry, setIndustry] = useState('')
  const [slugStatus, setSlugStatus] = useState<'idle'|'checking'|'available'|'taken'|'invalid'>('idle')

  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOAuthLoading] = useState('')
  const [error, setError] = useState('')
  const [needsConfirmation, setNeedsConfirmation] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      if (data?.session?.user) router.push('/admin')
    })
  }, [router])

  // Auto-generate slug from company name
  useEffect(() => {
    if (!companyName) { setSlug(''); setSlugStatus('idle'); return }
    const auto = companyName.toLowerCase()
      .replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')
      .replace(/^-|-$/g, '').slice(0, 30)
    if (auto.length >= 3) setSlug(auto)
  }, [companyName])

  // Check slug availability
  useEffect(() => {
    if (!slug) { setSlugStatus('idle'); return }
    if (!isValidSlug(slug)) { setSlugStatus('invalid'); return }
    setSlugStatus('checking')
    const t = setTimeout(async () => {
      const available = await isSlugAvailable(slug)
      setSlugStatus(available ? 'available' : 'taken')
    }, 500)
    return () => clearTimeout(t)
  }, [slug])

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) { setError('Passwords do not match'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    setStep(2)
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!companyName.trim()) { setError('Company name is required'); return }
    if (slugStatus !== 'available') { setError('Please choose a valid, available board URL'); return }
    if (!industry) { setError('Please select an industry'); return }

    setLoading(true)
    try {
      // 1. Sign up
      const { data, error: authErr } = await supabase.auth.signUp({
        email, password,
        options: {
          data: { display_name: companyName, company: companyName, industry },
          // Store company info in metadata so we can create it after email confirm
          emailRedirectTo: `${window.location.origin}/auth/callback?slug=${slug}&name=${encodeURIComponent(companyName)}&industry=${encodeURIComponent(industry)}`,
        },
      })
      if (authErr) throw authErr
      if (!data.user) throw new Error('Signup failed — please try again')

      const userId = data.user.id

      // 2. Create company now if we have a session (email confirm disabled)
      //    OR save to pending if email confirm is required
      if (data.session) {
        // Email confirm is OFF — user is logged in immediately
        const res = await fetch('/api/companies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, slug: slug.toLowerCase(), name: companyName.trim(), industry, accentColor: '#ff7a6b' }),
        })
        const result = await res.json()
        if (result.error && !result.error.includes('duplicate')) throw new Error(result.error)
        // Redirect to their subdomain onboarding
        const hostname = window.location.hostname
        const isLocal = hostname.includes('localhost') || hostname.includes('vercel.app')
        if (!isLocal) {
          window.location.href = `https://${slug.toLowerCase()}.colvy.com/onboarding`
        } else {
          router.push('/onboarding')
        }
      } else {
        // Email confirm is ON — save pending company to localStorage, show confirm screen
        localStorage.setItem('pending_company', JSON.stringify({
          userId, slug: slug.toLowerCase(), name: companyName.trim(), industry
        }))
        setNeedsConfirmation(true)
      }
    } catch (err: any) {
      setError(err.message || 'Sign up failed')
    }
    setLoading(false)
  }

  const handleGoogle = async () => { setOAuthLoading('google'); await signInWithGoogle() }
  const handleGitHub = async () => { setOAuthLoading('github'); await signInWithGitHub() }

  const slugStatusColor: any = { idle: 'var(--slate)', checking: '#f59e0b', available: '#10b981', taken: '#ef4444', invalid: '#ef4444' }
  const slugStatusMsg: any = { idle: '', checking: 'Checking...', available: '✓ Available', taken: '✗ Already taken', invalid: '✗ Use lowercase letters, numbers and hyphens (3–30 chars)' }

  // Email confirmation screen
  if (needsConfirmation) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--peach)' }}>
        <div className="max-w-md w-full text-center">
          <div className="text-5xl mb-4">📧</div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Check your email</h1>
          <p className="mb-2" style={{ color: 'var(--slate)' }}>
            We sent a confirmation link to <strong>{email}</strong>
          </p>
          <p className="text-sm mb-6" style={{ color: 'var(--slate)' }}>
            Click the link in the email to activate your account and board.
          </p>
          <div className="bg-white rounded-2xl border p-5 mb-4" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>Your board will be at:</p>
            <p className="font-bold" style={{ color: 'var(--coral)' }}>{slug}.colvy.com</p>
          </div>
          <p className="text-xs" style={{ color: 'var(--slate)' }}>
            Didn't receive it? Check your spam folder or{' '}
            <button onClick={() => setNeedsConfirmation(false)} className="underline cursor-pointer" style={{ color: 'var(--coral)' }}>
              try again
            </button>
          </p>

          {/* Quick fix: disable email confirm option */}
          <div className="mt-6 p-4 rounded-xl text-left text-xs" style={{ background: 'var(--canvas)', color: 'var(--slate)' }}>
            <p className="font-semibold mb-1">💡 Tip for faster access:</p>
            <p>In Supabase → Authentication → Providers → Email → disable "Confirm email" to let users in immediately.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--peach)' }}>
      <div className="w-full max-w-md">
        <Link href="/landing" className="inline-block mb-8 text-2xl font-bold" style={{ color: 'var(--coral)' }}>
          Colvy
        </Link>

        <div className="bg-white rounded-2xl shadow-lg p-8" style={{ border: '1px solid var(--border)' }}>
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            {[1, 2].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                  style={{ background: step >= s ? 'var(--coral)' : 'var(--border)', color: step >= s ? 'white' : 'var(--slate)' }}>
                  {step > s ? '✓' : s}
                </div>
                {s < 2 && <div className="h-0.5 w-8 rounded" style={{ background: step > s ? 'var(--coral)' : 'var(--border)' }} />}
              </div>
            ))}
            <span className="ml-2 text-sm" style={{ color: 'var(--slate)' }}>
              {step === 1 ? 'Account details' : 'Your board'}
            </span>
          </div>

          {error && <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#fee2e2', color: '#dc2626' }}>{error}</div>}

          {step === 1 ? (
            <>
              <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--ink)' }}>Create account</h2>
              <p className="text-sm mb-6" style={{ color: 'var(--slate)' }}>Free forever — no credit card needed</p>

              <div className="space-y-2 mb-5">
                <button onClick={handleGoogle} disabled={!!oauthLoading}
                  className="w-full px-4 py-2.5 rounded-xl border flex items-center justify-center gap-3 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
                  style={{ borderColor: 'var(--border)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  {oauthLoading === 'google' ? 'Redirecting...' : 'Continue with Google'}
                </button>
                <button onClick={handleGitHub} disabled={!!oauthLoading}
                  className="w-full px-4 py-2.5 rounded-xl border flex items-center justify-center gap-3 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
                  style={{ borderColor: 'var(--border)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                  {oauthLoading === 'github' ? 'Redirecting...' : 'Continue with GitHub'}
                </button>
              </div>

              <div className="relative mb-5">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t" style={{ borderColor: 'var(--border)' }} /></div>
                <div className="relative flex justify-center text-xs"><span className="px-2 bg-white" style={{ color: 'var(--slate)' }}>or continue with email</span></div>
              </div>

              <form onSubmit={handleStep1} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required autoFocus
                    className="w-full px-4 py-2.5 rounded-xl border focus:outline-none"
                    style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Password</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="Min. 6 characters" required
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
                  <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required
                    className="w-full px-4 py-2.5 rounded-xl border focus:outline-none"
                    style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                </div>
                <button type="submit"
                  className="w-full py-3 rounded-xl font-semibold text-white cursor-pointer"
                  style={{ background: 'var(--coral)' }}>
                  Continue →
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--ink)' }}>Set up your board</h2>
              <p className="text-sm mb-6" style={{ color: 'var(--slate)' }}>Choose your company name and URL</p>

              <form onSubmit={handleSignUp} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Company name</label>
                  <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
                    placeholder="Acme Inc." required autoFocus
                    className="w-full px-4 py-2.5 rounded-xl border focus:outline-none"
                    style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Board URL</label>
                  <div className="flex items-center rounded-xl border overflow-hidden"
                    style={{ borderColor: slugStatus === 'available' ? '#10b981' : slugStatus === 'taken' || slugStatus === 'invalid' ? '#ef4444' : 'var(--border)' }}>
                    <input type="text" value={slug}
                      onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="acme"
                      className="flex-1 px-4 py-2.5 focus:outline-none text-sm min-w-0"
                      style={{ fontSize: '16px' }} />
                    <span className="px-3 py-2.5 text-sm font-medium shrink-0 border-l"
                      style={{ background: 'var(--canvas)', color: 'var(--slate)', borderColor: 'var(--border)' }}>
                      .colvy.com
                    </span>
                  </div>
                  {slugStatusMsg[slugStatus] && (
                    <p className="text-xs mt-1" style={{ color: slugStatusColor[slugStatus] }}>{slugStatusMsg[slugStatus]}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Industry</label>
                  <select value={industry} onChange={e => setIndustry(e.target.value)} required
                    className="w-full px-4 py-2.5 rounded-xl border focus:outline-none text-sm"
                    style={{ borderColor: 'var(--border)', color: industry ? 'var(--ink)' : 'var(--slate)', fontSize: '16px' }}>
                    <option value="">Select an industry</option>
                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>

                {slug && slugStatus === 'available' && (
                  <div className="p-3 rounded-xl" style={{ background: 'var(--peach)' }}>
                    <p className="text-xs" style={{ color: 'var(--slate)' }}>Your board will be live at:</p>
                    <p className="font-bold" style={{ color: 'var(--coral)' }}>{slug}.colvy.com</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button type="button" onClick={() => setStep(1)}
                    className="flex-1 py-3 rounded-xl font-semibold border cursor-pointer hover:bg-gray-50"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                    ← Back
                  </button>
                  <button type="submit" disabled={loading || slugStatus !== 'available'}
                    className="flex-1 py-3 rounded-xl font-semibold text-white cursor-pointer disabled:opacity-50"
                    style={{ background: 'var(--coral)' }}>
                    {loading ? 'Creating...' : 'Create Board 🎉'}
                  </button>
                </div>
              </form>
            </>
          )}

          <p className="text-center text-sm mt-6" style={{ color: 'var(--slate)' }}>
            Already have an account?{' '}
            <Link href="/signin" className="font-semibold hover:underline" style={{ color: 'var(--coral)' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--peach)' }}>Loading...</div>}>
      <SignUpForm />
    </Suspense>
  )
}
