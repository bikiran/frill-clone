import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Same-origin image proxy for the gallery editor. A <canvas> can't export
// (toDataURL/toBlob) an image drawn from a cross-origin host unless that host
// sends permissive CORS headers — otherwise the canvas is "tainted" and Save
// fails. Storage domains (R2 / Supabase) don't reliably send those headers, so
// we stream the bytes back through our own origin, where the canvas stays clean.
//
// Locked to known storage hosts so this can't be used as an open proxy (SSRF).
const ALLOWED = [/\.supabase\.co$/i, /(^|\.)colvy\.com$/i, /\.r2\.dev$/i, /\.r2\.cloudflarestorage\.com$/i]

function allowedHost(host: string): boolean {
  return ALLOWED.some(re => re.test(host))
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url')
  if (!raw) return NextResponse.json({ error: 'Missing url' }, { status: 400 })
  let target: URL
  try { target = new URL(raw) } catch { return NextResponse.json({ error: 'Bad url' }, { status: 400 }) }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') return NextResponse.json({ error: 'Bad protocol' }, { status: 400 })
  if (!allowedHost(target.hostname)) return NextResponse.json({ error: 'Host not allowed' }, { status: 403 })

  try {
    // A stored media URL is immutable, so let the browser and the Vercel edge
    // cache it — the editor opens instantly on repeat, instead of re-streaming
    // the full original through the server every time.
    const upstream = await fetch(target.toString(), { cache: 'force-cache' })
    if (!upstream.ok || !upstream.body) return NextResponse.json({ error: 'Fetch failed' }, { status: 502 })
    const ct = upstream.headers.get('content-type') || 'application/octet-stream'
    // Only proxy images — never let this stream arbitrary content types.
    if (!ct.startsWith('image/')) return NextResponse.json({ error: 'Not an image' }, { status: 415 })
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Proxy error' }, { status: 500 })
  }
}
