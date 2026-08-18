import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Records that an agent (the MOBILE app) is online and whether they can take a
// call right now, so an inbound call can ring them — and skip them while they're
// already on one. Mirrors /api/telnyx/presence; the mobile app posts here.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { companyId } = body
    // The app reports itself busy (available:false) while on a call so the next
    // inbound call rings the OTHER agents instead. Defaults to true.
    const available = body?.available === false ? false : true
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

    // Identify the agent from the bearer token (the app sends the Supabase JWT).
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    const db = admin()
    let userId: string | null = null
    if (token) {
      const { data } = await db.auth.getUser(token)
      userId = data?.user?.id || null
    }
    if (!userId) return NextResponse.json({ ok: true }) // can't identify; skip silently

    // Preserve the SIP username the ring-all dials to, when the company has one.
    const { data: integ } = await db.from('telnyx_integrations')
      .select('sip_username').eq('company_id', companyId).maybeSingle()

    await db.from('agent_presence').upsert({
      company_id: companyId,
      user_id: userId,
      ...(integ?.sip_username ? { sip_username: integ.sip_username } : {}),
      available,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'company_id,user_id' })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
