import { readValue, signValue, safeReturn } from '@/lib/oauth-state'
import { NextRequest, NextResponse } from 'next/server'
import { instagramLoginUrl, isInstagramLoginConfigured, IG_LOGIN_SCOPES, INSTAGRAM_REDIRECT_URI } from '@/lib/instagram-login'

export const dynamic = 'force-dynamic'

// Kicks off "Instagram API with Instagram Login" (instagram.com OAuth). The
// company id + originating subdomain ride along in `state` so the callback can
// attribute the connection and send the user back where they started.
export async function GET(req: NextRequest) {
  if (!isInstagramLoginConfigured()) {
    return NextResponse.json({
      error: 'Instagram Login isn\'t configured yet. Set INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET and INSTAGRAM_REDIRECT_URI in Vercel.',
    }, { status: 400 })
  }
  const url = new URL(req.url)
  const companyId = url.searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const origin = safeReturn(url.searchParams.get('origin')
    || req.headers.get('origin')
    || (req.headers.get('host') ? `https://${req.headers.get('host')}` : ''))
  // Only a member of this workspace can start a connection (see lib/oauth-state).
  const ticket = readValue(url.searchParams.get('ticket'), 'ticket')
  if (!ticket || ticket.purpose !== 'instagram' || ticket.companyId !== companyId) {
    return NextResponse.json({ error: 'Open Settings → Channels and press Connect again.' }, { status: 401 })
  }
  const state = signValue({ kind: 'state', purpose: 'instagram', companyId, userId: ticket.userId, origin }, 30 * 60 * 1000)

  const loginUrl = instagramLoginUrl(state)

  // ?debug=1 — return exactly what we send to Instagram without redirecting.
  if (url.searchParams.get('debug') === '1') {
    return NextResponse.json({ scopes: IG_LOGIN_SCOPES, redirectUri: INSTAGRAM_REDIRECT_URI, loginUrl })
  }

  // Short-lived cookie fallback for the origin subdomain, in case Instagram
  // returns without our state (e.g. the user dismisses an error dialog).
  const res = NextResponse.redirect(loginUrl)
  if (origin) {
    res.cookies.set('colvy_meta_origin', origin, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 900 })
  }
  return res
}
