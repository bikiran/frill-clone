import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Start Gmail OAuth. Redirect URI is always on the ROOT domain so only one URI
// needs registering in Google Cloud, regardless of how many company subdomains
// exist. The company + outlet are carried through `state`.
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const locationId = req.nextUrl.searchParams.get('locationId') || ''
  const returnTo = req.nextUrl.searchParams.get('returnTo') || ''
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'Google is not configured (GOOGLE_CLIENT_ID missing).' }, { status: 500 })
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
  const redirectUri = `${base}/api/gmail/callback`
  const state = Buffer.from(JSON.stringify({ companyId, locationId, returnTo })).toString('base64url')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    // Read mail, send mail, and see which address we're connected as.
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' '),
    access_type: 'offline',   // we need a refresh token
    prompt: 'consent',        // force a refresh token on reconnect
    state,
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
