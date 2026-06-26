import { NextRequest, NextResponse } from 'next/server'

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.png|logo\\.png|.*\\..*).*)',],
}

const ADMIN_PATHS = [
  '/admin', '/api/', '/signin', '/signup', '/landing', '/onboarding',
  '/upgrade', '/billing', '/auth/', '/reset-password', '/forgot-password',
  '/profile', '/platform-admin', '/account', '/pricing', '/features',
]

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone()
  const hostname = req.headers.get('host') || ''
  const path = url.pathname

  // colvy.com → serve normally (page.tsx → /landing)
  if (hostname === 'colvy.com' || hostname === 'www.colvy.com') {
    return NextResponse.next()
  }

  // admin.colvy.com → platform admin
  if (hostname === 'admin.colvy.com') {
    url.pathname = `/platform-admin${path === '/' ? '' : path}`
    return NextResponse.rewrite(url)
  }

  // *.colvy.com subdomains
  if (hostname.endsWith('.colvy.com')) {
    const parts = hostname.split('.')
    if (parts.length === 3) {
      const sub = parts[0]
      const reserved = new Set(['www', 'api', 'mail', 'smtp', 'cdn', 'assets', 'static', 'admin'])
      if (!reserved.has(sub)) {
        // Admin/auth paths — pass through unchanged
        if (ADMIN_PATHS.some(p => path.startsWith(p))) {
          const res = NextResponse.next()
          res.headers.set('x-subdomain', sub)
          return res
        }
        // Root / → go to board index
        if (path === '/') {
          url.pathname = `/board/${sub}`
          const res = NextResponse.rewrite(url)
          res.headers.set('x-subdomain', sub)
          return res
        }
        // /roadmap, /announcements, /help, /help/* — serve the REAL colvy.com pages
        // They detect hostname and filter by company automatically
        const res = NextResponse.next()
        res.headers.set('x-subdomain', sub)
        return res
      }
    }
    return NextResponse.next()
  }

  // localhost/vercel preview
  if (hostname.includes('localhost') || hostname.includes('vercel.app')) {
    return NextResponse.next()
  }

  // Custom domains (help.prexty.com)
  const encodedDomain = hostname.replace(/\./g, '__')
  url.pathname = `/custom/${encodedDomain}${path === '/' ? '' : path}`
  const res = NextResponse.rewrite(url)
  res.headers.set('x-custom-domain', hostname)
  return res
}
