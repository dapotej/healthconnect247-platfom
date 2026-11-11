import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The shared business rules are TypeScript source in the workspace.
  transpilePackages: ['@hc247/core'],
  webpack(config) {
    // packages/core uses ESM-style ".js" import specifiers for ".ts" files.
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
  poweredByHeader: false,
};

export default nextConfig;
