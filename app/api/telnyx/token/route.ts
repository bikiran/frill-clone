import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TelnyxService } from '@/lib/telnyx-service'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Mints a short-lived WebRTC login token for the browser client.
// The browser NEVER sees the API key — only this ephemeral JWT.
export async function POST(req: NextRequest) {
  try {
    const { companyId } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const db = admin()
    const { data: integ } = await db.from('telnyx_integrations').select('*').eq('company_id', companyId).maybeSingle()
    if (!integ?.api_key) return NextResponse.json({ error: 'Telnyx not configured for this company' }, { status: 400 })
    if (!integ.connection_id) return NextResponse.json({ error: 'No WebRTC connection configured' }, { status: 400 })

    const svc = new TelnyxService(integ.api_key)

    // Reuse a stored credential if we have one, otherwise create one bound to
    // the company's connection.
    let credentialId = (integ as any).sip_username // we store the credential id here
    if (!credentialId) {
      const cred = await svc.createTelephonyCredential(integ.connection_id, `colvy-${companyId.slice(0, 8)}`)
      credentialId = cred?.data?.id
      if (credentialId) {
        await db.from('telnyx_integrations').update({ sip_username: credentialId }).eq('company_id', companyId)
      }
    }
    if (!credentialId) return NextResponse.json({ error: 'Could not create WebRTC credential' }, { status: 500 })

    const token = await svc.createCredentialToken(credentialId)
    return NextResponse.json({ token, from: integ.phone_number })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
