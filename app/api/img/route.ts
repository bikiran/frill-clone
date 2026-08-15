import { NextRequest, NextResponse } from 'next/server'

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
  // Basic SSRF guard: never let the proxy reach loopback / link-local / private
  // ranges by hostname. This is an image fetch, not a general fetcher.
  const host = url.hostname
  if (
    /^(localhost|0\.0\.0\.0)$/i.test(host) ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === '::1'
  ) {
    return new NextResponse('blocked host', { status: 400 })
  }

  try {
    const upstream = await fetch(url.toString(), {
      headers: { 'User-Agent': 'ColvyImageProxy/1.0', 'Accept': 'image/*,*/*;q=0.8' },
      redirect: 'follow',
    })
    if (!upstream.ok) return new NextResponse('upstream error', { status: 502 })
    const contentType = upstream.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) return new NextResponse('not an image', { status: 415 })

    const body = await upstream.arrayBuffer()
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Cache hard — product images are effectively immutable per URL.
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable',
      },
    })
  } catch {
    return new NextResponse('fetch failed', { status: 502 })
  }
}
