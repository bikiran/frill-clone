'use client'

// The Help Centre's frame, like the Settings area (components/settings):
// it lives in app/admin/help/layout.tsx (HelpFrame), so moving between
// Articles, Reporting, Import and Settings swaps only the page, not the
// whole frame (it flashed when each page drew its own). Pages still wrap
// themselves in <HelpShell nav={…}>: inside the frame that just renders the
// page and hands its own list (the articles, the report sections) to the menu.
//
// one white menu card — Articles, Reporting, Import, Settings — with the
// page's own list under it (the articles, or the report sections), beside the
// page in a white card, on the rail's soft grey. Both scroll on their own, so
// the menu never scrolls away. On a phone the menu folds into one row.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const ic = (d: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, display: 'block' }}>{d}</svg>
)

const LINKS = [
  { href: '/admin/help', label: 'Articles', icon: ic(<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>) },
  { href: '/admin/help/analytics', label: 'Reporting', icon: ic(<><path d="M4 13h3.5v7.5H4z" /><path d="M10.25 4h3.5v16.5h-3.5z" /><path d="M16.5 9h3.5v11.5h-3.5z" /></>) },
  { href: '/admin/help/import', label: 'Import from website', icon: ic(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" /></>) },
  { href: '/admin/help/settings', label: 'Settings', icon: ic(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>) },
]

// The menu's slot for the page's own list, when the frame is the layout's.
const SlotCtx = createContext<{ slot: HTMLElement | null } | null>(null)

/** The persistent frame, for app/admin/help/layout.tsx. The article editor has its own screen. */
export function HelpFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ''
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  if (pathname.startsWith('/admin/help/new')) return <>{children}</>
  return (
    <SlotCtx.Provider value={{ slot }}>
      <Frame slotRef={setSlot}><div key={pathname} className="hc-page">{children}</div></Frame>
    </SlotCtx.Provider>
  )
}

/** A Help Centre page: inside the frame, the page and its list for the menu; on its own, the whole frame. */
export default function HelpShell({ children, nav }: { children: ReactNode; nav?: ReactNode }) {
  const ctx = useContext(SlotCtx)
  if (ctx) return <>{children}{nav && ctx.slot ? createPortal(nav, ctx.slot) : null}</>
  return <Frame nav={nav}>{children}</Frame>
}

function Frame({ children, nav, slotRef }: { children: ReactNode; nav?: ReactNode; slotRef?: (el: HTMLDivElement | null) => void }) {
  const pathname = usePathname() || ''
  const [open, setOpen] = useState(false)  // the phone's folded menu
  useEffect(() => { setOpen(false) }, [pathname])
  // /admin/help/new (the editor) belongs to Articles.
  const current = LINKS.slice(1).find(l => pathname === l.href || pathname.startsWith(l.href + '/')) || LINKS[0]

  return (
    <div className="hc-wrap">
      <style>{`
        .hc-wrap { display: flex; gap: 12px; height: calc(100vh - 56px - var(--admin-banners-h, 0px)); padding: 12px; box-sizing: border-box; background: #f4f4f6; }
        .hc-nav { width: 264px; flex-shrink: 0; display: flex; flex-direction: column; min-height: 0; border-radius: 18px; background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.03); overflow: hidden; }
        .hc-top { padding: 14px 10px 8px; }
        .hc-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 6px 10px 10px; }
        .hc-title { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; color: #111; }
        .hc-new { width: 34px; height: 34px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: #111; color: #fff; text-decoration: none; transition: background .15s, transform .1s; }
        .hc-new:hover { background: #262626; }
        .hc-new:active { transform: scale(.94); }
        .hc-item { display: flex; align-items: center; gap: 12px; width: 100%; box-sizing: border-box; margin-bottom: 2px; padding: 8px 10px; border: none; border-radius: 11px; background: none; color: #27272a; text-decoration: none; font: inherit; font-size: 15px; font-weight: 500; text-align: left; cursor: pointer; transition: background .12s; }
        .hc-item:hover { background: #f7f7f8; }
        .hc-item::before, .hc-menu-row::before { display: none; }
        .hc-item .hc-ic { color: #52525b; display: flex; }
        .hc-item.on { background: #efeff1; color: #111; font-weight: 650; }
        .hc-item.on .hc-ic { color: var(--coral); }
        .hc-item:focus-visible { outline: none; box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--coral) 40%, transparent); }
        .hc-new:focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }
        .hc-sub { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; padding: 6px 10px 14px; border-top: 1px solid #f0f0f2; }
        .hc-sub:empty { display: none; }
        .hc-page { min-height: 100%; animation: hcPage .22s ease both; }
        @keyframes hcPage { from { opacity: 0 } to { opacity: 1 } }
        .hc-group { margin: 10px 0 4px; padding: 0 10px; font-size: 13px; font-weight: 500; color: #8e8e93; }
        .hc-main { flex: 1; min-width: 0; overflow-y: auto; border-radius: 18px; background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.03); }
        .hc-main h1 { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; color: #111; }
        .hc-fold { display: none; }
        /* Shared bits for the pages inside */
        .hc-card { border-radius: 16px; background: #fff; box-shadow: 0 0 0 1px #ececf0; }
        .hc-menu { position: absolute; z-index: 50; padding: 6px; border-radius: 16px; background: #fff; box-shadow: 0 16px 44px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.05); animation: hcMenu .18s cubic-bezier(.22,1,.36,1); }
        @keyframes hcMenu { from { opacity: 0; transform: translateY(-4px) scale(.98) } to { opacity: 1; transform: none } }
        .hc-menu-row { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: none; border-radius: 10px; background: none; font: inherit; font-size: 14px; color: #18181b; text-align: left; cursor: pointer; }
        .hc-menu-row:hover { background: #f4f4f5; }
        .hc-menu-row.cur { font-weight: 650; }
        .hc-tag { display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 8px 0 7px; border-radius: 999px; background: color-mix(in srgb, var(--tag) 9%, #fff); color: color-mix(in srgb, var(--tag) 88%, #000); font-size: 11.5px; font-weight: 600; white-space: nowrap; }
        .hc-tag::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--tag); }
        .hc-chip { display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 999px; background: #f4f4f5; color: #52525b; font-size: 11.5px; font-weight: 600; white-space: nowrap; }
        @media (prefers-reduced-motion: reduce) { .hc-menu, .hc-page { animation: none; } }
        @media (max-width: 860px) {
          .hc-wrap { flex-direction: column; height: auto; gap: 0; padding: 0; background: #fff; }
          .hc-nav { width: 100%; border-radius: 0; box-shadow: none; border-bottom: 1px solid #f0f0f2; }
          .hc-nav .hc-top, .hc-nav .hc-sub { display: none; }
          .hc-nav.open .hc-top { display: block; }
          .hc-nav.open .hc-sub { display: block; max-height: 55vh; }
          .hc-nav.open .hc-sub:empty { display: none; }
          .hc-fold { display: flex; align-items: center; gap: 10px; width: 100%; padding: 14px 16px; border: none; background: none; font: inherit; font-size: 15.5px; font-weight: 650; color: #111; cursor: pointer; text-align: left; }
          .hc-fold .hc-ic { color: var(--coral); display: flex; }
          .hc-main { overflow: visible; border-radius: 0; box-shadow: none; }
        }
      `}</style>
      <nav className={`hc-nav${open ? ' open' : ''}`} aria-label="Help Centre">
        <button type="button" className="hc-fold" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          <span style={{ color: '#8e8e93', fontWeight: 500 }}>Help Centre</span>
          <span aria-hidden style={{ color: '#d4d4d8' }}>/</span>
          <span className="hc-ic">{current.icon}</span>{current.label}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ marginLeft: 'auto', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}><polyline points="6 9 12 15 18 9" /></svg>
        </button>
        <div className="hc-top">
          <div className="hc-head">
            <h2 className="hc-title">Help Centre</h2>
            <Link href="/admin/help/new" className="hc-new" title="New article" aria-label="New article">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </Link>
          </div>
          {LINKS.map(l => (
            <Link key={l.href} href={l.href} className={`hc-item${l === current ? ' on' : ''}`} aria-current={l === current ? 'page' : undefined}>
              <span className="hc-ic">{l.icon}</span>{l.label}
            </Link>
          ))}
        </div>
        {slotRef ? <div className="hc-sub" ref={slotRef} /> : nav && <div className="hc-sub">{nav}</div>}
      </nav>
      <main className="hc-main">{children}</main>
    </div>
  )
}
