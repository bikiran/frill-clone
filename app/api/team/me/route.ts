import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyToken, bearerToken } from '@/lib/company-access'
import { cleanPhone, cleanText, isUuid } from '@/lib/team-management'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/team/me   { phone?, name?, companyId? }   Authorization: Bearer <token>
 *
 * A person's own mobile and display name on their team rows. Profile saves the
 * mobile (SMS reminders for events assigned to them) and onboarding saves the
 * new owner's name. Both used to write team_members from the browser, which the
 * database no longer allows (COLVY_V364).
 *
 * Only these two fields, and only on rows that are already the caller's own —
 * which rows is decided by the access token, never the body. With companyId
 * just that workspace's row; without it, every workspace they belong to (the
 * mobile is the same person wherever they work).
 */
export async function PATCH(req: NextRequest) {
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    }) as any
    const user = await verifyToken(db, bearerToken(req))
    if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const patch: Record<string, unknown> = {}
    if ('phone' in (body || {})) {
      const phone = cleanPhone(body.phone)
      if (phone === undefined) return NextResponse.json({ error: 'That doesn’t look like a mobile number.' }, { status: 400 })
      patch.phone = phone
    }
    if ('name' in (body || {})) {
      const name = cleanText(body.name, 120)
      if (name === undefined) return NextResponse.json({ error: 'That name is too long.' }, { status: 400 })
      patch.name = name
    }
    if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 })
    if (body.companyId != null && !isUuid(body.companyId)) return NextResponse.json({ error: 'Unknown workspace.' }, { status: 400 })

    let q = db.from('team_members').update(patch).eq('user_id', user.id)
    if (body.companyId) q = q.eq('company_id', body.companyId)
    const { error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, ...patch })
  } catch (e) {
    console.error('[team/me]', (e as Error)?.message || e)
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 })
  }
}
