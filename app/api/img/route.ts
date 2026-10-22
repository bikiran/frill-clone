import { NextRequest, NextResponse } from 'next/server'
import { publicUrlProblem } from '@/lib/site-crawl'

export const dynamic = 'force-dynamic'

// Same-origin image proxy. Product images from a WooCommerce store often fail to
// load directly in the admin: the URL may be http:// (blocked as mixed content
// on our https page), behind hotlink protection (referer check), or CORS-shy.
// Fetching them server-side and streaming the bytes back from our own origin
// sidesteps all three, and the cache headers make repeat loads instant.
//
// GET /api/img?src=<encoded absolute image url>
export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get('src')
  if (!src) return new NextResponse('missing src', { status: 400 })

  let url: URL
  try { url = new URL(src) } catch { return new NextResponse('bad url', { status: 400 }) }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return new NextResponse('unsupported scheme', { status: 400 })
  }
  // SSRF guard: every hop (the address and each redirect) must resolve to a
  // public address — never loopback, link-local/metadata or private ranges.
  // This is an image fetch, not a general fetcher.
  try {
    let current = url.toString()
    let upstream: Response | null = null
    for (let hop = 0; hop < 4 && !upstream; hop++) {
      if (await publicUrlProblem(current)) return new NextResponse('blocked host', { status: 400 })
      const res = await fetch(current, {
        headers: { 'User-Agent': 'ColvyImageProxy/1.0', 'Accept': 'image/*,*/*;q=0.8' },
        redirect: 'manual', signal: AbortSignal.timeout(15_000),
      })
      const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
      if (loc) { try { await res.body?.cancel() } catch {}; current = new URL(loc, current).toString(); continue }
      upstream = res
    }
    if (!upstream) return new NextResponse('too many redirects', { status: 502 })
    if (!upstream.ok) return new NextResponse('upstream error', { status: 502 })
    const contentType = upstream.headers.get('content-type') || ''
    // Never SVG: it's served from our own origin, where its script would run.
    if (!contentType.startsWith('image/') || /svg|xml/i.test(contentType)) return new NextResponse('not an image', { status: 415 })

    const body = await upstream.arrayBuffer()
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        // Cache hard — product images are effectively immutable per URL.
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable',
      },
    })
  } catch {
    return new NextResponse('fetch failed', { status: 502 })
  }
}
