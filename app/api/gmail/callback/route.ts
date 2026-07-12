import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Exchange the code for tokens, discover which Gmail address was connected, and
// store it as an email_channel with provider = 'gmail'.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const stateRaw = req.nextUrl.searchParams.get('state')
  const err = req.nextUrl.searchParams.get('error')
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

  let companyId = '', locationId = '', returnTo = ''
  try {
    const s = JSON.parse(Buffer.from(String(stateRaw), 'base64url').toString())
    companyId = s.companyId; locationId = s.locationId || ''; returnTo = s.returnTo || ''
  } catch {}

  const back = (q: string) => {
    const dest = returnTo && /^https:\/\/([a-z0-9-]+\.)?colvy\.com/i.test(returnTo)
      ? returnTo
      : `${base}/admin/integrations/email`
    return NextResponse.redirect(`${dest}${dest.includes('?') ? '&' : '?'}${q}`)
  }

  if (err) return back(`gmail=error&reason=${encodeURIComponent(err)}`)
  if (!code || !companyId) return back('gmail=error&reason=missing_code')

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return back('gmail=error&reason=not_configured')

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: `${base}/api/gmail/callback`,
        grant_type: 'authorization_code',
      }),
    })
    const tok = await tokenRes.json()
    if (!tokenRes.ok || !tok.access_token) {
      return back(`gmail=error&reason=${encodeURIComponent(tok.error_description || 'token_exchange_failed')}`)
    }

    // Which address did they connect?
    const profRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    })
    const prof = await profRes.json()
    const address = (prof.emailAddress || '').toLowerCase()
    if (!address) return back('gmail=error&reason=could_not_read_address')

    const db = admin()
    const expiresAt = new Date(Date.now() + (tok.expires_in || 3600) * 1000).toISOString()

    const row: any = {
      company_id: companyId,
      provider: 'gmail',
      inbound_address: address,
      from_address: address,
      location_id: locationId || null,
      access_token: tok.access_token,
      token_expires_at: expiresAt,
      history_id: prof.historyId ? String(prof.historyId) : null,
      is_active: true,
      sync_error: null,
    }
    // Google only returns a refresh token on first consent — keep the old one.
    if (tok.refresh_token) row.refresh_token = tok.refresh_token

    const { data: existing } = await db.from('email_channels')
      .select('id').eq('company_id', companyId).ilike('inbound_address', address).limit(1)

    if (existing?.[0]?.id) {
      await db.from('email_channels').update(row).eq('id', existing[0].id)
    } else {
      await db.from('email_channels').insert(row)
    }

    return back(`gmail=connected&address=${encodeURIComponent(address)}`)
  } catch (e: any) {
    return back(`gmail=error&reason=${encodeURIComponent(e.message)}`)
  }
}
