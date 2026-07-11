/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
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
