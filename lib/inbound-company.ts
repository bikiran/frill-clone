import type { SupabaseClient } from '@supabase/supabase-js'

// Resolve which company owns a DIALED number for an inbound call/SMS.
//
// TENANT ISOLATION: the authoritative number → company map is `phone_numbers`
// (one row per number, letting a company own many numbers). The
// `<provider>_integrations` table only stores each company's FIRST number "for
// backward compatibility" and goes STALE whenever a number is added or
// reassigned — nothing repoints the old owner's column. Resolving the tenant
// from that stale column leaked one company's inbound calls/SMS into another
// company's inbox (a number now owned by company B still sitting in company A's
// integration row routed B's calls to A).
//
// Rules, in order:
//   1. `phone_numbers`, matched EXACTLY or by the last 9 digits (so an E.164 vs
//      local format difference — +61… vs 0… — can't miss and fall through). If
//      it knows the number, that owner is authoritative and we return it.
//   2. Only when `phone_numbers` has NO record of the number at all, fall back
//      to the legacy integration column (same normalisation). This keeps genuine
//      legacy numbers working without ever letting the stale column override a
//      number whose current owner is recorded in `phone_numbers`.
//
// The previous version matched `phone_numbers` with a bare `.eq(...).maybeSingle()`:
// a format difference missed the row (→ fell through to the stale column), and a
// duplicate row threw (→ same fall-through) — both routes leaked the call.
export async function companyForInboundNumber(
  db: SupabaseClient,
  to: string,
  provider: 'twilio' | 'telnyx',
): Promise<string | null> {
  if (!to) return null
  const digits = String(to).replace(/\D/g, '')
  const last9 = digits.length >= 8 ? digits.slice(-9) : ''

  // Prefer an EXACT phone_number match; else a last-9-digit suffix match.
  const pick = (rows: any[] | null | undefined): string | null => {
    const list = rows || []
    if (!list.length) return null
    const exact = list.find(r => String(r.phone_number || '') === to
      || String(r.phone_number || '').replace(/\D/g, '') === digits)
    if (exact?.company_id) return exact.company_id
    if (last9) {
      const suffix = list.find(r => String(r.phone_number || '').replace(/\D/g, '').endsWith(last9))
      if (suffix?.company_id) return suffix.company_id
    }
    return null
  }

  const lookup = async (table: string): Promise<string | null> => {
    // A single .or() covers the exact value and the suffix; select several rows
    // so a duplicate can't throw (unlike .maybeSingle()) and we can rank them.
    const conds = [`phone_number.eq.${to}`]
    if (last9) conds.push(`phone_number.ilike.%${last9}`)
    try {
      const { data } = await (db as any).from(table)
        .select('company_id, phone_number').or(conds.join(',')).limit(20)
      return pick(data)
    } catch { return null }
  }

  // 1. Authoritative current owner.
  const authoritative = await lookup('phone_numbers')
  if (authoritative) return authoritative

  // 2. Legacy fallback — only when phone_numbers knows nothing about the number.
  return lookup(provider === 'twilio' ? 'twilio_integrations' : 'telnyx_integrations')
}
