import type { MetadataRoute } from 'next'
import { statSync } from 'fs'
import { join } from 'path'
import { allMarketingPaths } from '@/lib/marketing-routes'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

// A per-path crawl hint. The home page changes most; legal pages barely at all.
function hints(path: string): { priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] } {
  if (path === '') return { priority: 1, changeFrequency: 'weekly' }
  if (['pricing', 'product', 'inbox-crm', 'channels', 'solutions', 'industries'].includes(path)) {
    return { priority: 0.9, changeFrequency: 'weekly' }
  }
  if (['privacy', 'terms', 'security'].includes(path)) return { priority: 0.3, changeFrequency: 'yearly' }
  if (path.includes('/')) return { priority: 0.8, changeFrequency: 'monthly' } // landing pages
  return { priority: 0.7, changeFrequency: 'monthly' }
}

// The source file whose mtime best represents when a route's content last
// changed. Dynamic landing pages share one Client.tsx per segment.
function sourceFile(path: string): string {
  if (path === '') return 'app/page.tsx'
  if (path.startsWith('product/')) return 'app/product/[feature]/Client.tsx'
  if (path.startsWith('channels/')) return 'app/channels/[slug]/Client.tsx'
  if (path.startsWith('solutions/')) return 'app/solutions/[slug]/Client.tsx'
  if (path.startsWith('industries/')) return 'app/industries/[slug]/Client.tsx'
  return `app/${path}/Client.tsx` // static wrapped pages keep their UI in Client.tsx
}

export default function sitemap(): MetadataRoute.Sitemap {
  const buildTime = new Date()
  const lastMod = (path: string): Date => {
    try { return statSync(join(process.cwd(), sourceFile(path))).mtime }
    catch { return buildTime }
  }
  return allMarketingPaths().map(path => {
    const { priority, changeFrequency } = hints(path)
    return {
      url: path ? `${SITE_URL}/${path}` : SITE_URL,
      lastModified: lastMod(path),
      changeFrequency,
      priority,
    }
  })
}
