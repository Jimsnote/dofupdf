import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  experimental: {
    // Enables app/global-not-found.tsx: with two route-group root layouts
    // there is no single app/layout.tsx for not-found.tsx to render into, so
    // the custom 404 document lives in global-not-found instead.
    globalNotFound: true,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // The jspawn Emscripten builds reference Node core modules behind
      // runtime environment guards; webpack still resolves them statically,
      // so stub them out of the browser/worker bundles.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
