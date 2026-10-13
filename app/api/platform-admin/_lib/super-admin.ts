import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Shared by the platform-admin routes added for the console's operations views.
// The folder is private (leading underscore), so Next never routes it.

export const SUPER_ADMIN = 'bishalstha76@gmail.com'

/** Service-role client: these views read across every business. Falls back to
 *  the public key (like the other platform-admin routes) so a misconfigured
 *  environment still answers 403 to strangers instead of crashing. */
export function adminDb(): any {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/** The signed-in platform super admin (Bearer access token), or null. */
export async function superAdmin(req: NextRequest, db: any): Promise<{ id: string; email: string } | null> {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return null
    const { data } = await db.auth.getUser(token)
    const u = data?.user
    return u && (u.email || '').toLowerCase() === SUPER_ADMIN ? { id: u.id, email: u.email } : null
  } catch { return null }
}

/** A table/column that hasn't been created yet (migration not run). */
export const isMissing = (e: any) => /does not exist|schema cache|Could not find/i.test(String(e?.message || e || ''))

/** Run a query; on any error return the fallback instead of throwing. */
export async function safe<T>(q: PromiseLike<{ data: T | null; error: any }>, fallback: T): Promise<{ data: T; missing: boolean; error: string | null }> {
  try {
    const { data, error } = await q
    if (error) return { data: fallback, missing: isMissing(error), error: error.message || String(error) }
    return { data: (data ?? fallback) as T, missing: false, error: null }
  } catch (e: any) {
    return { data: fallback, missing: isMissing(e), error: e?.message || 'failed' }
  }
}

/** Count rows; 0 on any error. */
export async function countRows(q: PromiseLike<{ count: number | null; error: any }>): Promise<number> {
  try { const { count, error } = await q; return error ? 0 : (count || 0) } catch { return 0 }
}

/** Only the host of a URL — MCP server URLs often carry a secret in the path. */
export function hostOnly(url: any): string {
  try { return new URL(String(url)).host } catch { return '' }
}

export async function companyNames(db: any, ids: string[]): Promise<Record<string, { id: string; name: string; slug: string }>> {
  const out: Record<string, any> = {}
  const uniq = Array.from(new Set(ids.filter(Boolean)))
  for (let i = 0; i < uniq.length; i += 200) {
    const { data } = await safe<any[]>(db.from('companies').select('id, name, slug').in('id', uniq.slice(i, i + 200)), [])
    for (const c of data) out[c.id] = c
  }
  return out
}
