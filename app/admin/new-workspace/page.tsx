'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isValidSlug, isSlugAvailable } from '@/lib/board'
import { useRouter } from 'next/navigation'
import { SETUP_HOME, SKIPPABLE_STEPS, addQuery } from '@/lib/setup-return'
import { RESERVED_SUBDOMAINS, boardUrl } from '@/lib/redirect'
import AiBuddy from '@/components/AiBuddy'
import { COLVY_ICON, MORE_COLORS, DOMAIN_RE, cleanDomain, I, GLOBE, ICONS, SETUP_CSS, SetupPreview, SetupToast, PreviewSection, PreviewRow, GhostRows, Account, Swatch, answers, useSetupTheme, type Rect } from '@/components/setup/SetupKit'

// Create another workspace, as a short guided flow beside a live preview of the
// new workspace: name (and its .colvy.com address) → website (its icon and
// colours are read from it) → icon and colour → what you'll use → teams.
// "Create" zooms the preview out to fill the screen while the workspace is
// made, then opens its setup checklist with the channels they don't use
// skipped. The account menu (top right of the preview) switches this screen
// between light and dark, and signs out.

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


type Brand = { domain: string; icon: string | null; colors: string[]; name: string | null }

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
  const { theme, setTheme, dark } = useSetupTheme()

  // Create
  const [phase, setPhase] = useState<'form' | 'zoom' | 'full'>('form')
  const [error, setError] = useState('')
  const [errorWhen, setErrorWhen] = useState('')
  // A problem while the screen is zoomed: shown as a toast over it first.
  const [toast, setToast] = useState<{ msg: string; when: string } | null>(null)
  const closeToast = useCallback(() => setToast(null), [])
  const startRect = useRef<Rect | null>(null)
  const [buildLine, setBuildLine] = useState(0)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [from, setFrom] = useState<Rect | null>(null)
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
      <style>{SETUP_CSS}</style>

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
      <SetupPreview panelRef={panelRef} phase={phase} from={from} logo={logo} name={name}
        focus={(['name', 'site', 'brand', 'channels', 'teams'] as const)[step]}
        corner={<Account className="nw-acct-d" user={user} theme={theme} setTheme={setTheme} />}
        sub={site && step >= 1 && <div className="nw-ws-site">{siteIcon ? <img src={siteIcon} alt="" /> : I(GLOBE, 13)}{site}</div>}
        sections={step < LAST ? (
          <PreviewSection k="channels" icon={ICONS.chat} title="Channels">
            <PreviewRow color={color} icon={ICONS.chat} label="Website chat" fresh={false} />
            {picks.map(k => { const ch = CHANNELS.find(c => c.key === k)!; return <PreviewRow key={k} color={ch.color} icon={ch.icon} label={ch.label} /> })}
            {picks.length === 0 && step < 3 && <GhostRows />}
          </PreviewSection>
        ) : (
          <PreviewSection k="teams" icon={ICONS.people} title="Teams">
            {teams.map(n => { const t = TEAMS.find(x => x.name === n); return <PreviewRow key={n} color={t?.color || color} icon={t?.icon} label={n} /> })}
            {teams.length === 0 && <GhostRows widths={[40, 28]} />}
          </PreviewSection>
        )}
        build={
          <div className="nw-build">
            <AiBuddy size={84} color={color} shadow />
            <h2>Setting up {name.trim() || 'your workspace'}</h2>
            {site && siteLooksDone && <p className="nw-build-for">for <span className="nw-build-chip">{siteIcon ? <img src={siteIcon} alt="" /> : I(GLOBE, 16)}</span>{site}</p>}
            <p className="nw-build-line" key={buildLine}>{BUILDING[buildLine]}</p>
          </div>
        } />

      <SetupToast toast={toast} onClose={closeToast} />
    </div>
  )
}
