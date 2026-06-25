import { NextRequest, NextResponse } from 'next/server'

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.png|logo\\.png|.*\\..*).*)'],
}

const RESERVED = new Set([
  'www', 'app', 'api', 'mail', 'smtp', 'ftp',
  'dev', 'staging', 'preview', 'static', 'cdn', 'assets',
])

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone()
  const hostname = req.headers.get('host') || ''
  const path = url.pathname

  // Always pass through Next.js internals and API
  if (path.startsWith('/_next') || path.startsWith('/api/')) {
    return NextResponse.next()
  }

  const parts = hostname.split('.')
  let subdomain: string | null = null

  // Production: arik.colvy.com
  if (hostname.endsWith('.colvy.com') && parts.length === 3) {
    const sub = parts[0]

    // admin.colvy.com → platform super admin
    if (sub === 'admin') {
      url.pathname = `/platform-admin${path === '/' ? '' : path}`
      return NextResponse.rewrite(url)
    }

    if (!RESERVED.has(sub)) subdomain = sub
  }

  // Local dev: arik.localhost or arik.localhost:3000
  if (hostname.includes('localhost') && parts.length >= 2 && parts[0] !== 'localhost') {
    subdomain = parts[0]
  }

  // No subdomain → serve normal colvy.com app
  if (!subdomain) return NextResponse.next()

  // Subdomain → rewrite everything to /board/[slug]/...
  // /admin → /board/[slug]/admin (board owner's admin)
  // /      → /board/[slug]
  // /roadmap → /board/[slug]/roadmap
  const boardPath = path === '/' ? '' : path
  url.pathname = `/board/${subdomain}${boardPath}`

  const res = NextResponse.rewrite(url)
  res.headers.set('x-subdomain', subdomain)
  res.headers.set('x-hostname', hostname)
  return res
}
