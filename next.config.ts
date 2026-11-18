import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['echarts', 'zrender'],
};

export default nextConfig;
