import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST { companyId, username, password }
// Stores the Credential SIP Connection's username/password so the browser can
// REGISTER with them (required for this connection type to receive inbound
// calls). One-time setup: the values are on Telnyx → the connection →
// Authentication and routing.
export async function POST(req: NextRequest) {
  try {
    const { companyId, username, password } = await req.json()
    if (!companyId || !username || !password) {
      return NextResponse.json({ error: 'companyId, username, password required' }, { status: 400 })
    }
    const db = admin()
    const { error } = await db.from('telnyx_integrations')
      .update({ sip_conn_username: username, sip_conn_password: password })
      .eq('company_id', companyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, message: 'SIP registration credentials saved. Reopen Colvy to register.' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
