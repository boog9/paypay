import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@paypay/sdk'],
  reactStrictMode: true,
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true
  },
  redirects() {
    return Promise.resolve([
      {
        source: '/portal',
        destination: '/dashboard',
        permanent: true
      }
    ]);
  },
  rewrites() {
    if (process.env.NODE_ENV !== 'development') {
      return Promise.resolve([]);
    }
    const rawBase = process.env.NEXT_PUBLIC_BFF_URL ?? 'http://localhost:3000';
    const trimmed = rawBase.trim().replace(/\/$/, '');
    const destinationBase = trimmed || 'http://localhost:3000';
    return Promise.resolve([
      {
        source: '/api/:path*',
        destination: `${destinationBase}/api/:path*`
      }
    ]);
  }
};

export default nextConfig;
