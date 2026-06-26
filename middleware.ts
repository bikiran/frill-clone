import { NextRequest, NextResponse } from 'next/server'

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.png|logo\\.png|.*\\..*).*)',],
}

const PASSTHROUGH = [
  '/admin', '/api/', '/_next', '/signin', '/signup',
  '/landing', '/onboarding', '/upgrade', '/billing',
  '/auth/', '/reset-password', '/forgot-password',
  '/profile', '/platform-admin', '/account', '/pricing',
  '/features',
]

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone()
  const hostname = req.headers.get('host') || ''
  const path = url.pathname

  // colvy.com root → serve normally (lands on /landing via page.tsx)
  if (hostname === 'colvy.com' || hostname === 'www.colvy.com') {
    return NextResponse.next()
  }

  // admin.colvy.com → platform admin
  if (hostname === 'admin.colvy.com') {
    url.pathname = `/platform-admin${path === '/' ? '' : path}`
    return NextResponse.rewrite(url)
  }

  // *.colvy.com subdomains → rewrite to /board/[slug]/...
  if (hostname.endsWith('.colvy.com')) {
    const parts = hostname.split('.')
    if (parts.length === 3) {
      const sub = parts[0]
      const reserved = new Set(['www', 'api', 'mail', 'smtp', 'cdn', 'assets', 'static', 'admin'])
      if (!reserved.has(sub)) {
        if (PASSTHROUGH.some(p => path.startsWith(p))) {
          const res = NextResponse.next()
          res.headers.set('x-subdomain', sub)
          return res
        }
        // Rewrite ALL paths to /board/[slug]/path
        const boardPath = path === '/' ? '' : path
        url.pathname = `/board/${sub}${boardPath}`
        const res = NextResponse.rewrite(url)
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
