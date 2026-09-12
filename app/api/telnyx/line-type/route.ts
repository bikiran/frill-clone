import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { toE164, TelnyxService } from '@/lib/telnyx-service'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// A carrier classification we have already made is not worth paying for again.
// Numbers do get ported between line types, but rarely, and a wrong "landline"
// only ever costs one skipped text that the person can still send by hand.
const TTL_DAYS = 90

/**
 * Can this number receive a text? POST { companyId, number, contactId? }
 *   → { lineType, smsCapable, cached }
 *
 * Forwarding to a landline used to fail at the carrier after a full round trip,
 * with wording that never said why. The provider can answer the question up
 * front, but it is a paid lookup per number, so the answer is cached on the
 * contact and re-used.
 *
 * Never fails the caller. Any error — no Telnyx key, lookup down, column not yet
 * migrated — answers "unknown, assume it can receive a text", so this can only
 * ever save a doomed send, never block a good one.
 */
export async function POST(req: NextRequest) {
  const unknown = NextResponse.json({ lineType: null, smsCapable: true, cached: false })
  try {
    const { companyId, number, contactId } = await req.json()
    if (!companyId || !number) return unknown

    const e164 = toE164(String(number))
    if (!e164) return unknown

    const db = admin()

    // Cached on the contact, if we have been asked about this person before.
    if (contactId) {
      try {
        const { data } = await db.from('contacts')
          .select('line_type, line_type_checked_at').eq('id', contactId).maybeSingle()
        const at = data?.line_type_checked_at ? new Date(data.line_type_checked_at).getTime() : 0
        const fresh = at && Date.now() - at < TTL_DAYS * 86400_000
        if (data?.line_type && fresh) {
          return NextResponse.json({
            lineType: data.line_type,
            smsCapable: data.line_type !== 'landline',
            cached: true,
          })
        }
      } catch { /* column not migrated yet — fall through and look it up */ }
    }

    const { data: integ } = await db.from('telnyx_integrations')
      .select('api_key').eq('company_id', companyId).maybeSingle()
    if (!integ?.api_key) return unknown

    const lineType = await new TelnyxService(integ.api_key).lookupLineType(e164)
    if (!lineType) return unknown

    if (contactId) {
      try {
        await db.from('contacts')
          .update({ line_type: lineType, line_type_checked_at: new Date().toISOString() })
          .eq('id', contactId)
      } catch { /* not migrated — the answer is still usable for this send */ }
    }

    // Only an explicit landline is treated as unable to receive a text. Anything
    // else, including a classification we have not seen before, falls through to
    // trying the send.
    return NextResponse.json({ lineType, smsCapable: lineType !== 'landline', cached: false })
  } catch {
    return unknown
  }
}
