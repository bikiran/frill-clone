import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Exchanges the OAuth code for tokens and stores them against the company.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const stateRaw = req.nextUrl.searchParams.get('state')
  const err = req.nextUrl.searchParams.get('error')

  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

  let companyId = ''
  let returnTo = ''
  try {
    const s = JSON.parse(Buffer.from(String(stateRaw), 'base64url').toString())
    companyId = s.companyId
    returnTo = s.returnTo || ''
  } catch {}

  const back = (q: string) => {
    const dest = returnTo && /^https:\/\/([a-z0-9-]+\.)?colvy\.com/i.test(returnTo)
      ? returnTo
      : `${base}/admin/integrations/google-reviews`
    return NextResponse.redirect(`${dest}${dest.includes('?') ? '&' : '?'}${q}`)
  }

  if (err) return back(`google=error&reason=${encodeURIComponent(err)}`)
  if (!code || !companyId) return back('google=error&reason=missing_code')

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return back('google=error&reason=not_configured')

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: process.env.GOOGLE_REVIEWS_REDIRECT_URI || `${base}/api/google/reviews/callback`,
        grant_type: 'authorization_code',
      }),
    })
    const tok = await tokenRes.json()
    if (!tokenRes.ok || !tok.access_token) {
      return back(`google=error&reason=${encodeURIComponent(tok.error_description || 'token_exchange_failed')}`)
    }

    const db = admin()
    const expiresAt = new Date(Date.now() + (tok.expires_in || 3600) * 1000).toISOString()

    const { data: existing } = await db.from('google_business_accounts')
      .select('id, refresh_token').eq('company_id', companyId).limit(1)

    const row: any = {
      company_id: companyId,
      access_token: tok.access_token,
      token_expires_at: expiresAt,
      is_active: true,
      updated_at: new Date().toISOString(),
    }
    // Google only returns a refresh token on first consent — keep the old one.
    if (tok.refresh_token) row.refresh_token = tok.refresh_token

    if (existing?.[0]?.id) {
      await db.from('google_business_accounts').update(row).eq('id', existing[0].id)
    } else {
      await db.from('google_business_accounts').insert(row)
    }

    return back('google=connected')
  } catch (e: any) {
    return back(`google=error&reason=${encodeURIComponent(e.message)}`)
  }
}
