import { NextRequest, NextResponse } from 'next/server'

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.png|logo\\.png|.*\\..*).*)',],
}

const RESERVED = new Set([
  'www', 'app', 'api', 'mail', 'smtp', 'ftp',
  'dev', 'staging', 'preview', 'static', 'cdn', 'assets',
])

const PASSTHROUGH_PREFIXES = [
  '/admin', '/api/', '/_next', '/signin', '/signup',
  '/landing', '/onboarding', '/upgrade', '/billing',
  '/auth/', '/reset-password', '/forgot-password',
  '/profile', '/platform-admin',
]

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone()
  const hostname = req.headers.get('host') || ''
  const path = url.pathname

  // ── colvy.com root domain → serve normal app ────────────────────
  if (hostname === 'colvy.com' || hostname === 'www.colvy.com') {
    return NextResponse.next()
  }

  // ── admin.colvy.com → platform super admin ──────────────────────
  if (hostname === 'admin.colvy.com') {
    url.pathname = `/platform-admin${path === '/' ? '' : path}`
    return NextResponse.rewrite(url)
  }

  // ── *.colvy.com subdomains ──────────────────────────────────────
  if (hostname.endsWith('.colvy.com')) {
    const parts = hostname.split('.')
    if (parts.length === 3) {
      const sub = parts[0]
      if (!RESERVED.has(sub)) {
        if (PASSTHROUGH_PREFIXES.some(p => path.startsWith(p))) {
          const res = NextResponse.next()
          res.headers.set('x-subdomain', sub)
          return res
        }
        url.pathname = `/board/${sub}${path === '/' ? '' : path}`
        const res = NextResponse.rewrite(url)
        res.headers.set('x-subdomain', sub)
        return res
      }
    }
    return NextResponse.next()
  }

  // ── Local dev: arik.localhost:3000 ──────────────────────────────
  if (hostname.includes('localhost')) {
    const parts = hostname.split('.')
    if (parts.length >= 2 && parts[0] !== 'localhost') {
      const sub = parts[0]
      if (!PASSTHROUGH_PREFIXES.some(p => path.startsWith(p))) {
        url.pathname = `/board/${sub}${path === '/' ? '' : path}`
        return NextResponse.rewrite(url)
      }
    }
    return NextResponse.next()
  }

  // ── Vercel preview ──────────────────────────────────────────────
  if (hostname.includes('vercel.app')) {
    return NextResponse.next()
  }

  // ── Custom domains (help.prexty.com, feedback.acme.com) ─────────
  // These are non-colvy.com domains registered via Settings → White Labeling
  if (PASSTHROUGH_PREFIXES.some(p => path.startsWith(p))) {
    const res = NextResponse.next()
    res.headers.set('x-custom-domain', hostname)
    return res
  }

  const encodedDomain = hostname.replace(/\./g, '__')
  url.pathname = `/custom/${encodedDomain}${path === '/' ? '' : path}`
  const res = NextResponse.rewrite(url)
  res.headers.set('x-custom-domain', hostname)
  return res
}
