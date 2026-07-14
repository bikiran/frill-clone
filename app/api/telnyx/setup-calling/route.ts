import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TelnyxService } from '@/lib/telnyx-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * Set up browser calling properly.
 *
 * Buying a number does NOT make it callable from a browser — Telnyx needs a
 * Credential Connection (for WebRTC), an outbound voice profile, and the number
 * pointed at that connection. Without them the client gets a token for a
 * connection that doesn't exist, and fails with "Connection to server lost".
 *
 * This creates whatever is missing and reports exactly what it did, so a failure
 * is diagnosable instead of a mystery.
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

    const db = admin()
    const { data: integ } = await db.from('telnyx_integrations')
      .select('*').eq('company_id', companyId).maybeSingle()

    if (!integ?.api_key) {
      return NextResponse.json({ error: 'No Telnyx API key for this company.' }, { status: 400 })
    }
    if (!integ.phone_number) {
      return NextResponse.json({ error: 'No phone number on this account yet.' }, { status: 400 })
    }

    const svc = new TelnyxService(integ.api_key)
    const steps: string[] = []
    const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
    const webhookUrl = `${base}/api/telnyx/webhook`

    // 1. Outbound voice profile — without one, outbound calls are rejected.
    let profileId: string | undefined
    try {
      const profile = await svc.ensureOutboundVoiceProfile(`Colvy ${companyId.slice(0, 8)}`)
      profileId = profile?.id
      steps.push(profileId ? 'Outbound voice profile ready' : 'Could not create an outbound voice profile')
    } catch (e: any) {
      steps.push(`Outbound voice profile failed: ${e.message}`)
    }

    // 2. Credential connection for WebRTC.
    let connectionId: string | undefined = integ.connection_id || undefined
    if (connectionId) {
      // Make sure it still exists on the Telnyx side.
      const existing = await svc.listCredentialConnections()
      const found = existing.find((c: any) => String(c.id) === String(connectionId))
      if (!found) {
        steps.push('Stored connection no longer exists on Telnyx — creating a new one')
        connectionId = undefined
      } else {
        steps.push('WebRTC connection already exists')
        // HEAL: connections created before the fix have NO outbound voice
        // profile attached — Telnyx rejects every outbound call from them.
        const attached = found?.outbound?.outbound_voice_profile_id
        if (!attached && profileId) {
          try {
            await svc.attachOutboundProfile(String(connectionId), profileId)
            steps.push('Outbound voice profile attached to the connection (this was why calls were rejected)')
          } catch (e: any) {
            steps.push(`Could not attach the outbound voice profile: ${e.message}`)
          }
        } else if (attached) {
          steps.push('Outbound voice profile already attached')
        }
      }
    }

    if (!connectionId) {
      try {
        const conn = await svc.createCredentialConnection(`Colvy WebRTC ${companyId.slice(0, 8)}`, webhookUrl, profileId)
        connectionId = conn?.data?.id
        steps.push(connectionId ? 'WebRTC connection created (with outbound voice profile attached)' : 'Could not create the WebRTC connection')
      } catch (e: any) {
        return NextResponse.json({
          error: `Could not create the WebRTC connection: ${e.message}`,
          steps,
        }, { status: 502 })
      }
    }

    if (!connectionId) {
      return NextResponse.json({ error: 'No WebRTC connection could be established.', steps }, { status: 502 })
    }

    // 3. Point the number at the connection, so inbound calls reach the browser.
    try {
      await svc.assignNumberToConnection(integ.phone_number, connectionId)
      steps.push(`${integ.phone_number} pointed at the WebRTC connection`)
    } catch (e: any) {
      steps.push(`Could not assign the number: ${e.message}`)
    }

    // 4. Store it, and clear any stale credential so a fresh one is minted
    //    against the new connection.
    await db.from('telnyx_integrations').update({
      connection_id: connectionId,
      sip_username: null,     // force a new telephony credential
    }).eq('company_id', companyId)

    return NextResponse.json({ ok: true, connectionId, steps })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// GET → what's set up, and what isn't.
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()

    const { data: integ } = await db.from('telnyx_integrations')
      .select('*').eq('company_id', companyId).maybeSingle()

    const checks: any = {
      api_key: !!integ?.api_key,
      phone_number: integ?.phone_number || null,
      connection_id: integ?.connection_id || null,
      credential: !!integ?.sip_username,
    }

    let connectionExists = false
    if (integ?.api_key && integ?.connection_id) {
      const svc = new TelnyxService(integ.api_key)
      const list = await svc.listCredentialConnections()
      connectionExists = list.some((c: any) => String(c.id) === String(integ.connection_id))
    }
    checks.connection_exists_on_telnyx = connectionExists

    let verdict = 'Calling looks ready.'
    if (!checks.api_key) verdict = 'No Telnyx API key.'
    else if (!checks.phone_number) verdict = 'No phone number yet.'
    else if (!checks.connection_id) verdict = 'No WebRTC connection — click "Set up calling". This is why calls fail with "Connection to server lost".'
    else if (!connectionExists) verdict = 'The stored WebRTC connection no longer exists on Telnyx — click "Set up calling" to recreate it.'

    return NextResponse.json({ ok: true, verdict, checks })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
