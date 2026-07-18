import { NextRequest, NextResponse } from 'next/server'
import { resolveAudience, AudienceFilter } from '@/lib/campaign-audience'

export const dynamic = 'force-dynamic'

/**
 * POST /api/campaigns/audience
 *
 * Previews who a campaign would reach. Returns counts and a small sample only —
 * never the full recipient list, which is resolved again at send time so a
 * contact who unsubscribes in between is still excluded.
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, filter, channel } = await req.json()
    if (!companyId || !filter?.type) {
      return NextResponse.json({ error: 'Missing companyId or filter' }, { status: 400 })
    }

    const result = await resolveAudience(
      companyId,
      filter as AudienceFilter,
      channel === 'email' ? 'email' : 'sms'
    )

    return NextResponse.json({
      ok: true,
      matched: result.matched,
      recipients: result.recipients.length,
      excludedTotal: result.excludedTotal,
      excluded: result.excluded,
      // A short preview so staff can sanity-check they've targeted who they meant.
      sample: result.recipients.slice(0, 8).map(r => ({
        name: r.name,
        destination: channel === 'email' ? r.email : r.phone,
      })),
      excludedSample: result.excludedContacts.slice(0, 8),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
