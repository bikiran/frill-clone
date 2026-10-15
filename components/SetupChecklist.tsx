'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { track, type ColvyEvent } from '@/lib/analytics'
import type { SetupStatus, SetupStepKey } from '@/lib/setup-status'
import { SETUP_HOME, SKIPPABLE_STEPS, withReturnTo } from '@/lib/setup-return'
import { setupSteps, CheckMark, HourglassIcon, ArrowRight } from '@/components/setup-steps'

// ── Setup checklist (dashboard) ───────────────────────────────────────────────
// The seven things that make Colvy useful, each ticked from what's really
// connected (GET /api/setup/status) — never from a box someone ticked. Every
// step has one button to the page that connects it, carrying
// `returnTo=/admin?setup=1` so the connect flow (or the "Back to setup" bar)
// brings them straight back here, where the new tick gets a little celebration.
//
// Kept on this device only: "Hide", steps the business said it doesn't use
// ("Skip", or unticked in /onboarding), and which ticks it has already seen —
// so a celebration and its analytics event happen once.

export type SetupLink = {
  /** Arrived via /admin?setup=1 (back from a connect flow, or from onboarding). */
  open: boolean
  /** Steps unticked in onboarding's "what do you use?" (?skip=store,phone). */
  skip: SetupStepKey[]
  /** A connect flow that came back with an error. */
  notice: string
}

/** What the dashboard URL says about setup. Browser only. */
export function readSetupLink(): SetupLink {
  const none: SetupLink = { open: false, skip: [], notice: '' }
  if (typeof window === 'undefined') return none
  try {
    const p = new URLSearchParams(window.location.search)
    if (p.get('setup') !== '1') return none
    const skippable: readonly string[] = SKIPPABLE_STEPS
    const skip = (p.get('skip') || '').split(',').map(s => s.trim()).filter(s => skippable.includes(s)) as SetupStepKey[]
    let notice = ''
    if (p.get('gmail') === 'error') {
      const why = (p.get('reason') || '').replace(/_/g, ' ').slice(0, 120)
      notice = `Google sign-in didn’t finish${why ? ` (${why})` : ''}. Give “Connect email” another go.`
    }
    return { open: true, skip, notice }
  } catch { return none }
}

export type Prefs = { hidden: boolean; skipped: SetupStepKey[]; seen: SetupStepKey[] | null; completed: boolean }
const prefsKey = (companyId: string) => `colvy-setup-v2-${companyId}`
// The checklist before this one (the feedback-board steps) kept { done, hidden }
// here. Whoever hid that one said they don't want a setup checklist on their
// dashboard, so this one starts hidden for them too (?setup=1 still opens it).
const oldPrefsKey = (companyId: string) => `colvy-setup-${companyId}`
function readPrefs(companyId: string): Prefs {
  const blank: Prefs = { hidden: false, skipped: [], seen: null, completed: false }
  if (typeof window === 'undefined') return blank
  try {
    const raw = localStorage.getItem(prefsKey(companyId))
    if (raw == null) {
      const old = JSON.parse(localStorage.getItem(oldPrefsKey(companyId)) || 'null')
      return old && old.hidden === true ? { ...blank, hidden: true } : blank
    }
    const v = JSON.parse(raw)
    if (!v || typeof v !== 'object') return blank
    return {
      hidden: v.hidden === true,
      skipped: Array.isArray(v.skipped) ? v.skipped : [],
      seen: Array.isArray(v.seen) ? v.seen : null,
      completed: v.completed === true,
    }
  } catch { return blank }
}
function writePrefs(companyId: string, p: Prefs) {
  try { localStorage.setItem(prefsKey(companyId), JSON.stringify(p)) } catch { /* private mode — fine */ }
}

// One analytics event per step, the first time this browser sees it done.
const STEP_EVENT: Record<SetupStepKey, [ColvyEvent, Record<string, string>]> = {
  email: ['channel_connected', { channel: 'email' }],
  meta: ['channel_connected', { channel: 'facebook_instagram' }],
  store: ['store_connected', {}],
  phone: ['number_purchased', {}],
  customers: ['customers_added', {}],
  team: ['team_invited', {}],
  automation: ['automation_enabled', {}],
}
// Only young workspaces count towards "how long does setup take", so an
// established business opening the new checklist doesn't skew it.
const TRACK_MAX_AGE_DAYS = 30

/**
 * Whether the dashboard should fetch fresh setup numbers. Not when this device
 * has the checklist hidden or finished and the workspace is past the age where
 * ticks are counted (going by `last`, the numbers it last had): nothing would
 * show or be tracked. Arriving via ?setup=1 always checks.
 */
export function setupWorthLoading(companyId: string, last: Pick<SetupStatus, 'ageDays'> | null | undefined, link: SetupLink): boolean {
  if (link.open) return true
  const p = readPrefs(companyId)
  if (!p.hidden && !p.completed) return true
  return !(last && last.ageDays != null && last.ageDays > TRACK_MAX_AGE_DAYS)
}

const sinceSignup = (s: SetupStatus) => {
  const t = s.createdAt ? Date.parse(s.createdAt) : NaN
  return isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 60000)) : null
}

/**
 * The bookkeeping after a load, as a pure function (tested on its own):
 * fold onboarding's skips in and un-hide when they arrived via ?setup=1, then
 * — for numbers from the server — note newly seen ticks and which analytics
 * events that earns (only for workspaces young enough to measure setup time).
 */
export function settleProgress(prev: Prefs, status: SetupStatus, o: { fresh: boolean; applyLink: boolean; linkSkip: SetupStepKey[] }):
  { prefs: Prefs; events: [ColvyEvent, Record<string, unknown>][]; changed: boolean } {
  const p: Prefs = { ...prev, skipped: [...prev.skipped], seen: prev.seen ? [...prev.seen] : null }
  const events: [ColvyEvent, Record<string, unknown>][] = []
  let changed = false
  if (o.applyLink) {
    if (p.hidden) { p.hidden = false; changed = true }
    const add = o.linkSkip.filter(k => !p.skipped.includes(k))
    if (add.length) { p.skipped = [...p.skipped, ...add]; changed = true }
  }
  if (o.fresh) {
    const seen = new Set<SetupStepKey>(p.seen || [])
    const young = status.ageDays != null && status.ageDays <= TRACK_MAX_AGE_DAYS
    const mins = sinceSignup(status)
    for (const st of status.steps) {
      if (st.state !== 'done' || seen.has(st.key)) continue
      seen.add(st.key); changed = true
      if (young) {
        const [ev, props] = STEP_EVENT[st.key]
        events.push([ev, { ...props, ...(st.key === 'store' ? { store: status.store } : {}), step: st.key, minutes_since_signup: mins }])
      }
    }
    if (p.seen === null) changed = true
    p.seen = Array.from(seen)
    // Done, or skipped and never started. A step waiting on approval isn't done.
    const allDone = status.steps.length > 0 && status.steps.every(st => st.state === 'done' || (st.state === 'todo' && p.skipped.includes(st.key)))
    if (allDone && !p.completed) {
      p.completed = true; changed = true
      if (young) events.push(['setup_completed', { minutes_since_signup: mins, skipped: p.skipped.join(',') }])
    }
  }
  return { prefs: p, events, changed }
}

export default function SetupChecklist({ companyId, status, fresh, prominent, link }: {
  companyId: string
  status: SetupStatus
  /** True once the numbers come from the server (not this device's cache). */
  fresh: boolean
  /** New workspace or arrived via ?setup=1: open, at the top of the page. */
  prominent: boolean
  link: SetupLink
}) {
  // Arriving via ?setup=1 un-hides it (saved by settleProgress below), but
  // "Hide" on that same visit still hides it.
  const [prefs, setPrefs] = useState<Prefs>(() => {
    const p = readPrefs(companyId)
    return link.open ? { ...p, hidden: false } : p
  })
  // Ticks seen before this visit. With none on record, nothing is "new" —
  // except when they've just come back from setting something up.
  const [baseline] = useState<SetupStepKey[] | null>(() => prefs.seen ?? (link.open ? [] : null))
  const [open, setOpen] = useState(prominent)
  const [showSkipped, setShowSkipped] = useState(false)
  const [dismissedCheer, setDismissedCheer] = useState(false)
  // Onboarding's skips from the URL, until they're saved (or added back).
  const [linkSkip, setLinkSkip] = useState<SetupStepKey[]>(link.skip)

  const metas = setupSteps(status)
  const byKey = new Map(status.steps.map(s => [s.key, s]))
  const skipped = new Set<SetupStepKey>([...prefs.skipped, ...linkSkip])
  const stateOf = (k: SetupStepKey) => byKey.get(k)?.state || 'todo'
  // A step that's done counts as done even if it was skipped.
  const counted = metas.filter(m => !skipped.has(m.key) || stateOf(m.key) === 'done')
  const doneKeys = metas.filter(m => stateOf(m.key) === 'done').map(m => m.key)
  const done = counted.filter(m => stateOf(m.key) === 'done').length
  const total = counted.length
  const complete = done === total
  const newly = fresh && baseline ? doneKeys.filter(k => !baseline.includes(k)) : []
  // Where the progress bar and ring animate from: the ticks seen last time
  // (so a new tick visibly fills in), or empty on the very first look.
  const prevDone = baseline ? counted.filter(m => baseline.includes(m.key) && stateOf(m.key) === 'done').length : 0
  const nextUp = counted.find(m => stateOf(m.key) === 'todo')
  const minutesLeft = counted.filter(m => stateOf(m.key) === 'todo').reduce((a, m) => a + m.minutes, 0)
  const waiting = counted.some(m => stateOf(m.key) === 'waiting')

  // Save what came in from the URL (once), record the ticks seen, and fire
  // each step's analytics event once. Side effects only — the screen is
  // worked out above from props and the stored prefs.
  const linkApplied = useRef(false)
  useEffect(() => {
    const applyLink = link.open && !linkApplied.current
    linkApplied.current = linkApplied.current || link.open
    const { prefs: next, events, changed } = settleProgress(readPrefs(companyId), status, { fresh, applyLink, linkSkip: link.skip })
    if (applyLink) { try { window.history.replaceState(null, '', '/admin') } catch {} }
    if (changed) writePrefs(companyId, next)
    for (const [ev, props] of events) track(ev, props)
  }, [companyId, fresh, status, link])

  const update = (patch: Partial<Prefs>) => {
    const next = { ...readPrefs(companyId), ...patch }
    writePrefs(companyId, next); setPrefs(next)
  }
  const skip = (k: SetupStepKey) => update({ skipped: Array.from(new Set([...prefs.skipped, ...linkSkip, k])) })
  const unskip = (k: SetupStepKey) => {
    // It may have come from onboarding in this page's URL too — drop it there as well.
    setLinkSkip(xs => xs.filter(x => x !== k))
    update({ skipped: readPrefs(companyId).skipped.filter(x => x !== k) })
  }

  const cheering = newly.length > 0 && !dismissedCheer
  if (prefs.hidden) return null
  // Finished and nothing new to celebrate: out of the way.
  if (complete && !cheering && !link.open) return null

  const pct = total ? Math.round((done / total) * 100) : 0
  const fromPct = total ? Math.round((prevDone / total) * 100) : 0
  const R = 20, C = 2 * Math.PI * R
  const newTitle = newly.length === 1 ? (metas.find(m => m.key === newly[0])?.doneTitle || 'Step done') : `${newly.length} steps ticked off`
  const skippedList = metas.filter(m => skipped.has(m.key) && stateOf(m.key) !== 'done')

  return (
    <section className={`sc ${prominent ? 'sc-top' : ''}`} aria-label="Setup checklist">
      <style>{`
        .sc { background: var(--card, #fff); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; margin-bottom: 32px; }
        .sc-top { box-shadow: 0 1px 2px rgba(16,24,40,.04), 0 6px 24px -12px rgba(16,24,40,.18); }
        .sc-head { display: flex; align-items: center; gap: 14px; padding: 16px 20px; }
        .sc-toggle { flex: 1; min-width: 0; display: flex; align-items: center; gap: 14px; background: none; border: 0; padding: 0; text-align: left; cursor: pointer; color: inherit; font: inherit; }
        .sc-ring { position: relative; width: 52px; height: 52px; flex-shrink: 0; }
        .sc-ring svg { transform: rotate(-90deg); }
        .sc-ring-fill { transition: stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1); animation: sc-ring .9s cubic-bezier(.2,.8,.2,1) both; }
        @keyframes sc-ring { from { stroke-dashoffset: var(--from); } }
        .sc-ring-num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; color: var(--ink); font-variant-numeric: tabular-nums; }
        .sc-title { display: block; margin: 0; font-size: 16px; font-weight: 800; color: var(--ink); line-height: 1.25; }
        .sc-sub { display: block; margin: 3px 0 0; font-size: 13px; color: var(--slate); line-height: 1.4; }
        .sc-bar { display: block; height: 6px; border-radius: 99px; background: var(--canvas); margin-top: 9px; max-width: 320px; overflow: hidden; }
        .sc-fill { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--coral), #f59e0b); transition: width .8s cubic-bezier(.2,.8,.2,1); animation: sc-grow .9s cubic-bezier(.2,.8,.2,1) both; }
        @keyframes sc-grow { from { width: var(--from); } }
        .sc-chev { color: var(--slate); flex-shrink: 0; transition: transform .2s ease; }
        .sc-chev.is-open { transform: rotate(90deg); }
        .sc-hide { font-size: 12.5px; font-weight: 600; color: var(--slate); background: none; border: 0; padding: 7px 10px; border-radius: 8px; cursor: pointer; flex-shrink: 0; }
        .sc-hide:hover { background: var(--canvas); }
        .sc-continue { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 10px; background: var(--coral); color: #fff; font-size: 13px; font-weight: 700; text-decoration: none; white-space: nowrap; flex-shrink: 0; }
        .sc-cheer { position: relative; display: flex; align-items: center; gap: 12px; margin: 0 20px 14px; padding: 12px 14px; border-radius: 12px; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; font-size: 13.5px; line-height: 1.4; overflow: hidden; animation: sc-in .45s cubic-bezier(.2,.8,.2,1) both; }
        .sc-cheer strong { font-weight: 800; }
        .sc-cheer-x { margin-left: auto; background: none; border: 0; color: #047857; cursor: pointer; padding: 4px; border-radius: 6px; flex-shrink: 0; }
        .sc-burst { position: relative; width: 30px; height: 30px; flex-shrink: 0; }
        .sc-burst-core { position: absolute; inset: 3px; border-radius: 50%; background: #10b981; display: flex; align-items: center; justify-content: center; animation: sc-pop .5s cubic-bezier(.3,1.6,.5,1) both; }
        .sc-burst i { position: absolute; left: 13px; top: 13px; width: 5px; height: 5px; border-radius: 2px; opacity: 0; animation: sc-fly .9s ease-out .15s both; }
        @keyframes sc-pop { from { transform: scale(.2); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes sc-fly { 0% { opacity: 1; transform: translate(0,0) rotate(0); } 100% { opacity: 0; transform: translate(var(--x), var(--y)) rotate(160deg); } }
        @keyframes sc-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
        .sc-notice { margin: 0 20px 14px; padding: 10px 14px; border-radius: 10px; background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; font-size: 13px; line-height: 1.45; }
        .sc-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--border); }
        .sc-row { display: grid; grid-template-columns: 36px minmax(0,1fr) auto; gap: 4px 14px; align-items: center; padding: 14px 20px; transition: background .3s ease; }
        .sc-row + .sc-row { border-top: 1px solid var(--border); }
        .sc-row.is-next { background: var(--peach); }
        .sc-row.is-new { animation: sc-glow 1.8s ease-out both; }
        @keyframes sc-glow { 0% { background: #d1fae5; } 100% { background: transparent; } }
        .sc-dot { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--canvas); color: var(--slate); }
        .sc-row.is-next .sc-dot { background: #fff1ec; color: var(--coral); }
        .sc-dot.is-done { background: #10b981; color: #fff; }
        .sc-row.is-new .sc-dot.is-done { animation: sc-pop .5s cubic-bezier(.3,1.6,.5,1) both; }
        .sc-dot.is-waiting { background: #fffbeb; color: #b45309; }
        .sc-step { margin: 0; font-size: 14px; font-weight: 700; color: var(--ink); line-height: 1.3; }
        .sc-row.is-done .sc-step { color: var(--slate); font-weight: 600; }
        .sc-desc { margin: 2px 0 0; font-size: 12.5px; color: var(--slate); line-height: 1.45; }
        .sc-badge { display: inline-flex; align-items: center; gap: 5px; margin-top: 5px; font-size: 11.5px; font-weight: 700; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 99px; padding: 2px 9px; }
        .sc-actions { display: flex; align-items: center; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
        .sc-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 14px; border-radius: 10px; font-size: 13px; font-weight: 700; text-decoration: none; white-space: nowrap; border: 1px solid var(--border); color: var(--ink); background: var(--card, #fff); }
        .sc-btn:hover { background: var(--canvas); }
        .sc-btn.is-primary { background: var(--coral); border-color: var(--coral); color: #fff; }
        .sc-btn.is-primary:hover { filter: brightness(.96); }
        .sc-link { font-size: 12.5px; font-weight: 600; color: var(--coral); text-decoration: none; white-space: nowrap; }
        .sc-skip { font-size: 12px; font-weight: 600; color: var(--slate); background: none; border: 0; padding: 6px 4px; cursor: pointer; }
        .sc-skip:hover { color: var(--ink); text-decoration: underline; }
        .sc-foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 11px 20px; border-top: 1px solid var(--border); font-size: 12.5px; color: var(--slate); background: var(--canvas); }
        .sc-skipped { list-style: none; margin: 0; padding: 0 20px 12px; background: var(--canvas); }
        .sc-skipped li { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 0; font-size: 13px; color: var(--slate); }
        @media (max-width: 640px) {
          .sc-head { padding: 14px 16px; gap: 10px; align-items: flex-start; flex-wrap: wrap; }
          .sc-continue { order: 3; width: 100%; justify-content: center; padding: 10px 14px; }
          .sc-row { grid-template-columns: 36px minmax(0,1fr); padding: 14px 16px; }
          .sc-actions { grid-column: 2; justify-content: flex-start; margin-top: 8px; }
          .sc-row.is-next .sc-btn.is-primary { flex: 1; }
          .sc-cheer, .sc-notice { margin-left: 16px; margin-right: 16px; }
          .sc-foot, .sc-skipped { padding-left: 16px; padding-right: 16px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .sc *, .sc { animation: none !important; transition: none !important; }
        }
      `}</style>

      <div className="sc-head">
        <button type="button" className="sc-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          <span className="sc-ring" aria-hidden="true">
            <svg width="52" height="52" viewBox="0 0 52 52">
              <circle cx="26" cy="26" r={R} fill="none" stroke="var(--canvas)" strokeWidth="5" />
              <circle className="sc-ring-fill" cx="26" cy="26" r={R} fill="none" stroke={complete ? '#10b981' : 'var(--coral)'} strokeWidth="5" strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)}
                style={{ ['--from' as string]: String(C * (1 - fromPct / 100)) }} />
            </svg>
            <span className="sc-ring-num">{done}/{total}</span>
          </span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span className="sc-title">{complete ? 'You’re all set up' : 'Get Colvy set up'}</span>
            <span className="sc-sub">
              {complete ? 'Everything’s connected. Customers can reach you everywhere, in one inbox.'
                : `${done} of ${total} done${minutesLeft ? ` · about ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} to go` : ''}${waiting ? ' · waiting on an approval' : ''}`}
            </span>
            <span className="sc-bar" aria-hidden="true">
              <span className="sc-fill" style={{ width: `${pct}%`, ['--from' as string]: `${fromPct}%` }} />
            </span>
          </span>
          <svg className={`sc-chev ${open ? 'is-open' : ''}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
        {!open && nextUp && (
          <Link href={withReturnTo(nextUp.href, SETUP_HOME)} className="sc-continue">
            {nextUp.cta} <ArrowRight size={14} />
          </Link>
        )}
        <button type="button" className="sc-hide" onClick={() => update({ hidden: true })}>{complete ? 'Done' : 'Hide'}</button>
      </div>

      {cheering && (
        <div className="sc-cheer" role="status">
          <span className="sc-burst" aria-hidden="true">
            {[['#ff7a6b', '-16px', '-14px'], ['#f59e0b', '15px', '-15px'], ['#3b82f6', '18px', '9px'], ['#10b981', '-17px', '11px'], ['#a855f7', '2px', '-20px'], ['#ff7a6b', '-3px', '19px']].map(([bg, x, y], i) => (
              <i key={i} style={{ background: bg, ['--x' as string]: x, ['--y' as string]: y }} />
            ))}
            <span className="sc-burst-core"><CheckMark size={15} color="#fff" /></span>
          </span>
          <span>
            <strong>{complete ? 'All done — Colvy is ready to go.' : `${newTitle}. Nice work!`}</strong>
            {!complete && nextUp && <> Next up: {nextUp.title}.</>}
          </span>
          <button type="button" className="sc-cheer-x" aria-label="Close" onClick={() => setDismissedCheer(true)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      )}

      {link.notice && open && <p className="sc-notice" role="alert">{link.notice}</p>}

      {open && (
        <>
          <ul className="sc-list">
            {counted.map(m => {
              const st = byKey.get(m.key)
              const state = st?.state || 'todo'
              const isDone = state === 'done'
              const isNext = nextUp?.key === m.key
              const isNew = newly.includes(m.key)
              const canSkip = state === 'todo' && (SKIPPABLE_STEPS as readonly string[]).includes(m.key)
              return (
                <li key={m.key} className={`sc-row ${isDone ? 'is-done' : ''} ${isNext ? 'is-next' : ''} ${isNew ? 'is-new' : ''}`}>
                  <span className={`sc-dot ${isDone ? 'is-done' : state === 'waiting' ? 'is-waiting' : ''}`} aria-hidden="true">
                    {isDone ? <CheckMark size={17} /> : state === 'waiting' ? <HourglassIcon size={17} /> : <m.Icon size={17} />}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <p className="sc-step">
                      {isDone ? m.doneTitle : m.title}
                      <span className="sr-only">{isDone ? ' (done)' : state === 'waiting' ? ' (waiting)' : ''}</span>
                    </p>
                    {isDone
                      ? (st?.detail && <p className="sc-desc">{st.detail}</p>)
                      : state === 'waiting'
                        ? <span className="sc-badge"><HourglassIcon size={12} /> {st?.detail || 'Waiting for approval'}</span>
                        : <p className="sc-desc">{st?.detail ? `${st.detail}. ` : ''}{m.desc}</p>}
                  </div>
                  <div className="sc-actions">
                    {isDone ? (
                      <Link href={m.href.split('?')[0]} className="sc-link">Manage</Link>
                    ) : (
                      <>
                        {canSkip && <button type="button" className="sc-skip" onClick={() => skip(m.key)}>Skip</button>}
                        {m.alt && state === 'todo' && <Link href={withReturnTo(m.alt.href, SETUP_HOME)} className="sc-link">{m.alt.label}</Link>}
                        <Link href={withReturnTo(m.href, SETUP_HOME)} className={`sc-btn ${isNext ? 'is-primary' : ''}`}>
                          {state === 'waiting' ? 'Check progress' : m.cta}
                          {isNext && <ArrowRight size={14} />}
                        </Link>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          {skippedList.length > 0 && (
            <>
              <div className="sc-foot">
                <span>{skippedList.length} skipped — you said you don’t use {skippedList.length === 1 ? 'it' : 'them'}.</span>
                <button type="button" className="sc-skip" onClick={() => setShowSkipped(v => !v)} aria-expanded={showSkipped}>{showSkipped ? 'Hide' : 'Show'}</button>
              </div>
              {showSkipped && (
                <ul className="sc-skipped">
                  {skippedList.map(m => (
                    <li key={m.key}>
                      <span>{m.title}</span>
                      <button type="button" className="sc-skip" onClick={() => unskip(m.key)}>Add back</button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}
