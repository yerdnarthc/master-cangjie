import { beforeAll, afterAll, it, expect } from 'vitest';
import type pg from 'pg';
import { testDatabase } from './database.ts';
import { connect } from '../../infrastructure/persistence/connection.ts';
import { requireEnv } from '../../infrastructure/runtime/config.ts';

let adminPool: pg.Pool;

beforeAll(async () => {
  adminPool = await testDatabase();
});

afterAll(async () => {
  await adminPool?.end();
});

it('enforces worker role isolation: cannot select public tables or directly query exchange jobs', async () => {
  const workerUrl = requireEnv('WORKER_DATABASE_URL');
  // replace db name if needed with the test database
  const testDbName = new URL(requireEnv('TEST_DATABASE_URL')).pathname.slice(1);
  const workerTestUrl = new URL(workerUrl);
  workerTestUrl.pathname = `/${testDbName}`;

  const { pool: workerPool } = connect(workerTestUrl.toString());
  try {
    // mcj_worker cannot read public business tables
    await expect(workerPool.query('SELECT * FROM learner_accounts')).rejects.toThrow(/permission denied/i);
    await expect(workerPool.query('SELECT * FROM topics')).rejects.toThrow(/permission denied/i);
    await expect(workerPool.query('SELECT * FROM coding_drafts')).rejects.toThrow(/permission denied/i);
    await expect(workerPool.query('SELECT * FROM topic_submissions')).rejects.toThrow(/permission denied/i);

    // mcj_worker cannot directly select or insert into evaluation_exchange.jobs
    await expect(workerPool.query('SELECT * FROM evaluation_exchange.jobs')).rejects.toThrow(/permission denied/i);

    // mcj_worker CAN execute evaluation_exchange functions
    const dummyId = '00000000-0000-0000-0000-000000000000';
    const claimResult = await workerPool.query('SELECT evaluation_exchange.claim_job($1) AS res', [dummyId]);
    expect(claimResult.rows[0].res).toBeNull();
  } finally {
    await workerPool.end();
  }
});

it('enforces app role restrictions: cannot access schema_migrations', async () => {
  const appUrl = requireEnv('DATABASE_URL');
  const testDbName = new URL(requireEnv('TEST_DATABASE_URL')).pathname.slice(1);
  const appTestUrl = new URL(appUrl);
  appTestUrl.pathname = `/${testDbName}`;

  const { pool: appPool } = connect(appTestUrl.toString());
  try {
    // mcj_app cannot read schema_migrations
    await expect(appPool.query('SELECT * FROM schema_migrations')).rejects.toThrow(/permission denied/i);
    // mcj_app CAN read public business tables
    const topics = await appPool.query('SELECT count(*) FROM topics');
    expect(Number(topics.rows[0].count)).toBeGreaterThan(0);
  } finally {
    await appPool.end();
  }
});
