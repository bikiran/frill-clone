import { NextRequest, NextResponse } from 'next/server'

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.png|logo\\.png|.*\\..*).*)',],
}

const ADMIN_PATHS = [
  '/admin', '/api/', '/signin', '/signup', '/landing', '/onboarding',
  '/upgrade', '/billing', '/auth/', '/reset-password', '/forgot-password',
  '/profile', '/platform-admin', '/account', '/pricing', '/features',
]

export function proxy(req: NextRequest) {
  const url = req.nextUrl.clone()
  const hostname = req.headers.get('host') || ''
  const path = url.pathname

  // colvy.com → rewrite root to /landing (keeps URL bar as colvy.com/)
  // Use REWRITE not REDIRECT — redirect breaks Next.js Link navigation
  // because the router sees the URL as /landing and relative links break
  if (hostname === 'colvy.com' || hostname === 'www.colvy.com') {
    if (path === '/') {
      url.pathname = '/landing'
      return NextResponse.rewrite(url)
    }
    // All other colvy.com paths (/signin, /signup, /pricing, etc.) serve normally
    return NextResponse.next()
  }

  // admin.colvy.com → platform admin dashboard
  if (hostname === 'admin.colvy.com') {
    if (path.startsWith('/api/') || path.startsWith('/auth/') || path.startsWith('/_next/')) {
      return NextResponse.next()
    }
    url.pathname = `/platform-admin${path === '/' ? '' : path}`
    return NextResponse.rewrite(url)
  }

  // *.colvy.com subdomains → serve the same app pages with subdomain header
  if (hostname.endsWith('.colvy.com')) {
    const parts = hostname.split('.')
    if (parts.length === 3) {
      const sub = parts[0]
      const reserved = new Set(['www', 'api', 'mail', 'smtp', 'cdn', 'assets', 'static', 'admin'])
      if (!reserved.has(sub)) {
        const res = NextResponse.next()
        res.headers.set('x-subdomain', sub)
        return res
      }
    }
    return NextResponse.next()
  }

  // localhost / Vercel preview — pass through
  if (hostname.includes('localhost') || hostname.includes('vercel.app')) {
    return NextResponse.next()
  }

  // Custom domains (e.g. help.prexty.com)
  const encodedDomain = hostname.replace(/\./g, '__')
  url.pathname = `/custom/${encodedDomain}${path === '/' ? '' : path}`
  const res = NextResponse.rewrite(url)
  res.headers.set('x-custom-domain', hostname)
  return res
}

export default proxy
