import { NextRequest, NextResponse } from 'next/server'

const VERCEL_TOKEN = process.env.VERCEL_TOKEN || ''
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || ''
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || ''
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN || ''
const CF_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID || ''

async function vercelRequest(method: string, path: string, body?: any) {
  const teamParam = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : ''
  const res = await fetch(`https://api.vercel.com${path}${teamParam}`, {
    method,
    headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

async function addCloudflareDNS(subdomain: string) {
  if (!CF_TOKEN || !CF_ZONE_ID) return { skipped: true }
  // Add CNAME for subdomain.colvy.com → cns.vercel-dns.com
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'CNAME',
      name: subdomain,           // e.g. "prexty"
      content: 'cns.vercel-dns.com',
      ttl: 1,                    // Auto
      proxied: false,            // DNS only (grey cloud)
    }),
  })
  return res.json()
}

export async function POST(req: NextRequest) {
  try {
    const { domain } = await req.json()
    if (!domain) return NextResponse.json({ error: 'Domain required' }, { status: 400 })

    const results: any = { domain }

    // 1. Add to Vercel project
    if (VERCEL_TOKEN && VERCEL_PROJECT_ID) {
      const vercelResult = await vercelRequest('POST', `/v10/projects/${VERCEL_PROJECT_ID}/domains`, { name: domain })
      results.vercel = vercelResult.error
        ? { error: vercelResult.error.message, code: vercelResult.error.code }
        : { success: true }
    } else {
      results.vercel = { manual: true, message: 'Add VERCEL_TOKEN + VERCEL_PROJECT_ID to env vars' }
    }

    // 2. Add CNAME to Cloudflare (for colvy.com subdomains)
    if (domain.endsWith('.colvy.com')) {
      const subdomain = domain.replace('.colvy.com', '')
      if (CF_TOKEN && CF_ZONE_ID) {
        const cfResult = await addCloudflareDNS(subdomain)
        results.cloudflare = cfResult.success
          ? { success: true }
          : { error: cfResult.errors?.[0]?.message || 'CF error', skipped: cfResult.errors?.[0]?.code === 81053 } // 81053 = already exists
      } else {
        results.cloudflare = {
          manual: true,
          message: 'Add CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID to env vars',
          instruction: `In Cloudflare DNS: CNAME  ${domain.replace('.colvy.com', '')}  →  cns.vercel-dns.com  (DNS only)`
        }
      }
    }

    return NextResponse.json({ success: true, ...results })
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
