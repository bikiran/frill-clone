// Shapes and helpers shared by the public help-centre server loaders
// (lib/help-public.ts) and the client pages that render them. Nothing here
// touches the server or the browser, so both sides can import it.

// One row of a help-centre article list. Bodies are NOT included — the list
// only needs the title/meta plus a short excerpt for the featured cards. The
// full body is fetched only for the article that's open (and, lazily, for
// in-page search).
export type HelpListItem = {
  id: string
  title: string
  category: string | null
  status: string | null
  featured: boolean | null
  views: number | null
  likes: number | null
  created_at: string | null
  excerpt: string
  // Filled in on the client once bodies are loaded for search.
  content?: string
}

export type HelpCatMap = Record<string, { name: string; icon: string }>

// Columns for list views: everything the cards/rows show, minus the heavy
// `media` JSON (inline base64 uploads) that `select('*')` used to drag along.
export const HELP_LIST_COLUMNS = 'id, title, category, status, featured, views, likes, created_at'

// The line under the help centre's heading: the subtitle saved in Help Centre
// settings (site_settings 'general'.helpSubtitle), else a neutral line that
// suits any business. The page metadata uses the same setting (lib/tenant-meta).
export const DEFAULT_HELP_SUBTITLE = 'Find answers, guides and resources.'
export function helpSubtitleOf(saved: unknown): string {
  return typeof saved === 'string' && saved.trim() ? saved.trim() : DEFAULT_HELP_SUBTITLE
}

// The plain-text teaser shown on featured cards (same rules the pages used).
export function helpExcerpt(content: string | null | undefined): string {
  return (content || '').replace(/#{1,6} /g, '').replace(/```[\s\S]*?```/g, '').replace(/[*_>#`]/g, '').slice(0, 110)
}

export function toCatMap(rows: { slug: string; name: string; icon?: string | null }[] | null | undefined): HelpCatMap {
  const m: HelpCatMap = {}
  for (const c of rows || []) m[c.slug] = { name: c.name, icon: c.icon || '📁' }
  return m
}

// Turn rows that still carry `content` into list items (body dropped, excerpt kept).
export function toListItems(rows: any[] | null | undefined): HelpListItem[] {
  return (rows || []).map((a: any) => ({
    id: a.id, title: a.title, category: a.category ?? null, status: a.status ?? null,
    featured: a.featured ?? null, views: a.views ?? null, likes: a.likes ?? null,
    created_at: a.created_at ?? null, excerpt: helpExcerpt(a.content),
  }))
}

/** "equipment,-setup-&-troubleshooting" → "Equipment, setup & troubleshooting". */
export function humaniseSlug(slug: string | null | undefined): string {
  const t = String(slug || '').replace(/,-/g, ', ').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Other'
}

/** A category's readable name: its own name from Settings, else the slug made readable. */
export function helpCatName(slug: string | null | undefined, catMap?: HelpCatMap | null): string {
  return (slug && catMap?.[slug]?.name) || humaniseSlug(slug)
}

const CAT_COLOURS = ['#ff6a4d', '#0ea5e9', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6', '#6366f1', '#ef4444', '#84cc16']
/** A steady colour for a category, the same everywhere it shows. */
export function helpCatColor(slug: string | null | undefined): string {
  const s = String(slug || 'other')
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return CAT_COLOURS[h % CAT_COLOURS.length]
}
