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
