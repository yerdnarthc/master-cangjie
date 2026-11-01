import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { projects: [
  { test: { name: 'domain', include: ['modules/**/*.test.ts'], exclude: ['modules/**/adapters/**'] } },
  { test: { name: 'integration', include: ['tests/integration/**/*.test.ts'], fileParallelism: false, testTimeout: 30000, hookTimeout: 30000 } }
] } });
