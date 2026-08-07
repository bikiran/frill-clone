import { NextRequest, NextResponse } from 'next/server'
import { metaLoginUrl, isMetaConfigured, META_PAGE_SCOPES, META_MESSAGING_SCOPES, META_SCOPES, META_LOGIN_CONFIG_ID } from '@/lib/meta'

export const dynamic = 'force-dynamic'

// Kicks off Facebook Login. The company id rides along in `state` so the
// callback knows which company is connecting.
export async function GET(req: NextRequest) {
  if (!isMetaConfigured()) {
    return NextResponse.json({
      error: 'Meta isn\'t configured yet. Set META_APP_ID, META_APP_SECRET and META_REDIRECT_URI in Vercel.',
    }, { status: 400 })
  }
  const url = new URL(req.url)
  const companyId = url.searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  // The originating subdomain, passed explicitly by the settings page. We can't
  // rely on the request host here because this route now runs on the root
  // domain (colvy.com) — the host would always be root and we'd lose which
  // company's subdomain to return the user to.
  const origin = url.searchParams.get('origin')
    || req.headers.get('origin')
    || (req.headers.get('host') ? `https://${req.headers.get('host')}` : '')
  const state = Buffer.from(JSON.stringify({ companyId, origin, t: Date.now() })).toString('base64url')

  // Which permissions to ask for. Default is the four approved Page scopes
  // (what the Social-Engagement comments feature needs); `?scopes=full` also
  // requests the Messenger/Instagram DM scopes — only use it once the app is
  // approved for them, or Facebook rejects the whole login with "Invalid Scopes".
  const scopeParam = (url.searchParams.get('scopes') || '').toLowerCase()
  const scope = scopeParam === 'full'
    ? [...META_PAGE_SCOPES, ...META_MESSAGING_SCOPES].join(',')
    : META_SCOPES  // the env-driven default (four Page scopes unless messaging is enabled)

  const loginUrl = metaLoginUrl(state, scope)

  // ?debug=1 — return exactly what we send to Facebook (scope string, config id,
  // full dialog URL) WITHOUT redirecting, so you can prove our side is clean.
  // A deprecated scope like pages_read_user_content will NOT appear here; if
  // Facebook still complains about it, it's configured on the Meta app itself.
  if (url.searchParams.get('debug') === '1') {
    return NextResponse.json({
      requestedScope: META_LOGIN_CONFIG_ID ? '(ignored — using config_id)' : scope,
      configId: META_LOGIN_CONFIG_ID || null,
      redirectUri: process.env.META_REDIRECT_URI || null,
      loginUrl,
    })
  }

  return NextResponse.redirect(loginUrl)
}
