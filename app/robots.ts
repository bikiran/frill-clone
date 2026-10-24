import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

const AI_CRAWLERS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
  'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'anthropic-ai',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'GoogleOther', 'Applebot', 'Applebot-Extended',
  'bingbot', 'meta-externalagent', 'Amazonbot', 'DuckAssistBot', 'MistralAI-User', 'cohere-ai', 'CCBot',
]

// robots.txt is served per-host. On a tenant board (e.g. acme.colvy.com) we
// block the whole subdomain from indexing so customer boards don't get crawled
// or dilute colvy.com's authority. On the marketing root we allow crawling and
// point at the sitemap.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers()
  const host = (h.get('host') || '').toLowerCase().split(':')[0]
  const isRoot = host === '' || host === 'colvy.com' || host === 'www.colvy.com'
  const isTenant = host.endsWith('.colvy.com') && !isRoot

  if (isTenant) {
    // Customer board / app subdomain — keep it out of search entirely.
    return { rules: { userAgent: '*', disallow: '/' } }
  }

  const disallow = [
    '/admin', '/api/', '/platform-admin', '/pay/', '/u/', '/auth/',
    '/onboarding', '/profile', '/upgrade', '/reset-password',
    '/forgot-password', '/signin', '/signup',
  ]
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
      // AI assistants and answer engines, named so it's explicit that they're
      // welcome on the marketing site (and /llms.txt), with the same private
      // areas kept out. Training and search crawlers alike.
      { userAgent: AI_CRAWLERS, allow: ['/', '/llms.txt', '/llms-full.txt'], disallow },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
