'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// The pieces of Colvy's set-up screens (creating a workspace, and signing up):
// a form on the left beside a live preview of the workspace that builds as
// it's filled in, and zooms out to fill the screen while it's made. Shared so
// both read and move the same. The styles are the .nw-* classes in SETUP_CSS.

export const COLVY_ICON = '/icon-192.png'
export const MORE_COLORS = ['#ff7a6b', '#7c3aed', '#2563eb', '#16a34a', '#db2777', '#0f172a']
export const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/
export const cleanDomain = (s: string) => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')

export const I = (d: React.ReactNode, size = 16, stroke = 2) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
export const GLOBE = <><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>
export const ICONS = {
  inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>,
  people: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  tasks: <><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  bot: <><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" /></>,
  bag: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></>,
  megaphone: <><path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>,
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  check: <polyline points="20 6 9 17 4 12" />,
  back: <><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>,
  next: <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>,
  close: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
}

export type Theme = 'light' | 'dark' | 'system'
export type Rect = { top: number; left: number; right: number; bottom: number }
export type Logo = { kind: 'colvy' | 'globe' | 'img'; src?: string }

/** This screen's look: light, dark, or the device's (kept on this device). */
export function useSetupTheme() {
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
  return { theme, setTheme, dark: theme === 'dark' || (theme === 'system' && sysDark) }
}

/** One row in the preview's list column (a channel, a team): its tinted icon,
 *  its name, and optionally a detail and a "verified" tick. New ones slide in. */
export function PreviewRow({ color, icon, label, detail, verified, fresh = true }: { color: string; icon?: React.ReactNode; label: React.ReactNode; detail?: React.ReactNode; verified?: boolean; fresh?: boolean }) {
  return (
    <div className={`nw-chan${fresh ? ' nw-chan-new' : ''}`}>
      <span className="nw-chan-ic" style={{ ['--t' as string]: color } as React.CSSProperties}>{icon && I(icon, 13)}</span>
      <span className="nw-chan-txt">{label}{detail && <small>{detail}</small>}</span>
      {verified && <span className="nw-chan-ok" title="Verified">{I(ICONS.check, 12, 3)}</span>}
    </div>
  )
}
export const GhostRows = ({ widths = [44, 30] }: { widths?: number[] }) => <>{widths.map((w, i) => <div key={i} className="nw-chan nw-chan-ghost"><span className="nw-chan-ic" /><span className="nw-bar" style={{ width: `${w}%` }} /></div>)}</>
export const PreviewSection = ({ icon, title, children, k }: { icon: React.ReactNode; title: string; children: React.ReactNode; k: string }) => (
  <div key={k} className="nw-secs">
    <div className="nw-sec">{I(icon, 15)}<span>{title}</span>{I(ICONS.plus, 15)}</div>
    {children}
  </div>
)

const FOLDER_ICONS = [
  <g key="mine"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></g>,
  <g key="unread"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="18" cy="6" r="3" fill="currentColor" /></g>,
  <circle key="open" cx="12" cy="12" r="9" strokeDasharray="3 3" />,
  <g key="flag"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></g>,
]

/** The live preview: the workspace's colour behind a copy of the app with its
 *  logo, name and whatever the form has filled in so far. While the workspace
 *  is being made it fills the screen and shows `build` instead. */
export type PreviewFocus = 'overview' | 'name' | 'site' | 'brand' | 'channels' | 'teams'

export function SetupPreview({ panelRef, phase, from, logo, name, sub, sections, conv, build, corner, focus = 'overview' }: {
  panelRef: React.RefObject<HTMLDivElement | null>
  phase: 'form' | 'zoom' | 'full'
  from: Rect | null
  logo: Logo
  name: string
  /** Under the name (the website, the address…). */
  sub?: React.ReactNode
  /** The lower half of the list column (channels, teams…). */
  sections: React.ReactNode
  /** The conversation column; skeleton rows when not given. */
  conv?: React.ReactNode
  build: React.ReactNode
  /** Top right of the panel (the account). */
  corner?: React.ReactNode
  /** What the current step changes: the preview glides and zooms to it. */
  focus?: PreviewFocus
}) {
  return (
    <div ref={panelRef} className="nw-panel"
      style={phase !== 'form' && from ? { position: 'fixed', top: from.top, left: from.left, right: from.right, bottom: from.bottom, margin: 0, zIndex: 3 } : undefined}>
      {phase === 'form' && corner}
      <div className={`nw-app${phase === 'form' && focus !== 'overview' ? ' f-' + focus : ''}`} aria-hidden="true">
        <div className="nw-rail">
          <span className="nw-logo" key={logo.kind + (logo.src || '')}>
            {logo.kind === 'img' ? <img src={logo.src} alt="" /> : logo.kind === 'globe' ? <span className="nw-logo-globe">{I(GLOBE, 22, 1.7)}</span> : <img src={COLVY_ICON} alt="" />}
          </span>
          <span className="nw-rail-sep" />
          <span className="nw-rail-i on">{I(ICONS.inbox, 19)}</span>
          {[ICONS.people, ICONS.tasks, ICONS.bot, ICONS.bag, ICONS.megaphone].map((d, i) => <span key={i} className="nw-rail-i">{I(d, 19)}</span>)}
        </div>
        {phase === 'form' ? (<>
          <div className="nw-list">
            <div className="nw-ws">
              {name.trim() ? <span className="nw-ws-name" key={name.trim()}>{name.trim()}</span> : <span className="nw-bar" style={{ width: '58%', height: 16 }} />}
              {I(<polyline points="6 9 12 15 18 9" />, 18)}
            </div>
            {sub}
            {[62, 40, 70, 46].map((w, i) => (
              <div key={i} className={`nw-row${i === 0 ? ' on' : ''}`}>
                <span className="nw-row-ic">{I(FOLDER_ICONS[i], 17)}</span>
                <span className="nw-bar" style={{ width: `${w}%` }} /><span className="nw-dot" />
              </div>
            ))}
            <div className="nw-sep" />
            {sections}
          </div>
          <div className="nw-conv">
            {conv ?? [0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className={`nw-conv-row${i === 0 ? ' on' : ''}`}>
                <span className="nw-av" /><span style={{ flex: 1 }}><span className="nw-bar" style={{ width: `${[60, 44, 52, 38, 56, 42][i]}%` }} /><span className="nw-bar thin" style={{ width: `${[84, 70, 78, 64, 80, 58][i]}%` }} /></span>
              </div>
            ))}
          </div>
        </>) : build}
      </div>
    </div>
  )
}

/** A problem while the screen is zoomed: a toast over it (tap to dismiss). */
export function SetupToast({ toast, onClose }: { toast: { msg: string; when?: string } | null; onClose: () => void }) {
  useEffect(() => { if (!toast) return; const t = setTimeout(onClose, 7000); return () => clearTimeout(t) }, [toast, onClose])
  if (!toast) return null
  return (
    <div className="nw-toast" role="alert" onClick={onClose}>
      <span className="nw-toast-ic">{I(<><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></>, 20, 1.8)}</span>
      <span><b>{toast.msg}</b>{toast.when && <small>in {toast.when}</small>}</span>
    </div>
  )
}

/** Whether https://{slug}.colvy.com answers yet (loads one of its images). */
export function answers(slug: string): Promise<boolean> {
  return new Promise(resolve => {
    const img = new Image()
    const t = setTimeout(() => { img.onload = img.onerror = null; resolve(false) }, 4000)
    img.onload = () => { clearTimeout(t); resolve(true) }
    img.onerror = () => { clearTimeout(t); resolve(false) }
    img.src = `https://${slug}.colvy.com/icon-192.png?up=${Date.now()}`
  })
}

export function Swatch({ c, on, pick }: { c: string; on: boolean; pick: (c: string) => void }) {
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

/** A person's photo, or the first letter of their name. */
export function Avatar({ photo, name, size }: { photo?: string; name: string; size: number }) {
  return photo
    ? <img src={photo} alt="" className="nw-av-img" width={size} height={size} referrerPolicy="no-referrer" />
    : <span className="nw-av-ini" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}>{(name.trim()[0] || '?').toUpperCase()}</span>
}

/** The account menu: who's signed in, the language, this screen's theme, and
 *  signing out. Top right of the preview; in the top bar on phones. */
export function Account({ user, theme, setTheme, className }: { user: any; theme: Theme; setTheme: (t: Theme) => void; className: string }) {
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
  const current = THEMES.find(t => t.key === theme) || THEMES[0]
  return (
    <div ref={ref} className={`nw-acct ${className}`}>
      <button type="button" className="nw-acct-btn" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account" title={email}><Avatar photo={photo} name={name} size={36} /></button>
      {open && (
        <div className="nw-acct-menu" role="menu" aria-label="Account">
          <div className="nw-acct-who"><Avatar photo={photo} name={name} size={40} /><span><b>{name}</b><small>{email}</small></span></div>
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

export const SETUP_CSS = `
.nw{position:fixed;inset:0;z-index:1200;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:12px;padding:12px;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#18181b;overflow:hidden}
.nw button::before{display:none}
body:has(.nw) button[title="Send feedback"]{display:none!important}
.nw-left{display:flex;flex-direction:column;min-height:0;min-width:0;width:100%;max-width:470px;margin:0 auto;padding:18px 24px 14px;box-sizing:border-box;transition:opacity .45s ease,transform .6s cubic-bezier(.65,0,.35,1)}
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
.nw-app{position:absolute;left:16%;top:32%;right:-6%;bottom:-6%;display:flex;background:#fff;border-radius:30px 0 0 0;box-shadow:0 30px 80px -20px rgba(0,0,0,.35);overflow:hidden;transition:left .9s cubic-bezier(.65,0,.35,1),top .9s cubic-bezier(.65,0,.35,1),right .9s cubic-bezier(.65,0,.35,1),bottom .9s cubic-bezier(.65,0,.35,1),border-radius .9s ease,transform 1.05s cubic-bezier(.65,0,.35,1);transform-origin:0 0}
/* The camera: each step glides and zooms the app to the part that step
   changes, and a soft tint settles on it once the move is under way. */
.nw-app.f-name{transform:translate(-1%,-2%) scale(1.08)}
.nw-app.f-site{transform:translate(-3%,-6%) scale(1.16)}
.nw-app.f-brand{transform:translate(4%,3%) scale(1.3)}
.nw-app.f-channels{transform:translate(-2%,-23%) scale(1.2)}
.nw-app.f-teams{transform:translate(-4%,-21%) scale(1.24)}
.nw-ws,.nw-ws-site,.nw-secs{border-radius:12px;transition:background-color .55s ease .35s,box-shadow .55s ease .35s}
.nw-app.f-name .nw-ws,.nw-app.f-site .nw-ws-site,.nw-app.f-channels .nw-secs,.nw-app.f-teams .nw-secs{background-color:color-mix(in srgb,var(--c) 7%,transparent);box-shadow:0 0 0 7px color-mix(in srgb,var(--c) 7%,transparent)}
.nw-app.f-brand .nw-logo{box-shadow:0 0 0 4px color-mix(in srgb,var(--c) 30%,transparent),0 2px 8px rgba(0,0,0,.08);transition:box-shadow .55s ease .35s}
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
.nw-chan{min-width:0}
.nw-chan-txt{min-width:0;display:flex;flex-direction:column;line-height:1.25}
.nw-chan-txt small{font-size:11.5px;font-weight:500;color:#8e8e93;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nw-chan-ok{margin-left:auto;width:18px;height:18px;border-radius:50%;background:#22c55e;color:#fff;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;animation:nwPopIn .45s cubic-bezier(.2,.9,.3,1.3) both}
@keyframes nwPopIn{from{opacity:0;transform:scale(.3)}to{opacity:1;transform:none}}
/* Sign-up's preview: Colvy's welcome, the business card, and who you are. */
.nw-thread{display:flex;flex-direction:column;gap:16px;padding-right:clamp(48px,7vw,96px)}
.nw-msg{display:flex;align-items:flex-end;gap:10px;animation:nwFwd .5s cubic-bezier(.22,1,.36,1) both}
.nw-msg img{width:34px;height:34px;border-radius:10px;flex-shrink:0}
.nw-msg p{margin:0;max-width:88%;padding:12px 15px;border-radius:18px 18px 18px 6px;background:#f4f4f5;font-size:14px;line-height:1.45;color:#18181b}
.nw-msg b{font-weight:650}
.nw-card{border-radius:18px;padding:14px 16px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 8px 24px -10px rgba(0,0,0,.14);animation:nwFwd .5s cubic-bezier(.22,1,.36,1) both}
.nw-card h4{display:flex;align-items:center;gap:7px;margin:0 0 8px;font-size:12.5px;font-weight:650;color:#8e8e93;text-transform:uppercase;letter-spacing:.04em}
.nw-card-row{display:flex;align-items:center;gap:10px;padding:6px 0;font-size:13.5px;color:#27272a;animation:nwChan .55s cubic-bezier(.22,1,.36,1) both}
.nw-card-row svg{color:#a1a1aa;flex-shrink:0}
.nw-card-row span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nw-card-row em{margin-left:auto;font-style:normal;font-size:12px;font-weight:600;color:#15803d;flex-shrink:0}
.nw-me{position:absolute;top:18px;right:18px;z-index:5;display:flex;align-items:center;gap:8px;padding:4px 14px 4px 4px;border-radius:999px;background:rgba(255,255,255,.92);box-shadow:0 6px 16px rgba(0,0,0,.14);font-size:13.5px;font-weight:600;color:#18181b;animation:nwPopIn .45s cubic-bezier(.2,.9,.3,1.3) both}
.nw-top-link{display:inline-flex;align-items:center;height:34px;padding:0 14px;border-radius:999px;border:1.5px solid #e4e4e7;font-size:13.5px;font-weight:600;color:#18181b;text-decoration:none}
.nw-top-link:hover{background:#fafafa}
.nw.dark .nw-msg p{background:#232327;color:#f4f4f5}
.nw.dark .nw-card{background:#1c1c1f;box-shadow:0 0 0 1px rgba(255,255,255,.07)}
.nw.dark .nw-card-row{color:#e4e4e7}
.nw.dark .nw-me{background:rgba(28,28,31,.92);color:#f4f4f5}
.nw.dark .nw-top-link{border-color:#2f2f35;color:#f4f4f5}
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
  .nw{grid-template-columns:minmax(0,1fr);padding:0}
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
