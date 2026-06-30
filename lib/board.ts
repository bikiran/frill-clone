import { supabase } from './supabase'

export type Company = {
  id: string
  slug: string
  name: string
  owner_id: string
  logo_url?: string
  accent_color?: string
  description?: string
  is_private?: boolean
  created_at: string
}

let _cache: Record<string, Company | null> = {}

export async function getCompanyBySlug(slug: string): Promise<Company | null> {
  if (_cache[slug] !== undefined) return _cache[slug]
  try {
    const { data } = await (supabase as any)
      .from('companies')
      .select('*')
      .eq('slug', slug.toLowerCase())
      .single()
    _cache[slug] = data || null
    return _cache[slug]
  } catch {
    _cache[slug] = null
    return null
  }
}

export async function getCompanyByOwner(userId: string): Promise<Company | null> {
  try {
    // maybeSingle() returns null (not throws) when no company found
    const { data, error } = await (supabase as any)
      .from('companies')
      .select('*')
      .eq('owner_id', userId)
      .maybeSingle()
    if (error) console.warn('getCompanyByOwner error:', error.message)
    return data || null
  } catch (e: any) {
    console.warn('getCompanyByOwner exception:', e.message)
    return null
  }
}

const PLATFORM_SUPER_ADMIN = 'bishalstha76@gmail.com'

// Returns true if this user administers the company for the CURRENT hostname.
// Any signed-up user is admin of their own company — not just the platform super admin.
// The platform super admin (bishalstha76@gmail.com) also has admin rights everywhere, for support purposes.
export async function isCompanyAdminUser(user: { id: string; email?: string } | null | undefined): Promise<boolean> {
  if (!user) return false
  if (user.email === PLATFORM_SUPER_ADMIN) return true
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  if (h === 'colvy.com' || h === 'www.colvy.com' || h.includes('localhost') || h.includes('vercel.app')) return false
  if (!h.endsWith('.colvy.com')) return false
  const slug = h.replace('.colvy.com', '')
  const co = await getCompanyBySlug(slug)
  return !!co && co.owner_id === user.id
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(slug)
}

export async function isSlugAvailable(slug: string): Promise<boolean> {
  const RESERVED = ['www', 'app', 'api', 'admin', 'mail', 'colvy', 'help',
    'support', 'billing', 'dashboard', 'login', 'signup', 'landing']
  if (RESERVED.includes(slug.toLowerCase())) return false
  try {
    const { data } = await (supabase as any)
      .from('companies')
      .select('id')
      .eq('slug', slug.toLowerCase())
      .single()
    return !data
  } catch {
    return true
  }
}
