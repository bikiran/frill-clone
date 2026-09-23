import { NextRequest, NextResponse } from 'next/server'
import { provisionCustomDomain } from '@/lib/provision-domain'

export const dynamic = 'force-dynamic'

// Verify (and, on first call, register) a customer's custom domain on the Vercel
// project. Registering is what makes Vercel serve the host at all — without it
// the domain 404s with DEPLOYMENT_NOT_FOUND even when DNS is correct. Returns
// the live verification state plus the exact DNS records still required.
export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get('domain')
  if (!domain) return NextResponse.json({ verified: false, error: 'No domain' }, { status: 400 })
  try {
    const r = await provisionCustomDomain(domain)
    return NextResponse.json({
      verified: r.verified,
      registered: r.registered,
      configured: r.configured,
      misconfigured: r.misconfigured,
      records: r.records,
      // `manual` keeps the settings UI's existing branch working when the server
      // has no Vercel token — it shows the static DNS instructions instead.
      manual: !r.configured,
      error: r.error,
    })
  } catch (err: any) {
    return NextResponse.json({ verified: false, error: err?.message || 'Verify failed' })
  }
}
