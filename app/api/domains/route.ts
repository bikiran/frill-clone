import { NextRequest, NextResponse } from 'next/server'
import { provisionSubdomain } from '@/lib/provision-domain'

const VERCEL_TOKEN = process.env.VERCEL_TOKEN || ''
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || ''
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || ''

async function vercelRequest(method: string, path: string, body?: any) {
  const teamParam = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : ''
  const res = await fetch(`https://api.vercel.com${path}${teamParam}`, {
    method,
    headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

// Provision a board subdomain (Vercel project domain + Cloudflare CNAME) via the
// shared, idempotent engine. Only *.colvy.com is accepted.
export async function POST(req: NextRequest) {
  try {
    const { domain } = await req.json()
    if (!domain) return NextResponse.json({ error: 'Domain required' }, { status: 400 })
    const result = await provisionSubdomain(domain)
    return NextResponse.json({ success: result.ok, ...result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { domain } = await req.json()
    if (!domain) return NextResponse.json({ error: 'Domain required' }, { status: 400 })

    if (VERCEL_TOKEN && VERCEL_PROJECT_ID) {
      await vercelRequest('DELETE', `/v9/projects/${VERCEL_PROJECT_ID}/domains/${domain}`)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const domain = req.nextUrl.searchParams.get('domain')
    if (!domain) return NextResponse.json({ error: 'Domain required' }, { status: 400 })

    if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
      return NextResponse.json({ configured: false, manual: true })
    }

    const result = await vercelRequest('GET', `/v9/projects/${VERCEL_PROJECT_ID}/domains/${domain}`)
    return NextResponse.json({
      configured: !result.error,
      verified: result.verified || false,
      domain: result,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
