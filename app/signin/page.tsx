'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { signInWithGoogle, signInWithGitHub } from '@/lib/auth'

const TESTIMONIALS = [
  { quote: "Colvy replaced our messy spreadsheet overnight. Customers finally feel heard.", name: 'Jordan Mills', role: 'Founder, Prexty', avatar: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=80&h=80&fit=crop&crop=face' },
  { quote: "The public roadmap doubled our trial-to-paid conversion. Our users love the transparency.", name: 'Aiko Tanaka', role: 'Product Lead, nePlay', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&crop=face' },
  { quote: "Setup took 4 minutes. We migrated from Canny in one click and have not looked back since.", name: 'Sam Rivera', role: 'CEO, Roxy Aquarium', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face' },
]

const EyeIcon = ({ off }: { off: boolean }) => off ? (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
) : (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
)

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
)
const GithubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
)

function SignInForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [oauthLoading, setOAuthLoading] = useState('')
  const [slide, setSlide] = useState(0)
  const [companyContext, setCompanyContext] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      if (data?.session?.user) {
        const redirect = params.get('redirect')
        window.location.href = redirect || getRedirectUrl()
      }
    })

    // Detect company subdomain
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname
      const isSubdomain = hostname.endsWith('.colvy.com') && hostname !== 'colvy.com' && hostname !== 'www.colvy.com' && !hostname.includes('localhost')
      
      if (isSubdomain) {
        const slug = hostname.split('.')[0]
        supabase.from('companies').select('id, name, slug').eq('slug', slug).single().then(({ data }) => {
          if (data) {
            setCompanyContext(data)
          }
        })
      }
    }

    const t = setInterval(() => setSlide(s => (s + 1) % TESTIMONIALS.length), 5000)
    return () => clearInterval(t)
  }, [])

  const getRedirectUrl = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user

    // Always try to find the user's own company first (they should land on their admin)
    if (user) {
      const { data: ownCo } = await (supabase as any).from('companies').select('slug').eq('owner_id', user.id).maybeSingle()
      if (ownCo?.slug) {
        const hostname = window.location.hostname
        const isLocal = hostname.includes('localhost') || hostname.includes('vercel.app')
        if (!isLocal) {
          // Pass the session tokens in the URL so the subdomain can pick them up
          // without requiring a second sign-in. Supabase's detectSessionInUrl:true
          // will exchange these automatically.
          const accessToken = session?.access_token
          const refreshToken = session?.refresh_token
          const base = `https://${ownCo.slug}.colvy.com/admin`
          if (accessToken && refreshToken) {
            return `${base}#access_token=${accessToken}&refresh_token=${refreshToken}&type=recovery`
          }
          return base
        }
        return '/admin'
      }
    }

    // Signing in on a company subdomain — return to the board
    if (companyContext) {
      const hostname = window.location.hostname
      const isLocal = hostname.includes('localhost') || hostname.includes('vercel.app')
      if (!isLocal) return `https://${companyContext.slug}.colvy.com/`
      return '/'
    }

    return '/admin'
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) { setError(err.message); setLoading(false); return }
    const redirect = params.get('redirect') || await getRedirectUrl()
    window.location.href = redirect
  }

  const handleGoogle = async () => {
    setOAuthLoading('google')
    // Store company context for OAuth callback
    if (companyContext) {
      localStorage.setItem('oauth_company_context', JSON.stringify(companyContext))
    }
    const { error: err } = await signInWithGoogle()
    if (err) { setError('Google sign-in not enabled. Enable it in Supabase → Authentication → Providers → Google.'); setOAuthLoading('') }
  }

  const handleGitHub = async () => {
    setOAuthLoading('github')
    // Store company context for OAuth callback
    if (companyContext) {
      localStorage.setItem('oauth_company_context', JSON.stringify(companyContext))
    }
    const { error: err } = await signInWithGitHub()
    if (err) { setError('GitHub sign-in not enabled. Enable it in Supabase → Authentication → Providers → GitHub.'); setOAuthLoading('') }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr', background: '#fff' }}>
      <style>{`
        @media (max-width: 900px) { .sf-visual { display: none !important; } .sf-form-col { grid-column: 1 / -1 !important; } }
        @keyframes sfFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .sf-anim { animation: sfFade 0.5s ease both; }
      `}</style>

      {/* LEFT — form */}
      <div className="sf-form-col" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '48px clamp(24px, 8vw, 96px)' }}>
        <div style={{ maxWidth: 380, width: '100%', margin: '0 auto' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 40, textDecoration: 'none' }}>
            <img src="/logo.png" alt="Colvy" style={{ height: 28, width: 'auto' }} onError={(e: any) => e.target.style.display = 'none'} />
            <span style={{ fontWeight: 800, fontSize: 18, color: '#ff7a6b' }}>Colvy</span>
          </Link>

          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0d0d0d', marginBottom: 6, letterSpacing: '-0.01em' }}>Welcome back</h1>
          <p style={{ fontSize: 14, color: '#6b6b70', marginBottom: 28 }}>Sign in to manage your board.</p>

          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            <button onClick={handleGoogle} disabled={!!oauthLoading}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '11px', borderRadius: 12, border: '1px solid #e5e5e5', background: '#fff', fontSize: 14, fontWeight: 600, color: '#0d0d0d', cursor: 'pointer' }}>
              <GoogleIcon /> {oauthLoading === 'google' ? 'Connecting...' : 'Continue with Google'}
            </button>
            <button onClick={handleGitHub} disabled={!!oauthLoading}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '11px', borderRadius: 12, border: '1px solid #e5e5e5', background: '#fff', fontSize: 14, fontWeight: 600, color: '#0d0d0d', cursor: 'pointer' }}>
              <GithubIcon /> {oauthLoading === 'github' ? 'Connecting...' : 'Continue with GitHub'}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
            <div style={{ flex: 1, height: 1, background: '#e5e5e5' }} />
            <span style={{ fontSize: 12, color: '#9ca3af' }}>or</span>
            <div style={{ flex: 1, height: 1, background: '#e5e5e5' }} />
          </div>

          <form onSubmit={handleSignIn}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginBottom: 6 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@company.com"
                style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: '1px solid #e5e5e5', fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d' }}>Password</label>
                <Link href="/forgot-password" style={{ fontSize: 12, color: '#ff7a6b', textDecoration: 'none' }}>Forgot password?</Link>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="Your password"
                  style={{ width: '100%', padding: '11px 44px 11px 14px', borderRadius: 12, border: '1px solid #e5e5e5', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#6b6b70', borderRadius: 8 }}>
                  <EyeIcon off={showPassword} />
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              style={{ width: '100%', padding: '12px', borderRadius: 12, background: '#ff7a6b', color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: 13, color: '#6b6b70', marginTop: 24 }}>
            Don't have an account? <Link href="/signup" style={{ color: '#ff7a6b', fontWeight: 600, textDecoration: 'none' }}>Sign up free</Link>
          </p>
        </div>
      </div>

      {/* RIGHT — visual / testimonial slider */}
      <div className="sf-visual" style={{ background: 'linear-gradient(160deg, #fff7f5 0%, #ffeae6 100%)', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
        <div style={{ position: 'absolute', top: '-10%', right: '-10%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,122,107,0.18), transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: '-15%', left: '-10%', width: 350, height: 350, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.12), transparent 70%)' }} />

        <div key={slide} className="sf-anim" style={{ position: 'relative', zIndex: 1, maxWidth: 440 }}>
          <div style={{ display: 'flex', gap: 3, marginBottom: 24 }}>
            {[...Array(5)].map((_, i) => (
              <svg key={i} width="18" height="18" viewBox="0 0 24 24" fill="#ff7a6b"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            ))}
          </div>
          <p style={{ fontSize: 26, fontWeight: 600, color: '#1a1a1a', lineHeight: 1.4, marginBottom: 32, letterSpacing: '-0.01em' }}>
            "{TESTIMONIALS[slide].quote}"
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src={TESTIMONIALS[slide].avatar} alt={TESTIMONIALS[slide].name} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>{TESTIMONIALS[slide].name}</p>
              <p style={{ fontSize: 13, color: '#6b6b70' }}>{TESTIMONIALS[slide].role}</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 36 }}>
            {TESTIMONIALS.map((_, i) => (
              <button key={i} onClick={() => setSlide(i)}
                style={{ width: i === slide ? 24 : 8, height: 8, borderRadius: 999, background: i === slide ? '#ff7a6b' : 'rgba(0,0,0,0.15)', border: 'none', cursor: 'pointer', transition: 'all 0.3s' }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
      <SignInForm />
    </Suspense>
  )
}
