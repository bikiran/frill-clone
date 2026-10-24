// What Colvy's own analytics (PostHog, components/Analytics.tsx) may see.
//
// 1. Scope: only Colvy's marketing site and the Colvy app its customers sign
//    into are measured. A business's public pages (its board, booking,
//    payment, upload, form and media pages, on its subdomain, its own domain
//    or colvy.com/u/…) belong to that business's customers, not Colvy's
//    visitors, so nothing is sent from them.
// 2. Addresses: before an event leaves the browser, URLs lose the #fragment
//    (password-reset and sign-in links carry tokens there), every query
//    parameter except campaign tags, and any path segment that is a token or
//    an id.
// 3. Consent: anonymous by default; Do Not Track, Global Privacy Control and
//    the opt-out on the Privacy page all switch it off.

export type AnalyticsScope = 'marketing' | 'app' | null

// The signed-in Colvy app, on any host (businesses use it at
// <slug>.colvy.com/admin): measured, events tied to the workspace.
const APP_PREFIXES = ['/admin', '/onboarding', '/upgrade', '/profile', '/signin', '/signup', '/forgot-password', '/reset-password', '/team/join', '/drive-connect', '/oauth']
// A business's customer-facing pages: never measured, on any host.
const BUSINESS_PUBLIC_PREFIXES = ['/u/', '/pay/', '/m/', '/l/', '/n/', '/p/', '/r/', '/f/', '/forms/', '/polls/', '/surveys/', '/booking/', '/book/', '/widget', '/custom/', '/user/']
// The Super Admin console has its own analytics (this one) and isn't a visitor.
const NEVER_PREFIXES = ['/platform-admin']

const MARKETING_HOSTS = new Set(['colvy.com', 'www.colvy.com', 'localhost', '127.0.0.1'])
const isMarketingHost = (h: string) => MARKETING_HOSTS.has(h) || h.endsWith('.vercel.app')
const startsWithAny = (path: string, list: string[]) => list.some(raw => {
  const p = raw.replace(/\/$/, '')
  return path === p || path.startsWith(`${p}/`)
})

export function analyticsScope(hostname: string, pathname: string): AnalyticsScope {
  const host = String(hostname || '').toLowerCase().split(':')[0]
  const path = String(pathname || '/') || '/'
  if (host === 'admin.colvy.com' || startsWithAny(path, NEVER_PREFIXES)) return null
  if (startsWithAny(path, BUSINESS_PUBLIC_PREFIXES)) return null
  if (startsWithAny(path, APP_PREFIXES)) return 'app'
  // Everything else on colvy.com is the marketing site. On a business's
  // subdomain or own domain it's their board / help centre: not measured.
  return isMarketingHost(host) ? 'marketing' : null
}

// Campaign and click-id parameters are kept; everything else is dropped.
const KEEP_PARAMS = /^(utm_(source|medium|campaign|term|content|id)|gclid|gbraid|wbraid|fbclid|msclkid|ref|plan|billing)$/i
// A path segment that is an id or a token rather than a word: a UUID, a
// number, a short code mixing letters and digits ("vhiq14"), or a long random
// string. Readable slugs ("abandoned-cart-sms-woocommerce-shopify") stay.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)+$/
function isTokenish(s: string): boolean {
  if (UUID.test(s)) return true
  if (/^\d{4,}$/.test(s)) return true
  if (/^[A-Za-z0-9]{6,}$/.test(s) && /\d/.test(s) && /[A-Za-z]/.test(s)) return true
  if (/^[A-Za-z0-9_-]{20,}$/.test(s) && !SLUG.test(s)) return true
  return false
}

/** Path with ids and tokens replaced by ":id". */
export function cleanPath(pathname: string): string {
  return String(pathname || '/').split('/').map(seg => {
    if (!seg) return seg
    let s = seg
    try { s = decodeURIComponent(seg) } catch { /* keep as is */ }
    return isTokenish(s) ? ':id' : seg
  }).join('/') || '/'
}

/** A URL safe to send: no fragment, campaign parameters only, ids masked. */
export function cleanUrl(raw: unknown): unknown {
  if (typeof raw !== 'string' || !raw) return raw
  try {
    const u = new URL(raw)
    const kept = new URLSearchParams()
    u.searchParams.forEach((v, k) => { if (KEEP_PARAMS.test(k)) kept.set(k, v.slice(0, 120)) })
    const q = kept.toString()
    return `${u.origin}${cleanPath(u.pathname)}${q ? `?${q}` : ''}`
  } catch {
    // Not absolute: treat as a path.
    return cleanPath(String(raw).split(/[?#]/)[0])
  }
}

// PostHog properties that carry a URL or path.
const URL_KEYS = ['$current_url', '$referrer', '$initial_current_url', '$initial_referrer', '$prev_pageview_pathname', '$session_entry_url', '$session_entry_referrer']
const PATH_KEYS = ['$pathname', '$initial_pathname', '$session_entry_pathname', '$prev_pageview_pathname']

function cleanProps(props: Record<string, any> | undefined) {
  if (!props) return
  for (const k of URL_KEYS) if (k in props) props[k] = cleanUrl(props[k])
  for (const k of PATH_KEYS) if (typeof props[k] === 'string') props[k] = cleanPath(props[k])
  // Autocapture element chains can include hrefs (mailto:, tel:, links with ids).
  if (typeof props.$elements_chain === 'string') {
    props.$elements_chain = props.$elements_chain.replace(/attr__href="[^"]*"/g, m => {
      const href = m.slice(12, -1)
      return /^(mailto|tel|sms):/i.test(href) ? 'attr__href=""' : `attr__href="${cleanUrl(href.startsWith('/') ? `https://colvy.com${href}` : href)}"`
    })
  }
}

/**
 * PostHog `before_send`: drop events from pages Colvy doesn't measure, and
 * clean every URL on the rest. Returns null to drop.
 */
export function beforeSend(event: any): any {
  try {
    if (!event) return event
    const loc = typeof window !== 'undefined' ? window.location : null
    if (loc && !analyticsScope(loc.hostname, loc.pathname)) return null
    cleanProps(event.properties)
    cleanProps(event.$set)
    cleanProps(event.$set_once)
    if (event.properties) {
      event.properties.site = loc ? analyticsScope(loc.hostname, loc.pathname) : undefined
    }
    return event
  } catch { return null }
}

// ── Consent ──────────────────────────────────────────────────────────────────

export const OPT_OUT_KEY = 'colvy_analytics_opt_out'

/** The visitor has asked not to be measured (our opt-out, Do Not Track or GPC). */
export function analyticsOptedOut(): boolean {
  if (typeof window === 'undefined') return true
  try { if (window.localStorage.getItem(OPT_OUT_KEY) === '1') return true } catch { /* storage blocked */ }
  const nav: any = window.navigator || {}
  if (nav.globalPrivacyControl === true) return true
  const dnt = nav.doNotTrack || (window as any).doNotTrack || nav.msDoNotTrack
  return dnt === '1' || dnt === 'yes'
}

export function setAnalyticsOptOut(out: boolean) {
  try { if (out) window.localStorage.setItem(OPT_OUT_KEY, '1'); else window.localStorage.removeItem(OPT_OUT_KEY) } catch { /* storage blocked */ }
}
