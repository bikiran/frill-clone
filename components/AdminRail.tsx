'use client'

// The admin's navigation on wider screens (app/admin/layout.tsx), like
// Sellio's: a slim rail of big icons with their names underneath. The section
// you're in sits on a white tile with its icon filled in Colvy coral. Pointing
// at a section (or tabbing to it) opens a panel beside the rail with all of its
// pages; on a touch screen the first tap opens the panel and the panel's first
// row goes to the section. Phones keep the menu sheet and the bottom bar.
//
// Pointing is timed so the panels behave: one opens after a short pause (so
// sweeping past the rail doesn't flash them), stays a moment after the
// pointer leaves (time to reach it on a slanting path), and another section
// only takes over once the pointer settles on it. While a panel is open the
// rest of the screen fades back a little, so the panel stands out.
//
// Your avatar sits at the foot of the rail, like Sellio's: the app chrome
// (app/AppChrome) renders its account button and menu into the slot here
// (#rail-account-slot) instead of the top bar's corner.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'

export const RAIL_W = 84

export type RailItem = { label: string; href: string; icon: ReactNode; active?: boolean; count?: number; tone?: string; locked?: boolean; external?: boolean }
export type RailSection = { key: string; label: string; glyph: string; groups: { label?: string; items: RailItem[] }[] }

// The rail's icons on a 24px grid: `body` is filled in when the section is
// active, `detail` turns white over the fill (a `hole` is filled white), and
// `line` stays a line either way.
const GLYPHS: Record<string, { body: string[]; detail?: string[]; hole?: string[]; line?: string[] }> = {
  home: { body: ['M3.5 10.2 12 3.5l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4.5v-5.5h-5v5.5H5A1.5 1.5 0 0 1 3.5 19z'] },
  inbox: { body: ['M3 13.5 5.6 5.4A1.5 1.5 0 0 1 7 4.5h10a1.5 1.5 0 0 1 1.4.9l2.6 8.1V18.5A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5z'], detail: ['M3.4 13.5h4.8l1.6 2.5h4.4l1.6-2.5h4.8'] },
  contacts: { body: ['M9 11.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5z', 'M2.5 20a6.5 6.5 0 0 1 13 0z'], line: ['M16 4.3a3.75 3.75 0 0 1 0 7', 'M18.5 14.6A6.5 6.5 0 0 1 21.5 20'] },
  tasks: { body: ['M6 3.5h12A2.5 2.5 0 0 1 20.5 6v12a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V6A2.5 2.5 0 0 1 6 3.5z'], detail: ['m8 12.2 2.8 2.8L16.2 9'] },
  ai: { body: ['M7 8.5h10a3.5 3.5 0 0 1 3.5 3.5v4.5A3.5 3.5 0 0 1 17 20H7a3.5 3.5 0 0 1-3.5-3.5V12A3.5 3.5 0 0 1 7 8.5z'], detail: ['M9.3 13.3v1.6', 'M14.7 13.3v1.6'], line: ['M12 8.5V5', 'M12 3.5h.01'] },
  orders: { body: ['M4.8 8h14.4l-1.1 10.8a2 2 0 0 1-2 1.7H7.9a2 2 0 0 1-2-1.7z'], line: ['M8.8 8V6.8a3.2 3.2 0 0 1 6.4 0V8'] },
  ticket: { body: ['M3 7.2A2.2 2.2 0 0 1 5.2 5h13.6A2.2 2.2 0 0 1 21 7.2v2.1a2.7 2.7 0 0 0 0 5.4v2.1a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 16.8v-2.1a2.7 2.7 0 0 0 0-5.4z'], detail: ['M12 9.6l.75 1.55 1.7.25-1.23 1.2.29 1.7L12 13.5l-1.51.8.29-1.7-1.23-1.2 1.7-.25z'] },
  marketing: { body: ['M3.5 10.5v3a1 1 0 0 0 1 1h2.7l5.8 4V5.5l-5.8 4H4.5a1 1 0 0 0-1 1z'], line: ['M16.3 8.8a4.5 4.5 0 0 1 0 6.4', 'M18.9 6.2a8.2 8.2 0 0 1 0 11.6'] },
  feedback: { body: ['M12 3a6.5 6.5 0 0 0-3.8 11.8c.5.4.8 1 .8 1.6v.6h6v-.6c0-.6.3-1.2.8-1.6A6.5 6.5 0 0 0 12 3z'], line: ['M9.5 20.5h5'] },
  insights: { body: ['M4 13h3.5v7.5H4z', 'M10.25 4h3.5v16.5h-3.5z', 'M16.5 9h3.5v11.5h-3.5z'] },
  settings: {
    body: ['M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'],
    hole: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  },
  search: { body: [], line: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'm20.5 20.5-4.6-4.6'] },
  upgrade: { body: ['M12 2.8c3 2.1 4.6 5.4 4.2 9.6l2.3 2.6-1.9 4.3-2.9-2.1H10.3l-2.9 2.1-1.9-4.3 2.3-2.6C7.4 8.2 9 4.9 12 2.8z'], detail: ['M12 9.5h.01'] },
}

export function RailGlyph({ name, active, size = 24 }: { name: string; active?: boolean; size?: number }) {
  const g = GLYPHS[name] || GLYPHS.home
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block', overflow: 'visible' }}>
      {g.body.map(d => <path key={d} d={d} fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.7} />)}
      {g.detail?.map(d => <path key={d} d={d} stroke={active ? '#fff' : 'currentColor'} strokeWidth={1.7} />)}
      {g.hole?.map(d => <path key={d} d={d} fill={active ? '#fff' : 'none'} stroke={active ? '#fff' : 'currentColor'} strokeWidth={1.7} />)}
      {g.line?.map(d => <path key={d} d={d} stroke="currentColor" strokeWidth={1.7} />)}
    </svg>
  )
}

const Badge = ({ n, tone }: { n: number; tone?: string }) => (
  <span className="rail-badge" style={{ background: tone || '#ef4444' }}>{n > 99 ? '99+' : n}</span>
)

const OPEN_MS = 90      // pointing at a section, with no panel open
const SWITCH_MS = 220   // pointing at another section while one is open
const CLOSE_MS = 260    // after the pointer leaves a section and its panel

type Aim = { enter: (key: string) => void; leave: () => void; tap: (key: string | null) => void; blur: (key: string) => void }

/** One section of the rail: its tile, and the panel of its pages. */
function RailEntry({ s, open, aim, onLocked }: { s: RailSection; open: boolean; aim: Aim; onLocked: () => void }) {
  const items = s.groups.flatMap(g => g.items)
  const main = items[0]
  const active = items.some(i => i.active)
  const count = items.reduce((n, i) => n + (i.count || 0), 0)
  const tone = items.find(i => i.count)?.tone
  const touch = useRef(false)
  // Line the panel up with the tile, kept on screen.
  const place = (el: HTMLElement) => {
    const fly = el.querySelector<HTMLElement>('.rail-fly')
    if (!fly) return
    const r = el.getBoundingClientRect()
    const top = Math.max(64, Math.min(r.top - 6, window.innerHeight - fly.offsetHeight - 12))
    el.style.setProperty('--fly-top', `${Math.round(top)}px`)
  }
  return (
    <div className={`rail-item${open ? ' open' : ''}`}
      onMouseEnter={e => { place(e.currentTarget); aim.enter(s.key) }} onMouseLeave={aim.leave}
      // Tabbing to a section opens its panel; tabbing out of it closes it.
      onFocus={e => { if (items.length > 1 && !open && e.target.matches(':focus-visible')) { place(e.currentTarget); aim.tap(s.key) } }}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) aim.blur(s.key) }}>
      <Link href={main.locked ? '#' : main.href} className={`rail-tile${active ? ' on' : ''}`} aria-current={active ? 'page' : undefined}
        onPointerDown={e => { touch.current = e.pointerType === 'touch' }}
        onClick={e => {
          if (touch.current && !open && items.length > 1) { e.preventDefault(); aim.tap(s.key); return }
          if (main.locked) { e.preventDefault(); onLocked() }
          aim.tap(null)
        }}>
        <span className="rail-ic">
          <RailGlyph name={s.glyph} active={active} />
          {count > 0 && <Badge n={count} tone={tone} />}
        </span>
        <span className="rail-label">{s.label}</span>
      </Link>
      {items.length > 1 && <div className="rail-fly">
        <div className="rail-fly-card" role="group" aria-label={s.label}>
          <p className="rail-fly-title">{s.label}</p>
          {s.groups.map((g, gi) => (
            <Fragment key={gi}>
              {g.label && <p className="rail-fly-group">{g.label}</p>}
              {g.items.map(i => {
                const inner = (
                  <>
                    <span className="rail-fly-ic">{i.icon}</span>
                    <span className="rail-fly-label">{i.label}</span>
                    {i.locked && <span title="Not available in the demo" style={{ fontSize: 12, opacity: 0.55 }}>🔒</span>}
                    {!!i.count && <span className="rail-fly-count" style={{ background: i.tone || '#ef4444' }}>{i.count > 99 ? '99+' : i.count}</span>}
                    {i.external && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>}
                  </>
                )
                return i.external
                  ? <a key={i.href} href={i.href} className="rail-fly-row">{inner}</a>
                  : (
                    <Link key={i.href + i.label} href={i.locked ? '#' : i.href} className={`rail-fly-row${i.active ? ' on' : ''}`} aria-current={i.active ? 'page' : undefined}
                      onClick={e => { if (i.locked) { e.preventDefault(); onLocked() } aim.tap(null); e.currentTarget.blur() }}>
                      {inner}
                    </Link>
                  )
              })}
            </Fragment>
          ))}
        </div>
      </div>}
    </div>
  )
}

export default function AdminRail({ workspace, sections, settings, search, ring, upgrade, onLocked }: {
  /** The workspace logo at the top (opens the workspace switcher). */
  workspace: ReactNode
  sections: RailSection[]
  settings: RailSection | null
  /** Opens the search palette. */
  search: () => void
  /** The getting-started ring (components/SetupRing), if it shows. */
  ring?: ReactNode
  /** Where "Upgrade" goes, when there's something to upgrade to. */
  upgrade?: string | null
  onLocked: () => void
}) {
  const pathname = usePathname()
  // The section whose panel is open (pointing, a tap or tabbing to it).
  const [open, setOpen] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openRef = useRef(open)
  openRef.current = open
  const later = (key: string | null, ms: number) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(key), ms)
  }
  const aim: Aim = {
    enter: key => {
      if (openRef.current === key) { if (timer.current) clearTimeout(timer.current); return }
      later(key, openRef.current ? SWITCH_MS : OPEN_MS)
    },
    leave: () => later(null, CLOSE_MS),
    tap: key => { if (timer.current) clearTimeout(timer.current); setOpen(key) },
    blur: key => { if (openRef.current === key) { if (timer.current) clearTimeout(timer.current); setOpen(null) } },
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  // Fade the top or bottom edge of the sections while there's more that way.
  const mid = useRef<HTMLElement>(null)
  const fades = () => {
    const el = mid.current
    if (!el) return
    el.classList.toggle('fade-top', el.scrollTop > 2)
    el.classList.toggle('fade-bottom', el.scrollTop + el.clientHeight < el.scrollHeight - 2)
  }
  useEffect(() => {
    fades()
    window.addEventListener('resize', fades)
    return () => window.removeEventListener('resize', fades)
  }, [sections.length])
  useEffect(() => { setOpen(null) }, [pathname])
  // Tell the app chrome the account slot has come (or gone).
  useEffect(() => {
    window.dispatchEvent(new Event('colvy:rail-slot'))
    return () => { setTimeout(() => window.dispatchEvent(new Event('colvy:rail-slot')), 0) }
  }, [])
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => { if (!(e.target as HTMLElement)?.closest?.('.rail-item.open')) setOpen(null) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <aside className={`admin-rail${open ? ' dim' : ''}`} aria-label="Main menu">
      <style>{`
        .admin-rail { position: fixed; top: calc(56px + var(--imp-h, 0px)); left: 0; bottom: var(--sab-h, 0px); width: ${RAIL_W}px; z-index: 30; display: flex; flex-direction: column; align-items: center; background: #f4f4f6; border-right: 1px solid #ececf0; transition: z-index 0s linear .34s; }
        /* While a panel is open: a soft grey veil over everything but the
           panel and its tile. The rail lifts above the top bar for it, and
           settles back once the veil has faded. */
        .admin-rail.dim { z-index: 960; transition-delay: 0s; }
        .rail-scrim { position: fixed; inset: 0; z-index: -1; background: rgba(17,17,20,.15); opacity: 0; pointer-events: none; transition: opacity .3s cubic-bezier(.4,0,.2,1); }
        .admin-rail.dim .rail-scrim { opacity: 1; transition-duration: .22s; }
        /* The account menu (in the slot at the foot) gets the same veil. */
        .rail-acct { width: 100%; }
        .admin-rail:has(.cv-acct) { z-index: 960; transition-delay: 0s; }
        .admin-rail:has(.cv-acct) .rail-scrim { opacity: 1; transition-duration: .22s; }
        .admin-rail:has(.cv-acct) :is(.rail-top, .rail-bottom > :not(.rail-item):not(.rail-acct), .rail-item > .rail-tile) { opacity: .5; }
        .rail-top, .rail-bottom > :not(.rail-item), .rail-item > .rail-tile { transition: opacity .25s ease, background .2s, color .15s, box-shadow .2s; }
        .admin-rail.dim :is(.rail-top, .rail-bottom > :not(.rail-item), .rail-item:not(.open) > .rail-tile) { opacity: .5; }
        .rail-item.open > .rail-tile { background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 4px 14px rgba(0,0,0,.08); }
        .rail-item.open > .rail-tile:not(.on) { color: #18181b; }
        .rail-top { padding: 12px 0 10px; display: flex; flex-direction: column; align-items: center; gap: 12px; flex-shrink: 0; }
        .rail-top::after { content: ''; width: 28px; height: 1px; background: #e2e2e7; }
        .rail-mid { flex: 1; min-height: 0; width: 100%; overflow-y: auto; overflow-x: hidden; scrollbar-width: none; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px 0; }
        .rail-mid::-webkit-scrollbar { display: none; }
        .rail-bottom { flex-shrink: 0; width: 100%; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 0 12px; }
        .rail-item { position: relative; width: 100%; display: flex; justify-content: center; }
        .rail-tile { position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px; width: 72px; padding: 9px 0 8px; border-radius: 16px; border: none; background: none; color: #52525b; text-decoration: none; cursor: pointer; font: inherit; transition: background .15s, color .15s, box-shadow .15s; }
        .rail-tile:hover { background: rgba(0,0,0,.045); color: #18181b; }
        .rail-tile.on { background: #fff; color: var(--coral); box-shadow: 0 0 0 1px rgba(0,0,0,.07), 0 1px 3px rgba(0,0,0,.06); }
        .rail-tile:focus-visible { outline: 2px solid var(--coral); outline-offset: 1px; }
        .rail-ic { position: relative; display: flex; transition: transform .16s cubic-bezier(.22,1,.36,1); }
        .rail-tile:hover .rail-ic { transform: scale(1.06); }
        .rail-tile:active .rail-ic { transform: scale(.94); }
        .rail-label { font-size: 11.5px; line-height: 14px; font-weight: 600; color: #52525b; letter-spacing: -0.005em; white-space: nowrap; }
        .rail-tile.on .rail-label { color: #111; font-weight: 700; }
        .rail-badge { position: absolute; top: -6px; left: 14px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; border: 2px solid #f4f4f6; color: #fff; font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: center; box-sizing: border-box; }
        .rail-tile.on .rail-badge { border-color: #fff; }
        /* The panel beside the rail. Fixed, so the rail's scrolling can't clip it;
           it starts at the rail's edge and its padding is a bridge. Which one
           is open is timed in code (see the top of this file). */
        .rail-fly { position: fixed; left: ${RAIL_W - 1}px; top: var(--fly-top, 64px); z-index: 80; padding-left: 9px; visibility: hidden; opacity: 0; transform: translateX(-8px) scale(.98); transform-origin: left top; pointer-events: none;
          transition: opacity .16s ease, transform .22s cubic-bezier(.22,1,.36,1), visibility 0s linear .16s; }
        .rail-item.open .rail-fly { visibility: visible; opacity: 1; transform: none; pointer-events: auto; z-index: 81;
          transition: opacity .2s ease, transform .34s cubic-bezier(.22,1,.36,1), visibility 0s; }
        .rail-fly-card { min-width: 232px; max-width: 280px; max-height: calc(100vh - 80px); overflow-y: auto; padding: 8px; border-radius: 18px; background: #fff; box-shadow: 0 16px 44px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.05); }
        .rail-fly-title { margin: 0; padding: 8px 10px 6px; font-size: 15px; font-weight: 700; color: #111; letter-spacing: -0.01em; }
        .rail-fly-group { margin: 6px 0 0; padding: 10px 10px 4px; border-top: 1px solid #f0f0f2; font-size: 12.5px; font-weight: 500; color: #8e8e93; }
        .rail-fly-row { display: flex; align-items: center; gap: 11px; margin-bottom: 2px; padding: 8px 10px; border-radius: 10px; color: #3f3f46; text-decoration: none; font-size: 14.5px; font-weight: 500; transition: background .12s; }
        .rail-fly-row:hover { background: #f7f7f8; color: #111; }
        .rail-fly-row.on { background: #efeff1; color: #111; font-weight: 650; }
        .rail-fly-row:focus-visible { outline: none; box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--coral) 40%, transparent); }
        .rail-fly-ic { display: flex; color: #71717a; flex-shrink: 0; }
        .rail-fly-ic svg { width: 17px; height: 17px; }
        .rail-fly-row.on .rail-fly-ic { color: var(--coral); }
        .rail-fly-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .rail-fly-count { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
        /* When the sections don't all fit, a soft fade shows there's more. */
        .rail-mid.fade-bottom { -webkit-mask-image: linear-gradient(#000 calc(100% - 28px), transparent); mask-image: linear-gradient(#000 calc(100% - 28px), transparent); }
        .rail-mid.fade-top { -webkit-mask-image: linear-gradient(transparent, #000 28px); mask-image: linear-gradient(transparent, #000 28px); }
        .rail-mid.fade-top.fade-bottom { -webkit-mask-image: linear-gradient(transparent, #000 28px, #000 calc(100% - 28px), transparent); mask-image: linear-gradient(transparent, #000 28px, #000 calc(100% - 28px), transparent); }
        /* Shorter screens: tighter tiles, and Upgrade steps aside (Billing is under Settings). */
        @media (max-height: 860px) {
          .rail-tile { padding: 6px 0 5px; gap: 3px; }
          .rail-ic svg { width: 22px; height: 22px; }
          .rail-top { padding: 8px 0 6px; gap: 8px; }
          .rail-upgrade { display: none !important; }
        }
        /* The phone's status pill: in the middle of the top bar, clear of the
           rail and the Settings menu. */
        .cv-phone-pill { top: calc(15px + var(--imp-h, 0px)); bottom: auto !important; left: 50% !important; transform: translateX(-50%); z-index: 70 !important; }
        /* The rail runs the full height with the workspace logo at the very top,
           and the top bar starts beside it. */
        @media (min-width: 861px) {
          .admin-rail { top: var(--imp-h, 0px); z-index: 45; }
          .rail-top { padding-top: 6px; }
          /* The top bar is a panel beside the rail with a rounded top-left
             corner (like Sellio): the rail's grey shows round the curve, and
             the rail's edge line starts below the bar. */
          body:has(.admin-rail) .cv-app-header { margin-left: ${RAIL_W}px; padding-left: 0; border-top-left-radius: 22px; background: #fff; }
          body:has(.admin-rail)::before { content: ''; position: fixed; left: ${RAIL_W}px; top: var(--imp-h, 0px); width: 24px; height: 24px; background: #f4f4f6; z-index: 39; pointer-events: none; }
          .admin-rail::after { content: ''; position: absolute; top: 0; right: -1px; width: 1px; height: 56px; background: #f4f4f6; pointer-events: none; }
        }
        @media (max-width: 860px) { .admin-rail { display: none; } }
        @media (prefers-reduced-motion: reduce) { .rail-fly, .rail-ic, .rail-scrim { transition: none !important; } }
      `}</style>
      <div className="rail-scrim" aria-hidden />
      <div className="rail-top">{workspace}</div>
      <nav className="rail-mid" ref={mid} onScroll={fades}>
        {sections.map(s => <RailEntry key={s.key} s={s} open={open === s.key} aim={aim} onLocked={onLocked} />)}
      </nav>
      <div className="rail-bottom">
        {upgrade && (
          <Link href={upgrade} className="rail-tile rail-upgrade" style={{ color: 'var(--coral)' }}>
            <span className="rail-ic"><RailGlyph name="upgrade" /></span>
            <span className="rail-label" style={{ color: 'var(--coral)' }}>Upgrade</span>
          </Link>
        )}
        {ring}
        <button type="button" className="rail-tile" onClick={search} title="Search (⌘K)">
          <span className="rail-ic"><RailGlyph name="search" /></span>
          <span className="rail-label">Search</span>
        </button>
        {settings && <RailEntry s={settings} open={open === settings.key} aim={aim} onLocked={onLocked} />}
        <div id="rail-account-slot" className="rail-acct" />
      </div>
    </aside>
  )
}
