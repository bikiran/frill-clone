import type { MetadataRoute } from 'next'
import { requestTenant } from '@/lib/tenant-brand'
import { NEUTRAL_APPLE_ICON, NEUTRAL_ICON, customHostIsHelp } from '@/lib/tenant-meta'

/**
 * Installability.
 *
 * With this, Colvy can be added to a phone's home screen and opens without
 * browser chrome — which is most of what makes a web app feel like an app.
 * It is not a native build: there's no App Store presence, and push
 * notifications on iOS require the user to install it first.
 *
 * On a company's custom domain (help.acme.com) the manifest is the company's
 * instead: its name, icon and accent, opening at its own home page, so "Add to
 * Home Screen" never installs Colvy's admin from a customer's site. Company
 * subdomains (acme.colvy.com) keep Colvy's: staff run the admin app there too,
 * and an installed copy must keep opening the inbox.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { host, brand } = await requestTenant()
  if (host.kind === 'custom') {
    const isHelp = customHostIsHelp(host, brand)
    const name = brand?.name || (isHelp ? 'Help Centre' : 'Feedback')
    const icon = brand?.faviconUrl || brand?.logoUrl
    const accent = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(brand?.accentColor || '') ? brand!.accentColor! : '#ffffff'
    return {
      name: isHelp && brand?.name ? `${name} Help Centre` : name,
      short_name: name.slice(0, 24),
      description: brand?.name
        ? (isHelp ? `Answers, guides and help articles from ${name}.` : `${name} — ideas, updates and help.`)
        : 'Answers, guides and help articles.',
      start_url: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: accent,
      icons: icon
        ? [{ src: icon, sizes: 'any', purpose: 'any' }]
        : [
            { src: NEUTRAL_ICON, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            { src: NEUTRAL_APPLE_ICON, sizes: '180x180', type: 'image/png', purpose: 'any' },
          ],
    }
  }
  return {
    name: 'Colvy',
    short_name: 'Colvy',
    description: 'Customer conversations, contacts and campaigns',
    start_url: '/admin/inbox',
    display: 'standalone',
    background_color: '#fafafa',
    theme_color: '#ff7a6b',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
