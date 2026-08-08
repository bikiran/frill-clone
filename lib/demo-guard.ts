import { createClient } from '@supabase/supabase-js'

// Server-side safety for demo workspaces. A demo company has external sending
// switched off, so any endpoint that would send a real SMS/email/message or
// place a real call must refuse. This is the authoritative check — frontend
// hiding is not enough.
//
// Fails OPEN (returns "not blocked") on any error, including the columns not
// existing yet before the migration is applied, so it can never break sending
// for a real tenant.

export const DEMO_BLOCK_MESSAGE =
  'This action is unavailable in the shared Colvy showcase. Start a free trial to connect your channels and use live messaging.'

let _cache = new Map<string, { at: number; blocked: boolean }>()
const TTL = 30_000

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * True when external sending must be blocked for this company (it's a demo with
 * sending disabled). Pass a db client to reuse an existing one; otherwise a
 * service-role client is created. Cached briefly per company.
 */
export async function isExternalSendBlocked(companyId?: string | null, db?: any): Promise<boolean> {
  if (!companyId) return false
  const hit = _cache.get(companyId)
  if (hit && Date.now() - hit.at < TTL) return hit.blocked
  let blocked = false
  try {
    const client = db || admin()
    const { data, error } = await client.from('companies').select('is_demo, external_sending_enabled').eq('id', companyId).maybeSingle()
    if (!error && data) blocked = !!data.is_demo && data.external_sending_enabled === false
  } catch { blocked = false }
  _cache.set(companyId, { at: Date.now(), blocked })
  return blocked
}

/** Convenience: record a blocked attempt for the demo audit/analytics trail. */
export async function logBlockedSend(companyId: string | null | undefined, channel: string, db?: any): Promise<void> {
  if (!companyId) return
  try {
    const client = db || admin()
    await client.from('demo_analytics').insert({ company_id: companyId, event: 'blocked_send', meta: { channel } })
  } catch { /* best-effort */ }
}
