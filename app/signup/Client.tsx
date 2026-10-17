'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { signInWithGoogle, signInWithGitHub } from '@/lib/auth'
import { isValidSlug, isSlugAvailable } from '@/lib/board'
import { track } from '@/lib/analytics'
import { useRouter, useSearchParams } from 'next/navigation'
import AddressAutocomplete, { AddressParts } from '@/components/AddressAutocomplete'
import BusinessAutocomplete, { BusinessDetails, BusinessHours, emptyHours } from '@/components/BusinessAutocomplete'
import BusinessHoursEditor from '@/components/BusinessHoursEditor'
import ColvyLogo from '@/components/ColvyLogo'
import { INDUSTRIES } from '@/lib/industries'
import Turnstile, { TurnstileHandle, TURNSTILE_SITE_KEY } from '@/components/Turnstile'
import { normaliseSignupMobile } from '@/lib/signup-delivery'


const CORAL = '#ff7a6b'
const TOTAL_STEPS = 7

// AU-friendly mobile normalisation (lib/signup-delivery, the same rules the
// server applies): "0466 077 557", "+61 0466 077 557" and "61466077557" all
// become +61466077557. Falls back to what was typed while it isn't valid yet.
function normalizeMobile(raw: string): string {
  const m = normaliseSignupMobile(raw)
  return m.ok ? m.e164 : (raw || '').replace(/[\s()-]/g, '')
}

// Small outlined actions under the code box ("Resend text", "Call me with the code").
const smallBtn = (disabled?: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, border: '1px solid #e5e5e5',
  background: '#fff', color: disabled ? '#9ca3af' : '#0d0d0d', fontSize: 13, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
})
const SmsIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
const PhoneIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
const EditIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
const AlertIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>

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
        <ColvyLogo size={30} fontSize={19} />
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
  // The business picked from search (kept so Back → Continue still shows it).
  const [found, setFound] = useState<BusinessDetails | null>(null)

  const [email, setEmail] = useState('')
  const [mobile, setMobile] = useState('')
  const [token, setToken] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [emailVerified, setEmailVerified] = useState(false)
  const [smsVerified, setSmsVerified] = useState(false)
  const [emailResend, setEmailResend] = useState(0)
  const [smsResend, setSmsResend] = useState(0)
  // Mobile code delivery: a plain reason when the text didn't go or didn't
  // arrive (from the send, or Twilio's delivery report via /otp/delivery), and
  // the "call me with the code" fallback when the server can place calls.
  const [smsProblem, setSmsProblem] = useState('')
  const [emailProblem, setEmailProblem] = useState('')
  const [voiceAvailable, setVoiceAvailable] = useState(false)
  const [called, setCalled] = useState(false)
  const [mobileBusy, setMobileBusy] = useState<'' | 'sms' | 'voice' | 'change'>('')
  const [changingNumber, setChangingNumber] = useState(false)
  const [newMobile, setNewMobile] = useState('')
  // "Change number" passes Turnstile again (the server texts a new number only then).
  const [changeHumanToken, setChangeHumanToken] = useState('')
  const changeHumanRef = useRef<TurnstileHandle>(null)
  const [sentAt, setSentAt] = useState('')
  const [pollKey, setPollKey] = useState(0)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [loading, setLoading] = useState(false)
  // Cloudflare Turnstile ("are you human?") for the two forms that create an
  // account. Empty until it passes; reset after a failed submit (one use each).
  const [humanToken, setHumanToken] = useState('')
  const humanRef = useRef<TurnstileHandle>(null)
  const waitingForHuman = !!TURNSTILE_SITE_KEY && !humanToken
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
    // Where they came from (UTM tags, referring page, landing page), kept for
    // this tab so it rides along with the first code request.
    try {
      if (!sessionStorage.getItem('colvy_signup_attr')) {
        const utm: Record<string, string> = {}
        for (const k of ['source', 'medium', 'campaign', 'term', 'content']) { const v = searchParams.get(`utm_${k}`); if (v) utm[k] = v }
        sessionStorage.setItem('colvy_signup_attr', JSON.stringify({ utm, referrer: document.referrer || '', landing: window.location.pathname + window.location.search }))
      }
    } catch {}
  }, [planParam, billingParam, refParam, searchParams])

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
    if (d.industry) setIndustry(d.industry)
    setFound(d)
  }

  // ── Step transitions ─────────────────────────────────────────────────────
  const next = () => setStep(s => Math.min(TOTAL_STEPS, s + 1))
  const back = () => setStep(s => Math.max(1, s - 1))

  const canLeaveDetails = !!companyName.trim() && slugStatus === 'available' && !!industry

  const sendCodes = async () => {
    setError('')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setError('Enter a valid email address'); return }
    const checked = normaliseSignupMobile(mobile)
    if (!checked.ok) { setError(checked.error); return }
    const phone = checked.e164
    setLoading(true)
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(), phone, turnstileToken: humanToken,
          // Recorded with the attempt (super admin → Signups), so a sign-up that
          // stops before the account exists can still be followed up.
          profile: {
            fullName: fullName.trim(), businessName: companyName.trim(), businessSlug: slug.toLowerCase(), industry,
            website: website.trim(), businessPhone: businessPhone.trim(),
            businessCity: addrParts.city || '', businessState: addrParts.state || '', businessCountry: addrParts.country || '',
          },
          attribution: (() => {
            let a: any = {}
            try { a = JSON.parse(sessionStorage.getItem('colvy_signup_attr') || '{}') } catch {}
            let ref: string | null = refParam
            if (!ref) { try { ref = localStorage.getItem('pending_ref') } catch {} }
            return { ...a, plan: planParam || '', ref: ref || '' }
          })(),
        }),
      })
      const data = await res.json()
      if (!res.ok) { humanRef.current?.reset(); throw new Error(data.error || 'Could not send codes') }
      setToken(data.token)
      // Each Turnstile token works once; coming back to this step waits for a fresh one.
      setHumanToken('')
      if (data.phone) setMobile(data.phone)
      setVoiceAvailable(!!data.voiceAvailable)
      setSmsProblem(data.smsSent === false ? (data.mobileProblem || 'We couldn’t text that number. Check it and try again.') : '')
      setEmailProblem(data.emailSent === false ? 'We couldn’t send the email code. Check the address, or tap Resend code.' : '')
      setSentAt(data.sentAt || ''); setCalled(false); setPollKey(k => k + 1)
      setEmailResend(30); setSmsResend(30)
      track('signup_submitted', { via: 'email', joining: false })
      setStep(5)
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  // Resend a code, call the mobile with one ('voice'), or text a corrected
  // number (`phone`). The sign-up keeps its token, so a verified email stays verified.
  const resend = async (channel: 'email' | 'sms' | 'voice', phoneOverride?: string) => {
    setError('')
    const phone = phoneOverride || normalizeMobile(mobile)
    if (channel !== 'email') setMobileBusy(phoneOverride ? 'change' : channel)
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email: email.trim(), phone, channel, ...(phoneOverride ? { turnstileToken: changeHumanToken } : {}) }),
      })
      const data = await res.json()
      if (phoneOverride) { changeHumanRef.current?.reset() }
      if (!res.ok) { if (data.code === 'restart') startOver(data.error); throw new Error(data.error || 'Could not resend') }
      if (data.voiceAvailable !== undefined) setVoiceAvailable(!!data.voiceAvailable)
      if (channel === 'email') {
        setEmailResend(30)
        setEmailProblem(data.emailSent === false ? 'We couldn’t send the email code. Check the address, or try again in a moment.' : '')
      } else {
        setSmsResend(30)
        if (data.phone) setMobile(data.phone)
        setSmsProblem(data.smsSent === false ? (data.mobileProblem || 'We couldn’t reach that number. Check it and try again.') : '')
        setCalled(channel === 'voice' && !!data.smsSent)
        setSentAt(data.sentAt || ''); setPollKey(k => k + 1)
        if (phoneOverride && data.smsSent) { setChangingNumber(false); setSmsCode('') }
      }
    } catch (e: any) { setError(e.message) }
    setMobileBusy('')
  }

  // The sign-up can't continue (finished, over an hour old, or out of tries):
  // back to the contact step for fresh codes.
  const startOver = (why: string) => {
    setToken(''); setEmailVerified(false); setSmsVerified(false); setEmailCode(''); setSmsCode('')
    setSmsProblem(''); setEmailProblem(''); setChangingNumber(false); setCalled(false)
    setStep(4); setTimeout(() => setError(why), 0)
  }

  const changeNumber = () => {
    const m = normaliseSignupMobile(newMobile)
    if (!m.ok) { setError(m.error); return }
    resend('sms', m.e164)
  }

  // While on "Verify mobile": ask whether the text actually arrived (Twilio's
  // delivery report), so a blocked text says so instead of leaving them waiting.
  useEffect(() => {
    if (step !== 6 || !token || smsVerified) return
    let stop = false, n = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const since = sentAt ? new Date(sentAt).getTime() - 5000 : 0
    const tick = async () => {
      if (stop) return
      n++
      let done = false
      try {
        const res = await fetch('/api/auth/otp/delivery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
        const d = await res.json().catch(() => ({}))
        if (res.ok && !stop) {
          if (d.voiceAvailable !== undefined) setVoiceAvailable(!!d.voiceAvailable)
          const current = !since || !d.at || new Date(d.at).getTime() >= since
          if (current && (d.state === 'not_delivered' || d.state === 'send_failed')) { setSmsProblem(d.message || 'We couldn’t text that number.'); done = true }
          if (current && (d.state === 'delivered' || d.state === 'answered')) done = true
        }
      } catch {}
      if (!stop && !done && n < 24) timer = setTimeout(tick, 5000)
    }
    timer = setTimeout(tick, 2000)
    return () => { stop = true; if (timer) clearTimeout(timer) }
  }, [step, token, smsVerified, pollKey, sentAt])

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
      if (!res.ok) {
        if (data.code === 'locked' || data.code === 'restart') { startOver(data.error || 'Please start again.'); setLoading(false); return }
        throw new Error(data.error || 'Could not verify')
      }
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
        if (data.code === 'slug_taken') { setError('That Colvy address is taken. Please choose another.'); setSlugStatus('taken'); setStep(3); setLoading(false); return }
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
    if (!canLeaveDetails) { setError('Add your business name, Colvy address and industry first'); return }
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
        body: JSON.stringify({ email: joinEmail, password: joinPassword, name: joinName || null, companyId: companyContext.id, turnstileToken: humanToken }),
      })
      const data = await res.json()
      if (!res.ok) { humanRef.current?.reset(); throw new Error(data.error || 'Signup failed') }
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
            <Turnstile ref={humanRef} onToken={setHumanToken} action="join" />
            <button type="submit" disabled={loading || waitingForHuman} style={{ ...primaryBtn(loading || waitingForHuman), width: '100%', justifyContent: 'center' }}>{loading ? 'Creating…' : waitingForHuman ? 'Checking…' : `Join ${companyContext.name}`}</button>
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
              <button type="button" onClick={() => setBizMode('google')} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, background: bizMode === 'google' ? CORAL : 'transparent', color: bizMode === 'google' ? '#fff' : '#6b6b70' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                Find on Google
              </button>
              <button type="button" onClick={() => setBizMode('manual')} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, background: bizMode === 'manual' ? CORAL : 'transparent', color: bizMode === 'manual' ? '#fff' : '#6b6b70' }}>Enter manually</button>
            </div>
            <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'left' }}>
              {bizMode === 'google' ? (
                <>
                  <BusinessAutocomplete value={companyName} onChange={v => { setCompanyName(v); if (found && v !== found.name) setFound(null) }} onSelect={applyBusiness} placeholder="Search your business name…" style={inputStyle} />
                  {found && found.name === companyName ? (
                    <div className="su-found" style={{ marginTop: 12 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 999, background: '#ecfdf3', color: '#067647', fontSize: 13, fontWeight: 700 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                        {found.source === 'osm' ? 'Found on the map' : 'Found on Google'}
                      </span>
                      <p style={{ fontSize: 13.5, color: '#4b5563', margin: '10px 2px 0', lineHeight: 1.5 }}>
                        {found.address ? <><strong style={{ color: '#0d0d0d' }}>{found.address}</strong><br /></> : null}
                        We&rsquo;ll fill in your details{found.source === 'osm' ? '' : ' — address, phone, website and opening hours'}. Continue to check them.
                      </p>
                    </div>
                  ) : (
                    <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '8px 2px 0' }}>Search your business name and we&rsquo;ll fill your details from Google Maps.</p>
                  )}
                  <style>{`.su-found{animation:suFound .35s cubic-bezier(.22,1,.36,1) both}@keyframes suFound{from{opacity:0;transform:translate3d(0,4px,0)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.su-found{animation:none}}`}</style>
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

            <div style={{ marginBottom: 16 }}><label style={labelStyle}>Your Colvy address</label>
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
                {industry && !(INDUSTRIES as readonly string[]).includes(industry) && <option value={industry}>{industry}</option>}
              </select>
              {found?.source === 'google' && found.category && found.industry && industry === found.industry && (
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '6px 2px 0' }}>Google lists you as &ldquo;{found.category}&rdquo;. Change it if that&rsquo;s not right.</p>
              )}</div>

            <div style={{ marginBottom: 16 }}><label style={labelStyle}>Website</label>
              <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yourbusiness.com" style={inputStyle} /></div>

            <div style={{ marginBottom: 16 }}><label style={labelStyle}>Address</label>
              <AddressAutocomplete value={address} onChange={setAddress}
                onSelect={p => setAddrParts({ city: p.city, state: p.state, postcode: p.postcode, country: p.country })}
                placeholder="Business address" style={inputStyle} /></div>

            <div style={{ marginBottom: 16 }}><label style={labelStyle}>Business phone</label>
              <input value={businessPhone} onChange={e => setBusinessPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="03 9000 0000" style={inputStyle} />
              <p style={{ fontSize: 12, color: '#9ca3af', margin: '6px 2px 0' }}>Where calls are forwarded until your Colvy phone line is set up.</p></div>

            <div style={{ marginBottom: 8 }}><label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8 }}>Business hours
              {found?.source === 'google' && found.hours && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: '#ecfdf3', color: '#067647', fontSize: 11.5, fontWeight: 700 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  Verified via Google
                </span>
              )}</label>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 2px 10px' }}>Used for after-hours auto-replies and missed-call messages.</p>
              <BusinessHoursEditor value={hours} onChange={setHours} />
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
            <div style={{ marginTop: 16 }}><Turnstile ref={humanRef} onToken={setHumanToken} action="signup" /></div>
            {footer(true, <button type="button" onClick={sendCodes} disabled={loading || waitingForHuman} style={primaryBtn(loading || waitingForHuman)}>{loading ? 'Sending…' : waitingForHuman ? 'Checking…' : 'Send codes →'}</button>)}
          </div>
        )}

        {/* STEP 5 — Verify email */}
        {step === 5 && (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0d0d0d', margin: '4px 0 6px' }}>Verify email</h1>
            <p style={{ fontSize: 14, color: '#6b6b70', marginBottom: 24 }}>Enter the 6-digit code we emailed to <strong>{email}</strong>.</p>
            {smsProblem && <div role="alert" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left', maxWidth: 460, margin: '0 auto 16px', padding: '10px 14px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', fontSize: 13 }}><AlertIcon /><span><strong>Your mobile:</strong> {smsProblem}</span></div>}
            {emailProblem && <div role="alert" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left', maxWidth: 460, margin: '0 auto 16px', padding: '10px 14px', borderRadius: 12, background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', fontSize: 13 }}><AlertIcon />{emailProblem}</div>}
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
            <p style={{ fontSize: 14, color: '#6b6b70', marginBottom: 20 }}>Enter the 6-digit code we {called ? 'read out to' : 'texted to'} <strong>{normalizeMobile(mobile)}</strong>.</p>
            {smsProblem && (
              <div role="alert" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left', maxWidth: 460, margin: '0 auto 16px', padding: '12px 14px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', fontSize: 13.5, lineHeight: 1.45 }}>
                <AlertIcon /><span>{smsProblem}</span>
              </div>
            )}
            {called && !smsProblem && (
              <div role="status" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left', maxWidth: 460, margin: '0 auto 16px', padding: '12px 14px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', fontSize: 13.5, lineHeight: 1.45 }}>
                <PhoneIcon /><span>We&rsquo;re calling {normalizeMobile(mobile)} now. Answer and listen for the 6-digit code. It&rsquo;s read out twice.</span>
              </div>
            )}
            <input value={smsCode} onChange={e => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus inputMode="numeric" autoComplete="one-time-code" placeholder="Enter code"
              onKeyDown={e => { if (e.key === 'Enter') verify('sms') }}
              style={{ ...inputStyle, maxWidth: 320, margin: '0 auto', textAlign: 'center', letterSpacing: 6, fontSize: 20, fontWeight: 700 }} />
            <div style={{ marginTop: 18 }}>
              <p style={{ fontSize: 13, color: '#6b6b70', margin: '0 0 8px' }}>Didn&rsquo;t get it?{smsResend > 0 ? ` You can ask again in ${smsResend}s.` : ''}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                <button type="button" onClick={() => resend('sms')} disabled={smsResend > 0 || !!mobileBusy} style={smallBtn(smsResend > 0 || !!mobileBusy)}>
                  <SmsIcon />{mobileBusy === 'sms' ? 'Sending…' : 'Text me again'}
                </button>
                {voiceAvailable && (
                  <button type="button" onClick={() => resend('voice')} disabled={smsResend > 0 || !!mobileBusy} style={smallBtn(smsResend > 0 || !!mobileBusy)}>
                    <PhoneIcon />{mobileBusy === 'voice' ? 'Calling…' : 'Call me with the code'}
                  </button>
                )}
                <button type="button" onClick={() => { setChangingNumber(c => !c); setNewMobile(mobile) }} disabled={!!mobileBusy} style={smallBtn(!!mobileBusy)}>
                  <EditIcon />Change number
                </button>
              </div>
              {changingNumber && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 420, margin: '12px auto 0' }}>
                  <input value={newMobile} onChange={e => setNewMobile(e.target.value)} placeholder="04xx xxx xxx" inputMode="tel" autoComplete="tel"
                    onKeyDown={e => { if (e.key === 'Enter') changeNumber() }} style={{ ...inputStyle, flex: '1 1 200px', width: 'auto' }} />
                  <button type="button" onClick={changeNumber} disabled={!!mobileBusy || smsResend > 0 || (!!TURNSTILE_SITE_KEY && !changeHumanToken)} style={{ ...primaryBtn(!!mobileBusy || smsResend > 0 || (!!TURNSTILE_SITE_KEY && !changeHumanToken)), padding: '10px 16px', fontSize: 14 }}>
                    {mobileBusy === 'change' ? 'Sending…' : 'Text this number'}
                  </button>
                  <div style={{ flexBasis: '100%', display: 'flex', justifyContent: 'center' }}><Turnstile ref={changeHumanRef} onToken={setChangeHumanToken} action="signup-change-number" /></div>
                </div>
              )}
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
            {footer(true, <button type="button" onClick={finish} disabled={loading} style={primaryBtn(loading)}>{loading ? 'Creating your workspace…' : 'Create my workspace'}</button>)}
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
