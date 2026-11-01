import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
if (existsSync('.env')) loadEnvFile('.env');
const host = process.argv[2];
if (!['web', 'jobs', 'worker'].includes(host)) throw new Error('Choose web, jobs or worker.');
if (host === 'worker' && !process.env.WORKER_DATABASE_URL) throw new Error('WORKER_DATABASE_URL with the restricted worker role is required.');
const test = new URL(process.env.TEST_DATABASE_URL ?? '');
if (!test.pathname.endsWith('_test')) throw new Error('TEST_DATABASE_URL must name a dedicated *_test database.');
for (const name of ['DATABASE_URL', 'MIGRATION_DATABASE_URL', 'WORKER_DATABASE_URL']) {
  const url = new URL(process.env[name] ?? test.href);
  url.host = test.host;
  url.pathname = test.pathname;
  process.env[name] = url.href;
}
process.env.NODE_ENV = 'development';
const args = host === 'web'
  ? [resolve('node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', process.env.MCJ_JOURNEY_PORT ?? '3001']
  : ['--experimental-transform-types', `apps/${host === 'worker' ? 'evaluation-worker' : 'application-jobs'}/src/main.ts`];
const child = spawn(process.execPath, args, { cwd: host === 'web' ? resolve('apps/web') : process.cwd(), env: process.env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.once('error', () => { console.error('Test host could not start.'); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
