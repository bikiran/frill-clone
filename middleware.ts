import { NextRequest, NextResponse } from 'next/server'

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.png|logo\\.png|.*\\..*).*)',],
}

const RESERVED = new Set([
  'www', 'app', 'api', 'mail', 'smtp', 'ftp',
  'dev', 'staging', 'preview', 'static', 'cdn', 'assets',
])

// Paths that pass through to the real Next.js app unchanged
const PASSTHROUGH_PREFIXES = [
  '/admin',
  '/api/',
  '/_next',
  '/signin',
  '/signup',
  '/landing',
  '/onboarding',
  '/upgrade',
  '/billing',
  '/auth/',
  '/reset-password',
  '/forgot-password',
  '/profile',
  '/platform-admin',
]

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone()
  const hostname = req.headers.get('host') || ''
  const path = url.pathname

  const parts = hostname.split('.')

  // ── admin.colvy.com → platform super admin ──────────────────────────
  if (hostname === 'admin.colvy.com') {
    url.pathname = `/platform-admin${path === '/' ? '' : path}`
    return NextResponse.rewrite(url)
  }

  // ── *.colvy.com subdomains ───────────────────────────────────────────
  if (hostname.endsWith('.colvy.com') && parts.length === 3) {
    const sub = parts[0]
    if (RESERVED.has(sub)) return NextResponse.next()

    // Passthrough paths serve real admin app
    if (PASSTHROUGH_PREFIXES.some(p => path.startsWith(p))) {
      const res = NextResponse.next()
      res.headers.set('x-subdomain', sub)
      return res
    }

    // Board-facing paths rewrite to /board/[slug]
    url.pathname = `/board/${sub}${path === '/' ? '' : path}`
    const res = NextResponse.rewrite(url)
    res.headers.set('x-subdomain', sub)
    return res
  }

  // ── Local dev: arik.localhost:3000 ───────────────────────────────────
  if (hostname.includes('localhost') && parts.length >= 2 && parts[0] !== 'localhost') {
    const sub = parts[0]
    if (PASSTHROUGH_PREFIXES.some(p => path.startsWith(p))) {
      return NextResponse.next()
    }
    url.pathname = `/board/${sub}${path === '/' ? '' : path}`
    return NextResponse.rewrite(url)
  }

  // ── Custom domains (feedback.acme.com, help.acme.com) ───────────────
  // These are non-colvy.com domains — look them up in companies table
  // We pass them through with a header and let the app handle routing
  if (!hostname.includes('colvy.com') && !hostname.includes('localhost') && !hostname.includes('vercel.app')) {
    const res = NextResponse.next()
    res.headers.set('x-custom-domain', hostname)
    return res
  }

  return NextResponse.next()
}
