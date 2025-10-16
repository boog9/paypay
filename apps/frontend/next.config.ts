import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
  }
};

export default nextConfig;
