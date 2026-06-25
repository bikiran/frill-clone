import { NextRequest, NextResponse } from 'next/server'

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.png|logo\\.png|.*\\..*).*)',],
}

const RESERVED = new Set([
  'www', 'app', 'api', 'mail', 'smtp', 'ftp',
  'dev', 'staging', 'preview', 'static', 'cdn', 'assets',
])

// Paths that should NEVER be rewritten — always serve the real Next.js app
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
  let subdomain: string | null = null

  // Production: arik.colvy.com or admin.colvy.com
  if (hostname.endsWith('.colvy.com') && parts.length === 3) {
    const sub = parts[0]

    // admin.colvy.com → platform super admin
    if (sub === 'admin') {
      url.pathname = `/platform-admin${path === '/' ? '' : path}`
      return NextResponse.rewrite(url)
    }

    if (!RESERVED.has(sub)) subdomain = sub
  }

  // Local dev
  if (hostname.includes('localhost') && parts.length >= 2 && parts[0] !== 'localhost') {
    subdomain = parts[0]
  }

  // No subdomain → serve normal app unchanged
  if (!subdomain) return NextResponse.next()

  // Has subdomain — check if this is a passthrough path
  const isPassthrough = PASSTHROUGH_PREFIXES.some(p => path.startsWith(p))

  if (isPassthrough) {
    // Serve the real app but pass subdomain via header so admin knows which company
    const res = NextResponse.next()
    res.headers.set('x-subdomain', subdomain)
    return res
  }

  // Board-facing paths → rewrite to /board/[slug]/...
  const boardPath = path === '/' ? '' : path
  url.pathname = `/board/${subdomain}${boardPath}`

  const res = NextResponse.rewrite(url)
  res.headers.set('x-subdomain', subdomain)
  return res
}
