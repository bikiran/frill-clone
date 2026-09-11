import { supabase } from './supabase'

// Subdomains the proxy reserves for the platform itself (proxy.ts). A tenant whose
// slug collides with one of these must NOT be addressed as `<slug>.colvy.com` — that
// host is rewritten to a platform route. In particular the super-admin account owns a
// workspace whose slug is literally "admin", so `admin.colvy.com/admin` was rewritten
// to `/platform-admin/admin`, which 404s — that was the mystery "Start free trial → 404".
export const RESERVED_SUBDOMAINS = new Set(['www', 'api', 'mail', 'smtp', 'cdn', 'assets', 'static', 'admin', 'app'])

// Absolute URL to a tenant board (production). Reserved slugs are redirected to the
// right place instead of a 404: `admin` → the platform-admin dashboard at
// admin.colvy.com root (never append /admin); any other reserved slug → the apex.
export function boardUrl(slug: string, path = '/admin') {
  if (RESERVED_SUBDOMAINS.has(slug)) {
    return slug === 'admin' ? 'https://admin.colvy.com' : `https://colvy.com${path}`
  }
  return `https://${slug}.colvy.com${path}`
}

// Get the user's board subdomain and redirect to it
export async function redirectToUserAdmin(userId: string, path = '/admin') {
  try {
    // A user may own more than one company (the super-admin does). .single() throws
    // on multiple rows, so take the earliest-created one deterministically.
    const { data } = await (supabase as any)
      .from('companies')
      .select('slug')
      .eq('owner_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (data?.slug) {
      const hostname = window.location.hostname
      const isLocal = hostname.includes('localhost')
      const isVercel = hostname.includes('vercel.app')

      // Local dev / Vercel preview have no per-tenant subdomains — stay on this origin.
      if (isLocal || isVercel) {
        window.location.href = path
        return
      }

      // Production: route to the board, handling the reserved-slug collision.
      window.location.href = boardUrl(data.slug, path)
      return
    }
  } catch {}

  // Fallback
  window.location.href = path
}
