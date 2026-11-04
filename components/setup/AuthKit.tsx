'use client'

// The sign-in family of pages (sign in, forgot password, set a new password):
// sign-up's layout and live preview (SetupKit), plus what these pages share —
// their fields, the zoom to full screen once you're through, and a
// workspace's own look on its own address.

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { I, type Rect } from '@/components/setup/SetupKit'

export const CORAL = '#ff7a6b'
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const MAIL = <><rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" /></>
export const LOCK = <><rect x="4" y="11" width="16" height="10" rx="2.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>
export const UNLOCK = <><rect x="4" y="11" width="16" height="10" rx="2.5" /><path d="M8 11V7a4 4 0 0 1 7.6-1.7" /></>

/** A first name from an email, when it plainly has one (jo.smith@ → Jo). */
export function firstFromEmail(email: string): string {
  const local = (email.split('@')[0] || '').split(/[._+-]/)[0] || ''
  return /^[a-z]{2,14}$/i.test(local) ? local[0].toUpperCase() + local.slice(1).toLowerCase() : ''
}

export const EyeIcon = ({ off }: { off: boolean }) => off
  ? I(<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>, 18, 1.8)
  : I(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>, 18, 1.8)

/** Your email in the preview's corner, popping in as you type it. */
export function EmailChip({ email }: { email: string }) {
  const e = email.trim()
  if (!EMAIL_RE.test(e)) return null
  return (
    <div className="nw-me si-me" key={e[0].toLowerCase()}>
      <span className="nw-av-ini" style={{ width: 30, height: 30, fontSize: 13 }}>{e[0].toUpperCase()}</span>
      <span className="si-me-mail">{e}</span>
    </div>
  )
}

/**
 * Through (signed in, password saved): the preview grows to fill the screen,
 * with a line of what's happening, while the next page loads. As sign-up does
 * once it has made a workspace.
 */
export function usePanelZoom(lines: string[]) {
  const [phase, setPhase] = useState<'form' | 'zoom' | 'full'>('form')
  const [from, setFrom] = useState<Rect | null>(null)
  // Phones hide the panel: it opens out of the button pressed instead (a
  // growing circle, AUTH_CSS), centred here.
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    if (phase === 'form') { setN(0); return }
    const t = setInterval(() => setN(k => Math.min(lines.length - 1, k + 1)), 1100)
    return () => clearInterval(t)
  }, [phase, lines.length])
  const zoomOut = useCallback((fromEl?: Element | null) => {
    const r = panelRef.current?.getBoundingClientRect()
    if (r && r.width) {
      setFrom({ top: r.top, left: r.left, right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom }); setPhase('zoom')
      requestAnimationFrame(() => requestAnimationFrame(() => setFrom({ top: 0, left: 0, right: 0, bottom: 0 })))
    } else {
      const b = (fromEl || document.querySelector('.si-submit'))?.getBoundingClientRect()
      setOrigin(b ? { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) } : null)
      setPhase('zoom')
    }
    setTimeout(() => setPhase(p => (p === 'zoom' ? 'full' : p)), 750)
  }, [])
  // For the page's root: where a phone's reveal grows from.
  const originStyle = (origin ? { ['--ox' as string]: `${origin.x}px`, ['--oy' as string]: `${origin.y}px` } : {}) as React.CSSProperties
  return { phase, from, panelRef, zoomOut, line: lines[n] || '', lineKey: n, originStyle }
}

/** On a workspace's own address (roxyaquarium.colvy.com): its name, colour and logo. */
export function useWorkspaceLook() {
  const [look, setLook] = useState<{ id: string; name: string; slug: string; color: string; logo: string | null }>({ id: '', name: '', slug: '', color: CORAL, logo: null })
  useEffect(() => {
    const host = window.location.hostname
    const own = host.endsWith('.colvy.com') && host !== 'colvy.com' && host !== 'www.colvy.com' && !host.includes('localhost')
    if (!own) return
    const slug = host.split('.')[0]
    ;(supabase as any).from('companies').select('id, name, slug').eq('slug', slug).maybeSingle().then(({ data }: any) => {
      if (!data) return
      setLook(l => ({ ...l, id: data.id, name: data.name || '', slug: data.slug || slug }))
      // Asked separately so a missing column can't lose the name.
      ;(supabase as any).from('companies').select('logo_url, accent_color').eq('id', data.id).maybeSingle().then(({ data: d }: any) => {
        if (!d) return
        setLook(l => ({ ...l, color: /^#[0-9a-f]{6}$/i.test(d.accent_color || '') ? d.accent_color : l.color, logo: d.logo_url || null }))
      }, () => {})
    }, () => {})
  }, [])
  return look
}

/**
 * Phones: the live preview as a short strip under the logo (the side panel
 * doesn't fit), so the page moves there too. Each page puts in a compact
 * part of its preview; hidden when the screen is short (a keyboard up).
 */
export function PhoneBand({ children, corner, title }: { children: React.ReactNode; corner?: React.ReactNode; title?: string }) {
  return (
    <div className="au-band" aria-hidden="true">
      {title ? <div className="au-band-hi" key={title}>{title}</div> : null}
      {corner}
      <div className="au-band-app">{children}</div>
    </div>
  )
}

export const AUTH_CSS = `
.si .nw-body{padding-top:clamp(24px,8vh,88px)}
.si-top-link{margin-left:auto}
.si-field{display:block;margin:0 0 16px}
.si-field>span{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px;font-size:14px;font-weight:600}
.si-forgot{font-size:13px;font-weight:600;color:#71717a;text-decoration:none}
.si-forgot:hover{color:#18181b;text-decoration:underline;text-underline-offset:3px}
.si-pass{padding-right:6px}
.si-eye{width:38px;height:38px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:50%;background:none;color:#8e8e93;cursor:pointer}
.si-eye:hover{background:#f4f4f5;color:#18181b}
.si-error{margin:0 0 14px}
.si-submit{width:100%;margin-top:6px}
.si-spin{border-color:rgba(255,255,255,.35);border-top-color:#fff}
.si-alt{width:100%;justify-content:center;margin-top:10px;height:50px}
.si-alt:disabled{opacity:.6;cursor:default}
.si-note{display:flex;gap:10px;align-items:flex-start;margin:0 0 18px;padding:12px 14px;border-radius:14px;font-size:13.5px;line-height:1.45}
.si-note.good{background:#f0fdf4;color:#166534}
.si-note.bad{background:#fef2f2;color:#b91c1c}
.si-note svg{flex-shrink:0;margin-top:1px}
.si-sent-ic{width:60px;height:60px;margin:0 0 20px;border-radius:18px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--c) 12%,#fff);color:var(--c);animation:nwPopIn .5s cubic-bezier(.2,.9,.3,1.3) both}
.si-sent .nw-sub b{color:#18181b}
.si-sent-btns{display:flex;flex-wrap:wrap;gap:8px}
.si-new a{color:#18181b;font-weight:600;text-decoration:underline;text-underline-offset:2px}
.si-me{max-width:min(320px,60%)}
.si-me-mail{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.si-new-n{color:var(--c);font-weight:700;animation:nwFade .4s ease both}
.si.nw-form .nw-app{top:24%}
.si .nw-list{width:min(232px,40%)}
.si-thread{gap:18px;padding-right:clamp(36px,4.6vw,60px)}
.nw.dark .si-forgot{color:#a1a1aa}
.nw.dark .si-forgot:hover,.nw.dark .si-sent .nw-sub b,.nw.dark .si-new a{color:#f4f4f5}
.nw.dark .si-eye:hover{background:#26262b;color:#f4f4f5}
.nw.dark .si-pass input{color:#f4f4f5}
.nw.dark .si-note.good{background:rgba(34,197,94,.12);color:#86efac}
.nw.dark .si-note.bad{background:rgba(239,68,68,.12);color:#fca5a5}
.nw.dark .si-sent-ic{background:color-mix(in srgb,var(--c) 18%,#18181b)}
@media (max-width:900px){.si .nw-body{padding-top:32px}}
/* Phones: the strip, and the panel opening out of the button pressed. */
.au-band{display:none}
@media (max-width:900px){
  .si .au-band ~ .nw-body{padding-top:16px}
  .au-band{display:block;position:relative;flex-shrink:0;height:clamp(118px,18vh,156px);margin:12px 0 0;border-radius:22px;overflow:hidden;background-color:var(--c);background-image:radial-gradient(120% 90% at 85% 0%,rgba(255,255,255,.28),transparent 55%),radial-gradient(90% 70% at 0% 100%,rgba(0,0,0,.14),transparent 60%),repeating-linear-gradient(45deg,rgba(255,255,255,.12) 0 1px,transparent 1px 60px),repeating-linear-gradient(-45deg,rgba(255,255,255,.12) 0 1px,transparent 1px 60px);transition:background-color .6s ease;animation:auBandIn .7s cubic-bezier(.22,1,.36,1) both}
  @keyframes auBandIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
  .au-band-app{position:absolute;left:16px;right:-12px;top:36px;bottom:-16px;padding:10px 26px 0 12px;box-sizing:border-box;background:#fff;border-radius:20px 0 0 0;box-shadow:0 20px 50px -18px rgba(0,0,0,.35);overflow:hidden;animation:auAppIn .8s cubic-bezier(.22,1,.36,1) .12s both}
  @keyframes auAppIn{from{transform:translateY(24px)}to{transform:none}}
  .au-band .nw-me{top:6px;right:8px;padding:3px 11px 3px 3px;font-size:12px;max-width:58%}
  .au-band-hi{position:absolute;left:16px;top:12px;max-width:40%;font-size:13.5px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 2px rgba(0,0,0,.12);animation:nwFade .45s ease both}
  /* A little tighter so the button stays above the fold with the strip. */
  .si .au-band ~ .nw-body .nw-sub{margin:6px 0 16px}
  .si .au-band ~ .nw-body .si-field{margin-bottom:12px}
  .si .au-band ~ .nw-body .nw-input{height:48px}
  .si .au-band ~ .nw-body .nw-next{height:50px}
  .au-band .nw-me .nw-av-ini{width:24px!important;height:24px!important;font-size:11px!important}
  .au-band .nw-msg{gap:8px}
  .au-band .nw-msg img{width:26px;height:26px;border-radius:8px}
  .au-band .nw-msg p{max-width:100%;padding:8px 12px;font-size:13px;line-height:1.4}
  .si.nw-zoom .nw-panel,.si.nw-full .nw-panel{animation:auReveal .8s cubic-bezier(.65,0,.35,1) both}
}
@media (max-width:900px) and (max-height:600px){.au-band{display:none}}
@keyframes auReveal{from{clip-path:circle(0px at var(--ox,50%) var(--oy,85%))}to{clip-path:circle(160vmax at var(--ox,50%) var(--oy,85%))}}
.nw.dark .au-band-app{background:#151517}
@media (prefers-reduced-motion: reduce){.si-sent-ic,.si-new-n,.au-band,.au-band-app,.au-band *,.si.nw-zoom .nw-panel,.si.nw-full .nw-panel{animation:none!important}}
`
