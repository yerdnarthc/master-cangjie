import { defineConfig, devices } from '@playwright/test';
import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
if (existsSync('.env')) loadEnvFile('.env');
const test = new URL(process.env.TEST_DATABASE_URL ?? '');
if (!test.pathname.endsWith('_test')) throw new Error('Browser journeys require a dedicated *_test database.');
process.env.MIGRATION_DATABASE_URL = test.href;
const port = process.env.MCJ_JOURNEY_PORT ?? '3001';
export default defineConfig({
  testDir: './tests/journeys', timeout: 120_000, expect: { timeout: 15_000 },
  fullyParallel: false, forbidOnly: !!process.env.CI, retries: 0, workers: 1, reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'node tools/development/test-host.mjs web', url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false, timeout: 60_000 },
});
