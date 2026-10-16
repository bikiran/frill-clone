// Page metadata (tab title, description, icons, social cards, canonical URL)
// for a company's PUBLIC pages: the help centre, ideas board, roadmap,
// announcements, booking pages, polls, surveys and forms.
//
// These pages are served on a company subdomain (roxy.colvy.com) or on the
// company's own domain (help.roxyaquarium.com.au). Without this they inherited
// Colvy's marketing metadata from the root layout, so a customer hovering the
// tab saw "Colvy — Shared Inbox, CRM & Business Phone…" and Colvy's logo.
//
// Everything here is pure (no server or browser APIs) so it can be unit-tested.
// lib/tenant-brand.ts does the cached company lookup and reads the request host.

import type { Metadata } from 'next'
import { termFor } from './terminology'
import { RESERVED_SUBDOMAINS } from './reserved-subdomains'

// Neutral icons for a company that hasn't set a logo or favicon. Deliberately
// not Colvy's mark.
export const NEUTRAL_ICON = '/tenant-icon.svg'
export const NEUTRAL_APPLE_ICON = '/tenant-icon-180.png'

// ── Hosts ────────────────────────────────────────────────────────────────────

export type TenantHost =
  | { kind: 'colvy'; host: string }
  | { kind: 'subdomain'; host: string; slug: string }
  | { kind: 'custom'; host: string }

/** Normalise a Host header: lower case, no port, no trailing dot. '' if it looks unsafe. */
export function normaliseHost(raw: string | null | undefined): string {
  const h = String(raw || '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
  return /^[a-z0-9.-]{1,253}$/.test(h) ? h : ''
}

/** Which company (if any) a host belongs to. Mirrors the routing in proxy.ts. */
export function classifyHost(raw: string | null | undefined): TenantHost {
  const host = normaliseHost(raw)
  if (!host || !host.includes('.') || host.includes('localhost') || host.endsWith('vercel.app') || /^\d+(\.\d+){3}$/.test(host)) {
    return { kind: 'colvy', host }
  }
  if (host === 'colvy.com' || host === 'www.colvy.com' || host === 'admin.colvy.com') return { kind: 'colvy', host }
  if (host.endsWith('.colvy.com')) {
    const parts = host.split('.')
    if (parts.length === 3 && !RESERVED_SUBDOMAINS.has(parts[0])) return { kind: 'subdomain', host, slug: parts[0] }
    return { kind: 'colvy', host }
  }
  return { kind: 'custom', host }
}

// ── Brand ────────────────────────────────────────────────────────────────────

/** The public branding of one company, as the metadata needs it. */
export type TenantBrand = {
  id: string
  name: string
  slug: string | null
  description: string | null
  logoUrl: string | null
  faviconUrl: string | null
  ogImageUrl: string | null
  accentColor: string | null
  helpCoverUrl: string | null
  helpSubtitle: string | null
  helpDomain: string | null
  helpDomainVerified: boolean
  boardDomain: string | null
  terms: Record<string, string> | null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
// Only http(s) or site-relative URLs make it into <link>/<meta> tags.
const url = (v: unknown): string | null => {
  const s = str(v)
  return s && (/^https?:\/\//i.test(s) || /^\/(?!\/)/.test(s)) ? s : null
}

/** Build a brand from a companies row and its site_settings 'general' value. */
export function toTenantBrand(company: any, settings?: any): TenantBrand | null {
  if (!company?.id) return null
  const s = settings && typeof settings === 'object' ? settings : {}
  const domain = (v: unknown) => normaliseHost(str(v)) || null
  return {
    id: String(company.id),
    name: str(company.name) || str(s.companyName) || str(company.slug) || 'Help Centre',
    slug: str(company.slug),
    description: str(company.description),
    logoUrl: url(company.logo_url) || url(s.logoUrl),
    faviconUrl: url(s.faviconUrl),
    ogImageUrl: url(s.ogImageUrl),
    accentColor: str(company.accent_color) || str(s.accentColor),
    helpCoverUrl: url(company.help_cover_url),
    helpSubtitle: str(s.helpSubtitle),
    helpDomain: domain(company.help_domain),
    helpDomainVerified: company.help_domain_verified === true,
    boardDomain: domain(company.board_domain),
    terms: s.termValues && typeof s.termValues === 'object' ? s.termValues : null,
  }
}

// ── Metadata ─────────────────────────────────────────────────────────────────

export type TenantPage =
  | 'board' | 'roadmap' | 'announcements' | 'feedback'
  | 'help' | 'help-article' | 'help-ticket'
  | 'book' | 'booking'
  | 'poll' | 'survey' | 'form' | 'contact-form'
  | 'profile' | 'note' | 'media'
  | 'redirect'

export type TenantMetaInput = {
  /** Where the page is being served. */
  host: TenantHost
  /**
   * The company behind the page. null = looked up and there is none (the page
   * is then kept out of search results); undefined = the lookup failed or timed
   * out (neutral metadata, still indexable — a slow database mustn't de-index).
   */
  brand: TenantBrand | null | undefined
  page: TenantPage
  /** The page's path on that host, e.g. '/help/<id>'. */
  path: string
  /** The record's own title (article, form, poll…), when there is one. */
  title?: string | null
  /** The record's own description or excerpt, when there is one. */
  description?: string | null
  /** Keep this page out of search results (private links, missing records). */
  noIndex?: boolean
}

/** Plain-text teaser from markdown or HTML, cut at a word near `max` characters. */
export function metaExcerpt(content: string | null | undefined, max = 160): string {
  let raw = String(content || '')
  // Headings make a poor teaser ("Before you start A new tank…"): drop them
  // when there's body text to use instead.
  const noHeadings = raw.replace(/^\s{0,3}#{1,6} .*$/gm, ' ').replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, ' ')
  if (/[a-z0-9]/i.test(noHeadings.replace(/<[^>]+>|!?\[[^\]]*\]\([^)]*\)/g, ''))) raw = noHeadings
  let t = raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_`~#>|]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/ ([.,;:!?])/g, '$1')
    .trim()
  if (t.length > max) {
    const cut = t.slice(0, max - 1)
    const sp = cut.lastIndexOf(' ')
    t = (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–-]+$/, '') + '…'
  }
  return t
}

const HELP_PAGES = new Set<TenantPage>(['help', 'help-article', 'help-ticket'])

function isHelpHost(input: TenantMetaInput): boolean {
  const { host, brand } = input
  if (host.kind !== 'custom') return false
  if (brand?.helpDomain === host.host) return true
  if (brand?.boardDomain === host.host) return false
  return host.host.startsWith('help.')
}

// The address search engines should treat as the page's home. Help pages on a
// subdomain point at the company's own help domain once it's verified, so the
// same article isn't indexed twice.
function canonicalFor(input: TenantMetaInput): string {
  const { host, brand, page } = input
  let path = input.path.startsWith('/') ? input.path : `/${input.path}`
  if (host.kind === 'colvy') return path
  const toHelpDomain = HELP_PAGES.has(page) && host.kind === 'subdomain' && !!brand?.helpDomain && brand.helpDomainVerified
  const origin = toHelpDomain ? `https://${brand!.helpDomain}` : `https://${host.host}`
  // On a help domain the help centre lives at "/" ("/help" shows the same page).
  if (page === 'help' && path === '/help' && (toHelpDomain || isHelpHost(input))) path = '/'
  return origin + path
}

function titleFor(input: TenantMetaInput): { title: string; siteName: string } {
  const { brand, page } = input
  const name = brand?.name || ''
  const T = (k: string) => termFor(brand?.terms, k)
  const rec = str(input.title)
  const join = (a: string, b: string) => (b ? `${a} · ${b}` : a)
  const help = name ? `${name} Help Centre` : 'Help Centre'
  switch (page) {
    case 'help': return { title: help, siteName: help }
    case 'help-article': return { title: join(rec || 'Help article', name ? `${name} Help` : 'Help Centre'), siteName: help }
    case 'help-ticket': return { title: join('Submit a ticket', name ? `${name} Help` : 'Help Centre'), siteName: help }
    case 'board': return { title: join(T('nav_ideas'), name), siteName: name || T('nav_ideas') }
    case 'roadmap': return { title: join(T('nav_roadmap'), name), siteName: name || T('nav_roadmap') }
    case 'announcements': return { title: join(T('nav_updates'), name), siteName: name || T('nav_updates') }
    case 'feedback': return { title: name ? `${name} Feedback` : 'Feedback', siteName: name || 'Feedback' }
    case 'book': return { title: join(rec ? `Book ${rec}` : 'Book online', name), siteName: name || 'Book online' }
    case 'booking': return { title: join('Your booking', name), siteName: name || 'Your booking' }
    case 'poll': return { title: join(rec || 'Poll', name), siteName: name || 'Poll' }
    case 'survey': return { title: join(rec || 'Survey', name), siteName: name || 'Survey' }
    case 'form':
    case 'contact-form': return { title: join(rec || 'Form', name), siteName: name || 'Form' }
    case 'profile': return { title: join(rec || 'Profile', name), siteName: name || 'Profile' }
    case 'note': return { title: join(rec || 'Shared note', name), siteName: name || 'Shared note' }
    case 'media': return { title: join('Shared files', name), siteName: name || 'Shared files' }
    case 'redirect':
    default: return { title: name || 'Loading', siteName: name || 'Loading' }
  }
}

function descriptionFor(input: TenantMetaInput): string {
  const { brand, page } = input
  const own = metaExcerpt(input.description)
  if (own) return own
  const name = brand?.name || ''
  const of = name ? ` from ${name}` : ''
  const helpDesc = metaExcerpt(brand?.helpSubtitle) || `Answers, guides and help articles${of}.`
  switch (page) {
    case 'help':
    case 'help-article':
    case 'help-ticket': return helpDesc
    case 'board': return metaExcerpt(brand?.description) || (name ? `Share your ideas and feedback with ${name}, and vote on what matters to you.` : 'Share your ideas and feedback, and vote on what matters to you.')
    case 'feedback': return metaExcerpt(brand?.description) || (name ? `Share feedback and ideas with ${name}.` : 'Share your feedback and ideas.')
    case 'roadmap': return name ? `See what ${name} is planning, working on and has finished.` : 'See what’s planned, in progress and finished.'
    case 'announcements': return `The latest news and updates${of}.`
    case 'book': return name ? `Book an appointment with ${name} online.` : 'Book an appointment online.'
    case 'booking': return name ? `View, change or cancel your booking with ${name}.` : 'View, change or cancel your booking.'
    case 'poll': return `Have your say in this poll${of}.`
    case 'survey': return `Share your thoughts in this survey${of}.`
    case 'form':
    case 'contact-form': return name ? `Fill in this form from ${name}.` : 'Fill in this form.'
    case 'profile': return name ? `Ideas, votes and comments on the ${name} board.` : 'Ideas, votes and comments.'
    case 'note': return `A note shared${of}.`
    case 'media': return `Files shared${of}.`
    default: return metaExcerpt(brand?.description) || name
  }
}

/**
 * Full metadata for a company page. Every field the root layout sets is
 * overridden here (title uses `absolute` to skip the "· Colvy" template), so
 * nothing of Colvy's marketing copy or logo leaks through the shallow merge.
 */
export function buildTenantMetadata(input: TenantMetaInput): Metadata {
  const { brand, host, page } = input
  const { title, siteName } = titleFor(input)
  const description = descriptionFor(input)
  const canonical = canonicalFor(input)

  const icon = brand?.faviconUrl || brand?.logoUrl || NEUTRAL_ICON
  const apple = brand?.faviconUrl || brand?.logoUrl || NEUTRAL_APPLE_ICON
  // A wide social image when the company has one (its OG image, or the help
  // cover on help pages); otherwise its logo as a small card; otherwise none.
  const wide = brand?.ogImageUrl || (HELP_PAGES.has(page) ? brand?.helpCoverUrl : null) || null
  const image = wide || brand?.logoUrl || null

  const md: Metadata = {
    title: { absolute: title },
    description,
    applicationName: siteName,
    keywords: null,
    alternates: { canonical },
    icons: {
      icon: [{ url: icon }],
      shortcut: [{ url: icon }],
      apple: [{ url: apple }],
    },
    openGraph: {
      type: page === 'help-article' ? 'article' : 'website',
      siteName,
      url: canonical,
      title,
      description,
      images: image ? [{ url: image, alt: brand?.name || title }] : [],
    },
    twitter: {
      card: wide ? 'summary_large_image' : 'summary',
      title,
      description,
      images: image ? [image] : [],
    },
    appleWebApp: { title: brand?.name || siteName },
  }
  // Relative URLs (canonical, neutral icons) resolve against the host the page
  // is actually on, not colvy.com. An odd Host must never turn into a 500.
  if (host.kind !== 'colvy' && host.host) {
    try { md.metadataBase = new URL(`https://${host.host}`) } catch {}
  }
  // Out of search results: private links, a company that doesn't exist on
  // this host, or a help article that isn't (or is no longer) published.
  const unknownCompany = host.kind !== 'colvy' && brand === null
  const missingArticle = page === 'help-article' && !str(input.title)
  if (input.noIndex || unknownCompany || missingArticle) md.robots = { index: false, follow: !input.noIndex && !unknownCompany }
  return md
}

/** Whether a custom domain is the company's help domain (vs its board domain). */
export function customHostIsHelp(host: TenantHost, brand: TenantBrand | null | undefined): boolean {
  return isHelpHost({ host, brand, page: 'help', path: '/' })
}
