import type { Metadata } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

export const OG_IMAGES = [{ url: '/og.png', width: 1731, height: 909, alt: 'Colvy — customer communication made simple' }]

/**
 * Metadata for one of Colvy's marketing pages: title (the root template adds
 * " · Colvy"), description, canonical address, and matching Open Graph /
 * Twitter cards. Without the last two, a shared link shows the home page's
 * title whatever page it points at.
 */
export function pageMeta({ title, description, path, absolute = false }: { title: string; description: string; path: string; absolute?: boolean }): Metadata {
  const full = absolute ? title : `${title} · Colvy`
  const url = path ? `${SITE_URL}/${path}` : SITE_URL
  return {
    title: absolute ? { absolute: title } : title,
    description,
    alternates: { canonical: path ? `/${path}` : '/' },
    // A page's openGraph / twitter replace the root layout's rather than merge
    // with them, so the shared card's image and site name are repeated here.
    openGraph: { type: 'website', siteName: 'Colvy', locale: 'en_AU', url, title: full, description, images: OG_IMAGES },
    twitter: { card: 'summary_large_image', title: full, description, images: ['/og.png'] },
  }
}
