/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['gray-matter'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'openrouter.ai' },
      { protocol: 'https', hostname: '*.googleapis.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://*.clerk.accounts.dev https://challenges.cloudflare.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://openrouter.ai https://*.supabase.co https://*.clerk.accounts.dev https://api.clerk.com https://clerk.clerk.com https://clerk-telemetry.com; frame-src 'self' blob: data: https://*.clerk.accounts.dev https://challenges.cloudflare.com; frame-ancestors 'none';"
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
