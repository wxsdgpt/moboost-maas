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
}

module.exports = nextConfig
