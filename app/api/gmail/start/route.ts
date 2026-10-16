import { readValue, signValue, safeReturn } from '@/lib/oauth-state'
import { gmailAuthUrl } from '@/lib/gmail-oauth'
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

  // Only a member of this workspace can start a connection (see lib/oauth-state).
  const ticket = readValue(req.nextUrl.searchParams.get('ticket'), 'ticket')
  if (!ticket || ticket.purpose !== 'gmail' || ticket.companyId !== companyId) {
    return NextResponse.json({ error: 'Open the integration page and press Connect again.' }, { status: 401 })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
  if (!clientId) {
    // Never show a customer an env var name: back to the Email page, which
    // explains it in plain English and offers forwarding instead.
    console.error('[gmail/start] GOOGLE_CLIENT_ID is not set')
    const dest = safeReturn(returnTo) || `${base}/admin/crm-settings/channels/email`
    return NextResponse.redirect(`${dest}${dest.includes('?') ? '&' : '?'}gmail=error&reason=not_configured`)
  }

  const redirectUri = `${base}/api/gmail/callback`
  const state = signValue({ kind: 'state', purpose: 'gmail', companyId, userId: ticket.userId, locationId, returnTo: safeReturn(returnTo) }, 30 * 60 * 1000)

  // Read mail and send mail: the least that works (see lib/gmail-oauth.ts).
  // The consent screen's name, logo and privacy/terms links come from the
  // Google Cloud project's OAuth consent screen, not from this request.
  return NextResponse.redirect(gmailAuthUrl({ clientId, redirectUri, state }))
}
