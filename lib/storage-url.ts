/**
 * Public storage URLs.
 *
 * Supabase hands back URLs on its own host:
 *   https://mtfhctgdayeqrguodksv.supabase.co/storage/v1/object/public/...
 *
 * A custom storage domain is configured (api.colvy.com) which serves exactly
 * the same objects. Using it means:
 *   • links a customer sees look like they came from the business, not from a
 *     random project id
 *   • the bytes never pass through Vercel, so they don't count toward Fast
 *     Origin Transfer
 *
 * Set NEXT_PUBLIC_STORAGE_DOMAIN to change it without a code change. If it
 * isn't set, or a URL isn't a Supabase storage URL, the original is returned
 * untouched — so this is always safe to call.
 */

const DEFAULT_STORAGE_DOMAIN = 'api.colvy.com'

function storageHost(): string | null {
  const configured = process.env.NEXT_PUBLIC_STORAGE_DOMAIN || DEFAULT_STORAGE_DOMAIN
  return configured ? configured.replace(/^https?:\/\//, '').replace(/\/$/, '') : null
}

/**
 * Rewrite a Supabase storage URL onto the custom domain.
 * Anything else (a WooCommerce image, an external link, an empty value) is
 * returned exactly as given.
 */
export function toPublicUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') return url || ''
  const host = storageHost()
  if (!host) return url
  try {
    const u = new URL(url)
    // Only touch Supabase storage paths — never other hosts, and never the
    // auth/rest endpoints which must stay on the project domain.
    if (!u.hostname.endsWith('.supabase.co')) return url
    if (!u.pathname.startsWith('/storage/')) return url
    u.hostname = host
    // The custom domain is served over https.
    u.protocol = 'https:'
    return u.toString()
  } catch {
    return url
  }
}

/** Convenience for attachment-shaped objects. */
export function withPublicUrls<T extends { url?: string; thumbUrl?: string }>(a: T): T {
  return { ...a, url: toPublicUrl(a.url), thumbUrl: a.thumbUrl ? toPublicUrl(a.thumbUrl) : a.thumbUrl }
}
