import { NextRequest, NextResponse } from 'next/server'

const VERCEL_TOKEN = process.env.VERCEL_TOKEN || ''
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || ''
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || '' // optional

async function vercelRequest(method: string, path: string, body?: any) {
  const teamParam = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : ''
  const res = await fetch(`https://api.vercel.com${path}${teamParam}`, {
    method,
    headers: {
      'Authorization': `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

// POST /api/domains — add a domain to Vercel project
export async function POST(req: NextRequest) {
  try {
    const { domain } = await req.json()
    if (!domain) return NextResponse.json({ error: 'Domain required' }, { status: 400 })

    if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
      // No Vercel API keys configured — return instructions
      return NextResponse.json({
        manual: true,
        message: 'Add VERCEL_TOKEN and VERCEL_PROJECT_ID to env vars to automate this',
        domain,
        instructions: [
          `Go to Vercel → your project → Settings → Domains`,
          `Add: ${domain}`,
          `Add CNAME record: ${domain.split('.')[0]} → cns.vercel-dns.com`,
        ]
      })
    }

    // Add domain to Vercel project via API
    const result = await vercelRequest('POST', `/v10/projects/${VERCEL_PROJECT_ID}/domains`, {
      name: domain,
    })

    if (result.error) {
      return NextResponse.json({ error: result.error.message, code: result.error.code }, { status: 400 })
    }

    return NextResponse.json({ success: true, domain: result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/domains — remove a domain from Vercel project
export async function DELETE(req: NextRequest) {
  try {
    const { domain } = await req.json()
    if (!domain) return NextResponse.json({ error: 'Domain required' }, { status: 400 })

    if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
      return NextResponse.json({ manual: true, message: 'Remove domain manually from Vercel dashboard', domain })
    }

    const result = await vercelRequest('DELETE', `/v9/projects/${VERCEL_PROJECT_ID}/domains/${domain}`)

    return NextResponse.json({ success: true, result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET /api/domains?domain=xxx — check domain status on Vercel
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
      misconfigured: result.misconfigured || false,
      domain: result,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
