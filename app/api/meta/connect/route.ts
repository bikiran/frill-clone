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
  const companyId = new URL(req.url).searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  // A little CSRF protection: sign the state so the callback can trust it.
  const state = Buffer.from(JSON.stringify({ companyId, t: Date.now() })).toString('base64url')
  return NextResponse.redirect(metaLoginUrl(state))
}
