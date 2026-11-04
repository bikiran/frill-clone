'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { signInWithGoogle, signInWithGitHub } from '@/lib/auth'
import { sameSitePath } from '@/lib/same-site-path'
import { useBodyClass } from '@/lib/body-class'
import AiBuddy from '@/components/AiBuddy'
import { COLVY_ICON, I, ICONS, SETUP_CSS, SetupPreview, PreviewSection, PreviewRow, useSetupTheme, type PreviewFocus } from '@/components/setup/SetupKit'
import { CORAL, EMAIL_RE, MAIL, firstFromEmail, EyeIcon, EmailChip, PhoneBand, usePanelZoom, AUTH_CSS } from '@/components/setup/AuthKit'

// ?redirect= is a page on this same site: a path, or a full URL on this origin
// (the board sends its own address). Never another site or a javascript: URL.
function safeRedirect(raw: string | null): string {
  const path = sameSitePath(raw)
  if (path || !raw) return path
  try {
    const u = new URL(raw)
    if (u.origin === window.location.origin) return sameSitePath(`${u.pathname}${u.search}${u.hash}`)
  } catch {}
  return ''
}

const SUPER_ADMIN_EMAIL = 'bishalstha76@gmail.com'

// The preview: a workspace's inbox filling up while you were away. Sample
// messages of the kind any business gets (no names of real customers, and no
// quotes from anyone: the old testimonials here were made up).
const PHONE = <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
const CHANNELS = {
  chat: { label: 'Website chat', color: CORAL, icon: ICONS.chat },
  sms: { label: 'SMS', color: '#22c55e', icon: ICONS.chat },
  email: { label: 'Email', color: '#3b82f6', icon: MAIL },
  call: { label: 'Calls', color: '#7c3aed', icon: PHONE },
  order: { label: 'Orders', color: '#f59e0b', icon: ICONS.bag },
} as const
type Ch = keyof typeof CHANNELS
const FEED: { ch: Ch; who: string; text: string; ai?: boolean }[] = [
  { ch: 'sms', who: 'Mia', text: 'Can you deliver on Saturday morning?', ai: true },
  { ch: 'order', who: 'Ethan', text: 'New order #1042 · $186.50' },
  { ch: 'email', who: 'Liam', text: 'Could I get a quote for 20 units?' },
  { ch: 'chat', who: 'Ava', text: 'Is the blue one back in stock?', ai: true },
  { ch: 'call', who: 'Noah', text: 'Missed call · left a voicemail' },
  { ch: 'sms', who: 'Zoe', text: 'Any times free this weekend?', ai: true },
]
const FEED_EVERY = 2600
const SHOWN = 5

const OPENING = ['Signing you in…', 'Opening your inbox…', 'Loading your conversations…']

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
)
const GithubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
)

function SignInForm() {
  useBodyClass('nw-on')
  const { dark } = useSetupTheme()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [oauthLoading, setOAuthLoading] = useState('')
  const [companyContext, setCompanyContext] = useState<any>(null)
  // A workspace's own sign-in page wears its colour and logo.
  const [brand, setBrand] = useState<{ color: string; logo: string | null }>({ color: CORAL, logo: null })
  // How this workspace lets people sign in (Settings → Sign-in & security).
  const [methods, setMethods] = useState({ google: true, github: true, magicLink: false })
  const [linkSending, setLinkSending] = useState(false)
  const [linkSent, setLinkSent] = useState('')
  // Back from installing Colvy in Shopify (see lib/shopify-install): the store waits for a workspace.
  const [shopifyStore, setShopifyStore] = useState<string | null>(null)
  useEffect(() => {
    if (params.get('shopify') !== 'connect') return
    const m = document.cookie.match(/(?:^|;\s*)colvy_shopify_pending=([^;]*)/)
    if (m) { try { setShopifyStore(decodeURIComponent(m[1]) || 'your Shopify store') } catch { setShopifyStore('your Shopify store') } }
  }, [params])

  // The preview: which field you're in moves its camera, and the feed ticks.
  const [field, setField] = useState<'email' | 'password' | null>(null)
  // Starts with a few in, so the inbox isn't empty while the page settles.
  const [tick, setTick] = useState(2)
  const { phase, from, panelRef, zoomOut, line, lineKey, originStyle } = usePanelZoom(OPENING)
  useEffect(() => {
    if (phase !== 'form') return
    const t = setInterval(() => setTick(n => n + 1), FEED_EVERY)
    return () => clearInterval(t)
  }, [phase])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }: any) => {
      if (data?.session?.user) {
        const redirect = safeRedirect(params.get('redirect'))
        window.location.href = redirect || await getRedirectUrl()
      }
    })

    // Detect company subdomain
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname
      const isSubdomain = hostname.endsWith('.colvy.com') && hostname !== 'colvy.com' && hostname !== 'www.colvy.com' && !hostname.includes('localhost')

      if (isSubdomain) {
        const slug = hostname.split('.')[0]
        supabase.from('companies').select('id, name, slug').eq('slug', slug).single().then(async ({ data }) => {
          if (data) {
            setCompanyContext(data)
            // Its look, asked separately so a missing column can't lose the context above.
            ;(supabase as any).from('companies').select('logo_url, accent_color').eq('id', data.id).maybeSingle()
              .then(({ data: look }: any) => {
                if (!look) return
                setBrand({ color: /^#[0-9a-f]{6}$/i.test(look.accent_color || '') ? look.accent_color : CORAL, logo: look.logo_url || null })
              }, () => {})
            const { data: rows } = await (supabase as any).from('site_settings').select('value').eq('key', 'general').eq('company_id', data.id)
              .order('updated_at', { ascending: false }).limit(1)
            const m = rows?.[0]?.value?.signIn
            if (m && typeof m === 'object') setMethods(v => ({ ...v, ...m }))
          }
        })
      }
    }
  }, [])

  const getRedirectUrl = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user

    // Sent here by the platform console (admin.colvy.com) — go back there, not
    // to a workspace. Its session lives on its own origin, so hand it over the
    // same way as a subdomain. Super admin only: anyone else would be bounced
    // straight back here by the console, in a loop.
    const host = window.location.hostname
    const onColvy = host.endsWith('colvy.com') && !host.includes('localhost')
    if (user && params.get('to') === 'console' && (user.email || '').toLowerCase() === SUPER_ADMIN_EMAIL) {
      if (!onColvy) return '/platform-admin'
      if (session?.access_token && session?.refresh_token) {
        return `https://admin.colvy.com/auth/handoff#access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}&next=${encodeURIComponent('/')}`
      }
      return 'https://admin.colvy.com/'
    }

    // Always try to find the user's own company first (they should land on their admin)
    if (user) {
      // A user may OWN MANY companies. maybeSingle() throws on multiple rows and
      // returned null — so a multi-workspace owner fell through to a bare relative
      // '/admin', which on admin.colvy.com becomes admin.colvy.com/admin → 404.
      // Take the oldest-owned as the stable primary (matches getCompanyByOwner).
      const { data: ownList } = await (supabase as any)
        .from('companies').select('slug').eq('owner_id', user.id)
        .order('created_at', { ascending: true }).limit(1)
      const ownCo = ownList?.[0]
      if (ownCo?.slug) {
        const hostname = window.location.hostname
        const isLocal = hostname.includes('localhost') || hostname.includes('vercel.app')
        if (!isLocal) {
          const accessToken = session?.access_token
          const refreshToken = session?.refresh_token
          if (accessToken && refreshToken) {
            return `https://${ownCo.slug}.colvy.com/auth/handoff#access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}&next=${encodeURIComponent('/admin')}`
          }
          return `https://${ownCo.slug}.colvy.com/admin`
        }
        return '/admin'
      }

      // Own no company but a member of one (e.g. staff, or a super admin who
      // also works inside a company) — land in that company's admin rather than
      // nowhere. This is what lets the platform owner work as Roxy staff.
      const { data: memberships } = await (supabase as any)
        .from('team_members').select('company_id, role').eq('user_id', user.id)
      const elevated = (memberships || []).find((m: any) => ['owner', 'admin', 'editor'].includes((m.role || '').toLowerCase()) && m.company_id)
      if (elevated?.company_id) {
        const { data: memberCo } = await (supabase as any).from('companies').select('slug').eq('id', elevated.company_id).maybeSingle()
        if (memberCo?.slug) {
          const hostname = window.location.hostname
          const isLocal = hostname.includes('localhost') || hostname.includes('vercel.app')
          if (!isLocal) {
            const accessToken = session?.access_token
            const refreshToken = session?.refresh_token
            if (accessToken && refreshToken) {
              return `https://${memberCo.slug}.colvy.com/auth/handoff#access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}&next=${encodeURIComponent('/admin')}`
            }
            return `https://${memberCo.slug}.colvy.com/admin`
          }
          return '/admin'
        }
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

  // Magic link: email a one-time sign-in link. Only for existing accounts —
  // joining a board still goes through sign-up. Where to go afterwards is kept
  // on this device for the confirm page (the link may open elsewhere, then it
  // lands people by who they are).
  const sendMagicLink = async () => {
    setError('')
    const addr = email.trim()
    if (!EMAIL_RE.test(addr)) { setError('Enter your email above first, then we can send you a link.'); return }
    setLinkSending(true)
    try { localStorage.setItem('colvy_signin_next', JSON.stringify({ next: safeRedirect(params.get('redirect')), at: Date.now() })) } catch {}
    const { error: err } = await supabase.auth.signInWithOtp({ email: addr, options: { emailRedirectTo: `${window.location.origin}/auth/confirm`, shouldCreateUser: false } })
    setLinkSending(false)
    if (err) {
      const msg = err.message || ''
      setError(/signups? not allowed|not found|no user/i.test(msg) ? 'There’s no account with that email yet. Check the address, or sign up first.'
        : /rate|too many|seconds|security purposes/i.test(msg) ? 'A link was sent a moment ago. Give it a minute before asking for another.'
        : msg)
      return
    }
    setLinkSent(addr)
  }

  // Signed in: the preview grows to fill the screen ("Opening your inbox…")
  // while the workspace loads (usePanelZoom), as sign-up does when it makes one.
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) { setError(err.message); setLoading(false); return }
    const started = Date.now()
    zoomOut((e.nativeEvent as SubmitEvent).submitter)
    const redirect = safeRedirect(params.get('redirect')) || await getRedirectUrl()
    // Let the zoom land before the next page starts to load over it.
    setTimeout(() => { window.location.href = redirect }, Math.max(0, 700 - (Date.now() - started)))
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

  const color = brand.color
  const wsName: string = companyContext?.name || ''
  const emailOk = EMAIL_RE.test(email.trim())
  const first = emailOk ? firstFromEmail(email.trim()) : ''
  const focus: PreviewFocus = field === 'email' ? 'name' : field === 'password' ? 'channels' : 'overview'
  // The newest SHOWN of an endless feed, newest first; keys follow each item
  // so only the new one animates in.
  const shown = Array.from({ length: SHOWN }, (_, k) => tick - k).filter(n => n >= 0).map(n => ({ n, ...FEED[n % FEED.length] }))
  const unread = (ch: Ch) => shown.filter(s => s.ch === ch).length
  const oauth = !linkSent && (methods.google || methods.github)

  return (
    <div className={`nw nw-${phase}${dark ? ' dark' : ''} si`} style={{ ['--c' as string]: color, ...originStyle } as React.CSSProperties}>
      <style>{SETUP_CSS + AUTH_CSS + SI_CSS}</style>

      <div className="nw-left">
        <div className="nw-top">
          <div className="nw-brand"><img src={COLVY_ICON} alt="" width={30} height={30} /><span>Colvy</span></div>
          <a href="/signup" className="nw-top-link si-top-link">Sign up</a>
        </div>

        {/* Phones: the inbox filling up, as a strip (the panel doesn't fit). */}
        <PhoneBand corner={<EmailChip email={email} />} title={`Welcome back${first ? `, ${first}` : ''} 👋`}>
          <div className="si-bfeed-clip">
            <div className="si-bfeed" key={tick}>
              {shown.slice(0, 3).map((s, i) => {
                const c = CHANNELS[s.ch]
                return (
                  <div key={s.n} className={`si-item${i === 0 ? ' in' : ''}`} style={{ ['--t' as string]: c.color } as React.CSSProperties}>
                    <span className="si-av">{s.who[0]}<span className="si-av-ch">{I(c.icon, 9, 2.6)}</span></span>
                    <span className="si-item-txt"><b>{s.who}<em>{i === 0 ? 'now' : `${i * 3}m`}</em></b><small>{s.text}</small></span>
                    {i < 2 && <span className="si-unread" />}
                  </div>
                )
              })}
            </div>
          </div>
        </PhoneBand>

        <div className="nw-body">
          <div key={linkSent ? 'sent' : 'form'} className="nw-step fwd">
            {linkSent ? (
              <div className="si-sent">
                <span className="si-sent-ic">{I(MAIL, 26)}</span>
                <h1>Check your email</h1>
                <p className="nw-sub">We sent a sign-in link to <b>{linkSent}</b>. Open it on this device to come straight back here. It works once and expires soon.</p>
                <button type="button" className="nw-back" onClick={() => { setLinkSent(''); setError('') }}>{I(ICONS.back, 15)}Use a different email</button>
              </div>
            ) : (<>
              <h1>{wsName ? <>Sign in to {wsName}</> : <>Welcome back</>}</h1>
              <p className="nw-sub">{wsName ? 'Pick up where your team left off.' : 'Sign in to your Colvy workspace.'}</p>

              {shopifyStore && (
                <div role="status" className="si-note good">{I(ICONS.check, 16, 2.4)}<span>Colvy is installed on <strong>{shopifyStore}</strong>. Sign in, or create a free account, to finish connecting it.</span></div>
              )}

              {oauth && <>
                <div className="si-oauth">
                  {methods.google && <button type="button" onClick={handleGoogle} disabled={!!oauthLoading}>
                    {oauthLoading === 'google' ? <span className="nw-spin" /> : <GoogleIcon />}{oauthLoading === 'google' ? 'Connecting…' : 'Google'}
                  </button>}
                  {methods.github && <button type="button" onClick={handleGitHub} disabled={!!oauthLoading}>
                    {oauthLoading === 'github' ? <span className="nw-spin" /> : <GithubIcon />}{oauthLoading === 'github' ? 'Connecting…' : 'GitHub'}
                  </button>}
                </div>
                <div className="si-or"><span />or with your email<span /></div>
              </>}

              <form onSubmit={handleSignIn}>
                <label className="si-field"><span>Email</span>
                  <input className="nw-input" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@company.com" autoComplete="email"
                    onFocus={() => setField('email')} onBlur={() => setField(f => (f === 'email' ? null : f))} />
                </label>

                <div className="si-field">
                  <span><label htmlFor="si-password">Password</label><a href="/forgot-password" className="si-forgot">Forgot password?</a></span>
                  <div className="nw-input nw-domain si-pass">
                    <input id="si-password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required placeholder="Your password" autoComplete="current-password"
                      onFocus={() => setField('password')} onBlur={() => setField(f => (f === 'password' ? null : f))} />
                    <button type="button" className="si-eye" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                      <EyeIcon off={showPassword} />
                    </button>
                  </div>
                </div>

                {error && <div role="alert" className="nw-error si-error">{error}</div>}

                <button type="submit" className="nw-next si-submit" disabled={loading || phase !== 'form'}>
                  {loading ? <><span className="nw-spin si-spin" />Signing in…</> : <>Sign in{I(ICONS.next, 15)}</>}
                </button>
                {methods.magicLink && (
                  <button type="button" className="nw-back si-alt" onClick={sendMagicLink} disabled={linkSending}>
                    {I(MAIL, 16)}{linkSending ? 'Sending…' : 'Email me a sign-in link instead'}
                  </button>
                )}
              </form>
            </>)}
          </div>
        </div>

        <div className="nw-foot">
          <p className="nw-legal si-new">New to Colvy? <a href="/signup">Create your workspace</a></p>
        </div>
      </div>

      {/* ── The live preview ───────────────────────────────────────────── */}
      <SetupPreview panelRef={panelRef} phase={phase} from={from} name={wsName || 'Your inbox'} focus={focus}
        logo={brand.logo ? { kind: 'img', src: brand.logo } : { kind: 'colvy' }}
        corner={<EmailChip email={email} />}
        sub={wsName && companyContext?.slug ? <div className="nw-ws-site">{I(ICONS.chat, 13)}{companyContext.slug}.colvy.com</div> : undefined}
        sections={
          <PreviewSection k="channels" icon={ICONS.chat} title="Channels">
            {(Object.keys(CHANNELS) as Ch[]).map(ch => {
              const n = unread(ch)
              return <PreviewRow key={ch} color={CHANNELS[ch].color} icon={CHANNELS[ch].icon} label={CHANNELS[ch].label} fresh={false}
                detail={<span key={n} className={n ? 'si-new-n' : undefined}>{n ? `${n} new` : 'All caught up'}</span>} />
            })}
          </PreviewSection>
        }
        conv={
          <div className="nw-thread si-thread">
            <div className="nw-msg"><img src={COLVY_ICON} alt="" /><p>Welcome back{first ? <>, <b>{first}</b></> : null}! 👋 Here&rsquo;s what came in while you were away.</p></div>
            <div className="si-feed">
              {shown.map((s, i) => {
                const c = CHANNELS[s.ch]
                return (
                  <div key={s.n} className={`si-item${i === 0 ? ' in' : ''}`} style={{ ['--t' as string]: c.color } as React.CSSProperties}>
                    <span className="si-av">{s.who[0]}<span className="si-av-ch">{I(c.icon, 9, 2.6)}</span></span>
                    <span className="si-item-txt">
                      <b>{s.who}<em>{i === 0 ? 'now' : `${i * 3}m`}</em></b>
                      <small>{s.text}</small>
                      {s.ai && i < 2 && <span className="si-ai">{I(<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />, 11, 2.2)}Reply drafted</span>}
                    </span>
                    {i < 2 && <span className="si-unread" />}
                  </div>
                )
              })}
            </div>
          </div>
        }
        build={
          <div className="nw-build">
            <AiBuddy size={84} color={color} shadow />
            <h2>Welcome back{first ? `, ${first}` : ''}</h2>
            {wsName && <p className="nw-build-for">{brand.logo ? <span className="nw-build-chip"><img src={brand.logo} alt="" /></span> : null}{wsName}</p>}
            <p className="nw-build-line" key={lineKey}>{line}</p>
          </div>
        } />
    </div>
  )
}

const SI_CSS = `
.si-oauth{display:flex;gap:10px}
.si-oauth button{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:9px;height:50px;border-radius:999px;border:1.5px solid #e4e4e7;background:#fff;font:inherit;font-size:15px;font-weight:600;color:#18181b;cursor:pointer;transition:background-color .15s,transform .15s}
.si-oauth button:hover:not(:disabled){background:#fafafa;transform:translateY(-1px)}
.si-oauth button:disabled{opacity:.6;cursor:default}
.si-or{display:flex;align-items:center;gap:12px;margin:22px 0 18px;font-size:12.5px;color:#a1a1aa}
.si-or span{flex:1;height:1px;background:#ececef}
/* The feed: one new conversation at a time slides in on top. */
.si-feed{display:flex;flex-direction:column;gap:8px}
.si-item{display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:16px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.05),0 6px 18px -10px rgba(0,0,0,.18);overflow:hidden}
.si-item.in{animation:siIn .7s cubic-bezier(.22,1,.36,1) both}
@keyframes siIn{0%{opacity:0;transform:translateY(-10px) scale(.97);max-height:0;padding-top:0;padding-bottom:0;margin-bottom:-8px}45%{max-height:90px;padding-top:11px;padding-bottom:11px;margin-bottom:0}100%{opacity:1;transform:none;max-height:90px}}
.si-av{position:relative;width:40px;height:40px;border-radius:50%;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--t) 16%,#fff);color:color-mix(in srgb,var(--t) 80%,#000);font-size:15px;font-weight:700}
.si-av-ch{position:absolute;right:-3px;bottom:-3px;width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--t);color:#fff;box-shadow:0 0 0 2px #fff}
.si-item-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;line-height:1.3}
.si-item-txt b{display:flex;align-items:baseline;gap:8px;font-size:14px;font-weight:650;color:#18181b}
.si-item-txt em{margin-left:auto;font-style:normal;font-size:11.5px;font-weight:500;color:#a1a1aa}
.si-item-txt small{font-size:13px;color:#52525b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.si-ai{align-self:flex-start;display:inline-flex;align-items:center;gap:4px;margin-top:4px;padding:2px 8px;border-radius:999px;background:#f3e8ff;color:#7c3aed;font-size:11px;font-weight:700;animation:nwPopIn .45s cubic-bezier(.2,.9,.3,1.3) .5s both}
.si-unread{width:8px;height:8px;border-radius:50%;background:var(--c);flex-shrink:0}
.nw.dark .si-oauth button{background:#18181b;border-color:#2c2c31;color:#f4f4f5}
.nw.dark .si-oauth button:hover:not(:disabled){background:#1f1f23}
.nw.dark .si-or span{background:#26262b}
.nw.dark .si-item{background:#1c1c1f;box-shadow:0 0 0 1px rgba(255,255,255,.06)}
.nw.dark .si-item-txt b{color:#f4f4f5}
.nw.dark .si-item-txt small{color:#a1a1aa}
.nw.dark .si-av{background:color-mix(in srgb,var(--t) 22%,#1c1c1f);color:color-mix(in srgb,var(--t) 70%,#fff)}
.nw.dark .si-av-ch{box-shadow:0 0 0 2px #1c1c1f}
.nw.dark .si-ai{background:rgba(124,58,237,.2);color:#c4b5fd}
/* The phone strip's feed: fixed-height rows, and the list slides down one
   row as the new one comes in on top (transform only, smooth on phones). */
.si-bfeed-clip{overflow:hidden}
.si .au-band ~ .nw-body .si-or{margin:12px 0 10px}
.si .au-band ~ .nw-body .si-oauth button{height:46px}
.si-bfeed{display:flex;flex-direction:column;gap:8px;animation:siPush .65s cubic-bezier(.22,1,.36,1) both}
@keyframes siPush{from{transform:translateY(-62px)}to{transform:none}}
.si-bfeed .si-item{height:54px;box-sizing:border-box;padding:0 12px;flex-shrink:0;box-shadow:0 0 0 1px rgba(0,0,0,.06)}
.si-bfeed .si-item.in{animation:siFade .55s ease both}
@keyframes siFade{from{opacity:0}to{opacity:1}}
.si-bfeed .si-av{width:34px;height:34px;font-size:13px}
.si-bfeed .si-item-txt b{font-size:13px}
.si-bfeed .si-item-txt small{font-size:12.5px}
@media (prefers-reduced-motion: reduce){.si-item.in,.si-ai,.si-bfeed{animation:none!important}}
`

export default function SignInPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</div>}>
      <SignInForm />
    </Suspense>
  )
}
