import type { SupabaseClient } from '@supabase/supabase-js'

// Resolve which company owns a DIALED number for an inbound call/SMS.
//
// TENANT ISOLATION: the authoritative number → company map is `phone_numbers`
// (one row per number, unique index on phone_number), which lets a company own
// many numbers. The `<provider>_integrations` table only stores each company's
// FIRST number "for backward compatibility" and goes stale whenever a number is
// added or reassigned — nothing repoints the old owner's column. Resolving the
// tenant from that stale column leaked one company's inbound calls/SMS into
// another company's inbox (e.g. a number now owned by company B still sitting in
// company A's integration row routed B's calls to A).
//
// Always prefer `phone_numbers`; fall back to the integration column only for
// legacy numbers that were never recorded in `phone_numbers`.
export async function companyForInboundNumber(
  db: SupabaseClient,
  to: string,
  provider: 'twilio' | 'telnyx',
): Promise<string | null> {
  if (!to) return null

  // Authoritative: the current owner of this exact number.
  try {
    const { data: pn } = await (db as any).from('phone_numbers')
      .select('company_id').eq('phone_number', to).maybeSingle()
    if (pn?.company_id) return pn.company_id
  } catch { /* table may be absent in an old deployment — fall through */ }

  // Legacy fallback: the integration's single stored number.
  const table = provider === 'twilio' ? 'twilio_integrations' : 'telnyx_integrations'
  try {
    const { data } = await (db as any).from(table)
      .select('company_id').eq('phone_number', to).maybeSingle()
    return data?.company_id || null
  } catch { return null }
}
