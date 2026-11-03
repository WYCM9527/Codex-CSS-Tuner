import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  // webpack 模式（pnpm dev:webpack）用单独的输出目录，能和 Turbopack 的开发服务器同时跑
  distDir: process.env.TURBOPACK ? '.next' : '.next-webpack',
};

export default createNextIntlPlugin()(nextConfig);
