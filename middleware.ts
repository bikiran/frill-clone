import { NextRequest, NextResponse } from 'next/server'

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon|logo|public|api|.*\\..*$).*)',
  ],
}

// Subdomains that are NOT tenant boards
const RESERVED = new Set([
  'www', 'app', 'api', 'admin', 'mail', 'smtp',
  'ftp', 'dev', 'staging', 'preview', 'static',
])

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone()
  const hostname = req.headers.get('host') || ''

  // Extract subdomain
  // Works for: arik.colvy.com → subdomain = 'arik'
  // Works for: arik.localhost:3000 → subdomain = 'arik'
  const parts = hostname.split('.')
  
  let subdomain: string | null = null
  
  if (hostname.includes('localhost')) {
    // Local dev: arik.localhost:3000
    if (parts.length >= 2 && parts[0] !== 'localhost') {
      subdomain = parts[0]
    }
  } else if (hostname.includes('colvy.com')) {
    // Production: arik.colvy.com
    if (parts.length >= 3 && !RESERVED.has(parts[0])) {
      subdomain = parts[0]
    }
  } else if (hostname.includes('vercel.app')) {
    // Vercel preview: no subdomain routing
    subdomain = null
  }

  // No subdomain → serve normal app
  if (!subdomain) return NextResponse.next()

  // Has subdomain → rewrite to /board/[slug]
  const path = url.pathname

  // Pass through static assets and API routes
  if (
    path.startsWith('/api/') ||
    path.startsWith('/_next/') ||
    path.startsWith('/admin') ||
    path.startsWith('/signin') ||
    path.startsWith('/signup') ||
    path.startsWith('/landing')
  ) {
    return NextResponse.next()
  }

  // Rewrite root and sub-paths to board routes
  url.pathname = `/board/${subdomain}${path === '/' ? '' : path}`
  
  const response = NextResponse.rewrite(url)
  // Pass subdomain to pages via header
  response.headers.set('x-subdomain', subdomain)
  return response
}
