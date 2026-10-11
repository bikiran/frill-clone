// Server-only access to a business's own secrets.
//
// These used to live on the companies row, which anyone can read (the public
// board, help centre and widget load it by slug):
//   • stripe_secret_key — a business's own Stripe key (V351 moved it)
//   • api_key           — the Colvy plugin / public API key (V352 moves it)
// They now live in company_secrets (server only), and a trigger moves anything
// written to the old columns straight across. This is the one place that reads
// them. Until the migrations have run it falls back to the old columns, so
// deploying this code first changes nothing.

import { createClient } from '@supabase/supabase-js'
import { randomBytes, timingSafeEqual } from 'crypto'

function serviceDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  ) as any
}

const hasService = () => !!process.env.SUPABASE_SERVICE_ROLE_KEY

/** The business's own Stripe secret key, or null when it charges through
 *  Colvy's platform account (Connect) instead. */
export async function stripeSecretFor(company: any): Promise<string | null> {
  if (!company || company.stripe_mode !== 'keys') return null
  if (hasService() && company.id) {
    try {
      const { data } = await serviceDb().from('company_secrets').select('stripe_secret_key').eq('company_id', company.id).maybeSingle()
      const key = String(data?.stripe_secret_key || '').trim()
      if (key) return key
    } catch {}
  }
  const legacy = String(company.stripe_secret_key || '').trim()
  return legacy || null
}

// ── Plugin / public API key ──────────────────────────────────────────────────

/** Constant-time comparison for keys. */
export function keyMatches(given: string | null | undefined, expected: string | null | undefined): boolean {
  const a = Buffer.from(String(given || ''))
  const b = Buffer.from(String(expected || ''))
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b)
}

/** The company's Colvy plugin / API key, or null if it hasn't been made yet. */
export async function pluginKeyFor(companyId: string | null | undefined): Promise<string | null> {
  if (!companyId || !hasService()) return null
  const db = serviceDb()
  try {
    const { data } = await db.from('company_secrets').select('api_key').eq('company_id', companyId).maybeSingle()
    if (data?.api_key) return String(data.api_key)
  } catch {}
  // Before V352: still on the companies row.
  try {
    const { data } = await db.from('companies').select('api_key').eq('id', companyId).maybeSingle()
    if (data?.api_key) return String(data.api_key)
  } catch {}
  return null
}

/** Which company a plugin / API key belongs to. */
export async function companyIdForApiKey(key: string | null | undefined): Promise<string | null> {
  const k = String(key || '').trim()
  if (k.length < 16 || !hasService()) return null
  const db = serviceDb()
  try {
    const { data } = await db.from('company_secrets').select('company_id').eq('api_key', k).maybeSingle()
    if (data?.company_id) return data.company_id
  } catch {}
  try {
    const { data } = await db.from('companies').select('id').eq('api_key', k).maybeSingle()
    if (data?.id) return data.id
  } catch {}
  return null
}

/** The company's key, creating one the first time. */
export async function ensurePluginKey(companyId: string): Promise<string | null> {
  const existing = await pluginKeyFor(companyId)
  if (existing) return existing
  if (!hasService()) return null
  const key = 'colvy_' + randomBytes(16).toString('hex')
  const db = serviceDb()
  const { error } = await db.from('company_secrets').upsert({ company_id: companyId, api_key: key, updated_at: new Date().toISOString() }, { onConflict: 'company_id' })
  if (!error) return key
  // company_secrets.api_key not there yet (before V352): keep the old home.
  const { error: legacyErr } = await db.from('companies').update({ api_key: key }).eq('id', companyId)
  return legacyErr ? null : key
}
