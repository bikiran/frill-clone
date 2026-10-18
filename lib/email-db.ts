// Small shared pieces for the email-campaign modules (server only): the
// service-role client and "this database hasn't had V396 yet" checks, so every
// email feature degrades quietly before the migration runs.

import { createClient } from '@supabase/supabase-js'

export const emailAdminDb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

/** A table this database doesn't have (V396 not run yet). */
export function isMissingTable(e: any): boolean {
  return /^(42P01|PGRST205)$/.test(String(e?.code || '')) || /does not exist|could not find the table|schema cache/i.test(String(e?.message || '')) && !/column/i.test(String(e?.message || ''))
}

/** A column this database doesn't have (V396 not run yet). */
export function isMissingColumn(e: any): boolean {
  const msg = String(e?.message || '')
  return /^(42703|PGRST204)$/.test(String(e?.code || '')) || /column .* does not exist|could not find the '.*' column/i.test(msg)
}

/** Lower-cased, trimmed address, or '' when it isn't a plausible email. */
export function normEmail(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase()
  return /^[^@\s<>"',;]+@[^@\s<>"',;]+\.[a-z]{2,}$/i.test(s) ? s : ''
}
