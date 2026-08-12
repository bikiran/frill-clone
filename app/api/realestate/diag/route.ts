import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { reaConfigured, reaConfigSummary, getAccessToken, getSigningKeys, signatureSelfTest } from '@/lib/rea'

export const dynamic = 'force-dynamic'

const SUPER_ADMIN = 'bishalstha76@gmail.com'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Super-admin diagnostic for the realestate.com.au partner integration. Confirms
// the live server config without waiting for a real enquiry:
//   1. credentials present   2. OAuth client_credentials token works
//   3. Ed25519 signing keys are retrievable   4. the verifier self-tests green
// Never returns the client secret (only whether it's set) or private key material.
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const { data: auth } = token ? await db.auth.getUser(token) : { data: null as any }
    if ((auth?.user?.email || '').toLowerCase() !== SUPER_ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const out: any = { config: reaConfigSummary(), checks: [], ok: false }
    const add = (name: string, ok: boolean, detail: string) => out.checks.push({ name, ok, detail })

    // 1) Platform credentials present.
    const configured = reaConfigured()
    add('credentials configured', configured,
      configured ? `client ${out.config.clientId}, secret set` : 'REA_CLIENT_ID / REA_CLIENT_SECRET are not set on the server')

    // 2) Local verifier self-test (no network) — proves our own code path.
    const st = signatureSelfTest()
    add('signature verifier self-test', st.ok, st.detail)

    // The rest need live credentials.
    if (!configured) return NextResponse.json(out)

    // 3) OAuth token (client_credentials).
    try {
      const t = await getAccessToken()
      add('oauth token', !!t, t ? `got a client_credentials token (${t.length} chars)` : 'no access_token returned')
    } catch (e: any) {
      add('oauth token', false, e?.message || 'token request failed')
    }

    // 4) Ed25519 signing keys are published + parseable.
    try {
      const keys = await getSigningKeys(true)
      const ids = keys.map(k => k.id).filter(Boolean)
      add('signing keys', keys.length > 0,
        keys.length ? `${keys.length} Ed25519 key(s) from ${out.config.signingPath}${ids.length ? ` (ids: ${ids.join(', ')})` : ''}`
                    : `no keys returned from ${out.config.signingPath}`)
    } catch (e: any) {
      add('signing keys', false, e?.message || 'signing key fetch failed')
    }

    out.ok = out.checks.every((c: any) => c.ok)
    return NextResponse.json(out)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
