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
}

module.exports = nextConfig
