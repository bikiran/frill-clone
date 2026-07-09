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

// Save / update Telnyx config for a company. Verifies the API key first.
export async function POST(req: NextRequest) {
  try {
    const { companyId, apiKey, messagingProfileId, connectionId, phoneNumber, outboundVoiceProfileId, isUpdate } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const db = admin()

    // If a new key was provided, verify it works
    let verifiedKey = apiKey
    if (apiKey && !apiKey.includes('••')) {
      try {
        const svc = new TelnyxService(apiKey)
        await svc.listPhoneNumbers() // throws if invalid
      } catch (e: any) {
        return NextResponse.json({ error: `Could not verify Telnyx key: ${e.message}` }, { status: 400 })
      }
    } else if (isUpdate) {
      // Keep the existing key
      const { data: existing } = await db.from('telnyx_integrations').select('api_key').eq('company_id', companyId).maybeSingle()
      verifiedKey = existing?.api_key || null
    }

    const payload: any = {
      company_id: companyId,
      messaging_profile_id: messagingProfileId || null,
      connection_id: connectionId || null,
      phone_number: phoneNumber || null,
      outbound_voice_profile_id: outboundVoiceProfileId || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }
    if (verifiedKey) payload.api_key = verifiedKey

    const { data: existing } = await db.from('telnyx_integrations').select('id').eq('company_id', companyId).maybeSingle()
    if (existing) {
      await db.from('telnyx_integrations').update(payload).eq('company_id', companyId)
    } else {
      await db.from('telnyx_integrations').insert(payload)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Fetch config (masked) for the settings page
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()
    const { data } = await db.from('telnyx_integrations').select('*').eq('company_id', companyId).maybeSingle()
    if (!data) return NextResponse.json({ integration: null })
    // Mask the API key
    return NextResponse.json({
      integration: {
        ...data,
        api_key: data.api_key ? `••••••••${String(data.api_key).slice(-4)}` : null,
        sip_password: undefined,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
