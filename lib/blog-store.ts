import { createClient } from '@supabase/supabase-js'
import { POSTS, type BlogPost } from '@/lib/blog'
import { renderMarkdown, readingMinutes } from '@/lib/markdown'

// Normalised article the public blog UI renders. Produced from either a static
// seed post (lib/blog.ts) or a DB row (super-admin editor). DB posts win on a
// slug clash, so an editor can override a seed article.
export type Article = {
  slug: string
  title: string
  excerpt: string
  category: string
  accent: string
  icon: string
  cover?: string | null
  date: string          // ISO, for sorting + <time>
  dateLabel: string
  readTime: string
  author: string
  authorAvatar?: string | null
  bodyHtml: string
  takeaways: string[]
  seoTitle?: string | null
  seoDescription?: string | null
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return '' }
}

// Structured seed posts render intro + sections to HTML; markdown posts (and all
// DB posts) render their Markdown body.
function seedToArticle(p: BlogPost): Article {
  let bodyHtml: string
  if (p.content) {
    bodyHtml = renderMarkdown(p.content)
  } else {
    const parts: string[] = []
    if (p.intro) parts.push(`<p>${p.intro}</p>`)
    for (const s of p.sections || []) {
      parts.push(`<h2>${s.h}</h2>`)
      for (const para of s.p) parts.push(`<p>${para}</p>`)
    }
    bodyHtml = parts.join('\n')
  }
  return {
    slug: p.slug, title: p.title, excerpt: p.excerpt, category: p.category,
    accent: p.accent, icon: p.icon, cover: p.cover || null,
    date: p.date, dateLabel: p.dateLabel, readTime: p.readTime, author: p.author,
    bodyHtml, takeaways: p.takeaways || [],
  }
}

function rowToArticle(r: any): Article {
  const date = r.published_at || r.created_at || new Date().toISOString()
  const mins = r.reading_minutes || readingMinutes(r.content || '')
  return {
    slug: r.slug, title: r.title, excerpt: r.excerpt || '', category: r.category || 'Playbooks',
    accent: r.accent || '#ff6a4d', icon: r.icon || 'inbox', cover: r.cover_url || null,
    date, dateLabel: fmtDate(date), readTime: `${mins} min read`,
    author: r.author_name || 'The Colvy Team', authorAvatar: r.author_avatar || null,
    bodyHtml: renderMarkdown(r.content || ''), takeaways: [],
    seoTitle: r.seo_title, seoDescription: r.seo_description,
  }
}

// Published DB posts. Returns [] on any error (table missing, no env, etc.) so
// the public blog always falls back to the seed articles.
async function dbPosts(): Promise<Article[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return []
  try {
    const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data, error } = await db.from('blog_posts').select('*').eq('status', 'published').order('published_at', { ascending: false })
    if (error) return []
    return (data || []).map(rowToArticle)
  } catch { return [] }
}

// All articles for the public site, newest first, DB overriding seed on slug.
export async function listArticles(): Promise<Article[]> {
  const fromDb = await dbPosts()
  const dbSlugs = new Set(fromDb.map(a => a.slug))
  const seed = POSTS.map(seedToArticle).filter(a => !dbSlugs.has(a.slug))
  return [...fromDb, ...seed].sort((a, b) => (a.date < b.date ? 1 : -1))
}

export async function getArticle(slug: string): Promise<Article | null> {
  const all = await listArticles()
  return all.find(a => a.slug === slug) || null
}

export async function relatedArticles(slug: string, n = 3): Promise<Article[]> {
  const all = await listArticles()
  const current = all.find(a => a.slug === slug)
  const rest = all.filter(a => a.slug !== slug)
  const same = rest.filter(a => a.category === current?.category)
  const others = rest.filter(a => a.category !== current?.category)
  return [...same, ...others].slice(0, n)
}

// Just the published slugs (for the sitemap). Never throws.
export async function allArticleSlugs(): Promise<string[]> {
  try { return (await listArticles()).map(a => a.slug) } catch { return POSTS.map(p => p.slug) }
}
