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
  const [companyContext, setCompanyContext] = useState<any>(null) // For company subdomain signup

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
    // Check if user is already signed in
    supabase.auth.getSession().then(({ data }: any) => {
      if (data?.session?.user) router.push('/admin')
    })

    // Check if signing up through company subdomain
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname
      const isSubdomain = hostname.endsWith('.colvy.com') && hostname !== 'colvy.com' && hostname !== 'www.colvy.com' && !hostname.includes('localhost')
      
      if (isSubdomain) {
        const slug = hostname.split('.')[0]
        // Fetch company by slug
        supabase.from('companies').select('id, name, slug').eq('slug', slug).single().then(({ data, error }) => {
          if (data && !error) {
            setCompanyContext(data)
            // Skip step 2 for subdomain signups
            setStep(1)
          }
        })
      }
    }
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
    
    // If joining an existing company, go directly to signup
    if (companyContext) {
      handleSignUp(e)
    } else {
      // Otherwise, go to step 2 to set up new company
      setStep(2)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // If signing up through company subdomain, skip company creation validation
    if (!companyContext) {
      // Regular signup (new company)
      if (!companyName.trim()) { setError('Company name is required'); return }
      if (slugStatus !== 'available') { setError('Please choose a valid, available board URL'); return }
      if (!industry) { setError('Please select an industry'); return }
    }

    setLoading(true)
    try {
      // 1. Sign up user
      const { data, error: authErr } = await supabase.auth.signUp({
        email, password,
        options: {
          data: { 
            display_name: companyContext?.name || companyName,
            company: companyContext?.name || companyName,
            industry: companyContext ? 'N/A' : industry
          },
          emailRedirectTo: companyContext
            ? `${window.location.origin}/auth/callback?company_id=${companyContext.id}`
            : `${window.location.origin}/auth/callback?slug=${slug}&name=${encodeURIComponent(companyName)}&industry=${encodeURIComponent(industry)}`,
        },
      })
      if (authErr) throw authErr
      if (!data.user) throw new Error('Signup failed — please try again')

      const userId = data.user.id

      if (companyContext) {
        // Company subdomain signup — add as viewer
        if (data.session) {
          // Email confirm is OFF
          await fetch('/api/team-members', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              companyId: companyContext.id,
              role: 'viewer', // Viewers can vote, share ideas, see roadmap (read-only), get notifications
              email
            }),
          })
          
          // Redirect to the company board
          const hostname = window.location.hostname
          const isLocal = hostname.includes('localhost') || hostname.includes('vercel.app')
          if (!isLocal) {
            window.location.href = `https://${companyContext.slug}.colvy.com/`
          } else {
            router.push('/')
          }
        } else {
          // Email confirm is ON
          localStorage.setItem('pending_company_join', JSON.stringify({
            userId,
            companyId: companyContext.id,
            email,
            role: 'viewer'
          }))
          setNeedsConfirmation(true)
        }
      } else {
        // Regular signup — create new company
        // Store company info for post-email-confirm retrieval
        if (!data.session) {
          localStorage.setItem('pending_company', JSON.stringify({
            slug: slug.toLowerCase(),
            name: companyName.trim(),
            industry: industry || '',
          }))
        }

        if (data.session) {
          // Email confirm is OFF — user is logged in immediately
          const res = await fetch('/api/companies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, slug: slug.toLowerCase(), name: companyName.trim(), industry, accentColor: '#ff7a6b' }),
          })
          const result = await res.json()
          if (result.error && !result.error.includes('duplicate')) throw new Error(result.error)

          // Auto-register subdomain in Vercel so slug.colvy.com works immediately
          try {
            await fetch('/api/domains', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ domain: `${slug.toLowerCase()}.colvy.com` }),
            })
          } catch {} // Non-fatal
          
          // Redirect to their subdomain onboarding
          const hostname = window.location.hostname
          const isLocal = hostname.includes('localhost') || hostname.includes('vercel.app')
          if (!isLocal) {
            window.location.href = `https://${slug.toLowerCase()}.colvy.com/onboarding`
          } else {
            router.push('/onboarding')
          }
        } else {
          // Email confirm is ON
          localStorage.setItem('pending_company', JSON.stringify({
            userId, slug: slug.toLowerCase(), name: companyName.trim(), industry
          }))
          setNeedsConfirmation(true)
        }
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

  const EyeIcon = ({ off }: { off: boolean }) => off ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
  )

  const FEATURE_HIGHLIGHTS = [
    { title: 'Collect feedback', desc: 'Let customers submit and vote on ideas' },
    { title: 'Public roadmap', desc: 'Show what you are building next' },
    { title: 'Ship updates', desc: 'Announce releases with a changelog' },
  ]

  // Email confirmation screen
  if (needsConfirmation) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#fff' }}>
        <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: '#fff4f1', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff7a6b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0d0d0d', marginBottom: 8 }}>Check your email</h1>
          <p style={{ fontSize: 14, color: '#6b6b70', marginBottom: 4 }}>We sent a confirmation link to <strong>{email}</strong></p>
          <p style={{ fontSize: 13, color: '#6b6b70', marginBottom: 24 }}>Click the link to activate your account and board.</p>
          <div style={{ background: '#fafafa', borderRadius: 16, border: '1px solid #e5e5e5', padding: 18, marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginBottom: 4 }}>Your board will be at:</p>
            <p style={{ fontWeight: 700, color: '#ff7a6b' }}>{slug}.colvy.com</p>
          </div>
          <p style={{ fontSize: 12, color: '#9ca3af' }}>
            Didn't receive it?{' '}
            <button onClick={() => setNeedsConfirmation(false)} style={{ color: '#ff7a6b', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>try again</button>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr', background: '#fff' }}>
      <style>{`
        @media (max-width: 900px) { .su-visual { display: none !important; } .su-form-col { grid-column: 1 / -1 !important; } }
      `}</style>

      {/* LEFT — form */}
      <div className="su-form-col" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px clamp(24px, 7vw, 80px)', overflowY: 'auto' }}>
        <div style={{ maxWidth: 400, width: '100%', margin: '0 auto' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 28, textDecoration: 'none' }}>
            <img src="/logo.png" alt="Colvy" style={{ height: 26, width: 'auto' }} onError={(e: any) => e.target.style.display = 'none'} />
            <span style={{ fontWeight: 800, fontSize: 17, color: '#ff7a6b' }}>Colvy</span>
          </Link>

          {/* Step indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
            {(companyContext ? [1] : [1, 2]).map(s => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: step >= s ? '#ff7a6b' : '#e5e5e5', color: step >= s ? '#fff' : '#9ca3af' }}>
                  {step > s ? '✓' : s}
                </div>
                {s < (companyContext ? 1 : 2) && <div style={{ height: 2, width: 28, borderRadius: 2, background: step > s ? '#ff7a6b' : '#e5e5e5' }} />}
              </div>
            ))}
            <span style={{ marginLeft: 6, fontSize: 12, color: '#6b6b70' }}>{step === 1 ? (companyContext ? 'Join ' + companyContext.name : 'Account details') : 'Your board'}</span>
          </div>

          {error && <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', fontSize: 13 }}>{error}</div>}

          {step === 1 ? (
            <>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0d0d0d', marginBottom: 4 }}>Create your account</h1>
              {companyContext ? (
                <p style={{ fontSize: 14, color: '#6b6b70', marginBottom: 24 }}>Join <strong>{companyContext.name}</strong> to start sharing feedback</p>
              ) : (
                <p style={{ fontSize: 14, color: '#6b6b70', marginBottom: 24 }}>Free forever — no credit card needed</p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                <button onClick={handleGoogle} disabled={!!oauthLoading}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '11px', borderRadius: 12, border: '1px solid #e5e5e5', background: '#fff', fontSize: 14, fontWeight: 600, color: '#0d0d0d', cursor: 'pointer' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  {oauthLoading === 'google' ? 'Redirecting...' : 'Continue with Google'}
                </button>
                <button onClick={handleGitHub} disabled={!!oauthLoading}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '11px', borderRadius: 12, border: '1px solid #e5e5e5', background: '#fff', fontSize: 14, fontWeight: 600, color: '#0d0d0d', cursor: 'pointer' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                  {oauthLoading === 'github' ? 'Redirecting...' : 'Continue with GitHub'}
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
                <div style={{ flex: 1, height: 1, background: '#e5e5e5' }} />
                <span style={{ fontSize: 12, color: '#9ca3af' }}>or continue with email</span>
                <div style={{ flex: 1, height: 1, background: '#e5e5e5' }} />
              </div>

              <form onSubmit={handleStep1}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginBottom: 6 }}>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required autoFocus
                    style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: '1px solid #e5e5e5', fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginBottom: 6 }}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="Min. 6 characters" required
                      style={{ width: '100%', padding: '11px 44px 11px 14px', borderRadius: 12, border: '1px solid #e5e5e5', fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#6b6b70', borderRadius: 8 }}>
                      <EyeIcon off={showPassword} />
                    </button>
                  </div>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginBottom: 6 }}>Confirm password</label>
                  <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required
                    style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: '1px solid #e5e5e5', fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <button type="submit"
                  style={{ width: '100%', padding: '12px', borderRadius: 12, background: '#ff7a6b', color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer' }}>
                  {companyContext ? 'Join ' + companyContext.name + ' →' : 'Continue →'}
                </button>
              </form>
            </>
          ) : !companyContext && (
            <>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0d0d0d', marginBottom: 4 }}>Set up your board</h1>
              <p style={{ fontSize: 14, color: '#6b6b70', marginBottom: 24 }}>Choose your company name and URL</p>

              <form onSubmit={handleSignUp}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginBottom: 6 }}>Company name</label>
                  <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
                    placeholder="Acme Inc." required autoFocus
                    style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: '1px solid #e5e5e5', fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginBottom: 6 }}>Board URL</label>
                  <div style={{ display: 'flex', alignItems: 'center', borderRadius: 12, border: `1px solid ${slugStatus === 'available' ? '#10b981' : slugStatus === 'taken' || slugStatus === 'invalid' ? '#ef4444' : '#e5e5e5'}`, overflow: 'hidden' }}>
                    <input type="text" value={slug}
                      onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="acme"
                      style={{ flex: 1, padding: '11px 14px', border: 'none', outline: 'none', fontSize: 15, minWidth: 0 }} />
                    <span style={{ padding: '11px 12px', fontSize: 13, fontWeight: 500, color: '#6b6b70', background: '#fafafa', borderLeft: '1px solid #e5e5e5', flexShrink: 0 }}>.colvy.com</span>
                  </div>
                  {slugStatusMsg[slugStatus] && <p style={{ fontSize: 12, marginTop: 5, color: slugStatusColor[slugStatus] }}>{slugStatusMsg[slugStatus]}</p>}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginBottom: 6 }}>Industry</label>
                  <select value={industry} onChange={e => setIndustry(e.target.value)} required
                    style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: '1px solid #e5e5e5', fontSize: 15, outline: 'none', color: industry ? '#0d0d0d' : '#9ca3af', boxSizing: 'border-box', cursor: 'pointer' }}>
                    <option value="">Select an industry</option>
                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>

                {slug && slugStatus === 'available' && (
                  <div style={{ padding: 12, borderRadius: 12, background: '#fff4f1', marginBottom: 16 }}>
                    <p style={{ fontSize: 12, color: '#6b6b70' }}>Your board will be live at:</p>
                    <p style={{ fontWeight: 700, color: '#ff7a6b' }}>{slug}.colvy.com</p>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={() => setStep(1)}
                    style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid #e5e5e5', background: '#fff', color: '#0d0d0d', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                    ← Back
                  </button>
                  <button type="submit" disabled={loading || slugStatus !== 'available'}
                    style={{ flex: 1, padding: '12px', borderRadius: 12, background: '#ff7a6b', color: '#fff', fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer', opacity: (loading || slugStatus !== 'available') ? 0.6 : 1 }}>
                    {loading ? 'Creating...' : 'Create Board 🎉'}
                  </button>
                </div>
              </form>
            </>
          )}

          <p style={{ textAlign: 'center', fontSize: 13, color: '#6b6b70', marginTop: 24 }}>
            Already have an account? <Link href="/signin" style={{ color: '#ff7a6b', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
          </p>
        </div>
      </div>

      {/* RIGHT — visual */}
      <div className="su-visual" style={{ background: 'linear-gradient(160deg, #fff7f5 0%, #ffeae6 100%)', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
        <div style={{ position: 'absolute', top: '-10%', right: '-10%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,122,107,0.18), transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: '-15%', left: '-10%', width: 350, height: 350, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.12), transparent 70%)' }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 440 }}>
          <h2 style={{ fontSize: 30, fontWeight: 800, color: '#1a1a1a', lineHeight: 1.25, marginBottom: 16, letterSpacing: '-0.02em' }}>
            Build what your<br />customers actually want
          </h2>
          <p style={{ fontSize: 15, color: '#6b6b70', lineHeight: 1.6, marginBottom: 36 }}>
            Join 12,000+ product teams using Colvy to collect feedback, share roadmaps, and ship with confidence.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {FEATURE_HIGHLIGHTS.map(f => (
              <div key={f.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,122,107,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff7a6b" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', marginBottom: 2 }}>{f.title}</p>
                  <p style={{ fontSize: 13, color: '#6b6b70' }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
      <SignUpForm />
    </Suspense>
  )
}
