import { createInterface } from 'node:readline/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { connect } from '../../infrastructure/persistence/connection.ts';
import { requireEnv } from '../../infrastructure/runtime/config.ts';
import { resetDevelopmentLearner } from '../../infrastructure/persistence/reset-development-learner.ts';
import { LEARNER } from '../../modules/learner-account/adapters/development-session.ts';

type ResetEnvironment = {
  developmentIdentity?: string;
  nodeEnv?: string;
};

type LocalDatabaseTarget = {
  host: string;
  port: string;
  database: string;
};

function parseLocalDatabaseTarget(connectionString: string): LocalDatabaseTarget {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('Database configuration must be a valid PostgreSQL URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Database configuration must use PostgreSQL.');
  }

  const authorityHost = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const configuredTarget = new pg.Client({ connectionString });
  const host = configuredTarget.host.toLowerCase().replace(/^\[|\]$/g, '');
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error('Database reset is allowed only for a loopback host.');
  }
  if (host !== authorityHost) {
    throw new Error('Database configuration cannot override its URL host.');
  }

  const expectedPort = url.port || '5432';
  const port = String(configuredTarget.port);
  if (port !== expectedPort) {
    throw new Error('Database configuration cannot override its URL port.');
  }

  let database: string;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error('Database configuration has an invalid database name.');
  }
  if (database !== 'mcj_hello') {
    throw new Error('Database reset is allowed only for the mcj_hello development database.');
  }
  if (configuredTarget.database !== database) {
    throw new Error('Database configuration cannot override its URL database.');
  }

  return { host, port, database };
}

export function assertDevelopmentResetTarget(
  migrationUrl: string,
  runtimeUrl: string,
  environment: ResetEnvironment,
): void {
  if (environment.developmentIdentity !== 'true') {
    throw new Error('MCJ_DEVELOPMENT_IDENTITY must be true to reset the development learner.');
  }
  if (environment.nodeEnv === 'production') {
    throw new Error('Development learner reset is unavailable in production.');
  }

  const migrationTarget = parseLocalDatabaseTarget(migrationUrl);
  const runtimeTarget = parseLocalDatabaseTarget(runtimeUrl);
  if (
    migrationTarget.host !== runtimeTarget.host ||
    migrationTarget.port !== runtimeTarget.port ||
    migrationTarget.database !== runtimeTarget.database
  ) {
    throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must point to the same local database.');
  }
}

export function isResetConfirmation(answer: string | undefined): boolean {
  return answer?.trim() === 'reset';
}

export function openPoolAfterResetConfirmation<T>(
  isInteractive: boolean,
  answer: string | undefined,
  openPool: () => T,
): T | undefined {
  if (!isInteractive || !isResetConfirmation(answer)) return undefined;
  return openPool();
}

function displayTarget(connectionString: string): string {
  const url = new URL(connectionString);
  const host = url.hostname;
  const port = url.port || '5432';
  const database = decodeURIComponent(url.pathname.slice(1));
  return `${host}:${port}/${database}`;
}

async function main(): Promise<void> {
  let pool: ReturnType<typeof connect>['pool'] | undefined;
  try {
    const migrationUrl = requireEnv('MIGRATION_DATABASE_URL');
    const runtimeUrl = requireEnv('DATABASE_URL');
    assertDevelopmentResetTarget(migrationUrl, runtimeUrl, {
      developmentIdentity: process.env.MCJ_DEVELOPMENT_IDENTITY,
      nodeEnv: process.env.NODE_ENV,
    });

    console.log(`Development database: ${displayTarget(migrationUrl)}`);
    console.log(`Development learner: ${LEARNER}`);
    const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
    let answer: string | undefined;
    if (!isInteractive) {
      console.error('No interactive terminal detected. The reset was cancelled before connecting.');
      process.exitCode = 1;
      return;
    }

    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
      answer = await prompt.question('This clears saved activity and progress for this learner. Type reset to continue: ');
    } finally {
      prompt.close();
    }
    pool = openPoolAfterResetConfirmation(isInteractive, answer, () => connect(migrationUrl).pool);
    if (!pool) {
      console.log('Reset cancelled; the database was not changed.');
      return;
    }

    const result = await resetDevelopmentLearner(pool, LEARNER);
    const removedRows = Object.values(result).reduce((total, count) => total + count, 0);
    console.log(`Reset complete. Removed ${removedRows} saved activity rows and returned progress to the first topic.`);
    console.log(`Removed rows: ${Object.entries(result).map(([name, count]) => `${name}=${count}`).join(', ')}`);
    console.log('Browser drafts are stored separately. If you did not clear them before the reset, start the app, open a non-activity page, then delete master-cangjie-work in DevTools > Application > IndexedDB before opening an activity.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    console.error(`Development learner reset failed: ${message}`);
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
