import type { MetadataRoute } from 'next'
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

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return allMarketingPaths().map(path => {
    const { priority, changeFrequency } = hints(path)
    return {
      url: path ? `${SITE_URL}/${path}` : SITE_URL,
      lastModified: now,
      changeFrequency,
      priority,
    }
  })
}
