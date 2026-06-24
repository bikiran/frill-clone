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
    const { data } = await (supabase as any)
      .from('companies')
      .select('*')
      .eq('owner_id', userId)
      .single()
    return data || null
  } catch {
    return null
  }
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
