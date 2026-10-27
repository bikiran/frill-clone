// Installing the chat widget (public/widget.js) on a business's own website,
// and knowing that it worked. The widget tells Colvy which site it loaded on
// (POST /api/widget/seen, at most once a day from each browser); the install
// page and the inbox's "Install your chat widget" card read that back through
// /api/widget/install-status. No DOM or database here, so it's easy to test
// (scripts/widget-install.test.mjs).

export const WIDGET_BASE = 'https://colvy.com'

/** A site counts as live while the widget has loaded there in the last two weeks. */
export const LIVE_DAYS = 14

export type WidgetSite = { host: string; page_url?: string | null; first_seen_at: string; last_seen_at: string }
export type InstallState = 'live' | 'testing' | 'stale' | 'none'

/** A workspace slug as widget.js sends it (data-slug): lowercase letters, digits and dashes. */
export function validSlug(s: unknown): s is string {
  return typeof s === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(s)
}

/**
 * The site a request came from, from its Origin (or Referer) header:
 * "roxyaquarium.com.au", without "www.". null when there isn't a usable web
 * address (file:, a browser extension, nothing sent).
 */
export function siteHost(origin?: string | null, referer?: string | null): string | null {
  for (const raw of [origin, referer]) {
    if (!raw || raw === 'null') continue
    try {
      const u = new URL(raw)
      if (u.protocol !== 'https:' && u.protocol !== 'http:') continue
      const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
      if (host && host.length <= 253 && /^[a-z0-9.-]+$|^\[[0-9a-f:]+\]$/.test(host)) return host
    } catch { /* not a URL */ }
  }
  return null
}

/** Where a page is, without its query or fragment (they can carry personal details). */
export function pageUrl(referer?: string | null): string | null {
  if (!referer) return null
  try {
    const u = new URL(referer)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return `${u.origin}${u.pathname}`.slice(0, 500)
  } catch { return null }
}

/** A computer's own address or a private network: testing, not the live site. */
export function isLocalHost(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.test')
    || host === '[::1]' || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === '0.0.0.0'
}

/**
 * Whether the widget is on their website.
 *  live    loaded on a real site in the last LIVE_DAYS
 *  testing only seen on localhost / a private address so far
 *  stale   was on a real site, but not lately (taken off, or the site is quiet)
 *  none    never seen
 * Sites come back newest first, real sites before test ones.
 */
export function installState(rows: WidgetSite[], now: Date = new Date()): { state: InstallState; sites: WidgetSite[]; live: WidgetSite | null } {
  const at = (r: WidgetSite) => Date.parse(r.last_seen_at) || 0
  const sites = [...rows].sort((a, b) => Number(isLocalHost(a.host)) - Number(isLocalHost(b.host)) || at(b) - at(a))
  const real = sites.filter(r => !isLocalHost(r.host))
  const live = real.find(r => now.getTime() - at(r) <= LIVE_DAYS * 86_400_000) || null
  const state: InstallState = live ? 'live' : real.length ? 'stale' : sites.length ? 'testing' : 'none'
  return { state, sites, live }
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago". */
export function seenAgo(iso: string, now: Date = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 1000))
  if (!Number.isFinite(s)) return ''
  if (s < 60) return 'just now'
  const n = (v: number, u: string) => `${v} ${u}${v === 1 ? '' : 's'} ago`
  if (s < 3600) return n(Math.floor(s / 60), 'minute')
  if (s < 86400) return n(Math.floor(s / 3600), 'hour')
  return n(Math.floor(s / 86400), 'day')
}

// ── The install guide ────────────────────────────────────────────────────────

export type Platform = {
  key: string
  label: string
  /** Where it goes, in a sentence. */
  where: string
  /** What to paste, or null when there's nothing to paste (Shopify, WordPress: a switch or a plugin). */
  code: string | null
  /** Steps when there's no code, or extra steps around it. */
  steps?: string[]
}

export function widgetTag(slug: string, base = WIDGET_BASE): string {
  return `<script src="${base}/widget.js" data-slug="${slug}" async></script>`
}

export function platforms(slug: string, base = WIDGET_BASE): Platform[] {
  const tag = widgetTag(slug, base)
  return [
    { key: 'html', label: 'HTML', where: 'Paste it just before the closing </body> tag, on every page.', code: tag },
    {
      key: 'nextjs', label: 'Next.js', where: 'In app/layout.tsx (or pages/_app.tsx), inside <body>.',
      code: `import Script from 'next/script'\n\n// inside <body>, after {children}\n<Script src="${base}/widget.js" data-slug="${slug}" strategy="afterInteractive" />`,
    },
    {
      key: 'react', label: 'React', where: 'In index.html, before </body>. Or load it once from your root component:',
      code: `useEffect(() => {\n  if (document.querySelector('script[data-slug="${slug}"]')) return\n  const s = document.createElement('script')\n  s.src = '${base}/widget.js'\n  s.async = true\n  s.dataset.slug = '${slug}'\n  document.body.appendChild(s)\n}, [])`,
    },
    { key: 'vue', label: 'Vue', where: 'In index.html, before </body>.', code: tag },
    {
      key: 'nuxt', label: 'Nuxt', where: 'In nuxt.config.ts:',
      code: `export default defineNuxtConfig({\n  app: {\n    head: {\n      script: [{ src: '${base}/widget.js', async: true, 'data-slug': '${slug}', tagPosition: 'bodyClose' }],\n    },\n  },\n})`,
    },
    { key: 'svelte', label: 'SvelteKit', where: 'In src/app.html, before </body>.', code: tag },
    { key: 'astro', label: 'Astro', where: 'In your base layout, before </body>. is:inline keeps Astro from bundling it.', code: `<script is:inline src="${base}/widget.js" data-slug="${slug}" async></script>` },
    {
      key: 'wordpress', label: 'WordPress', where: 'Use the Colvy plugin: it adds the chat to every page, and brings in WooCommerce orders too.', code: null,
      steps: ['Download the Colvy plugin (Settings → API → WordPress plugin).', 'In WordPress: Plugins → Add New → Upload Plugin, then activate it.', 'Colvy → Connection: paste your Company ID and API key. The chat appears straight away.'],
    },
    {
      key: 'shopify', label: 'Shopify', where: 'No code: Shopify stores turn the chat on in the theme editor.', code: null,
      steps: ['Connect your store in Integrations → Shopify.', 'Under “On your store”, press Turn on beside Chat bubble.', 'Shopify opens your theme editor with “Colvy chat” switched on. Press Save.'],
    },
    { key: 'wix', label: 'Wix', where: 'Settings → Custom code → Add custom code. Place it in “Body - end”, on all pages.', code: tag },
    { key: 'squarespace', label: 'Squarespace', where: 'Settings → Advanced → Code injection → Footer.', code: tag },
    { key: 'webflow', label: 'Webflow', where: 'Site settings → Custom code → Footer code, then publish.', code: tag },
    { key: 'gtm', label: 'Tag Manager', where: 'New tag → Custom HTML, triggered on All Pages, then submit.', code: tag },
  ]
}

/**
 * The same instructions as a request to an AI coding assistant (Cursor,
 * Claude, ChatGPT…), for "Copy as a prompt".
 */
export function installPrompt(slug: string, p: Platform, base = WIDGET_BASE): string {
  const lines = [
    `Add the Colvy chat widget to my ${p.key === 'html' ? 'website' : `${p.label} site`}.`,
    '',
    `It's one script that must load on every page: ${widgetTag(slug, base)}`,
    `The data-slug attribute ("${slug}") is required: it's how the widget knows which business it belongs to. Keep it exactly as written.`,
    '',
    `Where it goes: ${p.where}`,
  ]
  if (p.code && p.code !== widgetTag(slug, base)) lines.push('', 'For example:', '', p.code)
  if (p.steps?.length) lines.push('', ...p.steps.map((s, k) => `${k + 1}. ${s}`))
  lines.push(
    '',
    'Load it once (not on every route change), asynchronously, and don\'t change anything else.',
    'When it\'s deployed, a chat bubble appears in the bottom-right corner of the site.',
  )
  return lines.join('\n')
}
