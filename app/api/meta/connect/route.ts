import { NextRequest, NextResponse } from 'next/server'
import { metaLoginUrl, isMetaConfigured } from '@/lib/meta'

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
  return NextResponse.redirect(metaLoginUrl(state))
}
