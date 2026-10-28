'use client'

// The Settings area, like Sellio's: one menu of every setting, grouped
// (components/settings/settings-nav), in a white card beside a white page, on
// the rail's soft grey. Business Settings, the board settings and the
// workspace pages all sit inside it, so moving between settings never loses
// the menu. On a phone the menu folds into one row showing where you are;
// tapping it opens the whole list.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { SETTINGS_ICONS, SETTINGS_NAV, SETTINGS_DEFAULT_TAB, type SettingsItem } from './settings-nav'

/** Whether this member may open a page (the admin layout provides it from their permissions). */
export const SettingsAccess = createContext<(href: string) => boolean>(() => true)

function Icon({ name }: { name: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, display: 'block' }}>
      {(SETTINGS_ICONS[name] || []).map(d => <path key={d} d={d} />)}
    </svg>
  )
}

// The item for this address: an exact #tab of /admin/settings, else the
// longest whole-segment match of a page.
function activeHref(pathname: string, hash: string): string | null {
  const items = SETTINGS_NAV.flatMap(g => g.items)
  if (pathname === '/admin/settings') {
    const tab = hash.replace('#', '') || SETTINGS_DEFAULT_TAB
    return items.find(i => i.href === `/admin/settings#${tab}`)?.href || null
  }
  let best: SettingsItem | null = null
  for (const i of items) {
    if (i.href.includes('#')) continue
    if ((pathname === i.href || pathname.startsWith(i.href + '/')) && (!best || i.href.length > best.href.length)) best = i
  }
  return best?.href || null
}

export default function SettingsShell({ children, top }: { children: ReactNode; top?: ReactNode }) {
  const pathname = usePathname() || ''
  const canOpen = useContext(SettingsAccess)
  const [hash, setHash] = useState('')
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)  // the phone's folded menu
  useEffect(() => {
    const read = () => setHash(window.location.hash)
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [pathname])
  useEffect(() => { setOpen(false) }, [pathname, hash])

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase()
    return SETTINGS_NAV
      .map(g => ({ ...g, items: g.items.filter(i => canOpen(i.href.split('#')[0]) && (!s || i.label.toLowerCase().includes(s) || g.title.toLowerCase().includes(s))) }))
      .filter(g => g.items.length)
  }, [q, canOpen])
  const current = activeHref(pathname, hash)
  const currentItem = SETTINGS_NAV.flatMap(g => g.items).find(i => i.href === current)

  return (
    <div className="st-wrap">
      <style>{`
        .st-wrap { display: flex; gap: 12px; align-items: flex-start; min-height: calc(100vh - 56px - var(--admin-banners-h, 0px)); padding: 12px; background: #f4f4f6; }
        /* The page scrolls as a whole and the menu stays put just under the
           top bar. The admin layout's main column is a scroll container that
           never scrolls, which would hold anything sticky in place, so on
           settings pages it stands down. (Sticky panels in the pages sit at
           76px: the 56px top bar, and a gap.) */
        .admin-main:has(.st-wrap) { overflow-x: clip !important; overflow-y: visible !important; }
        .st-nav { position: sticky; top: 68px; width: 264px; flex-shrink: 0; max-height: calc(100vh - 80px); overflow-y: auto; scrollbar-width: thin; padding: 14px 10px 16px; border-radius: 18px; background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.03); }
        .st-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 8px 10px 10px; }
        .st-title { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; color: #111; }
        .st-search-btn { width: 34px; height: 34px; border-radius: 50%; border: 1.5px solid #e4e4e7; background: #fff; color: #52525b; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
        .st-search-btn:hover { background: #fafafa; }
        .st-search { width: 100%; box-sizing: border-box; height: 38px; margin: 0 0 8px; padding: 0 12px; border-radius: 11px; border: none; background: #f4f4f5; font: inherit; font-size: 14px; color: #111; outline: none; }
        .st-search:focus { box-shadow: 0 0 0 2px color-mix(in srgb, var(--coral) 35%, transparent); }
        .st-group { margin: 14px 0 4px; padding: 0 10px; font-size: 13px; font-weight: 500; color: #8e8e93; }
        .st-item { display: flex; align-items: center; gap: 12px; margin-bottom: 2px; padding: 8px 10px; border-radius: 11px; color: #27272a; text-decoration: none; font-size: 15px; font-weight: 500; transition: background .12s; }
        .st-item:hover { background: #f7f7f8; }
        .st-item .st-ic { color: #52525b; display: flex; }
        .st-item.on { background: #efeff1; color: #111; font-weight: 650; }
        .st-item.on .st-ic { color: var(--coral); }
        .st-item:focus-visible { outline: none; box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--coral) 40%, transparent); }
        /* The page brings its own padding (pages also used on their own do). */
        .st-main { flex: 1; min-width: 0; border-radius: 18px; background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.03); }
        .st-fold { display: none; }
        /* The pages, like Sellio's: big bold titles; sections with their name
           and what they're for on the left and the fields on the right,
           between thin lines; soft grey fields. A section that doesn't open
           with a heading (or a narrow page) stays one column. Sections are
           className="st-sec" (Business Settings and /admin/settings use it). */
        .st-main h1 { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; color: #111; }
        .st-sec { display: flow-root; container-type: inline-size; margin: 0 !important; padding: 28px 0 !important; border: none !important; border-top: 1px solid #f0f0f2 !important; border-radius: 0 !important; background: none !important; box-shadow: none !important; }
        .st-sec > h2:first-child { font-size: 16px !important; font-weight: 700 !important; color: #111 !important; letter-spacing: -0.01em; margin: 0 0 6px !important; }
        .st-sec > h2:first-child + p { font-size: 14px !important; font-weight: 400 !important; color: #71717a !important; line-height: 1.55 !important; margin: 0 0 14px !important; }
        @container (min-width: 700px) {
          .st-sec:not(.st-one):has(> h2:first-child) > h2:first-child,
          .st-sec:not(.st-one):has(> h2:first-child) > h2:first-child + p { float: left; clear: left; width: 220px; }
          .st-sec:not(.st-one):has(> h2:first-child) > :not(h2:first-child):not(h2:first-child + p) { margin-left: 260px !important; }
        }
        /* .st-one: a section that keeps one column (a wide table). */
        /* Buttons the pages draw with utility classes become pills too, but
           not card-like buttons that hold blocks of content. */
        .st-main :is(button, a):is(.rounded-lg, .rounded-xl):is([class*="px-"], [class*="py-"]):not(:has(div, p, img, h3, h4, ul)) { border-radius: 999px !important; }
        .st-main :is(input:not([type]), input[type=text], input[type=email], input[type=tel], input[type=url], input[type=number], input[type=password], input[type=search], input[type=time], input[type=date], input[type=datetime-local], textarea, select:not(.cv-select)) {
          background-color: #f4f4f5 !important; border-color: transparent !important; border-radius: 12px !important; color: #111;
          transition: background-color .15s ease, box-shadow .15s ease, border-color .15s ease;
        }
        .st-main :is(input:not([type]), input[type=text], input[type=email], input[type=tel], input[type=url], input[type=number], input[type=password], input[type=search], input[type=time], input[type=date], input[type=datetime-local], textarea, select:not(.cv-select)):focus {
          background-color: #fff !important; border-color: #d4d4d8 !important; outline: none !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 16%, transparent) !important;
        }
        .st-main :is(input, textarea)::placeholder { color: #a1a1aa; }
        /* Pages with their own sticky header bar sit flat in the white page. */
        .st-main .ph-root { position: static !important; margin: 0 0 22px !important; padding: 0 0 18px !important; background: transparent !important; }
        .st-main .ph-root h1 { font-size: 26px !important; letter-spacing: -0.02em !important; }
        @media (max-width: 860px) {
          .st-wrap { flex-direction: column; gap: 0; padding: 0; background: #fff; }
          .st-nav { position: static; width: 100%; max-height: none; border-radius: 0; box-shadow: none; border-bottom: 1px solid #f0f0f2; padding: 10px 12px; }
          .st-nav .st-head, .st-nav .st-body { display: none; }
          .st-nav.open .st-body { display: block; }
          .st-fold { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 6px; border: none; background: none; font: inherit; font-size: 15.5px; font-weight: 650; color: #111; cursor: pointer; text-align: left; }
          .st-fold .st-ic { color: var(--coral); display: flex; }
          .st-main { border-radius: 0; box-shadow: none; }
        }
      `}</style>
      <nav className={`st-nav${open ? ' open' : ''}`} aria-label="Settings">
        <button type="button" className="st-fold" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          <span style={{ color: '#8e8e93', fontWeight: 500 }}>Settings</span>
          {currentItem && <><span aria-hidden style={{ color: '#d4d4d8' }}>/</span><span className="st-ic"><Icon name={currentItem.icon} /></span>{currentItem.label}</>}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ marginLeft: 'auto', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}><polyline points="6 9 12 15 18 9" /></svg>
        </button>
        <div className="st-head">
          <h2 className="st-title">Settings</h2>
          <button type="button" className="st-search-btn" aria-label="Search settings" aria-expanded={searching} onClick={() => { setSearching(v => !v); setQ('') }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
          </button>
        </div>
        <div className="st-body">
          {searching && <input className="st-search" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search settings…" aria-label="Search settings" onKeyDown={e => { if (e.key === 'Escape') { setSearching(false); setQ('') } }} />}
          {groups.map(g => (
            <div key={g.title}>
              <p className="st-group">{g.title}</p>
              {g.items.map(i => {
                const on = i.href === current
                const [path, tab] = i.href.split('#')
                return (
                  <Link key={i.href} href={i.href} className={`st-item${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined}
                    onClick={e => {
                      // Another tab of the page that's open: just switch the tab.
                      if (tab && pathname === path) { e.preventDefault(); window.location.hash = tab }
                    }}>
                    <span className="st-ic"><Icon name={i.icon} /></span>{i.label}
                  </Link>
                )
              })}
            </div>
          ))}
          {!groups.length && <p style={{ margin: '12px 10px', fontSize: 14, color: '#8e8e93' }}>No settings match “{q}”.</p>}
        </div>
      </nav>
      <main className="st-main">
        {top}
        {children}
      </main>
    </div>
  )
}
