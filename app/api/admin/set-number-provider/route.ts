import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const SUPER_ADMIN = 'bishalstha76@gmail.com'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Super-admin only: choose which carrier backs a company's number provisioning
// (transparent to that company). This is how a specific board (e.g. aquacircle)
// gets routed to Twilio while everyone else stays on Telnyx.
export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const db = admin()
    const { data: auth } = await db.auth.getUser(token)
    if ((auth?.user?.email || '').toLowerCase() !== SUPER_ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { companyId, provider } = await req.json()
    if (!companyId || !['telnyx', 'twilio'].includes(provider)) {
      return NextResponse.json({ error: 'companyId and provider (telnyx|twilio) required' }, { status: 400 })
    }

    await db.from('companies').update({ number_provider: provider }).eq('id', companyId)
    return NextResponse.json({ ok: true, companyId, provider })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
