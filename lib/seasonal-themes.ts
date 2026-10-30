// Seasonal themes (Settings → Theme → Seasonal themes): Halloween now,
// Christmas next. A theme dresses the app up (components/seasons) while it's
// on: always, or between two dates every year. The workspace's choice is saved
// with the rest of its look (site_settings 'general' → seasonal); anyone can
// still turn the effects off on their own device.
//
// This file also owns the html attributes the look hangs on: data-theme (light
// or dark, from Theme appearance, or dark while a "night" theme runs) and
// data-season (the running theme's id). AppChrome feeds it the saved settings;
// the Settings page feeds it edits as they happen, so changes show at once.

export type SeasonId = 'halloween' | 'christmas'

export type SeasonDef = {
  id: SeasonId
  name: string
  blurb: string
  /** Default dates, MM-DD, every year. */
  from: string
  to: string
  /** Switch to dark mode while it runs (the theme can be dressed for night). */
  night: boolean
  /** Built yet? Ones that aren't show as "Coming soon". */
  ready: boolean
}

export const SEASONS: SeasonDef[] = [
  { id: 'halloween', name: 'Halloween', blurb: 'Lightning, bats, fog and glowing jack-o’-lanterns.', from: '10-15', to: '11-01', night: true, ready: true },
  { id: 'christmas', name: 'Christmas', blurb: 'Falling snow, fairy lights and a cosy glow.', from: '12-01', to: '12-26', night: false, ready: false },
]

export type SeasonPrefs = {
  on: boolean
  /** 'always' while on, or only between from and to each year. */
  when: 'always' | 'schedule'
  from: string
  to: string
  night: boolean
  /** Also on the public board and help centre (not only the team's admin). */
  customers: boolean
}
export type SeasonalConfig = Partial<Record<SeasonId, Partial<SeasonPrefs>>>

export function seasonPrefs(cfg: SeasonalConfig | null | undefined, id: SeasonId): SeasonPrefs {
  const def = SEASONS.find(s => s.id === id)!
  const p = cfg?.[id] || {}
  const md = (v: unknown, d: string) => typeof v === 'string' && /^\d\d-\d\d$/.test(v) ? v : d
  return {
    on: !!p.on,
    when: p.when === 'always' ? 'always' : 'schedule',
    from: md(p.from, def.from),
    to: md(p.to, def.to),
    night: typeof p.night === 'boolean' ? p.night : def.night,
    customers: !!p.customers,
  }
}

const mdNum = (md: string) => { const [m, d] = md.split('-').map(Number); return m * 100 + d }
/** Is the date between from and to (MM-DD, inclusive)? Wraps past New Year (12-20 → 01-05). */
export function inWindow(from: string, to: string, now = new Date()) {
  const t = (now.getMonth() + 1) * 100 + now.getDate(), f = mdNum(from), e = mdNum(to)
  return f <= e ? t >= f && t <= e : t >= f || t <= e
}
/** The next date the window opens (today if it opens today). */
export function nextStart(from: string, now = new Date()) {
  const [m, d] = from.split('-').map(Number)
  const start = new Date(now.getFullYear(), m - 1, d)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (start < today) start.setFullYear(start.getFullYear() + 1)
  return start
}
/** The date the current run ends (from an MM-DD), on or after today. */
export function runEnd(to: string, now = new Date()) {
  const [m, d] = to.split('-').map(Number)
  const end = new Date(now.getFullYear(), m - 1, d)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (end < today) end.setFullYear(end.getFullYear() + 1)
  return end
}

// Public pages that never get dressed up: the chat widget and forms live on
// customers' own websites, and checkout and sign-in should stay plain.
const PLAIN = ['/widget', '/embed', '/pay/', '/oauth', '/auth', '/u/', '/f/', '/forms/', '/book', '/signin', '/signup', '/reset-password', '/forgot-password', '/platform-admin']
const isTeamPath = (path: string) => path === '/admin' || path.startsWith('/admin/')

export type ActiveSeason = { def: SeasonDef; prefs: SeasonPrefs }

/** The theme running now on this page, if any. Dated themes win over always-on ones. */
export function activeSeason(cfg: SeasonalConfig | null | undefined, opts: { path: string; now?: Date; preview?: SeasonId | null; deviceOff?: boolean }): ActiveSeason | null {
  const { path, now = new Date() } = opts
  if (PLAIN.some(p => path.startsWith(p))) return null
  const team = isTeamPath(path)
  if (opts.preview && team) {
    const def = SEASONS.find(s => s.id === opts.preview && s.ready)
    if (def) return { def, prefs: { ...seasonPrefs(cfg, def.id), on: true } }
  }
  if (opts.deviceOff) return null
  let always: ActiveSeason | null = null
  for (const def of SEASONS) {
    if (!def.ready) continue
    const prefs = seasonPrefs(cfg, def.id)
    if (!prefs.on || (!team && !prefs.customers)) continue
    if (prefs.when === 'schedule') { if (inWindow(prefs.from, prefs.to, now)) return { def, prefs } }
    else if (!always) always = { def, prefs }
  }
  return always
}

// ── This device ──────────────────────────────────────────────────────────────
const OFF_KEY = 'colvy-season-off'
export function deviceSeasonOff() {
  try { return localStorage.getItem(OFF_KEY) === '1' } catch { return false }
}
export function setDeviceSeasonOff(off: boolean) {
  try { if (off) localStorage.setItem(OFF_KEY, '1'); else localStorage.removeItem(OFF_KEY) } catch {}
  setAppearance({})
}

// ── The look (html attributes) ───────────────────────────────────────────────
type Appearance = { themeMode: string; seasonal: SeasonalConfig; preview: SeasonId | null }
let state: Appearance = { themeMode: 'light', seasonal: {}, preview: null }
const subs = new Set<() => void>()

export const getAppearance = () => state
export function subscribeAppearance(fn: () => void) { subs.add(fn); return () => { subs.delete(fn) } }

/** The season running for this page right now (with this device's choice). */
export function currentSeason(path = typeof location === 'undefined' ? '/' : location.pathname) {
  return activeSeason(state.seasonal, { path, preview: state.preview, deviceOff: deviceSeasonOff() })
}

export function setAppearance(next: Partial<Appearance>) {
  state = { ...state, ...next }
  if (typeof document === 'undefined') return
  const html = document.documentElement
  const season = currentSeason()
  let mode = state.themeMode || 'light'
  if (season?.prefs.night) mode = 'dark'
  else if (mode === 'auto') mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  if (mode === 'dark') html.setAttribute('data-theme', 'dark')
  else html.removeAttribute('data-theme')
  if (season) html.setAttribute('data-season', season.def.id)
  else html.removeAttribute('data-season')
  subs.forEach(fn => fn())
}

/** Play the theme for a little while (Settings → Preview), even if it's off. */
let previewTimer: ReturnType<typeof setTimeout> | null = null
export function previewSeason(id: SeasonId, ms = 20000) {
  if (previewTimer) clearTimeout(previewTimer)
  setAppearance({ preview: id })
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('colvy-season-preview', { detail: id }))
  previewTimer = setTimeout(() => { previewTimer = null; setAppearance({ preview: null }) }, ms)
}
