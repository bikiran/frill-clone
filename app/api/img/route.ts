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
//
// Anyone can call this with any address, and what it returns is served from
// our own origin, so:
//   • every hop (redirects included) must be a public internet address — a
//     hostname check alone let a redirect or a DNS name reach private ranges;
//   • only raster images come back. An SVG is a document that can run script,
//     and opened from here it would run on colvy.com;
//   • the answer is sandboxed and never sniffed as anything else.
const MAX_BYTES = 15 * 1024 * 1024
const RASTER = /^image\/(png|jpe?g|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon|heic|heif|tiff)$/i

export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get('src')
  if (!src) return new NextResponse('missing src', { status: 400 })

  let url: URL
  try { url = new URL(src) } catch { return new NextResponse('bad url', { status: 400 }) }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return new NextResponse('unsupported scheme', { status: 400 })
  }

  try {
    let current = url.toString()
    let upstream: Response | null = null
    for (let hop = 0; hop < 5; hop++) {
      if (await publicUrlProblem(current)) return new NextResponse('blocked host', { status: 400 })
      const res = await fetch(current, {
        headers: { 'User-Agent': 'ColvyImageProxy/1.0', 'Accept': 'image/*,*/*;q=0.8' },
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      })
      const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
      if (!next) { upstream = res; break }
      current = new URL(next, current).toString()
    }
    if (!upstream || !upstream.ok) return new NextResponse('upstream error', { status: 502 })
    const contentType = (upstream.headers.get('content-type') || '').split(';')[0].trim()
    if (!RASTER.test(contentType)) return new NextResponse('not an image', { status: 415 })
    if (Number(upstream.headers.get('content-length') || 0) > MAX_BYTES) return new NextResponse('too large', { status: 413 })

    const body = await upstream.arrayBuffer()
    if (body.byteLength > MAX_BYTES) return new NextResponse('too large', { status: 413 })
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
