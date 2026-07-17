import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Records that an agent is online (their Colvy tab is open), so an inbound call
// can ring them. Called every ~45s from the admin layout while the tab is
// visible. Uses the caller's auth to identify the user.
export async function POST(req: NextRequest) {
  try {
    const { companyId } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

    // Identify the agent from the bearer token (browser sends the Supabase JWT).
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    const db = admin()
    let userId: string | null = null
    if (token) {
      const { data } = await db.auth.getUser(token)
      userId = data?.user?.id || null
    }
    if (!userId) return NextResponse.json({ ok: true }) // can't identify; skip silently

    // The company's WebRTC SIP username — every agent's browser connects with the
    // company credential, so that's the SIP address Call Control dials to ring
    // whoever is online.
    const { data: integ } = await db.from('telnyx_integrations')
      .select('sip_username').eq('company_id', companyId).maybeSingle()

    await db.from('agent_presence').upsert({
      company_id: companyId,
      user_id: userId,
      sip_username: integ?.sip_username || null,
      available: true,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'company_id,user_id' })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
