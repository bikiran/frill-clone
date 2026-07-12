import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Starts the Google Business Profile OAuth flow. The redirect URI is always on
// the ROOT domain (colvy.com) so only one URI needs registering in Google Cloud
// — the company id is carried through `state`, and we bounce back to the
// company's own subdomain at the end.
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const returnTo = req.nextUrl.searchParams.get('returnTo') || ''
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'Google is not configured (GOOGLE_CLIENT_ID missing).' }, { status: 500 })
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
  const redirectUri = `${base}/api/google/reviews/callback`

  const state = Buffer.from(JSON.stringify({ companyId, returnTo })).toString('base64url')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    // Business Profile management (reviews live here).
    scope: 'https://www.googleapis.com/auth/business.manage',
    access_type: 'offline',      // we need a refresh token
    prompt: 'consent',           // force refresh token on re-connect
    state,
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
