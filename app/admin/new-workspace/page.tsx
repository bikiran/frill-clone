'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isValidSlug, isSlugAvailable } from '@/lib/board'
import { useRouter } from 'next/navigation'
import { SETUP_HOME, SKIPPABLE_STEPS, addQuery } from '@/lib/setup-return'
import { RESERVED_SUBDOMAINS, boardUrl } from '@/lib/redirect'
import AiBuddy from '@/components/AiBuddy'

// Create another workspace, as a short guided flow beside a live preview of the
// new workspace: name (and its .colvy.com address) → website (its icon and
// colours are read from it) → icon and colour → what you'll use → teams.
// "Create" zooms the preview out to fill the screen while the workspace is
// made, then opens its setup checklist with the channels they don't use
// skipped. The account menu (top right of the preview) switches this screen
// between light and dark, and signs out.

const COLVY_ICON = '/icon-192.png'
const MORE_COLORS = ['#ff7a6b', '#7c3aed', '#2563eb', '#16a34a', '#db2777', '#0f172a']
type Pick = (typeof SKIPPABLE_STEPS)[number]
const CHANNELS: { key: Pick; label: string; color: string; icon: React.ReactNode }[] = [
  { key: 'email', label: 'Email', color: '#3b82f6', icon: <><rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" /></> },
  { key: 'meta', label: 'Facebook & Instagram', color: '#8b5cf6', icon: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></> },
  { key: 'phone', label: 'Business phone & SMS', color: '#22c55e', icon: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /> },
  { key: 'store', label: 'Online store', color: '#f59e0b', icon: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></> },
]
const TEAMS: { name: string; color: string; icon: React.ReactNode }[] = [
  { name: 'Support', color: '#3b82f6', icon: <><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></> },
  { name: 'Sales', color: '#8b5cf6', icon: <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></> },
  { name: 'Customer Success', color: '#f43f5e', icon: <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /> },
  { name: 'Billing', color: '#f59e0b', icon: <><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></> },
  { name: 'Technical', color: '#64748b', icon: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /> },
  { name: 'Marketing', color: '#f97316', icon: <><path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></> },
  { name: 'Operations', color: '#10b981', icon: <><circle cx="12" cy="12" r="3" /><path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" /></> },
  { name: 'Fulfillment', color: '#0ea5e9', icon: <><rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></> },
  { name: 'Front Desk', color: '#d946ef', icon: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></> },
]
const LAST = 4 // the teams step; "Create workspace" is there
const BUILDING = ['Creating your inbox…', 'Saving your branding…', 'Getting Colvy AI ready…', 'Setting up your address…', 'Opening your workspace…']
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/

const I = (d: React.ReactNode, size = 16, stroke = 2) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
const GLOBE = <><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>
const cleanDomain = (s: string) => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')

type Brand = { domain: string; icon: string | null; colors: string[]; name: string | null }
type Theme = 'light' | 'dark' | 'system'

export default function NewWorkspacePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)

  // Step 1 — name and address
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [editSlug, setEditSlug] = useState(false)
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')

  // Step 2 — website
  const [domain, setDomain] = useState('')
  const [brand, setBrand] = useState<Brand | null>(null)
  const [brandState, setBrandState] = useState<'idle' | 'loading' | 'ok' | 'none'>('idle')
  const [iconOk, setIconOk] = useState(true)

  // Step 3 — icon and colour
  const [iconChoice, setIconChoice] = useState<'site' | 'colvy' | 'upload'>('colvy')
  const [iconTouched, setIconTouched] = useState(false)
  const [uploadUrl, setUploadUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [color, setColor] = useState('#ff7a6b')

  // Step 4 — channels
  const [picks, setPicks] = useState<Pick[]>([])

  // Step 5 — teams
  const [teams, setTeams] = useState<string[]>(['Support', 'Sales'])

  // This screen's look (the account menu): light, dark, or the device's.
  const [theme, setThemeState] = useState<Theme>('light')
  const [sysDark, setSysDark] = useState(false)
  useEffect(() => {
    try { const t = localStorage.getItem('colvy_nw_theme'); if (t === 'dark' || t === 'system') setThemeState(t) } catch {}
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    setSysDark(mq.matches)
    const on = (e: MediaQueryListEvent) => setSysDark(e.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  const setTheme = (t: Theme) => { setThemeState(t); try { localStorage.setItem('colvy_nw_theme', t) } catch {} }
  const dark = theme === 'dark' || (theme === 'system' && sysDark)

  // Create
  const [phase, setPhase] = useState<'form' | 'zoom' | 'full'>('form')
  const [error, setError] = useState('')
  const [errorWhen, setErrorWhen] = useState('')
  // A problem while the screen is zoomed: shown as a toast over it first.
  const [toast, setToast] = useState<{ msg: string; when: string } | null>(null)
  const startRect = useRef<{ top: number; left: number; right: number; bottom: number } | null>(null)
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 7000); return () => clearTimeout(t) }, [toast])
  const [buildLine, setBuildLine] = useState(0)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [from, setFrom] = useState<{ top: number; left: number; right: number; bottom: number } | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      const u = data?.session?.user
      if (!u) { router.push('/signin'); return }
      setUser(u)
    })
  }, [router])

  // The address follows the name until it's edited by hand.
  useEffect(() => {
    if (slugEdited) return
    const auto = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 30)
    setSlug(auto.length >= 3 ? auto : '')
  }, [name, slugEdited])
  useEffect(() => {
    if (!slug) { setSlugStatus('idle'); return }
    if (!isValidSlug(slug)) { setSlugStatus('invalid'); return }
    setSlugStatus('checking')
    const t = setTimeout(async () => setSlugStatus((await isSlugAvailable(slug)) ? 'available' : 'taken'), 450)
    return () => clearTimeout(t)
  }, [slug])

  // Once the address looks whole ("roxy.com"), read the site's icon and colours.
  const site = cleanDomain(domain)
  const siteLooksDone = DOMAIN_RE.test(site)
  useEffect(() => {
    if (!siteLooksDone) { setBrand(null); setBrandState('idle'); return }
    setBrandState('loading')
    let live = true
    const t = setTimeout(async () => {
      try {
        const r = await authFetch(`/api/site-brand?domain=${encodeURIComponent(site)}`)
        const d = await r.json()
        if (!live) return
        if (r.ok && d.domain) { setBrand(d); setIconOk(true); setBrandState('ok') } else { setBrand(null); setBrandState('none') }
      } catch { if (live) { setBrand(null); setBrandState('none') } }
    }, 550)
    return () => { live = false; clearTimeout(t) }
  }, [site, siteLooksDone])
  // A website icon becomes the workspace icon unless they've chosen one.
  useEffect(() => {
    if (iconTouched) return
    setIconChoice(brand?.icon && iconOk ? 'site' : 'colvy')
  }, [brand, iconOk, iconTouched])

  // The preview's logo, as it stands.
  const siteIcon = brand?.icon && iconOk ? brand.icon : null
  const logo: { kind: 'colvy' | 'globe' | 'img'; src?: string } =
    iconChoice === 'upload' && uploadUrl ? { kind: 'img', src: uploadUrl }
    : iconChoice === 'site' && siteIcon ? { kind: 'img', src: siteIcon }
    : step === 1 && site && !siteIcon ? { kind: 'globe' }
    : { kind: 'colvy' }

  const canNext = step === 0 ? !!name.trim() && slugStatus === 'available'
    : step === 1 ? !site || siteLooksDone
    : true
  const go = (to: number) => { setDir(to > step ? 1 : -1); setError(''); setErrorWhen(''); setStep(to) }
  const next = () => { if (!canNext) return; if (step < LAST) go(step + 1); else create() }

  const upload = async (file?: File | null) => {
    if (!file) return
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { setError('Choose a PNG, JPG or WebP image.'); return }
    if (file.size > 2 * 1024 * 1024) { setError('That image is over 2 MB.'); return }
    setUploading(true); setError('')
    try {
      const path = `logos/new-${user?.id || 'x'}-${Date.now()}.${file.name.split('.').pop()}`
      let bucket = 'settings'
      let res = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
      if (res.error) { bucket = 'idea-images'; res = await supabase.storage.from(bucket).upload(path, file, { upsert: true }) }
      if (res.error) throw res.error
      setUploadUrl(supabase.storage.from(bucket).getPublicUrl(res.data!.path).data.publicUrl)
      setIconChoice('upload'); setIconTouched(true)
    } catch (e: any) { setError(e?.message || 'Couldn’t upload that image.') } finally { setUploading(false) }
  }

  // ── Create: zoom the preview out to the whole screen, then make it ─────────
  const create = async () => {
    if (!user) return
    setError(''); setErrorWhen('')
    const r = panelRef.current?.getBoundingClientRect()
    if (r && r.width) {
      startRect.current = { top: r.top, left: r.left, right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom }
      setFrom(startRect.current)
      setPhase('zoom')
      requestAnimationFrame(() => requestAnimationFrame(() => setFrom({ top: 0, left: 0, right: 0, bottom: 0 })))
      setTimeout(() => setPhase(p => (p === 'zoom' ? 'full' : p)), 750)
    } else setPhase('full')
    const started = Date.now()
    try {
      const res = await authFetch('/api/companies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: slug.toLowerCase(), name: name.trim(), accentColor: color, industry: '',
          logoUrl: logo.kind === 'img' ? logo.src : undefined, website: siteLooksDone ? site : undefined, teams,
        }),
      })
      const d = await res.json().catch(() => ({}))
      // Over the limit: say when they can try again.
      const retry = Date.parse(d.retryAt || '')
      let when = ''
      if (res.status === 429 && Number.isFinite(retry)) {
        const mins = Math.max(1, Math.ceil((retry - Date.now()) / 60_000))
        when = mins >= 90 ? `about ${Math.round(mins / 60)} hours` : `${mins} minute${mins === 1 ? '' : 's'}`
      }
      if (!res.ok || !d.company) throw Object.assign(new Error(d.error || 'Couldn’t create the workspace.'), { when })
      const wait = Math.max(0, 2800 - (Date.now() - started))
      setTimeout(() => openWorkspace(String(d.company.slug || slug)), wait)
    } catch (e: any) {
      const msg = e?.message || 'Couldn’t create the workspace.'
      const when: string = e?.when || ''
      const back = () => {
        setPhase('form'); setFrom(null)
        if (/taken|url\b|address/i.test(msg)) { setDir(-1); setStep(0); setSlugStatus('taken') }
        setError(msg); setErrorWhen(when ? `You can try again in ${when}.` : '')
      }
      // Say it over the full screen (like a toast), then ease back to the form.
      setToast({ msg, when })
      const wait = Math.max(0, 1600 - (Date.now() - started))
      setTimeout(() => {
        if (startRect.current && window.innerWidth > 900) {
          setPhase('zoom'); setFrom(startRect.current)
          setTimeout(back, 820)
        } else back()
      }, wait + 2200)
    }
  }
  const openWorkspace = async (s: string) => {
    const skipped = SKIPPABLE_STEPS.filter(k => !picks.includes(k))
    const path = addQuery(SETUP_HOME, skipped.length ? `skip=${skipped.join(',')}` : '')
    const host = window.location.hostname
    if (host.includes('localhost') || host.includes('vercel.app') || !host.endsWith('colvy.com')) { router.push(path); return }
    if (RESERVED_SUBDOMAINS.has(s)) { window.location.href = boardUrl(s, path); return }
    // A brand-new address can take a few seconds to answer (its certificate is
    // made on first use): going there straight away used to fail with "This
    // site can't be reached" until a reload. Wait (up to ~20s, on the setup
    // screen) until it serves an image, then go.
    for (let i = 0; i < 8 && !(await answers(s)); i++) await new Promise(r => setTimeout(r, 1200))
    const { data: { session } } = await supabase.auth.getSession()
    window.location.href = session?.access_token && session?.refresh_token
      ? `https://${s}.colvy.com/auth/handoff#access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}&next=${encodeURIComponent(path)}`
      : `https://${s}.colvy.com${path}`
  }
  useEffect(() => {
    if (phase === 'form') { setBuildLine(0); return }
    const t = setInterval(() => setBuildLine(n => Math.min(BUILDING.length - 1, n + 1)), 1100)
    return () => clearInterval(t)
  }, [phase])

  const siteColors = (brand?.colors || []).filter(c => !MORE_COLORS.includes(c))
  const slugNote = { idle: '', checking: 'Checking…', available: 'Available', taken: 'Already taken', invalid: 'Use 3–30 lowercase letters, numbers or hyphens' }[slugStatus]

  return (
    <div className={`nw nw-${phase}${dark ? ' dark' : ''}`} style={{ ['--c' as string]: color } as React.CSSProperties}>
      <style>{NW_CSS}</style>

      {/* ── The form ───────────────────────────────────────────────────── */}
      <div className="nw-left">
        <div className="nw-top">
          <div className="nw-brand"><img src={COLVY_ICON} alt="" width={30} height={30} /><span>Colvy</span></div>
          <div className="nw-dots" aria-label={`Step ${step + 1} of ${LAST + 1}`}>{Array.from({ length: LAST + 1 }, (_, i) => <span key={i} className={i === step ? 'on' : i < step ? 'done' : ''} />)}</div>
          <Account className="nw-acct-m" user={user} theme={theme} setTheme={setTheme} />
          <button type="button" className="nw-close" onClick={() => router.back()} aria-label="Close" title="Close">{I(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, 16, 2.4)}</button>
        </div>

        <div className="nw-body">
          <div key={step} className={`nw-step ${dir > 0 ? 'fwd' : 'back'}`}>
            {step === 0 && (<>
              <h1>Name your workspace</h1>
              <p className="nw-sub">It’s how your team and your customers will see you. You can change it later.</p>
              <input className="nw-input" value={name} onChange={e => setName(e.target.value)} placeholder="Roxy Aquarium" autoFocus aria-label="Workspace name"
                onKeyDown={e => e.key === 'Enter' && next()} />
              <div className="nw-addr">
                {editSlug ? (
                  <div className="nw-slug">
                    <input value={slug} onChange={e => { setSlug(e.target.value.toLowerCase()); setSlugEdited(true) }} aria-label="Colvy address" autoFocus />
                    <span>.colvy.com</span>
                  </div>
                ) : (
                  <span className="nw-addr-url">{slug || 'your-name'}<b>.colvy.com</b></span>
                )}
                {slugNote && <span className={`nw-addr-st ${slugStatus}`}>{slugStatus === 'available' && I(<polyline points="20 6 9 17 4 12" />, 12, 3)}{slugNote}</span>}
                {!editSlug && <button type="button" className="nw-link" onClick={() => setEditSlug(true)}>Change</button>}
              </div>
            </>)}

            {step === 1 && (<>
              <h1>What’s your website?</h1>
              <p className="nw-sub">Colvy AI learns from it, and your chat widget is allowed on it. You can skip this.</p>
              <label className={`nw-input nw-domain${siteIcon ? ' has-icon' : ''}`}>
                <span className="nw-domain-ic" key={siteIcon || (brandState === 'loading' ? 'load' : 'globe')}>
                  {siteIcon ? <img src={siteIcon} alt="" width={20} height={20} onError={() => setIconOk(false)} />
                    : brandState === 'loading' ? <span className="nw-spin" /> : I(GLOBE, 18, 1.8)}
                </span>
                <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="roxyaquarium.com.au" autoFocus aria-label="Website"
                  inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} onKeyDown={e => e.key === 'Enter' && next()} />
              </label>
              {brandState === 'ok' && brand && (
                <p className="nw-found">{I(<polyline points="20 6 9 17 4 12" />, 13, 3)}
                  {siteIcon ? 'Found your icon' : 'Found your site'}{brand.colors.length ? ` and ${brand.colors.length} colour${brand.colors.length === 1 ? '' : 's'}` : ''}
                </p>
              )}
              {brandState === 'none' && <p className="nw-hint">We couldn’t read that site, but you can still use it.</p>}
            </>)}

            {step === 2 && (<>
              <h1>Make it yours</h1>
              <p className="nw-sub">Choose your workspace icon and a colour{brand?.domain ? ' from your website' : ''}.</p>
              <p className="nw-label">Workspace icon</p>
              <div className="nw-icons">
                {siteIcon && (
                  <button type="button" className={iconChoice === 'site' ? 'on' : ''} onClick={() => { setIconChoice('site'); setIconTouched(true) }}>
                    <span className="nw-icon-img"><img src={siteIcon} alt="" /></span>Website icon
                  </button>
                )}
                <button type="button" className={iconChoice === 'colvy' ? 'on' : ''} onClick={() => { setIconChoice('colvy'); setIconTouched(true) }}>
                  <span className="nw-icon-img"><img src={COLVY_ICON} alt="" /></span>Colvy
                </button>
                <button type="button" className={`nw-up${iconChoice === 'upload' ? ' on' : ''}`} onClick={() => (uploadUrl && iconChoice !== 'upload' ? (setIconChoice('upload'), setIconTouched(true)) : fileRef.current?.click())}>
                  <span className="nw-icon-img">{uploadUrl ? <img src={uploadUrl} alt="" /> : uploading ? <span className="nw-spin" /> : I(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>, 18)}</span>
                  {uploadUrl ? 'Your logo' : 'Upload logo'}
                </button>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => upload(e.target.files?.[0])} />
              </div>
              <p className="nw-hint">PNG, JPG or WebP · up to 2 MB</p>
              <p className="nw-label" style={{ marginTop: 26 }}>Workspace colour</p>
              {siteColors.length > 0 && (<>
                <p className="nw-hint" style={{ margin: '0 0 10px' }}>Colours from {brand?.domain}</p>
                <div className="nw-swatches">{siteColors.map(c => <Swatch key={c} c={c} on={color === c} pick={setColor} />)}</div>
                <p className="nw-hint" style={{ margin: '16px 0 10px' }}>More colours</p>
              </>)}
              <div className="nw-swatches">{MORE_COLORS.map(c => <Swatch key={c} c={c} on={color === c} pick={setColor} />)}</div>
            </>)}

            {step === 3 && (<>
              <h1>What will you use Colvy for?</h1>
              <p className="nw-sub">Pick what you’d like in your inbox. You can connect them in a minute, or later.</p>
              <div className="nw-chips">
                {CHANNELS.map(ch => {
                  const on = picks.includes(ch.key)
                  return (
                    <button key={ch.key} type="button" aria-pressed={on} className={on ? 'on' : ''} style={{ ['--t' as string]: ch.color } as React.CSSProperties}
                      onClick={() => setPicks(p => (on ? p.filter(k => k !== ch.key) : [...p, ch.key]))}>
                      <span className="nw-chip-ic">{I(ch.icon, 15)}</span>{ch.label}
                    </button>
                  )
                })}
              </div>
            </>)}

            {step === 4 && (<>
              <h1>Set up your teams</h1>
              <p className="nw-sub">Teams route conversations to the right people. You can add or change them later.</p>
              <div className="nw-chips">
                {TEAMS.map(t => {
                  const on = teams.includes(t.name)
                  return (
                    <button key={t.name} type="button" aria-pressed={on} className={on ? 'on' : ''} style={{ ['--t' as string]: t.color } as React.CSSProperties}
                      onClick={() => setTeams(ts => (on ? ts.filter(n => n !== t.name) : [...ts, t.name]))}>
                      <span className="nw-chip-ic">{I(t.icon, 15)}</span>{t.name}
                    </button>
                  )
                })}
              </div>
            </>)}
          </div>
          {error && <div className="nw-error" role="alert">{error}{errorWhen && <span>{errorWhen}</span>}</div>}
        </div>

        <div className="nw-foot">
          <div className="nw-btns">
            {step > 0 && <button type="button" className="nw-back" onClick={() => go(step - 1)}>{I(<><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>, 15)}Back</button>}
            <button type="button" className="nw-next" onClick={next} disabled={!canNext || phase !== 'form'}>
              {step === LAST ? 'Create workspace' : step === 1 && !site ? 'Skip' : 'Continue'}
              {I(<><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>, 15)}
            </button>
          </div>
          <p className="nw-legal">© {new Date().getFullYear()} Colvy · <a href="/terms" target="_blank" rel="noreferrer">Terms</a> · <a href="/privacy" target="_blank" rel="noreferrer">Privacy</a></p>
        </div>
      </div>

      {/* ── The live preview ───────────────────────────────────────────── */}
      <div ref={panelRef} className="nw-panel"
        style={phase !== 'form' && from ? { position: 'fixed', top: from.top, left: from.left, right: from.right, bottom: from.bottom, margin: 0, zIndex: 3 } : undefined}>
        {phase === 'form' && <Account className="nw-acct-d" user={user} theme={theme} setTheme={setTheme} />}
        <div className="nw-app" aria-hidden="true">
          <div className="nw-rail">
            <span className="nw-logo" key={logo.kind + (logo.src || '')}>
              {logo.kind === 'img' ? <img src={logo.src} alt="" /> : logo.kind === 'globe' ? <span className="nw-logo-globe">{I(GLOBE, 22, 1.7)}</span> : <img src={COLVY_ICON} alt="" />}
            </span>
            <span className="nw-rail-sep" />
            <span className="nw-rail-i on">{I(<><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>, 19)}</span>
            <span className="nw-rail-i">{I(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>, 19)}</span>
            <span className="nw-rail-i">{I(<><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>, 19)}</span>
            <span className="nw-rail-i">{I(<><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" /></>, 19)}</span>
            <span className="nw-rail-i">{I(<><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></>, 19)}</span>
            <span className="nw-rail-i">{I(<><path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>, 19)}</span>
          </div>

          {phase === 'form' ? (<>
            <div className="nw-list">
              <div className="nw-ws">
                {name.trim() ? <span className="nw-ws-name">{name.trim()}</span> : <span className="nw-bar" style={{ width: '58%', height: 16 }} />}
                {I(<polyline points="6 9 12 15 18 9" />, 18)}
              </div>
              {site && step >= 1 && <div className="nw-ws-site">{siteIcon ? <img src={siteIcon} alt="" /> : I(GLOBE, 13)}{site}</div>}
              {[62, 40, 70, 46].map((w, i) => (
                <div key={i} className={`nw-row${i === 0 ? ' on' : ''}`}>
                  <span className="nw-row-ic">{I([<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></>, <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="18" cy="6" r="3" fill="currentColor" /></>, <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />, <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></>][i], 17)}</span>
                  <span className="nw-bar" style={{ width: `${w}%` }} /><span className="nw-dot" />
                </div>
              ))}
              <div className="nw-sep" />
              {step < LAST ? (
                <div key="channels" className="nw-secs">
                  <div className="nw-sec">{I(<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>, 15)}<span>Channels</span>{I(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>, 15)}</div>
                  <div className="nw-chan">
                    <span className="nw-chan-ic" style={{ ['--t' as string]: color } as React.CSSProperties}>{I(<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>, 13)}</span>Website chat
                  </div>
                  {picks.map(k => {
                    const ch = CHANNELS.find(c => c.key === k)!
                    return (
                      <div key={k} className="nw-chan nw-chan-new">
                        <span className="nw-chan-ic" style={{ ['--t' as string]: ch.color } as React.CSSProperties}>{I(ch.icon, 13)}</span>{ch.label}
                      </div>
                    )
                  })}
                  {picks.length === 0 && step < 3 && [44, 30].map((w, i) => <div key={i} className="nw-chan nw-chan-ghost"><span className="nw-chan-ic" /><span className="nw-bar" style={{ width: `${w}%` }} /></div>)}
                </div>
              ) : (
                <div key="teams" className="nw-secs">
                  <div className="nw-sec">{I(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>, 15)}<span>Teams</span>{I(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>, 15)}</div>
                  {teams.map(n => {
                    const t = TEAMS.find(x => x.name === n)
                    return (
                      <div key={n} className="nw-chan nw-chan-new">
                        <span className="nw-chan-ic" style={{ ['--t' as string]: t?.color || color } as React.CSSProperties}>{t && I(t.icon, 13)}</span>{n}
                      </div>
                    )
                  })}
                  {teams.length === 0 && [40, 28].map((w, i) => <div key={i} className="nw-chan nw-chan-ghost"><span className="nw-chan-ic" /><span className="nw-bar" style={{ width: `${w}%` }} /></div>)}
                </div>
              )}
            </div>
            <div className="nw-conv">
              {[0, 1, 2, 3, 4, 5].map(i => (
                <div key={i} className={`nw-conv-row${i === 0 ? ' on' : ''}`}>
                  <span className="nw-av" /><span style={{ flex: 1 }}><span className="nw-bar" style={{ width: `${[60, 44, 52, 38, 56, 42][i]}%` }} /><span className="nw-bar thin" style={{ width: `${[84, 70, 78, 64, 80, 58][i]}%` }} /></span>
                </div>
              ))}
            </div>
          </>) : (
            <div className="nw-build">
              <AiBuddy size={84} color={color} shadow />
              <h2>Setting up {name.trim() || 'your workspace'}</h2>
              {site && siteLooksDone && <p className="nw-build-for">for <span className="nw-build-chip">{siteIcon ? <img src={siteIcon} alt="" /> : I(GLOBE, 16)}</span>{site}</p>}
              <p className="nw-build-line" key={buildLine}>{BUILDING[buildLine]}</p>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="nw-toast" role="alert" onClick={() => setToast(null)}>
          <span className="nw-toast-ic">{I(<><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></>, 20, 1.8)}</span>
          <span><b>{toast.msg}</b>{toast.when && <small>in {toast.when}</small>}</span>
        </div>
      )}
    </div>
  )
}

/** Whether https://{slug}.colvy.com answers yet (loads one of its images). */
function answers(slug: string): Promise<boolean> {
  return new Promise(resolve => {
    const img = new Image()
    const t = setTimeout(() => { img.onload = img.onerror = null; resolve(false) }, 4000)
    img.onload = () => { clearTimeout(t); resolve(true) }
    img.onerror = () => { clearTimeout(t); resolve(false) }
    img.src = `https://${slug}.colvy.com/icon-192.png?up=${Date.now()}`
  })
}

function Swatch({ c, on, pick }: { c: string; on: boolean; pick: (c: string) => void }) {
  return (
    <button type="button" className={`nw-sw${on ? ' on' : ''}`} style={{ background: c }} onClick={() => pick(c)} aria-label={`Colour ${c}`} aria-pressed={on}>
      {on && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
    </button>
  )
}

const THEMES: { key: Theme; label: string; icon: React.ReactNode }[] = [
  { key: 'light', label: 'Light', icon: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></> },
  { key: 'dark', label: 'Dark', icon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /> },
  { key: 'system', label: 'System', icon: <><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></> },
]

/** The account menu: who's signed in, the language, this screen's theme, and
 *  signing out. Top right of the preview; in the top bar on phones. */
function Account({ user, theme, setTheme, className }: { user: any; theme: Theme; setTheme: (t: Theme) => void; className: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [sub, setSub] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) { setSub(false); return }
    const out = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', out)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', esc) }
  }, [open])
  if (!user) return null
  const meta = user.user_metadata || {}
  const email: string = user.email || ''
  const name: string = meta.full_name || meta.name || email.split('@')[0] || 'You'
  const photo: string = meta.avatar_url || meta.picture || ''
  const Av = ({ size }: { size: number }) => photo
    ? <img src={photo} alt="" className="nw-av-img" width={size} height={size} referrerPolicy="no-referrer" />
    : <span className="nw-av-ini" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}>{(name.trim()[0] || '?').toUpperCase()}</span>
  const current = THEMES.find(t => t.key === theme) || THEMES[0]
  return (
    <div ref={ref} className={`nw-acct ${className}`}>
      <button type="button" className="nw-acct-btn" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account" title={email}><Av size={36} /></button>
      {open && (
        <div className="nw-acct-menu" role="menu" aria-label="Account">
          <div className="nw-acct-who"><Av size={40} /><span><b>{name}</b><small>{email}</small></span></div>
          <div className="nw-acct-row static">{I(GLOBE, 17, 1.8)}Language<em>English</em></div>
          <div className="nw-acct-theme">
            <button type="button" className={`nw-acct-row${sub ? ' on' : ''}`} role="menuitem" aria-haspopup="menu" aria-expanded={sub} onClick={() => setSub(v => !v)}>
              {I(current.icon, 17, 1.8)}Theme<em>{current.label}</em>{I(<polyline points="9 18 15 12 9 6" />, 15, 2.2)}
            </button>
            {sub && (
              <div className="nw-acct-sub" role="menu" aria-label="Theme">
                {THEMES.map(t => (
                  <button key={t.key} type="button" role="menuitemradio" aria-checked={theme === t.key} className="nw-acct-row" onClick={() => { setTheme(t.key); setSub(false) }}>
                    {I(t.icon, 16, 1.8)}{t.label}{theme === t.key && <span className="nw-acct-check">{I(<polyline points="20 6 9 17 4 12" />, 15, 2.6)}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="nw-acct-sep" />
          <button type="button" className="nw-acct-row out" role="menuitem" onClick={async () => { await supabase.auth.signOut(); router.push('/signin') }}>
            {I(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>, 17, 1.9)}Log out
          </button>
        </div>
      )}
    </div>
  )
}

const NW_CSS = `
.nw{position:fixed;inset:0;z-index:1200;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:12px;padding:12px;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#18181b;overflow:hidden}
.nw button::before{display:none}
body:has(.nw) button[title="Send feedback"]{display:none!important}
.nw-left{display:flex;flex-direction:column;min-height:0;width:100%;max-width:470px;margin:0 auto;padding:18px 24px 14px;box-sizing:border-box;transition:opacity .45s ease,transform .6s cubic-bezier(.65,0,.35,1)}
.nw-zoom .nw-left,.nw-full .nw-left{opacity:0;transform:translateX(-40px);pointer-events:none}
.nw-top{display:flex;align-items:center;gap:14px}
.nw-brand{display:flex;align-items:center;gap:9px;font-size:22px;font-weight:800;letter-spacing:-.02em}
.nw-brand img{border-radius:8px}
.nw-dots{display:flex;align-items:center;gap:6px;margin-left:auto}
.nw-dots span{width:7px;height:7px;border-radius:999px;background:#d4d4d8;transition:width .4s cubic-bezier(.22,1,.36,1),background-color .3s}
.nw-dots span.done{background:#18181b}
.nw-dots span.on{width:24px;background:#18181b}
.nw-close{width:34px;height:34px;padding:0;border:none;border-radius:50%;background:#f4f4f5;color:#52525b;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.nw-close:hover{background:#ececef;color:#18181b}
.nw-body{flex:1;min-height:0;overflow-y:auto;margin:0 -8px;padding:clamp(28px,9vh,96px) 10px 12px}
.nw-step{animation-duration:.5s;animation-timing-function:cubic-bezier(.22,1,.36,1);animation-fill-mode:both}
.nw-step.fwd{animation-name:nwFwd}.nw-step.back{animation-name:nwBack}
@keyframes nwFwd{from{opacity:0;transform:translateX(36px)}to{opacity:1;transform:none}}
@keyframes nwBack{from{opacity:0;transform:translateX(-36px)}to{opacity:1;transform:none}}
.nw h1{margin:0;font-size:31px;font-weight:700;letter-spacing:-.025em;line-height:1.15}
.nw-sub{margin:10px 0 24px;font-size:15px;color:#71717a;line-height:1.5}
.nw-input{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;height:52px;padding:0 16px;border-radius:14px;border:1.5px solid #e4e4e7;background:#fff;font:inherit;font-size:16px;color:#18181b;outline:none;transition:border-color .15s,box-shadow .15s}
.nw-input:focus,.nw-input:focus-within{border-color:var(--c)!important;box-shadow:0 0 0 4px color-mix(in srgb,var(--c) 16%,transparent)}
.nw-domain input{flex:1;min-width:0;height:100%;border:none;outline:none;background:transparent;font:inherit;font-size:16px;color:#18181b}
.nw-domain input:focus{box-shadow:none}
.nw-domain-ic{width:22px;height:22px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;color:#a1a1aa;animation:nwFlip .55s cubic-bezier(.22,1,.36,1) both}
.nw-domain-ic img{width:20px;height:20px;border-radius:5px;object-fit:contain}
@keyframes nwFlip{0%{opacity:0;transform:perspective(200px) rotateY(90deg) scale(.6)}60%{opacity:1;transform:perspective(200px) rotateY(-12deg) scale(1.12)}100%{transform:none}}
.nw-spin{width:15px;height:15px;border-radius:50%;border:2px solid #e4e4e7;border-top-color:var(--c);animation:nwSpin .8s linear infinite;display:inline-block}
@keyframes nwSpin{to{transform:rotate(360deg)}}
.nw-found{display:flex;align-items:center;gap:6px;margin:12px 2px 0;font-size:13.5px;font-weight:600;color:#15803d;animation:nwFwd .4s cubic-bezier(.22,1,.36,1) both}
.nw-hint{margin:10px 2px 0;font-size:13px;color:#8e8e93}
.nw-addr{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:12px 2px 0;font-size:14px;color:#52525b}
.nw-addr-url{font-weight:600;color:#18181b}
.nw-addr-url b{font-weight:500;color:#8e8e93}
.nw-addr-st{display:inline-flex;align-items:center;gap:4px;font-size:12.5px;font-weight:600;color:#8e8e93}
.nw-addr-st.available{color:#15803d}.nw-addr-st.taken,.nw-addr-st.invalid{color:#dc2626}
.nw-link{border:none;background:none;padding:0;font:inherit;font-size:13.5px;font-weight:600;color:#52525b;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.nw-slug{display:flex;align-items:center;height:36px;border-radius:10px;background:#f4f4f5;padding:0 12px;font-size:14px}
.nw-slug input{width:150px;border:none;outline:none;background:transparent;font:inherit;font-weight:600;color:#18181b}
.nw-slug input:focus{box-shadow:none}
.nw-slug span{color:#8e8e93}
.nw-label{margin:0 0 10px;font-size:14.5px;font-weight:600}
.nw-icons{display:flex;gap:10px;flex-wrap:wrap}
.nw-icons button{display:flex;flex-direction:column;align-items:center;gap:10px;width:118px;padding:16px 8px 12px;border-radius:18px;border:1.5px solid #ececef;background:#fff;font:inherit;font-size:13px;font-weight:500;color:#3f3f46;cursor:pointer;transition:border-color .15s,box-shadow .15s,transform .15s}
.nw-icons button:hover{transform:translateY(-1px)}
.nw-icons button.on{border-color:#18181b;box-shadow:0 0 0 1px #18181b}
.nw-icons .nw-up{border-style:dashed}
.nw-icons .nw-up.on{border-style:solid}
.nw-icon-img{width:58px;height:58px;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;background:#f4f4f5;color:#71717a;overflow:hidden}
.nw-icon-img img{width:100%;height:100%;object-fit:contain}
.nw-swatches{display:flex;gap:12px;flex-wrap:wrap}
.nw-sw{width:42px;height:42px;padding:0;border:none;border-radius:50%;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);transition:transform .15s,box-shadow .2s}
.nw-sw:hover{transform:scale(1.07)}
.nw-sw.on{box-shadow:0 0 0 3px #fff,0 0 0 5px #18181b}
.nw-chips{display:flex;flex-wrap:wrap;gap:9px}
.nw-chips button{display:inline-flex;align-items:center;gap:9px;height:44px;padding:0 16px 0 10px;border-radius:14px;border:1.5px solid #ececef;background:#fff;font:inherit;font-size:14.5px;font-weight:600;color:#3f3f46;cursor:pointer;transition:all .2s cubic-bezier(.22,1,.36,1)}
.nw-chips button:hover{border-color:#d4d4d8}
.nw-chips button.on{border-color:color-mix(in srgb,var(--t) 45%,#fff);background:color-mix(in srgb,var(--t) 9%,#fff);color:#18181b;box-shadow:0 0 0 3px color-mix(in srgb,var(--t) 14%,transparent)}
.nw-chip-ic{width:26px;height:26px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--t) 13%,#fff);color:var(--t)}
.nw-error{margin:16px 2px 0;padding:11px 14px;border-radius:14px;background:#fef2f2;color:#b91c1c;font-size:13.5px;line-height:1.45}
.nw-error span{display:block;margin-top:2px;color:#7f1d1d;font-weight:600}
.nw-toast{position:fixed;right:22px;bottom:22px;z-index:20;display:flex;align-items:flex-start;gap:12px;max-width:min(400px,calc(100vw - 32px));padding:14px 18px 14px 14px;box-sizing:border-box;border-radius:18px;background:#fff;color:#18181b;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 20px 50px -12px rgba(0,0,0,.35);cursor:pointer;animation:nwToast .45s cubic-bezier(.2,.9,.3,1.1) both}
.nw-toast-ic{display:inline-flex;color:#dc2626;flex-shrink:0;margin-top:1px}
.nw-toast b{display:block;font-size:14px;font-weight:600;line-height:1.4}
.nw-toast small{display:block;margin-top:3px;font-size:12.5px;color:#8e8e93}
@keyframes nwToast{from{opacity:0;transform:translateY(16px) scale(.96)}to{opacity:1;transform:none}}
.nw.dark .nw-toast{background:#1c1c1f;color:#f4f4f5;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 20px 50px -12px rgba(0,0,0,.6)}
.nw-secs{animation:nwFwd .45s cubic-bezier(.22,1,.36,1) both}

/* The account menu */
.nw-acct{position:relative}
.nw-acct-d{position:absolute;top:18px;right:18px;z-index:5}
.nw-acct-m{display:none}
.nw-acct-btn{width:40px;height:40px;padding:0;border:none;border-radius:50%;background:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px rgba(255,255,255,.9),0 6px 16px rgba(0,0,0,.18);transition:transform .15s cubic-bezier(.22,1,.36,1)}
.nw-acct-btn:hover{transform:scale(1.06)}
.nw-av-img{border-radius:50%;object-fit:cover;display:block;flex-shrink:0}
.nw-av-ini{border-radius:50%;background:#18181b;color:#fff;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
.nw-acct-menu{position:absolute;top:calc(100% + 10px);right:0;width:272px;padding:6px;box-sizing:border-box;border-radius:18px;background:#fff;color:#18181b;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 18px 50px -10px rgba(0,0,0,.3);transform-origin:top right;animation:nwPop .22s cubic-bezier(.22,1,.36,1) both;z-index:10}
@keyframes nwPop{from{opacity:0;transform:scale(.94) translateY(-4px)}to{opacity:1;transform:none}}
.nw-acct-who{display:flex;align-items:center;gap:11px;padding:8px 8px 12px;margin-bottom:4px;border-bottom:1px solid #f0f0f2}
.nw-acct-who span{min-width:0;display:flex;flex-direction:column;gap:1px}
.nw-acct-who b{font-size:14.5px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nw-acct-who small{font-size:12.5px;color:#8e8e93;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nw-acct-row{display:flex;align-items:center;gap:10px;width:100%;height:40px;padding:0 10px;border:none;border-radius:11px;background:none;font:inherit;font-size:14px;font-weight:500;color:inherit;cursor:pointer;text-align:left}
.nw-acct-row:hover:not(.static),.nw-acct-row.on{background:#f4f4f5}
.nw-acct-row.static{cursor:default}
.nw-acct-row svg{flex-shrink:0;color:#71717a}
.nw-acct-row em{margin-left:auto;font-style:normal;font-size:13px;color:#8e8e93}
.nw-acct-row.out,.nw-acct-row.out svg{color:#dc2626}
.nw-acct-check{margin-left:auto;display:inline-flex}
.nw-acct-check svg{color:var(--c)}
.nw-acct-sep{height:1px;background:#f0f0f2;margin:4px 6px}
.nw-acct-theme{position:relative}
.nw-acct-sub{position:absolute;top:-6px;right:calc(100% + 14px);width:176px;padding:6px;box-sizing:border-box;border-radius:16px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 18px 50px -10px rgba(0,0,0,.3);transform-origin:top right;animation:nwPop .2s cubic-bezier(.22,1,.36,1) both}
.nw-foot{padding-top:12px}
.nw-btns{display:flex;gap:8px}
.nw-back{display:inline-flex;align-items:center;gap:7px;height:52px;padding:0 20px;border-radius:999px;border:1.5px solid #e4e4e7;background:#fff;font:inherit;font-size:15px;font-weight:600;color:#18181b;cursor:pointer}
.nw-back:hover{background:#fafafa}
.nw-next{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:8px;height:52px;border:none;border-radius:999px;background:#18181b;color:#fff;font:inherit;font-size:15.5px;font-weight:600;cursor:pointer;transition:opacity .2s,transform .15s}
.nw-next:hover:not(:disabled){transform:translateY(-1px)}
.nw-next:disabled{opacity:.35;cursor:default}
.nw-legal{margin:14px 0 0;font-size:12.5px;color:#a1a1aa;text-align:center}
.nw-legal a{color:#8e8e93}
.nw-next:focus-visible,.nw-back:focus-visible,.nw-chips button:focus-visible,.nw-icons button:focus-visible,.nw-sw:focus-visible,.nw-close:focus-visible{outline:none;box-shadow:0 0 0 4px color-mix(in srgb,var(--c) 30%,transparent)}

/* The preview: the workspace's colour, a fine lattice and grain, and the app. */
.nw-panel{position:relative;min-height:0;border-radius:26px;overflow:hidden;background-color:var(--c);background-image:radial-gradient(120% 90% at 85% 0%,rgba(255,255,255,.28),transparent 55%),radial-gradient(90% 70% at 0% 100%,rgba(0,0,0,.14),transparent 60%),repeating-linear-gradient(45deg,rgba(255,255,255,.12) 0 1px,transparent 1px 78px),repeating-linear-gradient(-45deg,rgba(255,255,255,.12) 0 1px,transparent 1px 78px);transition:background-color .6s ease,top .8s cubic-bezier(.65,0,.35,1),left .8s cubic-bezier(.65,0,.35,1),right .8s cubic-bezier(.65,0,.35,1),bottom .8s cubic-bezier(.65,0,.35,1),border-radius .8s ease}
.nw-full .nw-panel{border-radius:0}
.nw-app{position:absolute;left:16%;top:32%;right:-6%;bottom:-6%;display:flex;background:#fff;border-radius:30px 0 0 0;box-shadow:0 30px 80px -20px rgba(0,0,0,.35);overflow:hidden;transition:left .9s cubic-bezier(.65,0,.35,1),top .9s cubic-bezier(.65,0,.35,1),right .9s cubic-bezier(.65,0,.35,1),bottom .9s cubic-bezier(.65,0,.35,1),border-radius .9s ease}
.nw-zoom .nw-app{left:6%;top:9%;right:6%;bottom:9%;border-radius:28px}
.nw-full .nw-app{left:10px;top:10px;right:10px;bottom:10px;border-radius:22px}
.nw-rail{width:78px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:10px;padding:16px 0;background:#f4f4f5}
.nw-logo{width:52px;height:52px;border-radius:16px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.08);display:inline-flex;align-items:center;justify-content:center;overflow:hidden;animation:nwFlip .7s cubic-bezier(.22,1,.36,1) both}
.nw-logo img{width:100%;height:100%;object-fit:contain}
.nw-logo-globe{color:#71717a;display:inline-flex}
.nw-rail-sep{width:30px;height:2px;border-radius:2px;background:#e4e4e7;margin:4px 0}
.nw-rail-i{width:46px;height:46px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#a1a1aa}
.nw-rail-i.on{background:#fff;color:var(--c);box-shadow:0 2px 8px rgba(0,0,0,.06);transition:color .6s}
.nw-list{width:min(330px,52%);flex-shrink:0;padding:26px 18px;box-sizing:border-box;border-right:1px solid #f0f0f2;overflow:hidden}
.nw-ws{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:30px;color:#3f3f46}
.nw-ws-name{font-size:22px;font-weight:700;letter-spacing:-.02em;color:#18181b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;animation:nwFade .3s ease both}
@keyframes nwFade{from{opacity:.4}to{opacity:1}}
.nw-ws-site{display:flex;align-items:center;gap:6px;margin-top:6px;font-size:12.5px;color:#8e8e93;animation:nwFwd .4s cubic-bezier(.22,1,.36,1) both}
.nw-ws-site img{width:14px;height:14px;border-radius:3px}
.nw-bar{display:block;height:10px;border-radius:999px;background:#ececef}
.nw-bar.thin{height:8px;margin-top:8px;background:#f4f4f5}
.nw-row{display:flex;align-items:center;gap:12px;margin-top:10px;padding:12px;border-radius:14px;color:#a1a1aa}
.nw-row.on{background:#f4f4f5;color:var(--c);transition:color .6s}
.nw-row .nw-bar{flex:0 1 auto}
.nw-row-ic{display:inline-flex;flex-shrink:0}
.nw-dot{width:7px;height:7px;border-radius:50%;background:#e4e4e7;margin-left:auto;flex-shrink:0}
.nw-sep{height:1px;background:#f0f0f2;margin:18px 4px}
.nw-sec{display:flex;align-items:center;gap:8px;padding:0 6px 6px;font-size:13px;font-weight:600;color:#8e8e93}
.nw-sec span{flex:1}
.nw-chan{display:flex;align-items:center;gap:10px;padding:8px 6px;font-size:14px;font-weight:500;color:#27272a}
.nw-chan-ic{width:24px;height:24px;border-radius:8px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--t,#d4d4d8) 14%,#fff);color:var(--t,#a1a1aa)}
.nw-chan-ghost .nw-chan-ic{background:#f4f4f5}
.nw-chan-new{animation:nwChan .55s cubic-bezier(.22,1,.36,1) both}
@keyframes nwChan{0%{opacity:0;transform:translateX(-14px) scale(.96);max-height:0;padding-top:0;padding-bottom:0}55%{opacity:1;max-height:44px;padding-top:8px;padding-bottom:8px}100%{transform:none;max-height:44px}}
.nw-conv{flex:1;min-width:0;padding:26px 18px;box-sizing:border-box;overflow:hidden}
.nw-conv-row{display:flex;align-items:center;gap:14px;padding:14px;border-radius:18px;margin-bottom:6px}
.nw-conv-row.on{background:#fafafa}
.nw-av{width:52px;height:52px;border-radius:50%;background:#f4f4f5;flex-shrink:0}
.nw-build{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:24px;text-align:center;animation:nwFade .6s ease .25s both}
.nw-build h2{overflow-wrap:anywhere;margin:22px 0 0;font-size:clamp(26px,3.2vw,38px);font-weight:800;letter-spacing:-.03em;line-height:1.15;color:#18181b}
.nw-build-for{display:flex;flex-wrap:wrap;justify-content:center;overflow-wrap:anywhere;align-items:center;gap:10px;margin:6px 0 0;font-size:clamp(22px,2.6vw,32px);font-weight:800;letter-spacing:-.025em;color:#18181b}
.nw-build-chip{width:40px;height:40px;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 4px 12px rgba(0,0,0,.06);color:#71717a;overflow:hidden}
.nw-build-chip img{width:26px;height:26px;object-fit:contain}
.nw-build-line{margin:18px 0 0;font-size:15px;color:#71717a;animation:nwLine .5s ease both}
@keyframes nwLine{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (max-width:900px){
  .nw{grid-template-columns:1fr;padding:0}
  .nw-left{max-width:none;padding:16px 18px 14px}
  .nw-panel{display:none}
  .nw-zoom .nw-panel,.nw-full .nw-panel{display:block;position:fixed;inset:0;border-radius:0;z-index:3}
  .nw-body{padding-top:36px}
  .nw-acct-m{display:block}
  .nw-acct-m .nw-acct-btn{box-shadow:none}
  .nw-acct-m .nw-acct-menu{width:min(272px,calc(100vw - 32px))}
  .nw-acct-m .nw-acct-sub{position:static;width:auto;padding:2px 0 4px 22px;box-shadow:none;background:none;animation:none}
  .nw h1{font-size:27px}
  .nw-icons button{width:calc(33.3% - 7px);min-width:96px}
  .nw-rail{width:58px}
  .nw-logo{width:42px;height:42px;border-radius:13px}
  .nw-rail-i{width:38px;height:38px}
  .nw-build{padding:18px 14px}
  .nw-build h2{font-size:24px}
  .nw-build-for{font-size:19px}
  .nw-build-chip{width:32px;height:32px;border-radius:10px}
  .nw-build-chip img{width:20px;height:20px}
}
/* Dark: this screen only (the account menu's Theme). */
.nw.dark{background:#0f0f11;color:#f4f4f5}
.nw.dark .nw-sub,.nw.dark .nw-hint,.nw.dark .nw-addr{color:#a1a1aa}
.nw.dark .nw-addr-url,.nw.dark .nw-slug input,.nw.dark .nw-domain input{color:#f4f4f5}
.nw.dark .nw-dots span{background:#3f3f46}
.nw.dark .nw-dots span.on,.nw.dark .nw-dots span.done{background:#fafafa}
.nw.dark .nw-close{background:#1f1f23;color:#d4d4d8}
.nw.dark .nw-close:hover{background:#2a2a2f;color:#fff}
.nw.dark .nw-input{background:#18181b;border-color:#2c2c31;color:#f4f4f5}
.nw.dark .nw-input::placeholder,.nw.dark .nw-domain input::placeholder{color:#71717a}
.nw.dark .nw-slug{background:#1f1f23}
.nw.dark .nw-link{color:#d4d4d8}
.nw.dark .nw-icons button,.nw.dark .nw-chips button{background:#18181b;border-color:#2c2c31;color:#e4e4e7}
.nw.dark .nw-icons button.on{border-color:#fafafa;box-shadow:0 0 0 1px #fafafa}
.nw.dark .nw-icon-img{background:#26262b;color:#a1a1aa}
.nw.dark .nw-chips button:hover{border-color:#3f3f46}
.nw.dark .nw-chips button.on{border-color:color-mix(in srgb,var(--t) 60%,#18181b);background:color-mix(in srgb,var(--t) 20%,#18181b);color:#fff;box-shadow:0 0 0 3px color-mix(in srgb,var(--t) 20%,transparent)}
.nw.dark .nw-chip-ic{background:color-mix(in srgb,var(--t) 22%,#18181b)}
.nw.dark .nw-sw.on{box-shadow:0 0 0 3px #0f0f11,0 0 0 5px #fafafa}
.nw.dark .nw-error{background:rgba(239,68,68,.12);color:#fca5a5}
.nw.dark .nw-error span{color:#fecaca}
.nw.dark .nw-back{background:transparent;border-color:#2f2f35;color:#f4f4f5}
.nw.dark .nw-back:hover{background:#18181b}
.nw.dark .nw-next{background:#fafafa;color:#18181b}
.nw.dark .nw-legal{color:#71717a}
.nw.dark .nw-legal a{color:#a1a1aa}
.nw.dark .nw-app{background:#151517}
.nw.dark .nw-rail{background:#1b1b1e}
.nw.dark .nw-logo{background:#26262b}
.nw.dark .nw-rail-sep{background:#2c2c31}
.nw.dark .nw-rail-i{color:#71717a}
.nw.dark .nw-rail-i.on{background:#26262b}
.nw.dark .nw-list{border-right-color:#232327}
.nw.dark .nw-ws{color:#a1a1aa}
.nw.dark .nw-ws-name,.nw.dark .nw-chan{color:#f4f4f5}
.nw.dark .nw-row{color:#71717a}
.nw.dark .nw-row.on,.nw.dark .nw-conv-row.on{background:#1f1f23}
.nw.dark .nw-bar{background:#26262b}
.nw.dark .nw-bar.thin{background:#1f1f23}
.nw.dark .nw-dot{background:#2c2c31}
.nw.dark .nw-sep{background:#232327}
.nw.dark .nw-sec{color:#8e8e93}
.nw.dark .nw-chan-ic{background:color-mix(in srgb,var(--t,#3f3f46) 24%,#151517)}
.nw.dark .nw-chan-ghost .nw-chan-ic,.nw.dark .nw-av{background:#232327}
.nw.dark .nw-build h2,.nw.dark .nw-build-for{color:#fafafa}
.nw.dark .nw-build-line{color:#a1a1aa}
.nw.dark .nw-build-chip{background:#26262b;box-shadow:0 0 0 1px rgba(255,255,255,.08)}
.nw.dark .nw-acct-menu,.nw.dark .nw-acct-sub{background:#1c1c1f;color:#f4f4f5;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 18px 50px -10px rgba(0,0,0,.6)}
.nw.dark .nw-acct-m .nw-acct-sub{background:none;box-shadow:none}
.nw.dark .nw-acct-who,.nw.dark .nw-acct-sep{border-color:#2c2c31;background-color:transparent}
.nw.dark .nw-acct-sep{background:#2c2c31}
.nw.dark .nw-acct-row:hover:not(.static),.nw.dark .nw-acct-row.on{background:#26262b}
.nw.dark .nw-acct-row svg{color:#a1a1aa}
.nw.dark .nw-acct-row.out,.nw.dark .nw-acct-row.out svg{color:#f87171}
.nw.dark .nw-av-ini{background:#fafafa;color:#18181b}
.nw{transition:background-color .35s ease,color .35s ease}

@media (prefers-reduced-motion: reduce){
  .nw-step,.nw-logo,.nw-domain-ic,.nw-chan-new,.nw-build,.nw-build-line,.nw-found,.nw-secs,.nw-acct-menu,.nw-acct-sub{animation:none!important}
  .nw-panel,.nw-app,.nw-left{transition:none!important}
}
`
