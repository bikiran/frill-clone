// Getting people back to the setup checklist after they connect something.
//
// The checklist (app/admin/page.tsx) links each step to the settings page that
// connects it with `?returnTo=/admin?setup=1`. That page then:
//   • hands the path to its connect flow where the flow can take it (Gmail,
//     Facebook/Instagram), so the provider sends them straight back; and
//   • shows a "Back to setup" bar (components/SetupReturnBar) for flows that
//     must finish on their own page first (Shopify's first import, the phone
//     number checkout), remembered for this tab so it survives the round trip.
//
// Only a same-site relative path inside the admin is ever accepted. This file
// is shared by the browser and the server (the Meta connect routes), so it must
// not touch `window` at import time.

export const SETUP_HOME = '/admin?setup=1'

// Steps a business may say it doesn't use (in onboarding, or "Skip" on the
// checklist). The other steps apply to everyone.
export const SKIPPABLE_STEPS = ['email', 'meta', 'store', 'phone'] as const

const STORE_KEY = 'colvy-setup-return'
const TTL_MS = 2 * 3600_000

// The pages the checklist's steps open (components/setup-steps), which is also
// where their connect flows come back to. The remembered way back only counts
// on these; anywhere else in the admin, the setup trip is over.
const SETUP_PAGES = [
  '/admin/crm-settings/channels/email',
  '/admin/crm-settings/channels/meta',
  '/admin/integrations/shopify',
  '/admin/integrations/woocommerce',
  '/admin/crm-settings/channels/calls',
  '/admin/contacts',
  '/admin/team',
  '/admin/crm-settings/auto-replies',
]

/** Is this admin path one of the pages a setup step opens? */
export function isSetupPage(pathname: string): boolean {
  return SETUP_PAGES.some(p => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * The path itself if it's a relative path inside the admin ("/admin",
 * "/admin?setup=1", "/admin/team?x=1"), else ''. Rejects absolute and
 * protocol-relative URLs, backslashes and control characters, so it can never
 * send anyone (or a fresh session) to another site.
 */
export function safeSetupPath(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const s = raw
  if (!s || s.length > 600) return ''
  if (!s.startsWith('/admin')) return ''
  if (!/^\/admin(?:[/?#]|$)/.test(s)) return ''
  if (/[\\\s]/.test(s)) return ''
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c < 32 || c === 127) return '' }
  try {
    const base = 'https://setup.invalid'
    const u = new URL(s, base)
    if (u.origin !== base) return ''
    if (!/^\/admin(?:\/|$)/.test(u.pathname) || u.pathname.includes('//')) return ''
    return `${u.pathname}${u.search}`
  } catch { return '' }
}

/** `href` with `returnTo` added (keeps any query it already has). */
export function withReturnTo(href: string, returnTo: string = SETUP_HOME): string {
  const path = safeSetupPath(returnTo)
  if (!path) return href
  return `${href}${href.includes('?') ? '&' : '?'}returnTo=${encodeURIComponent(path)}`
}

/** Join extra query params onto a path that may already have some. */
export function addQuery(path: string, query: string): string {
  if (!query) return path
  return `${path}${path.includes('?') ? '&' : '?'}${query}`
}

// ── Browser only ─────────────────────────────────────────────────────────────

/** Remember (for this tab) where "Back to setup" goes. */
export function rememberSetupReturn(path: string) {
  const p = safeSetupPath(path)
  if (!p) return
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ path: p, at: Date.now() })) } catch {}
}

export function clearSetupReturn() {
  try { sessionStorage.removeItem(STORE_KEY) } catch {}
}

/** What this tab remembered from earlier in the setup trip, or ''. */
export function readSetupReturn(): string {
  if (typeof window === 'undefined') return ''
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null')
    if (saved && Date.now() - Number(saved.at || 0) < TTL_MS) return safeSetupPath(saved.path)
  } catch {}
  return ''
}

/**
 * Where this page should send people back to when they're mid-setup: the
 * page's own `?returnTo=` (remembered for the tab), else — on a setup step's
 * page — what this tab remembered from earlier in the flow, else ''. Call it
 * from an event handler.
 */
export function currentSetupReturn(): string {
  if (typeof window === 'undefined') return ''
  const fromUrl = safeSetupPath(new URLSearchParams(window.location.search).get('returnTo'))
  if (fromUrl) { rememberSetupReturn(fromUrl); return fromUrl }
  return isSetupPage(window.location.pathname) ? readSetupReturn() : ''
}
