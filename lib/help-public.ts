// Server-side loaders for the PUBLIC help centre (/help, /help/<id> and the
// custom-domain renderer under /custom/<domain>).
//
// The pages used to be client-only: the browser downloaded the bundle, showed a
// spinner, then walked a chain of Supabase round trips (company → categories →
// every article with `select('*')`, including inline base64 media) before the
// first article appeared. These loaders let the server render the page with its
// content instead, and keep the results in Next's data cache so repeat visitors
// don't hit the database at all.
//
// Safety rules:
//   • Only the anon key is used, so row-level security still applies.
//   • Only PUBLISHED articles and public company fields are read — nothing
//     per-user. Drafts (admin previews) are still loaded by the client.
//   • A help centre set to "locked" (sign-in required) is never pre-rendered or
//     cached here; the page falls back to its client-side flow.
//   • A failed query throws inside the cache scope, so errors are never cached;
//     callers get `undefined` and the page falls back to fetching on the client.
//
// Freshness: entries revalidate every HELP_REVALIDATE_SECONDS, and the admin
// calls /api/help/revalidate after publishing, editing, deleting or changing
// help settings so changes show up straight away.

import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { HELP_LIST_COLUMNS, toCatMap, toListItems, type HelpCatMap, type HelpListItem } from './help-shared'

export const HELP_REVALIDATE_SECONDS = 60

// Cache tags. /api/help/revalidate expires these on demand.
export const helpTags = {
  companies: 'help:companies',
  company: (companyId: string) => `help:company:${companyId}`,
  all: 'help:all',
  article: (id: string) => `help:article:${id}`,
}

let anon: any = null
function db(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  if (!anon) anon = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  return anon
}

// ── Companies ────────────────────────────────────────────────────────────────

export type HelpCompany = {
  id: string
  name: string | null
  slug: string | null
  logo_url: string | null
  accent_color: string | null
  help_cover_url: string | null
  support_email: string | null
  business_email: string | null
  contact_email: string | null
  email: string | null
}

const COMPANY_COLUMNS = 'id, name, slug, logo_url, accent_color, help_cover_url, support_email, business_email, contact_email, email'

function pickCompany(r: any): HelpCompany | null {
  if (!r) return null
  return {
    id: r.id, name: r.name ?? null, slug: r.slug ?? null, logo_url: r.logo_url ?? null,
    accent_color: r.accent_color ?? null, help_cover_url: r.help_cover_url ?? null,
    support_email: r.support_email ?? null, business_email: r.business_email ?? null,
    contact_email: r.contact_email ?? null, email: r.email ?? null,
  }
}

async function companyWhere(col: 'slug' | 'help_domain' | 'board_domain', val: string): Promise<HelpCompany | null> {
  const d = db()
  let r = await d.from('companies').select(COMPANY_COLUMNS).eq(col, val).maybeSingle()
  // An optional column missing on this database: fall back to the whole row and
  // keep only the public fields (the pages used to read `select('*')` here).
  if (r.error && r.error.code !== 'PGRST116') r = await d.from('companies').select('*').eq(col, val).maybeSingle()
  if (r.error) throw new Error(r.error.message || 'company lookup failed')
  return pickCompany(r.data)
}

const companyBySlug = (slug: string) => unstable_cache(
  () => companyWhere('slug', slug),
  ['help-company-slug', slug],
  { revalidate: HELP_REVALIDATE_SECONDS, tags: [helpTags.companies] },
)()

// Custom domain → company, same precedence as the client renderer used:
// help_domain, then board_domain, then the second-level label as a slug. The
// three lookups run in parallel instead of one after another.
const companyByHost = (host: string) => unstable_cache(
  async (): Promise<{ company: HelpCompany | null; isHelp: boolean }> => {
    const parts = host.split('.')
    const slug = parts.length >= 2 ? parts[parts.length - 2] : ''
    const [byHelp, byBoard, bySlug] = await Promise.all([
      companyWhere('help_domain', host),
      companyWhere('board_domain', host),
      slug ? companyWhere('slug', slug) : Promise.resolve(null),
    ])
    if (byHelp) return { company: byHelp, isHelp: true }
    if (byBoard) return { company: byBoard, isHelp: false }
    if (bySlug) return { company: bySlug, isHelp: host.startsWith('help.') }
    return { company: null, isHelp: false }
  },
  ['help-company-host', host],
  { revalidate: HELP_REVALIDATE_SECONDS, tags: [helpTags.companies] },
)()

// ── Per-company help data ───────────────────────────────────────────────────

type SiteInfo = { terms: Record<string, string> | null; locked: boolean }

const siteInfo = (companyId: string) => unstable_cache(
  async (): Promise<SiteInfo> => {
    const { data, error } = await db().from('site_settings').select('value')
      .eq('key', 'general').eq('company_id', companyId)
      .order('updated_at', { ascending: false }).limit(1)
    if (error) throw new Error(error.message || 'settings lookup failed')
    const v = data?.[0]?.value || {}
    return { terms: v.termValues && typeof v.termValues === 'object' ? v.termValues : null, locked: v.helpAccess === 'locked' }
  },
  ['help-site-info', companyId],
  { revalidate: HELP_REVALIDATE_SECONDS, tags: [helpTags.company(companyId)] },
)()

// Published articles for one company (or, with no company — colvy.com itself —
// every published article, as the page always did). Bodies are read here only
// to build the excerpt and are NOT passed on to the page.
const publishedList = (companyId: string | null) => unstable_cache(
  async (): Promise<HelpListItem[]> => {
    let q = db().from('help_articles').select(`${HELP_LIST_COLUMNS}, content`).eq('status', 'published')
    if (companyId) q = q.eq('company_id', companyId)
    const { data, error } = await q.order('created_at', { ascending: false })
    if (error) throw new Error(error.message || 'articles lookup failed')
    return toListItems(data)
  },
  ['help-published-list', companyId || '*'],
  { revalidate: HELP_REVALIDATE_SECONDS, tags: [companyId ? helpTags.company(companyId) : helpTags.all] },
)()

// Category slug → readable name/icon (Settings → Help Categories).
const catMapFor = (companyId: string | null) => unstable_cache(
  async (): Promise<HelpCatMap> => {
    let q = db().from('help_categories').select('slug, name, icon')
    if (companyId) q = q.eq('company_id', companyId)
    const { data, error } = await q
    if (error) return {} // the page falls back to the raw category value
    return toCatMap(data)
  },
  ['help-cat-map', companyId || '*'],
  { revalidate: HELP_REVALIDATE_SECONDS, tags: [companyId ? helpTags.company(companyId) : helpTags.all] },
)()

// ── Page loaders ────────────────────────────────────────────────────────────

export type HelpIndexData = {
  companyId: string | null
  companyName: string
  helpCover: string
  // On a company subdomain whose company doesn't exist: show nothing (no demo).
  onSubdomain: boolean
  articles: HelpListItem[]
  catMap: HelpCatMap
}

function subdomainSlug(host: string): string | null {
  const h = host.split(':')[0].toLowerCase()
  if (h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com') return h.replace('.colvy.com', '')
  return null
}

/** Data for /help on a colvy host. `undefined` → let the client load it. */
export async function getHelpIndexForHost(host: string): Promise<HelpIndexData | undefined> {
  if (!db()) return undefined
  try {
    const slug = subdomainSlug(host)
    if (!slug) {
      const [articles, catMap] = await Promise.all([publishedList(null), catMapFor(null)])
      return { companyId: null, companyName: '', helpCover: '', onSubdomain: false, articles, catMap }
    }
    const company = await companyBySlug(slug)
    if (!company) return { companyId: null, companyName: '', helpCover: '', onSubdomain: true, articles: [], catMap: {} }
    const [info, articles, catMap] = await Promise.all([siteInfo(company.id), publishedList(company.id), catMapFor(company.id)])
    if (info.locked) return undefined
    return { companyId: company.id, companyName: company.name || '', helpCover: company.help_cover_url || '', onSubdomain: true, articles, catMap }
  } catch { return undefined }
}

export type CustomDomainHelpData = {
  company: HelpCompany | null
  isHelp: boolean
  articles: HelpListItem[]
  terms: Record<string, string> | null
}

/** Data for the custom-domain home (help.acme.com). `undefined` → client loads it. */
export async function getCustomDomainHelp(host: string): Promise<CustomDomainHelpData | undefined> {
  if (!db() || !host) return undefined
  try {
    const { company, isHelp } = await companyByHost(host.toLowerCase())
    if (!company) return { company: null, isHelp: false, articles: [], terms: null }
    const [info, articles] = await Promise.all([siteInfo(company.id), isHelp ? publishedList(company.id) : Promise.resolve([])])
    if (info.locked) return undefined
    return { company, isHelp, articles, terms: info.terms }
  } catch { return undefined }
}

export type HelpArticleData = {
  article: {
    id: string; title: string; content: string | null; category: string | null; status: string
    featured: boolean | null; views: number | null; likes: number | null
    created_at: string | null; company_id: string | null
  }
  catMap: HelpCatMap
  related: { id: string; title: string; category: string | null }[]
}

const publishedArticle = (id: string) => unstable_cache(
  async (): Promise<(HelpArticleData & { locked: boolean }) | null> => {
    const d = db()
    const { data: a, error } = await d.from('help_articles')
      .select('id, title, content, category, status, featured, views, likes, created_at, company_id')
      .eq('id', id).eq('status', 'published').maybeSingle()
    if (error) throw new Error(error.message || 'article lookup failed')
    if (!a) return null
    let rel = d.from('help_articles').select('id, title, category')
      .eq('category', a.category).eq('status', 'published').neq('id', id)
    if (a.company_id) rel = rel.eq('company_id', a.company_id)
    const [catMap, relRes, info] = await Promise.all([
      a.company_id ? catMapFor(a.company_id) : Promise.resolve({} as HelpCatMap),
      rel.limit(4),
      a.company_id ? siteInfo(a.company_id) : Promise.resolve({ terms: null, locked: false }),
    ])
    return { article: a, catMap, related: relRes.data || [], locked: info.locked }
  },
  ['help-published-article', id],
  { revalidate: HELP_REVALIDATE_SECONDS, tags: [helpTags.article(id)] },
)()

/**
 * A published article for /help/<id>. `undefined` → not pre-rendered (draft,
 * demo id, locked help centre, or an error); the page loads it on the client,
 * which also handles admin previews of drafts.
 */
export async function getPublishedHelpArticle(id: string): Promise<HelpArticleData | undefined> {
  if (!db() || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '')) return undefined
  try {
    const r = await publishedArticle(id.toLowerCase())
    if (!r || r.locked) return undefined
    const { locked: _locked, ...data } = r
    return data
  } catch { return undefined }
}
