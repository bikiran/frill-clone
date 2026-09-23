'use client'

import { useState, useEffect, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { signInWithGoogle, signInWithGitHub } from '@/lib/auth'
import { isValidSlug, isSlugAvailable } from '@/lib/board'
import { track } from '@/lib/analytics'
import { useRouter, useSearchParams } from 'next/navigation'
import AddressAutocomplete, { AddressParts } from '@/components/AddressAutocomplete'
import BusinessAutocomplete, { BusinessDetails, BusinessHours, DAYS, emptyHours } from '@/components/BusinessAutocomplete'

const INDUSTRIES = ['SaaS', 'E-commerce', 'Healthcare', 'Education', 'Finance',
  'Logistics', 'Manufacturing', 'Media & Entertainment', 'Travel & Hospitality',
  'Retail', 'Real Estate', 'Other']

const CORAL = '#ff7a6b'
const TOTAL_STEPS = 7
const DAY_LABEL: Record<string, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
  friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
}

// AU-friendly mobile normalisation: strip spaces, turn a leading 0 into +61 so
// the OTP SMS has a dialable number. Anything already starting with + is kept.
function normalizeMobile(raw: string): string {
  const t = (raw || '').replace(/[\s()-]/g, '')
  if (!t) return ''
  if (t.startsWith('+')) return t
  if (t.startsWith('0')) return '+61' + t.slice(1)
  return t
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid #e5e5e5',
  fontSize: 15, outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginBottom: 6 }
const primaryBtn = (disabled?: boolean): React.CSSProperties => ({
  padding: '12px 22px', borderRadius: 12, background: CORAL, color: '#fff', fontWeight: 700,
  fontSize: 15, border: 'none', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1,
  display: 'inline-flex', alignItems: 'center', gap: 8,
})
const ghostBtn: React.CSSProperties = {
  padding: '12px 22px', borderRadius: 12, background: '#fff', color: '#0d0d0d', fontWeight: 600,
  fontSize: 15, border: '1px solid #e5e5e5', cursor: 'pointer',
}

// Page chrome. MUST live at module scope — if it were defined inside the form
// component it'd be a new component type on every render, remounting the inputs
// and dropping focus after each keystroke.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #fff 0%, #fff7f5 100%)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px clamp(20px, 5vw, 48px)' }}>
        <a href="/" style={{ fontWeight: 800, fontSize: 19, color: CORAL, textDecoration: 'none' }}>Colvy</a>
        <a href="/signin" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: '#0d0d0d', textDecoration: 'none', border: '1px solid #e5e5e5', padding: '8px 14px', borderRadius: 10, background: '#fff' }}>Sign In</a>
      </div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '8px 16px 48px' }}>
        <div style={{ width: '100%', maxWidth: 720 }}>{children}</div>
      </div>
    </div>
  )
}

function SignUpForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Subdomain (join-an-existing-board) context — preserved from the old flow so a
  // viewer on someone's *.colvy.com board can never fall through to creating a
  // company. Joiners get the compact join card, not the full business wizard.
  const [companyContext, setCompanyContext] = useState<any>(null)
  const [isSubdomainContext, setIsSubdomainContext] = useState(false)
  const [companyCheckDone, setCompanyCheckDone] = useState(false)
  const [companyLookupFailed, setCompanyLookupFailed] = useState(false)

  // ── Wizard state ───────────────────────────────────────────────────────────
  const [step, setStep] = useState(1)
  const [fullName, setFullName] = useState('')
  const [bizMode, setBizMode] = useState<'google' | 'manual'>('google')
  const [companyName, setCompanyName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugStatus, setSlugStatus] = useState<'idle'|'checking'|'available'|'taken'|'invalid'>('idle')
  const [slugTouched, setSlugTouched] = useState(false)
  const [industry, setIndustry] = useState('')
  const [website, setWebsite] = useState('')
  const [address, setAddress] = useState('')
  const [addrParts, setAddrParts] = useState<Partial<AddressParts>>({})
  const [businessPhone, setBusinessPhone] = useState('')
  const [hours, setHours] = useState<BusinessHours>(emptyHours())

  const [email, setEmail] = useState('')
  const [mobile, setMobile] = useState('')
  const [token, setToken] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [emailVerified, setEmailVerified] = useState(false)
  const [smsVerified, setSmsVerified] = useState(false)
  const [emailResend, setEmailResend] = useState(0)
  const [smsResend, setSmsResend] = useState(0)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOAuthLoading] = useState('')
  const [error, setError] = useState('')

  // Join-flow (subdomain) fields
  const [joinEmail, setJoinEmail] = useState('')
  const [joinPassword, setJoinPassword] = useState('')
  const [joinName, setJoinName] = useState('')
  const [needsConfirmation, setNeedsConfirmation] = useState(false)

  const planParam = searchParams.get('plan')
  const billingParam = searchParams.get('billing') === 'annual' ? 'annual' : 'monthly'
  const refParam = searchParams.get('ref')

  useEffect(() => {
    track('signup_started', planParam ? { plan: planParam, billing: billingParam } : undefined)
    if (planParam && planParam !== 'free') {
      try { localStorage.setItem('pending_plan', JSON.stringify({ plan: planParam, billing: billingParam })) } catch {}
    }
    // Persist a referral code so it survives the multi-step flow (and any OAuth
    // round-trip), the same way the pending plan is stashed.
    if (refParam) { try { localStorage.setItem('pending_ref', refParam) } catch {} }
  }, [planParam, billingParam, refParam])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      if (data?.session?.user) router.push('/admin')
    })
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname
      const isSubdomain = hostname.endsWith('.colvy.com') && hostname !== 'colvy.com' && hostname !== 'www.colvy.com' && !hostname.includes('localhost')
      setIsSubdomainContext(isSubdomain)
      if (isSubdomain) {
        const boardSlug = hostname.split('.')[0]
        supabase.from('companies').select('id, name, slug').eq('slug', boardSlug).maybeSingle().then(({ data }) => {
          if (data) setCompanyContext(data)
          else setCompanyLookupFailed(true)
          setCompanyCheckDone(true)
        })
      } else {
        setCompanyCheckDone(true)
      }
    }
  }, [router])

  // Auto-derive slug from the business name until the user edits it themselves.
  useEffect(() => {
    if (slugTouched || !companyName) return
    const auto = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 30)
    if (auto.length >= 3) setSlug(auto)
  }, [companyName, slugTouched])

  // Debounced slug availability check.
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

  // Resend countdown timers.
  useEffect(() => { if (emailResend <= 0) return; const t = setTimeout(() => setEmailResend(c => c - 1), 1000); return () => clearTimeout(t) }, [emailResend])
  useEffect(() => { if (smsResend <= 0) return; const t = setTimeout(() => setSmsResend(c => c - 1), 1000); return () => clearTimeout(t) }, [smsResend])

  const applyBusiness = (d: BusinessDetails) => {
    if (d.name) setCompanyName(d.name)
    if (d.website) setWebsite(d.website)
    if (d.address) { setAddress(d.address); setAddrParts({ city: d.city, state: d.state, postcode: d.postcode, country: d.country }) }
    if (d.phone) setBusinessPhone(d.phone)
    if (d.hours) setHours(d.hours)
    setStep(3)
  }

  // ── Step transitions ─────────────────────────────────────────────────────
  const next = () => setStep(s => Math.min(TOTAL_STEPS, s + 1))
  const back = () => setStep(s => Math.max(1, s - 1))

  const canLeaveDetails = !!companyName.trim() && slugStatus === 'available' && !!industry

  const sendCodes = async () => {
    setError('')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setError('Enter a valid email address'); return }
    const phone = normalizeMobile(mobile)
    if (!phone || phone.replace(/\D/g, '').length < 8) { setError('Enter a valid mobile number'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), phone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not send codes')
      setToken(data.token)
      setEmailResend(30); setSmsResend(30)
      track('signup_submitted', { via: 'email', joining: false })
      setStep(5)
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  const resend = async (channel: 'email' | 'sms') => {
    setError('')
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email: email.trim(), phone: normalizeMobile(mobile), channel }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not resend')
      if (channel === 'email') setEmailResend(30); else setSmsResend(30)
    } catch (e: any) { setError(e.message) }
  }

  const verify = async (channel: 'email' | 'sms') => {
    setError('')
    const code = channel === 'email' ? emailCode : smsCode
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit code'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, channel, code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not verify')
      if (channel === 'email') { setEmailVerified(true); setStep(6) }
      else { setSmsVerified(true); setStep(7) }
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  const finish = async () => {
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirmPassword) { setError('Passwords do not match'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/complete-signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, password, fullName: fullName.trim(),
          ref: refParam || (() => { try { return localStorage.getItem('pending_ref') } catch { return null } })() || null,
          business: {
            name: companyName.trim(), slug: slug.toLowerCase(), industry,
            website: website.trim() || null, address: address.trim() || null,
            city: addrParts.city || null, state: addrParts.state || null,
            postcode: addrParts.postcode || null, country: addrParts.country || null,
            phone: businessPhone.trim() || null, hours,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.code === 'slug_taken') { setError('That board URL is taken — please choose another.'); setSlugStatus('taken'); setStep(3); setLoading(false); return }
        throw new Error(data.error || 'Signup failed')
      }
      track('signup_completed', { via: 'email' })
      // Sign in and head to onboarding (the account is already email-confirmed).
      await supabase.auth.signInWithPassword({ email: email.trim(), password })
      router.push('/onboarding')
    } catch (e: any) { setError(e.message); setLoading(false) }
  }

  // ── OAuth (alternative to the email path) ────────────────────────────────
  const oauth = async (provider: 'google' | 'github') => {
    if (!canLeaveDetails) { setError('Add your business name, URL and industry first'); return }
    // Stash the extended business profile so onboarding can apply it after the
    // provider round-trip (the OAuth callback only carries slug/name/industry).
    try {
      localStorage.setItem('pending_business_profile', JSON.stringify({
        fullName: fullName.trim(),
        website: website.trim() || null, business_address: address.trim() || null,
        business_city: addrParts.city || null, business_state: addrParts.state || null,
        business_postcode: addrParts.postcode || null, business_country: addrParts.country || null,
        business_phone: businessPhone.trim() || null, business_hours: hours,
      }))
    } catch {}
    track('signup_submitted', { via: provider, joining: false })
    setOAuthLoading(provider)
    const opts = { slug: slug.toLowerCase(), name: companyName.trim(), industry: industry || 'saas' }
    if (provider === 'google') await signInWithGoogle(opts); else await signInWithGitHub(opts)
  }

  // ── Join an existing board (subdomain flow) ──────────────────────────────
  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (joinPassword.length < 6) { setError('Password must be at least 6 characters'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: joinEmail, password: joinPassword, name: joinName || null, companyId: companyContext.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Signup failed')
      localStorage.setItem('pending_company_join', JSON.stringify({ userId: data.userId, companyId: companyContext.id, email: joinEmail, role: 'viewer' }))
      track('signup_submitted', { via: 'email', joining: true })
      setNeedsConfirmation(true)
    } catch (err: any) { setError(err.message) }
    setLoading(false)
  }

  // ── Guards for subdomain resolution ───────────────────────────────────────
  if (isSubdomainContext && !companyCheckDone) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #f0f0f0', borderTop: `3px solid ${CORAL}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }
  if (isSubdomainContext && companyLookupFailed) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#fff' }}>
        <div style={{ maxWidth: 380, width: '100%', textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0d0d0d', marginBottom: 8 }}>Board not found</h1>
          <p style={{ fontSize: 14, color: '#6b6b70' }}>We couldn&rsquo;t find a board at this address. Double-check the URL, or contact whoever shared it with you.</p>
        </div>
      </div>
    )
  }

  // ── Join card (subdomain) ─────────────────────────────────────────────────
  if (companyContext) {
    if (needsConfirmation) {
      return (
        <Shell>
          <div style={{ background: '#fff', border: '1px solid #f0e6e2', borderRadius: 20, padding: 32, textAlign: 'center', maxWidth: 460, margin: '24px auto' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0d0d0d', marginBottom: 8 }}>Check your email</h1>
            <p style={{ fontSize: 14, color: '#6b6b70' }}>We sent a confirmation link to <strong>{joinEmail}</strong>. Click it to join {companyContext.name}.</p>
          </div>
        </Shell>
      )
    }
    return (
      <Shell>
        <div style={{ background: '#fff', border: '1px solid #f0e6e2', borderRadius: 20, padding: 32, maxWidth: 460, margin: '24px auto' }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0d0d0d', marginBottom: 4 }}>Join {companyContext.name}</h1>
          <p style={{ fontSize: 14, color: '#6b6b70', marginBottom: 20 }}>Create your account to start collaborating.</p>
          {error && <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <form onSubmit={handleJoin}>
            <div style={{ marginBottom: 14 }}><label style={labelStyle}>Your name</label>
              <input value={joinName} onChange={e => setJoinName(e.target.value)} placeholder="Jane Smith" style={inputStyle} /></div>
            <div style={{ marginBottom: 14 }}><label style={labelStyle}>Email</label>
              <input type="email" value={joinEmail} onChange={e => setJoinEmail(e.target.value)} placeholder="you@company.com" required style={inputStyle} /></div>
            <div style={{ marginBottom: 20 }}><label style={labelStyle}>Password</label>
              <input type="password" value={joinPassword} onChange={e => setJoinPassword(e.target.value)} placeholder="Min. 6 characters" required style={inputStyle} /></div>
            <button type="submit" disabled={loading} style={{ ...primaryBtn(loading), width: '100%', justifyContent: 'center' }}>{loading ? 'Creating…' : `Join ${companyContext.name}`}</button>
          </form>
        </div>
      </Shell>
    )
  }

  // ── Progress header ────────────────────────────────────────────────────────
  const stepTitles = ['Your name', 'Your business', 'Your business details', 'Your contact details', 'Verify email', 'Verify mobile', 'Create password']
  const progress = (
    <div style={{ marginBottom: 28 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: CORAL, letterSpacing: '0.06em', margin: '0 0 4px' }}>STEP {step} OF {TOTAL_STEPS}</p>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0d0d0d', margin: '0 0 12px' }}>{stepTitles[step - 1]}</h2>
      <div style={{ height: 4, borderRadius: 4, background: '#eee', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(step / TOTAL_STEPS) * 100}%`, background: '#22c55e', borderRadius: 4, transition: 'width 0.3s ease' }} />
      </div>
    </div>
  )

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #f0e6e2', borderRadius: 20, padding: 'clamp(20px, 4vw, 36px)' }
  const footer = (backOk: boolean, right: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 28 }}>
      {backOk ? <button type="button" onClick={back} style={ghostBtn}>← Previous</button> : <span />}
      {right}
    </div>
  )

  return (
    <Shell>
      <div style={card}>
        {progress}
        {error && <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', fontSize: 13 }}>{error}</div>}

        {/* STEP 1 — Your name */}
        {step === 1 && (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0d0d0d', margin: '12px 0 6px' }}>Let&rsquo;s get to know you</h1>
            <p style={{ fontSize: 15, color: '#6b6b70', marginBottom: 24 }}>Start with your name.</p>
            <input value={fullName} onChange={e => setFullName(e.target.value)} autoFocus placeholder="Your full name"
              onKeyDown={e => { if (e.key === 'Enter' && fullName.trim()) next() }}
              style={{ ...inputStyle, maxWidth: 460, margin: '0 auto', textAlign: 'center' }} />
            {footer(false, <button type="button" onClick={next} disabled={!fullName.trim()} style={primaryBtn(!fullName.trim())}>Continue →</button>)}
          </div>
        )}

        {/* STEP 2 — Your business (find on Google / manual) */}
        {step === 2 && (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0d0d0d', margin: '4px 0 6px' }}>Your business</h1>
            <p style={{ fontSize: 15, color: '#6b6b70', marginBottom: 20 }}>Let&rsquo;s find your business on Google or enter it manually.</p>
            <div style={{ display: 'inline-flex', background: '#f5f5f5', borderRadius: 12, padding: 4, marginBottom: 20 }}>
              <button type="button" onClick={() => setBizMode('google')} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, background: bizMode === 'google' ? CORAL : 'transparent', color: bizMode === 'google' ? '#fff' : '#6b6b70' }}>🔍 Find on Google</button>
              <button type="button" onClick={() => setBizMode('manual')} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, background: bizMode === 'manual' ? CORAL : 'transparent', color: bizMode === 'manual' ? '#fff' : '#6b6b70' }}>Enter manually</button>
            </div>
            <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'left' }}>
              {bizMode === 'google' ? (
                <>
                  <BusinessAutocomplete value={companyName} onChange={setCompanyName} onSelect={applyBusiness} placeholder="Search your business name…" style={inputStyle} />
                  <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '8px 2px 0' }}>Search your business name and we&rsquo;ll fill your details from Google Maps.</p>
                </>
              ) : (
                <>
                  <label style={labelStyle}>Business name</label>
                  <input value={companyName} onChange={e => setCompanyName(e.target.value)} autoFocus placeholder="Acme Aquariums" style={inputStyle} />
                </>
              )}
            </div>
            {footer(true, <button type="button" onClick={next} disabled={!companyName.trim()} style={primaryBtn(!companyName.trim())}>Continue →</button>)}
          </div>
        )}

        {/* STEP 3 — Business details */}
        {step === 3 && (
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0d0d0d', margin: '4px 0 6px' }}>Your business details</h1>
            <p style={{ fontSize: 14, color: '#6b6b70', marginBottom: 22 }}>Review what we found — you can edit anything.</p>

            <div style={{ marginBottom: 16 }}><label style={labelStyle}>Business name</label>
              <input value={companyName} onChange={e => setCompanyName(e.target.value)} style={inputStyle} /></div>

            <div style={{ marginBottom: 16 }}><label style={labelStyle}>Board URL</label>
              <div style={{ display: 'flex', alignItems: 'center', borderRadius: 12, border: `1px solid ${slugStatus === 'available' ? '#10b981' : (slugStatus === 'taken' || slugStatus === 'invalid') ? '#ef4444' : '#e5e5e5'}`, overflow: 'hidden' }}>
                <input value={slug} onChange={e => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')) }} placeholder="acme"
                  style={{ flex: 1, padding: '12px 14px', border: 'none', outline: 'none', fontSize: 15, minWidth: 0 }} />
                <span style={{ padding: '12px', fontSize: 13, fontWeight: 500, color: '#6b6b70', background: '#fafafa', borderLeft: '1px solid #e5e5e5', flexShrink: 0 }}>.colvy.com</span>
              </div>
              {slugStatus === 'checking' && <p style={{ fontSize: 12, marginTop: 5, color: '#f59e0b' }}>Checking…</p>}
              {slugStatus === 'available' && <p style={{ fontSize: 12, marginTop: 5, color: '#10b981' }}>✓ Available</p>}
              {slugStatus === 'taken' && <p style={{ fontSize: 12, marginTop: 5, color: '#ef4444' }}>✗ Already taken</p>}
              {slugStatus === 'invalid' && <p style={{ fontSize: 12, marginTop: 5, color: '#ef4444' }}>✗ Lowercase letters, numbers and hyphens (3–30 chars)</p>}
            </div>

            <div style={{ marginBottom: 16 }}><label style={labelStyle}>Industry</label>
              <select value={industry} onChange={e => setIndustry(e.target.value)} style={{ ...inputStyle, color: industry ? '#0d0d0d' : '#9ca3af', cursor: 'pointer' }}>
                <option value="">Select an industry</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select></div>

            <div style={{ marginBottom: 16 }}><label style={labelStyle}>Website</label>
              <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yourbusiness.com" style={inputStyle} /></div>

            <div style={{ marginBottom: 16 }}><label style={labelStyle}>Address</label>
              <AddressAutocomplete value={address} onChange={setAddress}
                onSelect={p => setAddrParts({ city: p.city, state: p.state, postcode: p.postcode, country: p.country })}
                placeholder="Business address" style={inputStyle} /></div>

            <div style={{ marginBottom: 8 }}><label style={labelStyle}>Business hours</label>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 2px 10px' }}>Used for after-hours auto-replies and missed-call messages.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {DAYS.map(d => (
                  <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ width: 92, fontSize: 13, color: '#0d0d0d' }}>{DAY_LABEL[d]}</span>
                    <button type="button" onClick={() => setHours(h => ({ ...h, [d]: { ...h[d], open: !h[d].open } }))}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer' }}>
                      <span style={{ width: 38, height: 22, borderRadius: 11, background: hours[d].open ? CORAL : '#d1d5db', position: 'relative', transition: 'background 0.2s' }}>
                        <span style={{ position: 'absolute', top: 2, left: hours[d].open ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                      </span>
                      <span style={{ fontSize: 13, color: hours[d].open ? '#0d0d0d' : '#9ca3af', width: 52, textAlign: 'left' }}>{hours[d].open ? 'Open' : 'Closed'}</span>
                    </button>
                    {hours[d].open && (
                      <>
                        <input type="time" value={hours[d].from} onChange={e => setHours(h => ({ ...h, [d]: { ...h[d], from: e.target.value } }))}
                          style={{ padding: '7px 10px', borderRadius: 9, border: '1px solid #e5e5e5', fontSize: 13 }} />
                        <span style={{ color: '#9ca3af' }}>–</span>
                        <input type="time" value={hours[d].to} onChange={e => setHours(h => ({ ...h, [d]: { ...h[d], to: e.target.value } }))}
                          style={{ padding: '7px 10px', borderRadius: 9, border: '1px solid #e5e5e5', fontSize: 13 }} />
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* OAuth shortcut — skips the password + OTP path. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 14px' }}>
              <div style={{ flex: 1, height: 1, background: '#eee' }} />
              <span style={{ fontSize: 12, color: '#9ca3af' }}>or finish faster with</span>
              <div style={{ flex: 1, height: 1, background: '#eee' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => oauth('google')} disabled={!!oauthLoading} style={{ ...ghostBtn, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <svg width="17" height="17" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                {oauthLoading === 'google' ? 'Redirecting…' : 'Google'}
              </button>
              <button type="button" onClick={() => oauth('github')} disabled={!!oauthLoading} style={{ ...ghostBtn, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                {oauthLoading === 'github' ? 'Redirecting…' : 'GitHub'}
              </button>
            </div>

            {footer(true, <button type="button" onClick={next} disabled={!canLeaveDetails} style={primaryBtn(!canLeaveDetails)}>Continue →</button>)}
          </div>
        )}

        {/* STEP 4 — Contact details */}
        {step === 4 && (
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0d0d0d', margin: '4px 0 6px', textAlign: 'center' }}>Your contact details</h1>
            <p style={{ fontSize: 14, color: '#6b6b70', marginBottom: 24, textAlign: 'center' }}>Add your email and mobile so we can verify your account.</p>
            <div className="contact-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div><label style={labelStyle}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" style={inputStyle} />
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '6px 2px 0' }}>Work email preferred; personal is fine.</p></div>
              <div><label style={labelStyle}>Mobile number</label>
                <input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="04xx xxx xxx" style={inputStyle} />
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '6px 2px 0' }}>We&rsquo;ll text a 6-digit code to this number.</p></div>
            </div>
            <style>{`@media (max-width:560px){.contact-grid{grid-template-columns:1fr !important}}`}</style>
            {footer(true, <button type="button" onClick={sendCodes} disabled={loading} style={primaryBtn(loading)}>{loading ? 'Sending…' : 'Send codes →'}</button>)}
          </div>
        )}

        {/* STEP 5 — Verify email */}
        {step === 5 && (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0d0d0d', margin: '4px 0 6px' }}>Verify email</h1>
            <p style={{ fontSize: 14, color: '#6b6b70', marginBottom: 24 }}>Enter the 6-digit code we emailed to <strong>{email}</strong>.</p>
            <input value={emailCode} onChange={e => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus inputMode="numeric" placeholder="Enter code"
              onKeyDown={e => { if (e.key === 'Enter') verify('email') }}
              style={{ ...inputStyle, maxWidth: 320, margin: '0 auto', textAlign: 'center', letterSpacing: 6, fontSize: 20, fontWeight: 700 }} />
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={() => resend('email')} disabled={emailResend > 0} style={{ background: 'none', border: 'none', cursor: emailResend > 0 ? 'default' : 'pointer', color: emailResend > 0 ? '#9ca3af' : CORAL, fontSize: 13, fontWeight: 600 }}>
                {emailResend > 0 ? `Resend code in ${emailResend}s` : 'Resend code'}
              </button>
            </div>
            {footer(true, <button type="button" onClick={() => verify('email')} disabled={loading || emailCode.length !== 6} style={primaryBtn(loading || emailCode.length !== 6)}>Verify email →</button>)}
          </div>
        )}

        {/* STEP 6 — Verify mobile */}
        {step === 6 && (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0d0d0d', margin: '4px 0 6px' }}>Verify mobile</h1>
            <p style={{ fontSize: 14, color: '#6b6b70', marginBottom: 24 }}>Enter the 6-digit code we texted to <strong>{normalizeMobile(mobile)}</strong>.</p>
            <input value={smsCode} onChange={e => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus inputMode="numeric" placeholder="Enter code"
              onKeyDown={e => { if (e.key === 'Enter') verify('sms') }}
              style={{ ...inputStyle, maxWidth: 320, margin: '0 auto', textAlign: 'center', letterSpacing: 6, fontSize: 20, fontWeight: 700 }} />
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={() => resend('sms')} disabled={smsResend > 0} style={{ background: 'none', border: 'none', cursor: smsResend > 0 ? 'default' : 'pointer', color: smsResend > 0 ? '#9ca3af' : CORAL, fontSize: 13, fontWeight: 600 }}>
                {smsResend > 0 ? `Resend code in ${smsResend}s` : 'Resend code'}
              </button>
            </div>
            {footer(true, <button type="button" onClick={() => verify('sms')} disabled={loading || smsCode.length !== 6} style={primaryBtn(loading || smsCode.length !== 6)}>Verify mobile →</button>)}
          </div>
        )}

        {/* STEP 7 — Create password */}
        {step === 7 && (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0d0d0d', margin: '4px 0 6px' }}>Create your password</h1>
            <p style={{ fontSize: 14, color: '#6b6b70', marginBottom: 24 }}>Last step — set a password to secure your account.</p>
            <div style={{ maxWidth: 380, margin: '0 auto', textAlign: 'left' }}>
              <div style={{ marginBottom: 14 }}><label style={labelStyle}>Password</label>
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 6 characters" autoFocus style={inputStyle} /></div>
              <div style={{ marginBottom: 6 }}><label style={labelStyle}>Confirm password</label>
                <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') finish() }} style={inputStyle} /></div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6b6b70', cursor: 'pointer' }}>
                <input type="checkbox" checked={showPassword} onChange={e => setShowPassword(e.target.checked)} /> Show password
              </label>
            </div>
            {footer(true, <button type="button" onClick={finish} disabled={loading} style={primaryBtn(loading)}>{loading ? 'Creating your board…' : 'Create my board 🎉'}</button>)}
          </div>
        )}
      </div>

      <p style={{ textAlign: 'center', fontSize: 13, color: '#6b6b70', marginTop: 20 }}>
        Already have an account? <a href="/signin" style={{ color: CORAL, fontWeight: 600, textDecoration: 'none' }}>Sign in</a>
      </p>
    </Shell>
  )
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</div>}>
      <SignUpForm />
    </Suspense>
  )
}
