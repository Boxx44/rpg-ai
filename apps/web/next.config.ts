import type { NextConfig } from 'next';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${api} ${api.replace(/^http/, 'ws')} ${supabase}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' " + supabase,
].join('; ');

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@rpg-ai/ui', '@rpg-ai/shared'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default config;
