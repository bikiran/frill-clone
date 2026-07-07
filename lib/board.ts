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
    // maybeSingle() — never throws when no company matches the slug
    const { data } = await (supabase as any)
      .from('companies')
      .select('*')
      .eq('slug', slug.toLowerCase())
      .maybeSingle()
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

// Roles that grant access to the admin panel
const ADMIN_ROLES = ['owner', 'admin', 'editor']

// Returns the company for the CURRENT hostname (subdomain slug), or null on the main domain.
export async function getCompanyForCurrentHost(): Promise<Company | null> {
  if (typeof window === 'undefined') return null
  const h = window.location.hostname
  if (h === 'colvy.com' || h === 'www.colvy.com' || h.includes('localhost') || h.includes('vercel.app')) return null
  if (!h.endsWith('.colvy.com')) return null
  const slug = h.replace('.colvy.com', '')
  return await getCompanyBySlug(slug)
}

// True if the user is an elevated team member (owner/admin/editor) of the given company.
// Uses an array query with .length check — never .single() (may return no rows).
export async function isTeamAdminOf(userId: string, companyId: string): Promise<boolean> {
  try {
    const { data } = await (supabase as any)
      .from('team_members')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .limit(1)
    if (data && data.length > 0) {
      const role = (data[0].role || '').toLowerCase()
      return ADMIN_ROLES.includes(role)
    }
    return false
  } catch {
    return false
  }
}

// Returns true if this user administers the company for the CURRENT hostname.
// Admin = the actual company owner (owner_id), an elevated team member, or the platform super admin.
// IMPORTANT: simply being signed in on a company's subdomain does NOT make someone an admin.
export async function isCompanyAdminUser(user: { id: string; email?: string } | null | undefined): Promise<boolean> {
  if (!user) return false
  if (user.email === PLATFORM_SUPER_ADMIN) return true

  // On a company subdomain: only the real owner or an elevated team member is admin
  const co = await getCompanyForCurrentHost()
  if (co) {
    if (co.owner_id === user.id) return true
    return await isTeamAdminOf(user.id, co.id)
  }

  // On the main domain / localhost: a user administers their OWN company
  try {
    const own = await getCompanyByOwner(user.id)
    if (own) return true
    // Or a company where they are an elevated team member
    const { data } = await (supabase as any)
      .from('team_members')
      .select('role')
      .eq('user_id', user.id)
      .limit(5)
    if (data && data.length > 0) {
      return data.some((m: any) => ADMIN_ROLES.includes((m.role || '').toLowerCase()))
    }
  } catch {}
  return false
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
