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
  },
  // Allow images from any subdomain
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.colvy.com' },
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },
  // Keep the embeddable widget script fresh so businesses pick up updates fast
  // (default static caching would pin an old widget.js for a long time).
  async headers() {
    return [
      {
        source: '/widget.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=300, must-revalidate' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
