import { supabase } from './supabase'

// Get the user's board subdomain and redirect to it
export async function redirectToUserAdmin(userId: string, path = '/admin') {
  try {
    const { data } = await (supabase as any)
      .from('companies')
      .select('slug')
      .eq('owner_id', userId)
      .single()

    if (data?.slug) {
      const hostname = window.location.hostname
      const isLocal = hostname.includes('localhost')
      const isVercel = hostname.includes('vercel.app')

      if (isLocal) {
        // Local dev: use port-based routing since subdomains are tricky
        window.location.href = path
        return
      }

      if (isVercel) {
        // Vercel preview: no subdomain, just go to /admin
        window.location.href = path
        return
      }

      // Production: redirect to slug.colvy.com/admin
      window.location.href = `https://${data.slug}.colvy.com${path}`
      return
    }
  } catch {}

  // Fallback
  window.location.href = path
}
