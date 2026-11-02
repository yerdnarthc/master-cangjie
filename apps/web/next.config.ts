import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['pg', 'pg-boss'],
  ...(process.env.MCJ_TEST_WEB_HOST === 'true' ? { distDir: '.next-test' } : {}),
};
export default config;
