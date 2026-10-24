import { NextRequest } from 'next/server'
import { buildLlmsFullTxt, isColvyMarketingHost } from '@/lib/llms'

// /llms-full.txt for AI assistants and agents (lib/llms.ts). Colvy's own site only:
// a business's subdomain or custom domain has no Colvy summary to give.
export async function GET(req: NextRequest) {
  if (!isColvyMarketingHost(req.headers.get('host'))) return new Response('Not found', { status: 404 })
  return new Response(buildLlmsFullTxt(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  })
}
