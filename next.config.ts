import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  compress: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
    formats: ['image/webp', 'image/avif'],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  experimental: {
    optimizePackageImports: ['@supabase/supabase-js'],
  },
};

export default withPWA({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/.*$/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'supabase-storage',
          expiration: { maxEntries: 80, maxAgeSeconds: 7 * 24 * 60 * 60 },
        },
      },
      {
        urlPattern: /\/api\/me$/,
        handler: 'StaleWhileRevalidate',
        options: { cacheName: 'api-me', expiration: { maxAgeSeconds: 300 } },
      },
      {
        urlPattern: /\/api\/obras\/\d+\/apontamentos/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-apontamentos',
          networkTimeoutSeconds: 10,
          expiration: { maxAgeSeconds: 60 * 60 },
        },
      },
    ],
  },
})(nextConfig);
