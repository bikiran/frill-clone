'use client'

import { useState } from 'react'

// The official platform marks (public/logos) and a store's own logo with its
// platform badged in the corner, for store pickers and order lists.

const PLATFORM: Record<string, { src: string; name: string }> = {
  woocommerce: { src: '/logos/woocommerce.svg', name: 'WooCommerce' },
  shopify: { src: '/logos/shopify.svg', name: 'Shopify' },
}

export const platformName = (p?: string | null) => PLATFORM[String(p || '')]?.name || ''

export function PlatformLogo({ platform, size = 20, ring = false }: { platform?: string | null; size?: number; ring?: boolean }) {
  const p = PLATFORM[String(platform || '')]
  if (!p) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={p.src} alt={p.name} title={p.name} width={size} height={size}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.27), flexShrink: 0, display: 'inline-block', boxShadow: ring ? '0 0 0 2px #fff, 0 1px 3px rgba(0,0,0,.18)' : undefined }} />
  )
}

/** The store's own icon (from its website) with the platform badge in the corner. */
export function StoreLogo({ domain, name, platform, size = 40 }: { domain?: string | null; name?: string | null; platform?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false)
  const host = String(domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const initial = String(name || host || '?').trim().charAt(0).toUpperCase()
  const badge = Math.max(14, Math.round(size * 0.46))
  return (
    <span style={{ position: 'relative', width: size, height: size, flexShrink: 0, display: 'inline-block' }}>
      <span style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), background: '#fff', border: '1px solid var(--border)', boxShadow: '0 1px 2px rgba(0,0,0,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {/* A bare *.myshopify.com address has no site icon of its own (Google would show a globe). */}
        {host && !failed && !/\.myshopify\.com$/i.test(host)
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`} alt="" onError={() => setFailed(true)}
              style={{ width: '72%', height: '72%', objectFit: 'contain' }} />
          : <span style={{ fontSize: size * 0.42, fontWeight: 800, color: 'var(--coral)' }}>{initial}</span>}
      </span>
      {PLATFORM[String(platform || '')] && (
        <span style={{ position: 'absolute', right: -Math.round(badge * 0.28), bottom: -Math.round(badge * 0.28) }}>
          <PlatformLogo platform={platform} size={badge} ring />
        </span>
      )}
    </span>
  )
}
