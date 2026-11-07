import type { MetadataRoute } from 'next'
import { statSync } from 'fs'
import { execFileSync } from 'child_process'
import { join } from 'path'
import { allMarketingPaths } from '@/lib/marketing-routes'
import { listArticles } from '@/lib/blog-store'
import { POSTS } from '@/lib/blog'
import { TOPIC_PAGES } from '@/lib/topic-pages'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

// A per-path crawl hint. The home page changes most; legal pages barely at all.
function hints(path: string): { priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] } {
  if (path === '') return { priority: 1, changeFrequency: 'weekly' }
  if (['pricing', 'product', 'inbox-crm', 'channels', 'solutions', 'industries', 'for', 'business-phone-number-australia', 'all-in-one-customer-platform', 'ai-agents', 'selling-chat', 'email-sms-marketing', 'whatsapp-shared-inbox', 'compare', 'blog'].includes(path) || path.startsWith('for/')) {
    return { priority: 0.9, changeFrequency: 'weekly' }
  }
  if (['privacy', 'terms', 'security'].includes(path)) return { priority: 0.3, changeFrequency: 'yearly' }
  if (path.includes('/')) return { priority: 0.8, changeFrequency: 'monthly' } // landing pages
  return { priority: 0.7, changeFrequency: 'monthly' }
}

// The files whose last commit is when a page last changed: its own folder and
// the data it's built from. Git pathspecs: literal for the [param] folders,
// a glob for a static page's own files (not its sub-pages).
function sources(path: string): string[] {
  const lit = (p: string) => `:(literal)${p}`
  const own = (dir: string) => `:(glob)${dir}/*`
  if (path === '') return [own('app/landing')] // proxy.ts serves colvy.com/ from the landing page
  const [base, slug] = path.split('/')
  if (slug) {
    const dir = { product: 'app/product/[feature]', channels: 'app/channels/[slug]', solutions: 'app/solutions/[slug]', industries: 'app/industries/[slug]',
      phones: 'app/phones/[slug]', 'ai-assistant': 'app/ai-assistant/[slug]', integrations: 'app/integrations/[slug]',
      compare: 'app/compare/[slug]', for: 'app/for/[slug]' }[base]
    const data = { compare: 'lib/compare-meta.ts', for: 'lib/for-pages.ts' }[base] || 'lib/page-meta.ts'
    return dir ? [lit(dir), data] : [own(`app/${base}`)]
  }
  return TOPIC_PAGES[path] ? [own(`app/${path}`), 'lib/topic-pages.ts'] : [own(`app/${path}`)]
}

// The date of the last commit touching those files. Vercel builds from a
// shallow clone (the last 10 commits), so a page untouched in that window
// gets the oldest commit's date: never later than the truth. With
// VERCEL_DEEP_CLONE=true it's exact. Without git at all: the file's mtime.
function gitDate(paths: string[]): Date | null {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', ...paths], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim()
    return out ? new Date(out) : null
  } catch { return null }
}
function mtime(path: string): Date | null {
  const file = path === '' ? 'app/landing/page.tsx' : path.includes('/') ? null : `app/${path}/Client.tsx`
  try { return file ? statSync(join(process.cwd(), file)).mtime : null } catch { return null }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const buildTime = new Date()
  const lastMod = (path: string): Date => gitDate(sources(path)) || mtime(path) || buildTime
  const pages: MetadataRoute.Sitemap = allMarketingPaths().map(path => {
    const { priority, changeFrequency } = hints(path)
    return {
      url: path ? `${SITE_URL}/${path}` : SITE_URL,
      lastModified: lastMod(path),
      changeFrequency,
      priority,
    }
  })

  // Individual blog articles (DB + seed), dated when they were published.
  // Never throws: falls back to the built-in posts.
  let articles: { slug: string; date: string }[]
  try { articles = await listArticles() } catch { articles = POSTS }
  const posts: MetadataRoute.Sitemap = articles.map(a => ({
    url: `${SITE_URL}/blog/${a.slug}`,
    lastModified: a.date && !isNaN(Date.parse(a.date)) ? new Date(a.date) : buildTime,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  return [...pages, ...posts]
}
