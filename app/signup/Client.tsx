'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { signInWithGoogle, signInWithGitHub } from '@/lib/auth'
import { isValidSlug, isSlugAvailable } from '@/lib/board'
import { track } from '@/lib/analytics'
import { readFirstTouch } from '@/lib/analytics-privacy'
import { useRouter, useSearchParams } from 'next/navigation'
import AddressAutocomplete, { AddressParts } from '@/components/AddressAutocomplete'
import BusinessAutocomplete, { BusinessDetails, BusinessHours, emptyHours } from '@/components/BusinessAutocomplete'
import BusinessHoursEditor from '@/components/BusinessHoursEditor'
import ColvyLogo from '@/components/ColvyLogo'
import { INDUSTRIES } from '@/lib/industries'
import Turnstile, { TurnstileHandle, TURNSTILE_SITE_KEY } from '@/components/Turnstile'
import { normaliseSignupMobile } from '@/lib/signup-delivery'
import { signupProfilePayload } from '@/lib/signup-profile'
import AiBuddy from '@/components/AiBuddy'
import { COLVY_ICON, MORE_COLORS, DOMAIN_RE, cleanDomain, I, GLOBE, ICONS, SETUP_CSS, SetupPreview, type PreviewFocus, SetupToast, PreviewSection, PreviewRow, GhostRows, Swatch, useSetupTheme, type Rect } from '@/components/setup/SetupKit'
import { DAYS, type DayHours } from '@/lib/week-hours'


const CORAL = '#ff7a6b'
const TOTAL_STEPS = 7
// Step names for the signup funnel in Super Admin → Intelligence.
const SIGNUP_STEP_NAMES: Record<number, string> = { 1: 'about_you', 2: 'business', 3: 'business_details', 4: 'contact', 5: 'verify_email', 6: 'verify_mobile', 7: 'password' }
/** A short, fixed code for an error shown on the signup form (never its text). */
function signupErrorCode(msg: string): string {
  const m = msg.toLowerCase()
  if (/valid email/.test(m)) return 'invalid_email'
  if (/already|exists|registered|in use/.test(m)) return 'account_exists'
  if (/6-digit|code/.test(m)) return /expired/.test(m) ? 'code_expired' : 'code_invalid'
  if (/at least 6/.test(m)) return 'password_too_short'
  if (/do not match/.test(m)) return 'password_mismatch'
  if (/address is taken|slug/.test(m)) return 'slug_taken'
  if (/business name|industry/.test(m)) return 'details_missing'
  if (/mobile|phone/.test(m)) return 'phone_invalid'
  if (/too many|rate|wait/.test(m)) return 'rate_limited'
  if (/network|fetch|failed to|timeout/.test(m)) return 'network'
  return 'other'
}

// AU-friendly mobile normalisation (lib/signup-delivery, the same rules the
// server applies): "0466 077 557", "+61 0466 077 557" and "61466077557" all
// become +61466077557. Falls back to what was typed while it isn't valid yet.
function normalizeMobile(raw: string): string {
  const m = normaliseSignupMobile(raw)
  return m.ok ? m.e164 : (raw || '').replace(/[\s()-]/g, '')
}

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

  // Funnel analytics (Super Admin → Intelligence): each step finished, and the
  // kind of error someone hit. Only a short code is sent, never the message
  // (which can echo an email address) or anything typed.
  const lastStep = useRef(step)
  useEffect(() => {
    if (step > lastStep.current) track('signup_step_completed', { step: lastStep.current, name: SIGNUP_STEP_NAMES[lastStep.current] || String(lastStep.current) })
    lastStep.current = step
  }, [step])
  useEffect(() => {
    if (error) track('signup_error', { step, code: signupErrorCode(error) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])

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
        // The visit that first found Colvy (kept by components/Analytics for
        // 90 days) wins over this page's own referrer, which is usually our
        // pricing page.
        const ft = readFirstTouch()
        sessionStorage.setItem('colvy_signup_attr', JSON.stringify(ft
          ? { utm: ft.utm && Object.keys(ft.utm).length ? ft.utm : utm, referrer: ft.referrer || '', landing: ft.landing || '', first_seen: ft.at, click: ft.click || '' }
          : { utm, referrer: document.referrer || '', landing: window.location.pathname + window.location.search }))
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

  // ── The live preview ─────────────────────────────────────────────────────
  // Beside the form, a copy of their workspace builds as they go (components/
  // setup/SetupKit, the same as creating another workspace): their name, the
  // business, its website's icon and colour, its details, their email and
  // mobile as channels (ticked once verified). Creating it zooms the preview
  // out to fill the screen while the workspace is made.
  const { dark } = useSetupTheme()
  const [dir, setDir] = useState<1 | -1>(1)
  const [brand, setBrand] = useState<{ domain: string; icon: string | null; colors: string[] } | null>(null)
  const [brandState, setBrandState] = useState<'idle' | 'loading' | 'ok' | 'none'>('idle')
  const [iconOk, setIconOk] = useState(true)
  const [color, setColor] = useState(CORAL)
  const [colorTouched, setColorTouched] = useState(false)
  const site = cleanDomain(website)
  const siteLooksDone = DOMAIN_RE.test(site)
  useEffect(() => {
    if (!siteLooksDone) { setBrand(null); setBrandState('idle'); return }
    setBrandState('loading')
    let live = true
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/site-brand?domain=${encodeURIComponent(site)}`)
        const d = await r.json()
        if (!live) return
        if (r.ok && d.domain) { setBrand(d); setIconOk(true); setBrandState('ok') } else { setBrand(null); setBrandState('none') }
      } catch { if (live) { setBrand(null); setBrandState('none') } }
    }, 600)
    return () => { live = false; clearTimeout(t) }
  }, [site, siteLooksDone])
  // Their website's main colour becomes the workspace colour unless they pick one.
  useEffect(() => { if (!colorTouched && brand?.colors?.[0]) setColor(brand.colors[0]) }, [brand, colorTouched])
  const siteIcon = brand?.icon && iconOk ? brand.icon : null
  const [phase, setPhase] = useState<'form' | 'zoom' | 'full'>('form')
  const [from, setFrom] = useState<Rect | null>(null)
  const startRect = useRef<Rect | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [buildLine, setBuildLine] = useState(0)
  const [toast, setToast] = useState<{ msg: string } | null>(null)
  const closeToast = useCallback(() => setToast(null), [])
  useEffect(() => {
    if (phase === 'form') { setBuildLine(0); return }
    const t = setInterval(() => setBuildLine(n => Math.min(BUILDING.length - 1, n + 1)), 1100)
    return () => clearInterval(t)
  }, [phase])

  // ── Step transitions ─────────────────────────────────────────────────────
  const next = () => { setDir(1); setStep(s => Math.min(TOTAL_STEPS, s + 1)) }
  const back = () => { setDir(-1); setStep(s => Math.max(1, s - 1)) }

  const canLeaveDetails = !!companyName.trim() && slugStatus === 'available' && !!industry

  // Everything we know about the business (Google place, address, hours…),
  // sent with every code request, verification and the finished sign-up so
  // super admin → Signups has it even if one of those records is lost.
  const signupProfile = () => signupProfilePayload({ fullName, companyName, slug, industry, website, businessPhone, address, addrParts, hours, found, bizMode })

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
          profile: signupProfile(),
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
      setDir(1); setStep(5)
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
        body: JSON.stringify({ token, email: email.trim(), phone, channel, profile: signupProfile(), ...(phoneOverride ? { turnstileToken: changeHumanToken } : {}) }),
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
    setDir(-1); setStep(4); setTimeout(() => setError(why), 0)
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
        body: JSON.stringify({ token, channel, code, profile: signupProfile() }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.code === 'locked' || data.code === 'restart') { startOver(data.error || 'Please start again.'); setLoading(false); return }
        throw new Error(data.error || 'Could not verify')
      }
      setDir(1)
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
    // Zoom the preview out to the whole screen while the workspace is made.
    const r = panelRef.current?.getBoundingClientRect()
    if (r && r.width) {
      startRect.current = { top: r.top, left: r.left, right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom }
      setFrom(startRect.current); setPhase('zoom')
      requestAnimationFrame(() => requestAnimationFrame(() => setFrom({ top: 0, left: 0, right: 0, bottom: 0 })))
      setTimeout(() => setPhase(p => (p === 'zoom' ? 'full' : p)), 750)
    } else setPhase('full')
    const started = Date.now()
    // Something went wrong: say so over the full screen, then ease back to the form.
    const backToForm = (msg: string, after?: () => void) => {
      setToast({ msg })
      setTimeout(() => {
        const done = () => { setPhase('form'); setFrom(null); setError(msg); setLoading(false); after?.() }
        if (startRect.current && window.innerWidth > 900) { setPhase('zoom'); setFrom(startRect.current); setTimeout(done, 820) } else done()
      }, Math.max(0, 1600 - (Date.now() - started)) + 2200)
    }
    try {
      const res = await fetch('/api/auth/complete-signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, password, fullName: fullName.trim(), profile: signupProfile(),
          ref: refParam || (() => { try { return localStorage.getItem('pending_ref') } catch { return null } })() || null,
          business: {
            name: companyName.trim(), slug: slug.toLowerCase(), industry,
            website: website.trim() || null, address: address.trim() || null,
            city: addrParts.city || null, state: addrParts.state || null,
            postcode: addrParts.postcode || null, country: addrParts.country || null,
            phone: businessPhone.trim() || null, hours,
            accentColor: color, logoUrl: siteIcon || undefined,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.code === 'slug_taken') { setSlugStatus('taken'); backToForm('That Colvy address is taken. Please choose another.', () => { setDir(-1); setStep(3) }); return }
        throw new Error(data.error || 'Signup failed')
      }
      track('signup_completed', { via: 'email' })
      // Sign in and head to onboarding (the account is already email-confirmed),
      // after the setup screen has had a moment.
      await supabase.auth.signInWithPassword({ email: email.trim(), password })
      setTimeout(() => router.push('/onboarding'), Math.max(0, 2800 - (Date.now() - started)))
    } catch (e: any) { backToForm(e?.message || 'Signup failed') }
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

  // ── The wizard: the form beside a live preview of their workspace ─────────
  const first = fullName.trim().split(/\s+/)[0] || ''
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
  const mobileOk = normaliseSignupMobile(mobile).ok
  const today = DAYS[(new Date().getDay() + 6) % 7]
  const todayHours: DayHours | undefined = hours?.[today]
  const hoursText = !todayHours ? '' : !todayHours.open ? 'Closed today' : todayHours.from === '00:00' && /^(24:00|23:59|00:00)$/.test(todayHours.to) ? 'Open 24 hours today' : `Open today ${todayHours.from}–${todayHours.to}`
  const siteColors = (brand?.colors || []).filter(c => !MORE_COLORS.includes(c))

  // The one button at the foot, per step.
  const primary: { label: string; run: () => void; off: boolean } = [
    { label: 'Continue', run: next, off: !fullName.trim() },
    { label: 'Continue', run: next, off: !companyName.trim() },
    { label: 'Continue', run: next, off: !canLeaveDetails },
    { label: loading ? 'Sending…' : waitingForHuman ? 'Checking…' : 'Send codes', run: sendCodes, off: loading || waitingForHuman },
    { label: loading ? 'Checking…' : 'Verify email', run: () => verify('email'), off: loading || emailCode.length !== 6 },
    { label: loading ? 'Checking…' : 'Verify mobile', run: () => verify('sms'), off: loading || smsCode.length !== 6 },
    { label: loading ? 'Creating…' : 'Create my workspace', run: finish, off: loading },
  ][step - 1]
  const onEnter = (ok: boolean) => (e: React.KeyboardEvent) => { if (e.key === 'Enter' && ok) primary.run() }

  return (
    <div className={`nw nw-${phase}${dark ? ' dark' : ''} su`} style={{ ['--c' as string]: color } as React.CSSProperties}>
      <style>{SETUP_CSS + SU_CSS}</style>

      <div className="nw-left">
        <div className="nw-top">
          <div className="nw-brand"><img src={COLVY_ICON} alt="" width={30} height={30} /><span>Colvy</span></div>
          <div className="nw-dots" aria-label={`Step ${step} of ${TOTAL_STEPS}`}>{Array.from({ length: TOTAL_STEPS }, (_, i) => <span key={i} className={i + 1 === step ? 'on' : i + 1 < step ? 'done' : ''} />)}</div>
          <a href="/signin" className="nw-top-link">Sign in</a>
        </div>

        <div className="nw-body">
          <div key={step} className={`nw-step ${dir > 0 ? 'fwd' : 'back'}`}>
            {/* STEP 1 — Your name */}
            {step === 1 && (<>
              <h1>Let&rsquo;s get to know you</h1>
              <p className="nw-sub">Start with your name. Colvy will say hello on the right.</p>
              <input className="nw-input" value={fullName} onChange={e => setFullName(e.target.value)} autoFocus placeholder="Your full name" autoComplete="name" aria-label="Your full name"
                onKeyDown={onEnter(!!fullName.trim())} />
            </>)}

            {/* STEP 2 — Your business (find on Google / manual) */}
            {step === 2 && (<>
              <h1>Your business</h1>
              <p className="nw-sub">Find it on Google and we&rsquo;ll fill in the rest, or type it in.</p>
              <div className="su-seg" role="tablist">
                <button type="button" role="tab" aria-selected={bizMode === 'google'} className={bizMode === 'google' ? 'on' : ''} onClick={() => setBizMode('google')}>
                  {I(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>, 15, 2.2)}Find on Google
                </button>
                <button type="button" role="tab" aria-selected={bizMode === 'manual'} className={bizMode === 'manual' ? 'on' : ''} onClick={() => setBizMode('manual')}>Enter manually</button>
              </div>
              {bizMode === 'google' ? (<>
                <BusinessAutocomplete value={companyName} onChange={v => { setCompanyName(v); if (found && v !== found.name) setFound(null) }} onSelect={applyBusiness} placeholder="Search your business name…" className="nw-input" style={FIELD} />
                {found && found.name === companyName ? (
                  <div className="nw-found su-found-box">
                    {I(ICONS.check, 13, 3)}
                    <span>{found.source === 'osm' ? 'Found on the map' : 'Found on Google'}{found.address ? <small>{found.address}</small> : null}</span>
                  </div>
                ) : <p className="nw-hint">Search your business name and we&rsquo;ll fill your details from Google Maps.</p>}
              </>) : (
                <input className="nw-input" value={companyName} onChange={e => setCompanyName(e.target.value)} autoFocus placeholder="Acme Aquariums" aria-label="Business name" onKeyDown={onEnter(!!companyName.trim())} />
              )}
            </>)}

            {/* STEP 3 — Business details */}
            {step === 3 && (<>
              <h1>Your business details</h1>
              <p className="nw-sub">Check what we found. You can change anything.</p>
              <label className="su-field"><span>Business name</span>
                <input className="nw-input" value={companyName} onChange={e => setCompanyName(e.target.value)} /></label>
              <label className="su-field"><span>Your Colvy address</span>
                <span className={`su-slug ${slugStatus}`}>
                  <input value={slug} onChange={e => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')) }} placeholder="acme" aria-label="Colvy address" />
                  <b>.colvy.com</b>
                </span>
                {slugStatus !== 'idle' && <small className={`nw-addr-st ${slugStatus}`}>{slugStatus === 'available' && I(ICONS.check, 12, 3)}{{ checking: 'Checking…', available: 'Available', taken: 'Already taken', invalid: 'Lowercase letters, numbers and hyphens (3–30)' }[slugStatus]}</small>}
              </label>
              <label className="su-field"><span>Industry</span>
                <select className="nw-input su-select" value={industry} onChange={e => setIndustry(e.target.value)} style={{ color: industry ? undefined : '#9ca3af' }}>
                  <option value="">Select an industry</option>
                  {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  {industry && !(INDUSTRIES as readonly string[]).includes(industry) && <option value={industry}>{industry}</option>}
                </select>
                {found?.source === 'google' && found.category && found.industry && industry === found.industry && <small>Google lists you as &ldquo;{found.category}&rdquo;. Change it if that&rsquo;s not right.</small>}
              </label>
              <label className="su-field"><span>Website</span>
                <span className={`nw-input nw-domain${siteIcon ? ' has-icon' : ''}`}>
                  <span className="nw-domain-ic" key={siteIcon || (brandState === 'loading' ? 'load' : 'globe')}>
                    {siteIcon ? <img src={siteIcon} alt="" width={20} height={20} onError={() => setIconOk(false)} />
                      : brandState === 'loading' ? <span className="nw-spin" /> : I(GLOBE, 18, 1.8)}
                  </span>
                  <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="yourbusiness.com" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                </span>
                {brandState === 'ok' && brand && <small className="su-ok">{I(ICONS.check, 12, 3)}{siteIcon ? 'Found your icon' : 'Found your site'}{brand.colors.length ? ` and ${brand.colors.length} colour${brand.colors.length === 1 ? '' : 's'}` : ''}</small>}
              </label>
              <div className="su-field"><span>Workspace colour</span>
                <div className="nw-swatches">
                  {[...siteColors, ...MORE_COLORS].map(c => <Swatch key={c} c={c} on={color === c} pick={c2 => { setColor(c2); setColorTouched(true) }} />)}
                </div>
              </div>
              <label className="su-field"><span>Address</span>
                <AddressAutocomplete value={address} onChange={setAddress}
                  onSelect={p => setAddrParts({ city: p.city, state: p.state, postcode: p.postcode, country: p.country })}
                  placeholder="Business address" className="nw-input" style={FIELD} /></label>
              <label className="su-field"><span>Business phone</span>
                <input className="nw-input" value={businessPhone} onChange={e => setBusinessPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="03 9000 0000" />
                <small>Where calls are forwarded until your Colvy phone line is set up.</small></label>
              <div className="su-field"><span>Business hours
                {found?.source === 'google' && found.hours && <em className="su-pill">{I(ICONS.check, 11, 3)}Verified via Google</em>}</span>
                <small style={{ margin: '0 0 10px' }}>Used for after-hours auto-replies and missed-call messages.</small>
                <div className="su-hours"><BusinessHoursEditor value={hours} onChange={setHours} /></div>
              </div>

              {/* OAuth shortcut — skips the password + OTP path. */}
              <div className="su-or"><span />or finish faster with<span /></div>
              <div className="su-oauth">
                <button type="button" onClick={() => oauth('google')} disabled={!!oauthLoading}>
                  <svg width="17" height="17" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  {oauthLoading === 'google' ? 'Redirecting…' : 'Google'}
                </button>
                <button type="button" onClick={() => oauth('github')} disabled={!!oauthLoading}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                  {oauthLoading === 'github' ? 'Redirecting…' : 'GitHub'}
                </button>
              </div>
            </>)}

            {/* STEP 4 — Contact details */}
            {step === 4 && (<>
              <h1>Your contact details</h1>
              <p className="nw-sub">Your email and mobile, so we can verify your account. They become your first channels.</p>
              <label className="su-field"><span>Email</span>
                <input className="nw-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" autoFocus />
                <small>Work email preferred; personal is fine.</small></label>
              <label className="su-field"><span>Mobile number</span>
                <input className="nw-input" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="04xx xxx xxx" inputMode="tel" autoComplete="tel" onKeyDown={onEnter(!primary.off)} />
                <small>We&rsquo;ll text a 6-digit code to this number.</small></label>
              <div style={{ marginTop: 6 }}><Turnstile ref={humanRef} onToken={setHumanToken} action="signup" /></div>
            </>)}

            {/* STEP 5 — Verify email */}
            {step === 5 && (<>
              <h1>Check your email</h1>
              <p className="nw-sub">Enter the 6-digit code we emailed to <strong>{email}</strong>.</p>
              {smsProblem && <div role="alert" className="su-note bad"><AlertIcon /><span><strong>Your mobile:</strong> {smsProblem}</span></div>}
              {emailProblem && <div role="alert" className="su-note warn"><AlertIcon />{emailProblem}</div>}
              <input className="nw-input su-code" value={emailCode} onChange={e => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" aria-label="Email code"
                onKeyDown={onEnter(emailCode.length === 6)} />
              <button type="button" className="nw-link su-resend" onClick={() => resend('email')} disabled={emailResend > 0}>
                {emailResend > 0 ? `Resend code in ${emailResend}s` : 'Resend code'}
              </button>
            </>)}

            {/* STEP 6 — Verify mobile */}
            {step === 6 && (<>
              <h1>Check your phone</h1>
              <p className="nw-sub">Enter the 6-digit code we {called ? 'read out to' : 'texted to'} <strong>{normalizeMobile(mobile)}</strong>.</p>
              {smsProblem && <div role="alert" className="su-note bad"><AlertIcon /><span>{smsProblem}</span></div>}
              {called && !smsProblem && <div role="status" className="su-note good"><PhoneIcon /><span>We&rsquo;re calling {normalizeMobile(mobile)} now. Answer and listen for the 6-digit code. It&rsquo;s read out twice.</span></div>}
              <input className="nw-input su-code" value={smsCode} onChange={e => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" aria-label="Mobile code"
                onKeyDown={onEnter(smsCode.length === 6)} />
              <p className="nw-hint">Didn&rsquo;t get it?{smsResend > 0 ? ` You can ask again in ${smsResend}s.` : ''}</p>
              <div className="su-smalls">
                <button type="button" onClick={() => resend('sms')} disabled={smsResend > 0 || !!mobileBusy}><SmsIcon />{mobileBusy === 'sms' ? 'Sending…' : 'Text me again'}</button>
                {voiceAvailable && <button type="button" onClick={() => resend('voice')} disabled={smsResend > 0 || !!mobileBusy}><PhoneIcon />{mobileBusy === 'voice' ? 'Calling…' : 'Call me with the code'}</button>}
                <button type="button" onClick={() => { setChangingNumber(c => !c); setNewMobile(mobile) }} disabled={!!mobileBusy}><EditIcon />Change number</button>
              </div>
              {changingNumber && (
                <div className="su-change">
                  <input className="nw-input" value={newMobile} onChange={e => setNewMobile(e.target.value)} placeholder="04xx xxx xxx" inputMode="tel" autoComplete="tel" onKeyDown={e => { if (e.key === 'Enter') changeNumber() }} />
                  <button type="button" className="nw-back" onClick={changeNumber} disabled={!!mobileBusy || smsResend > 0 || (!!TURNSTILE_SITE_KEY && !changeHumanToken)}>
                    {mobileBusy === 'change' ? 'Sending…' : 'Text this number'}
                  </button>
                  <Turnstile ref={changeHumanRef} onToken={setChangeHumanToken} action="signup-change-number" />
                </div>
              )}
            </>)}

            {/* STEP 7 — Create password */}
            {step === 7 && (<>
              <h1>Create your password</h1>
              <p className="nw-sub">Last step. Set a password to keep your account safe.</p>
              <label className="su-field"><span>Password</span>
                <input className="nw-input" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" autoComplete="new-password" autoFocus /></label>
              <label className="su-field"><span>Confirm password</span>
                <input className="nw-input" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" onKeyDown={onEnter(!loading)} /></label>
              <label className="su-check"><input type="checkbox" checked={showPassword} onChange={e => setShowPassword(e.target.checked)} /> Show password</label>
            </>)}
          </div>
          {error && <div className="nw-error" role="alert">{error}</div>}
        </div>

        <div className="nw-foot">
          <div className="nw-btns">
            {step > 1 && <button type="button" className="nw-back" onClick={back}>{I(ICONS.back, 15)}Back</button>}
            <button type="button" className="nw-next" onClick={primary.run} disabled={primary.off || phase !== 'form'}>{primary.label}{I(ICONS.next, 15)}</button>
          </div>
          <p className="nw-legal">By continuing you agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms</a> and <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a></p>
        </div>
      </div>

      {/* ── The live preview ───────────────────────────────────────────── */}
      <SetupPreview panelRef={panelRef} phase={phase} from={from} name={companyName}
        focus={(({ 2: 'name', 3: 'site', 4: 'channels', 5: 'brand', 6: 'channels' }) as Record<number, PreviewFocus>)[step] || 'overview'}
        logo={siteIcon ? { kind: 'img', src: siteIcon } : { kind: 'colvy' }}
        corner={first ? <div className="nw-me" key={first[0]}><span className="nw-av-ini" style={{ width: 30, height: 30, fontSize: 13 }}>{first[0].toUpperCase()}</span>{first}</div> : null}
        sub={<>
          {step >= 3 && slug && slugStatus === 'available' && <div className="nw-ws-site">{I(ICONS.chat, 13)}{slug}.colvy.com</div>}
          {siteLooksDone && <div className="nw-ws-site">{siteIcon ? <img src={siteIcon} alt="" /> : I(GLOBE, 13)}{site}</div>}
        </>}
        sections={
          <PreviewSection k="channels" icon={ICONS.chat} title="Channels">
            <PreviewRow color={color} icon={ICONS.chat} label="Website chat" fresh={false} />
            {step >= 3 && businessPhone.trim() && <PreviewRow color="#7c3aed" icon={<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />} label="Calls" detail={businessPhone.trim()} />}
            {step >= 4 && emailOk && <PreviewRow color="#3b82f6" icon={<><rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" /></>} label="Email" detail={email.trim()} verified={emailVerified} />}
            {step >= 4 && mobileOk && <PreviewRow color="#22c55e" icon={ICONS.chat} label="SMS" detail={normalizeMobile(mobile)} verified={smsVerified} />}
            {step < 3 && <GhostRows />}
          </PreviewSection>
        }
        conv={first ? (
          <div className="nw-thread">
            <div className="nw-msg"><img src={COLVY_ICON} alt="" /><p>Welcome to Colvy, <b>{first}</b>! 👋 {companyName.trim() ? <>Let&rsquo;s get <b>{companyName.trim()}</b> set up.</> : <>Let&rsquo;s set up your business.</>}</p></div>
            {step >= 3 && (address.trim() || businessPhone.trim() || hoursText) && (
              <div className="nw-card">
                <h4>{I(ICONS.bag, 13)}{industry || 'Your business'}</h4>
                {address.trim() && <div className="nw-card-row">{I(<><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>, 15)}<span>{address.trim()}</span></div>}
                {businessPhone.trim() && <div className="nw-card-row">{I(<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />, 15)}<span>{businessPhone.trim()}</span></div>}
                {hoursText && <div className="nw-card-row">{I(<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>, 15)}<span>{hoursText}</span>{found?.source === 'google' && found.hours && <em>Google</em>}</div>}
              </div>
            )}
            {step >= 5 && (
              <div className="nw-msg" key={emailVerified && smsVerified ? 'both' : emailVerified ? 'email' : 'codes'}>
                <img src={COLVY_ICON} alt="" />
                <p>{emailVerified && smsVerified ? <>You&rsquo;re verified. One last thing: a password.</> : emailVerified ? <>Email verified ✓ Now the code on your phone.</> : <>I&rsquo;ve sent you two codes: one by email, one by text.</>}</p>
              </div>
            )}
          </div>
        ) : undefined}
        build={
          <div className="nw-build">
            <AiBuddy size={84} color={color} shadow />
            <h2>Setting up {companyName.trim() || 'your workspace'}</h2>
            {siteLooksDone && <p className="nw-build-for">for <span className="nw-build-chip">{siteIcon ? <img src={siteIcon} alt="" /> : I(GLOBE, 16)}</span>{site}</p>}
            <p className="nw-build-line" key={buildLine}>{BUILDING[buildLine]}</p>
          </div>
        } />

      <SetupToast toast={toast} onClose={closeToast} />
    </div>
  )
}

const BUILDING = ['Creating your account…', 'Creating your inbox…', 'Saving your branding…', 'Getting Colvy AI ready…', 'Setting up your address…', 'Opening your workspace…']

// Fields drawn by other components (business search, address) take a style.
const FIELD: React.CSSProperties = { width: '100%', height: 52, boxSizing: 'border-box' }

const SU_CSS = `
.su .nw-body{padding-top:clamp(24px,7vh,72px)}
.su-field{display:block;margin:0 0 18px}
.su-field>span{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:14px;font-weight:600}
.su-field small{display:flex;align-items:center;gap:5px;margin:7px 2px 0;font-size:12.5px;color:#8e8e93}
.su-field small.su-ok{color:#15803d;font-weight:600}
.su-pill{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:#ecfdf3;color:#067647;font-size:11.5px;font-weight:700;font-style:normal}
.su-slug{display:flex;align-items:center;height:52px;border-radius:14px;border:1.5px solid #e4e4e7;background:#fff;overflow:hidden;transition:border-color .15s,box-shadow .15s}
.su-slug:focus-within{border-color:var(--c);box-shadow:0 0 0 4px color-mix(in srgb,var(--c) 16%,transparent)}
.su-slug.available{border-color:#22c55e}.su-slug.taken,.su-slug.invalid{border-color:#ef4444}
.su-slug input{flex:1;min-width:0;height:100%;padding:0 6px 0 16px;border:none;outline:none;background:transparent;font:inherit;font-size:16px;font-weight:600;color:inherit}
.su-slug input:focus{box-shadow:none}
.su-slug b{padding:0 14px 0 0;font-weight:500;color:#8e8e93}
.su-select{appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 16px center;padding-right:40px;cursor:pointer}
.su-seg{display:inline-flex;gap:4px;padding:4px;margin:0 0 16px;border-radius:999px;background:#f4f4f5}
.su-seg button{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 16px;border:none;border-radius:999px;background:transparent;font:inherit;font-size:14px;font-weight:600;color:#71717a;cursor:pointer;transition:background-color .2s,color .2s,box-shadow .2s}
.su-seg button.on{background:#fff;color:#18181b;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.su-found-box{align-items:flex-start}
.su-found-box span{display:flex;flex-direction:column;gap:2px}
.su-found-box small{font-weight:500;color:#52525b}
.su-or{display:flex;align-items:center;gap:12px;margin:26px 0 12px;font-size:12.5px;color:#a1a1aa}
.su-or span{flex:1;height:1px;background:#ececef}
.su-oauth{display:flex;gap:10px}
.su-oauth button,.su-smalls button{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:8px;height:46px;border-radius:999px;border:1.5px solid #e4e4e7;background:#fff;font:inherit;font-size:14.5px;font-weight:600;color:#18181b;cursor:pointer}
.su-oauth button:hover,.su-smalls button:hover:not(:disabled){background:#fafafa}
.su-smalls{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.su-smalls button{flex:0 0 auto;height:38px;padding:0 14px;font-size:13.5px}
.su-smalls button:disabled{opacity:.5;cursor:default}
.su-change{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.su-change .nw-input{flex:1 1 200px;width:auto}
.su-change .nw-back{height:52px}
.su-code{justify-content:center;text-align:center;letter-spacing:.5em;font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}
.su-resend{margin-top:12px}
.su-resend:disabled{color:#a1a1aa;text-decoration:none;cursor:default}
.su-note{display:flex;gap:10px;align-items:flex-start;margin:0 0 14px;padding:11px 14px;border-radius:14px;font-size:13.5px;line-height:1.45}
.su-note.bad{background:#fef2f2;color:#b91c1c}
.su-note.warn{background:#fffbeb;color:#92400e}
.su-note.good{background:#f0fdf4;color:#166534}
.su-hours{max-width:100%;overflow-x:auto}
.su-check{display:inline-flex;align-items:center;gap:8px;font-size:13.5px;color:#71717a;cursor:pointer}
.su .nw-legal a{text-decoration:underline;text-underline-offset:2px}
.nw.dark .su-slug,.nw.dark .su-oauth button,.nw.dark .su-smalls button{background:#18181b;border-color:#2c2c31;color:#f4f4f5}
.nw.dark .su-seg{background:#1f1f23}
.nw.dark .su-seg button.on{background:#2c2c31;color:#fff}
.nw.dark .su-or span{background:#26262b}
`

export default function SignUpPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</div>}>
      <SignUpForm />
    </Suspense>
  )
}
