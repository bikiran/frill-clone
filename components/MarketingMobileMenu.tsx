'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import FeatureIcon from '@/components/FeatureIcon'
import ComingSoonPill from '@/components/ComingSoonPill'
import type { ComingSoonKey } from '@/lib/feature-availability'

// The marketing site's menu on phones and tablets (Sellio-style): a white card
// floating over a dimmed page, with the logo and a close button, the menus as
// sections (small grey group labels, outline icons and plain labels), and the
// two things people come for pinned to the bottom: try it free, or sign in.
//
// Rendered into <body>: the nav bar has a backdrop blur, which would otherwise
// make it the containing block of anything position: fixed inside it.

type Item = { icon: string; title: string; href: string; soon?: ComingSoonKey }
type Section = { key: string; label: string; columns: { heading: string; items: Item[] }[] }
type Link = { label: string; href: string }

const INK = '#0f1119'

export default function MarketingMobileMenu({ sections, links, moreLinks, openKey, dark, onToggleDark, signedIn, onPrimary, onClose, pathname }: {
  sections: Section[]
  /** Big rows at the top (Pricing…). */
  links: Link[]
  /** Small links at the end (Blog, Changelog…). */
  moreLinks: Link[]
  /** The section that starts open (the one this page belongs to). */
  openKey: string
  dark: boolean
  onToggleDark?: () => void
  signedIn: boolean
  onPrimary: () => void
  onClose: () => void
  pathname: string
}) {
  const [mounted, setMounted] = useState(false)
  const [closing, setClosing] = useState(false)
  const [open, setOpen] = useState<string | null>(openKey)
  const closeBtn = useRef<HTMLButtonElement | null>(null)

  // While it's open the floating chat bubble steps aside (it sat over Sign in).
  useEffect(() => {
    setMounted(true)
    const root = document.documentElement
    root.setAttribute('data-mm-open', '')
    return () => root.removeAttribute('data-mm-open')
  }, [])
  useEffect(() => { if (mounted) closeBtn.current?.focus() }, [mounted])

  // Plays the card out, then unmounts.
  const close = () => {
    if (closing) return
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { onClose(); return }
    setClosing(true)
    setTimeout(onClose, 190)
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  if (!mounted) return null
  const here = (href: string) => href !== '/' && (pathname === href || pathname.startsWith(href + '/'))

  return createPortal(
    <div className={`mm-root${dark ? ' dk' : ''}${closing ? ' out' : ''}`}>
      <style>{CSS}</style>
      <div className="mm-scrim" onClick={close} aria-hidden="true" />
      <div className="mm-card" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="mm-head">
          <a href="/" className="mm-logo" onClick={close}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="" width={30} height={30} />
            <span>Colvy</span>
          </a>
          <div className="mm-head-btns">
            {onToggleDark && (
              <button type="button" className="mm-sq" onClick={onToggleDark} aria-label="Toggle theme">
                {dark
                  ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>}
              </button>
            )}
            <button ref={closeBtn} type="button" className="mm-sq" onClick={close} aria-label="Close menu">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="mm-body">
          {links.map(l => (
            <a key={l.href} href={l.href} className={`mm-top${here(l.href) ? ' on' : ''}`} onClick={close}>{l.label}</a>
          ))}
          <div className="mm-rule" />

          {sections.map(s => {
            const isOpen = open === s.key
            return (
              <div key={s.key} className={`mm-sec${isOpen ? ' open' : ''}`}>
                <button type="button" className="mm-sec-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.key)}>
                  <span>{s.label}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                <div className="mm-sec-body">
                  <div>
                    {s.columns.map(c => (
                      <div key={c.heading} className="mm-group">
                        <p>{c.heading}</p>
                        {c.items.map(it => (
                          <a key={it.title + it.href} href={it.href} className={`mm-item${here(it.href) ? ' on' : ''}`} onClick={close} tabIndex={isOpen ? 0 : -1}>
                            <span className="mm-ic"><FeatureIcon name={it.icon} color="currentColor" size={20} /></span>
                            <span className="mm-lbl">{it.title}</span>
                            {it.soon && <ComingSoonPill feature={it.soon} style={{ fontSize: 9.5, padding: '2px 7px' }} />}
                          </a>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}

          <div className="mm-rule" />
          <div className="mm-more">
            {moreLinks.map(l => <a key={l.href} href={l.href} className={here(l.href) ? 'on' : ''} onClick={close}>{l.label}</a>)}
          </div>
        </div>

        <div className="mm-foot">
          <button type="button" className="mm-cta" onClick={() => { onPrimary(); close() }} data-cta="nav_get_started" data-cta-location="nav_mobile">
            <span>{signedIn ? 'Go to dashboard' : 'Try Colvy free'}</span>
            <span className="mm-cta-arrow" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </button>
          {!signedIn && <a href="/signin" className="mm-login" onClick={close}>Sign in</a>}
        </div>
      </div>
    </div>,
    document.body,
  )
}

const CSS = `
html[data-mm-open] .colvy-chat-launcher{opacity:0 !important;pointer-events:none !important}
.mm-root{position:fixed;inset:0;z-index:1200;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,sans-serif;--mm-bg:#fff;--mm-ink:${INK};--mm-muted:rgba(15,17,25,.5);--mm-ic:#5b6170;--mm-line:rgba(15,17,25,.08);--mm-soft:#f5f5f6}
.mm-root.dk{--mm-bg:#14151d;--mm-ink:#f4f5fb;--mm-muted:rgba(244,245,251,.5);--mm-ic:rgba(244,245,251,.62);--mm-line:rgba(255,255,255,.09);--mm-soft:rgba(255,255,255,.06)}
.mm-scrim{position:absolute;inset:0;background:rgba(15,17,25,.38);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);animation:mmFade .22s ease both}
.mm-card{position:absolute;top:10px;bottom:10px;right:10px;left:10px;margin-left:auto;max-width:480px;display:flex;flex-direction:column;background:var(--mm-bg);color:var(--mm-ink);border-radius:26px;box-shadow:0 30px 80px -20px rgba(0,0,0,.45),0 0 0 1px rgba(15,17,25,.04);overflow:hidden;transform-origin:92% 0;animation:mmIn .32s cubic-bezier(.16,1,.3,1) both}
.mm-root.out .mm-scrim{animation:mmFadeOut .19s ease both}
.mm-root.out .mm-card{animation:mmOut .19s ease both}
@keyframes mmFade{from{opacity:0}to{opacity:1}}
@keyframes mmFadeOut{from{opacity:1}to{opacity:0}}
@keyframes mmIn{from{opacity:0;transform:translateY(-8px) scale(.96)}to{opacity:1;transform:none}}
@keyframes mmOut{from{opacity:1;transform:none}to{opacity:0;transform:translateY(-6px) scale(.97)}}
.mm-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 16px 10px 22px}
.mm-logo{display:flex;align-items:center;gap:9px;text-decoration:none;color:var(--mm-ink)}
.mm-logo img{border-radius:9px;display:block}
.mm-logo span{font-size:22px;font-weight:900;letter-spacing:-.02em}
.mm-head-btns{display:flex;gap:8px}
.mm-sq{width:42px;height:42px;border-radius:13px;border:1.5px solid var(--mm-line);background:var(--mm-bg);color:var(--mm-ink);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
.mm-sq:active{background:var(--mm-soft)}
.mm-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:4px 22px 18px;-webkit-overflow-scrolling:touch}
.mm-top{display:block;padding:14px 2px;font-size:19px;font-weight:650;letter-spacing:-.01em;color:var(--mm-ink);text-decoration:none}
.mm-top.on,.mm-item.on .mm-lbl,.mm-more a.on{color:#ff6a4d}
.mm-rule{height:1px;background:var(--mm-line);margin:6px 0}
.mm-sec-head{display:flex;align-items:center;justify-content:space-between;width:100%;padding:16px 2px 10px;background:none;border:0;cursor:pointer;font:inherit;font-size:13.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--mm-ink)}
.mm-sec-head svg{color:var(--mm-muted);transition:transform .3s cubic-bezier(.16,1,.3,1)}
.mm-sec.open .mm-sec-head svg{transform:rotate(180deg)}
.mm-sec-body{display:grid;grid-template-rows:0fr;transition:grid-template-rows .32s cubic-bezier(.16,1,.3,1)}
.mm-sec.open .mm-sec-body{grid-template-rows:1fr}
.mm-sec-body > div{overflow:hidden;min-height:0}
.mm-group{padding-bottom:6px}
.mm-group p{margin:6px 2px 2px;font-size:14.5px;font-weight:600;color:var(--mm-muted)}
.mm-item{display:flex;align-items:center;gap:14px;padding:10px 2px;border-radius:12px;text-decoration:none;color:var(--mm-ink)}
.mm-item:active{background:var(--mm-soft)}
.mm-ic{display:inline-flex;width:24px;justify-content:center;color:var(--mm-ic);flex-shrink:0}
.mm-lbl{font-size:17px;font-weight:500;letter-spacing:-.005em}
.mm-more{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;padding:8px 0 4px}
.mm-more a{padding:10px 2px;font-size:15.5px;font-weight:600;color:var(--mm-muted);text-decoration:none}
.mm-foot{display:flex;flex-direction:column;gap:10px;padding:14px 16px calc(16px + env(safe-area-inset-bottom));border-top:1px solid var(--mm-line);background:var(--mm-bg)}
.mm-cta{position:relative;display:flex;align-items:center;justify-content:center;gap:14px;height:58px;border-radius:999px;border:0;cursor:pointer;font:inherit;font-size:17px;font-weight:800;color:#fff;background:linear-gradient(180deg,#2a2c36,#0f1119);box-shadow:0 10px 24px -10px rgba(15,17,25,.6),inset 0 1px 0 rgba(255,255,255,.14)}
.mm-cta-arrow{width:40px;height:40px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:rgba(255,255,255,.14)}
.mm-root.dk .mm-cta{color:${INK};background:linear-gradient(180deg,#ffffff,#e9e9ee);box-shadow:none}
.mm-root.dk .mm-cta-arrow{background:rgba(15,17,25,.08)}
.mm-cta:active{transform:scale(.985)}
.mm-login{display:flex;align-items:center;justify-content:center;height:54px;border-radius:999px;border:1.5px solid var(--mm-line);font-size:16.5px;font-weight:700;color:var(--mm-ink);text-decoration:none}
.mm-login:active{background:var(--mm-soft)}
.mm-sq:focus-visible,.mm-cta:focus-visible,.mm-login:focus-visible,.mm-item:focus-visible,.mm-top:focus-visible,.mm-sec-head:focus-visible,.mm-more a:focus-visible{outline:2px solid #ff6a4d;outline-offset:2px}
@media (prefers-reduced-motion:reduce){.mm-scrim,.mm-card,.mm-root.out .mm-scrim,.mm-root.out .mm-card{animation:none}.mm-sec-body,.mm-sec-head svg{transition:none}}
`
