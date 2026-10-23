// Hosts the image optimiser may fetch from: only our own storage. Keep in step
// with sizedImageUrl in lib/storage-url.ts.
const hostOf = (url, fallback) => { try { return new URL(url).hostname } catch { return fallback } }
const SUPABASE_HOST = hostOf(process.env.NEXT_PUBLIC_SUPABASE_URL, 'mtfhctgdayeqrguodksv.supabase.co')
const STORAGE_HOST = (process.env.NEXT_PUBLIC_STORAGE_DOMAIN || 'api.colvy.com').replace(/^https?:\/\//, '').replace(/\/.*$/, '')
const MEDIA_HOST = hostOf(process.env.NEXT_PUBLIC_R2_PUBLIC_URL || process.env.R2_PUBLIC_DOMAIN || 'https://media.colvy.com', 'media.colvy.com')

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // The transcode routes shell out to the static FFmpeg binary; make sure Next's
  // file tracing bundles the WHOLE ffmpeg-static package (binary + its index)
  // into those serverless functions. Globbing the package (not just the binary
  // path) is what reliably ships the executable; without it the function throws
  // "spawn …/ffmpeg ENOENT" at runtime.
  outputFileTracingIncludes: {
    '/api/storage/transcode': ['./node_modules/ffmpeg-static/**'],
    '/api/cron/transcode-worker': ['./node_modules/ffmpeg-static/**'],
    '/api/media/upload': ['./node_modules/ffmpeg-static/**'],
    '/api/twilio/webhook': ['./node_modules/ffmpeg-static/**'],
    '/api/media/web-mp4': ['./node_modules/ffmpeg-static/**'],
  },
  // The image optimiser only resizes files from our own storage (photo tiles
  // in the inbox fall back to it for attachments without a stored thumbnail).
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: SUPABASE_HOST, pathname: '/storage/v1/object/public/**' },
      { protocol: 'https', hostname: STORAGE_HOST, pathname: '/storage/v1/object/public/**' },
      { protocol: 'https', hostname: MEDIA_HOST, pathname: '/**' },
    ],
  },
  // The marketing feature pages moved from /features/* to /product/* so the
  // top-nav URLs read as an intentional product family (and don't collide with
  // the tenant portal's own /roadmap and /announcements routes). Redirect the
  // old paths so existing links, bookmarks and search results keep working.
  async redirects() {
    return [
      { source: '/features', destination: '/product', permanent: true },
      { source: '/features/:slug*', destination: '/product/:slug*', permanent: true },
      // These industry pages became workflow pages under /for.
      { source: '/industries/ecommerce', destination: '/for/ecommerce', permanent: true },
      { source: '/industries/real-estate', destination: '/for/real-estate', permanent: true },
      // The testimonials wall held placeholder quotes, not real customers.
      // Temporary, so the address can come back once there are real ones.
      { source: '/testimonials', destination: '/', permanent: false },
    ]
  },
  // Colvy MCP: OAuth discovery documents live under /.well-known. The path-
  // suffixed forms (…/oauth-protected-resource/api/mcp) are what newer MCP
  // clients ask for first.
  async rewrites() {
    return [
      { source: '/.well-known/oauth-protected-resource', destination: '/api/mcp/oauth/protected-resource' },
      { source: '/.well-known/oauth-protected-resource/:path*', destination: '/api/mcp/oauth/protected-resource' },
      { source: '/.well-known/oauth-authorization-server', destination: '/api/mcp/oauth/metadata' },
      { source: '/.well-known/oauth-authorization-server/:path*', destination: '/api/mcp/oauth/metadata' },
      { source: '/.well-known/openid-configuration', destination: '/api/mcp/oauth/metadata' },
    ]
  },
  // Keep the embeddable widget script fresh so businesses pick up updates fast
  // (default static caching would pin an old widget.js for a long time).
  async headers() {
    // Clickjacking: the admin, the platform console and the account/sign-in
    // pages may only be framed by Colvy itself. Everything else (the chat
    // widget, forms, booking, surveys, the board) stays embeddable on
    // customers' sites, so this is per path, not site-wide.
    const noFraming = [
      { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    ]
    const privatePages = ['/admin/:path*', '/platform-admin/:path*', '/signin', '/signup', '/onboarding', '/upgrade', '/billing/:path*',
      '/account/:path*', '/profile/:path*', '/reset-password', '/forgot-password', '/auth/:path*', '/drive-connect/:path*']
    // /oauth/* is stricter still (no framing at all): see the consent page below.
    return [
      ...privatePages.map(source => ({ source, headers: noFraming })),
      // The signed-in app is never served from the browser's cache. Going Back
      // to an admin page could otherwise show HTML saved before a deploy, whose
      // CSS and JS files no longer exist: an unstyled header and nothing else
      // until a reload. The page shell is small, the data is fetched anyway.
      { source: '/admin/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] },
      { source: '/admin', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] },
      // The platform console host is all admin (its "/" is /platform-admin).
      { source: '/:path*', has: [{ type: 'host', value: 'admin.colvy.com' }], headers: noFraming },
      { source: '/:path*', headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ] },
      {
        source: '/widget.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=300, must-revalidate' },
        ],
      },
      // The MCP consent page grants an app access to a business. Framed inside
      // another site, a visitor could be tricked into clicking Approve.
      {
        source: '/oauth/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        ],
      },
    ]
  },
}

module.exports = nextConfig
