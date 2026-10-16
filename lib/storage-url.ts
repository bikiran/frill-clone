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

// ── Small copies of photos for tiles ─────────────────────────────────────────
// Customer photos (MMS, Messenger, email) arrive as full-size phone originals
// with no thumbnail. Drawn into an 80px tile the browser still decodes the
// whole 12-megapixel bitmap (~48 MB each) and keeps it in its image cache, so
// an inbox left open all day climbed past a gigabyte. Tiles ask Next's image
// optimiser (next.config `images.remotePatterns`) for a copy at the size shown;
// the lightbox and downloads keep the original.
// Our own storage only — keep in step with next.config images.remotePatterns.
const hostOf = (url: string | undefined, fallback: string) => { try { return new URL(url || '').hostname } catch { return fallback } }
function sizedSources(): { host: string; storagePath: boolean }[] {
  return [
    { host: hostOf(process.env.NEXT_PUBLIC_SUPABASE_URL, 'mtfhctgdayeqrguodksv.supabase.co'), storagePath: true },
    { host: storageHost() || 'api.colvy.com', storagePath: true },
    { host: hostOf(process.env.NEXT_PUBLIC_R2_PUBLIC_URL, 'media.colvy.com'), storagePath: false },
  ]
}
const SIZED_WIDTHS = [64, 96, 128, 256, 384, 640, 750, 828, 1080]  // default imageSizes + deviceSizes

/**
 * A URL for `url` resized to about `width` CSS px (allowing for retina), or
 * the plain public URL when it can't be resized here (other hosts, SVG/GIF,
 * relative URLs). Pair with `sizedImageFallback` so a failed resize still
 * shows the original.
 */
export function sizedImageUrl(url: string | null | undefined, width: number): string {
  const full = toPublicUrl(url)
  if (!full) return full
  try {
    const u = new URL(full)
    const host = u.hostname.toLowerCase()
    const src = sizedSources().find(x => x.host.toLowerCase() === host)
    if (u.protocol !== 'https:' || (u.port && u.port !== '443') || !src) return full
    if (src.storagePath && !u.pathname.startsWith('/storage/v1/object/public/')) return full
    if (/\.(svg|gif)$/i.test(u.pathname)) return full
    const want = Math.ceil(width * 2)
    const w = SIZED_WIDTHS.find(x => x >= want) || SIZED_WIDTHS[SIZED_WIDTHS.length - 1]
    return `/_next/image?url=${encodeURIComponent(full)}&w=${w}&q=75`
  } catch {
    return full
  }
}

/** onError for an <img> using sizedImageUrl: fall back to the original once. */
export function sizedImageFallback(url: string | null | undefined) {
  return (e: { currentTarget: HTMLImageElement }) => {
    const img = e.currentTarget
    const original = toPublicUrl(url)
    if (!original || img.dataset.sizedFallback) return
    img.dataset.sizedFallback = '1'
    img.src = original
  }
}
