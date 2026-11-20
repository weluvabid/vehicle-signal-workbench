import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
  transpilePackages: ['echarts', 'zrender'],
  allowedDevOrigins: [
    '*.trycloudflare.com', // For Cloudflare Quick Tunnels
    'dev.yourdomain.com', // For a custom named tunnel domain
  ],
};

export default nextConfig;
