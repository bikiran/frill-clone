import type { MetadataRoute } from 'next'

/**
 * Installability.
 *
 * With this, Colvy can be added to a phone's home screen and opens without
 * browser chrome — which is most of what makes a web app feel like an app.
 * It is not a native build: there's no App Store presence, and push
 * notifications on iOS require the user to install it first.
 */
export default function manifest(): MetadataRoute.Manifest {
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
