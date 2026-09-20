import type { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

// Allow crawling the marketing site; keep the app, API, auth and customer-facing
// one-off pages (pay links, secure uploads, embeds) out of the index.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/api/',
        '/platform-admin',
        '/pay/',
        '/u/',
        '/auth/',
        '/onboarding',
        '/profile',
        '/upgrade',
        '/reset-password',
        '/forgot-password',
        '/signin',
        '/signup',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
