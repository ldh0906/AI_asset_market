import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite'],
  outputFileTracingIncludes: { '/api/market/*': ['./evaluator/*.mjs', './supabase/schema.sql', './private/free-packages/*.zip'] },
  async redirects() {
    return process.env.VERCEL ? [{ source: '/', destination: '/demo', permanent: false }] : [];
  },
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ] }];
  },
};
export default config;
