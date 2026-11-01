import { beforeAll, afterAll, it, expect } from 'vitest';
import type pg from 'pg';
import { testDatabase, fixture } from './database.ts';
import { PostgresSubmissions } from '../../modules/topic-submission/adapters/postgres.ts';
import { assessmentFor } from '../../modules/roadmap/application/content.ts';
import { dispatch } from '../../infrastructure/evaluation-transport/postgres.ts';
import { queue } from '../../infrastructure/evaluation-transport/queue.ts';
import { requireEnv } from '../../infrastructure/runtime/config.ts';

let pool: pg.Pool;
let submissions: PostgresSubmissions;
let boss: ReturnType<typeof queue>;

beforeAll(async () => {
  pool = await testDatabase();
  submissions = new PostgresSubmissions(pool);
  boss = queue(requireEnv('TEST_DATABASE_URL'));
  await boss.start();
});

afterAll(async () => {
  await boss?.stop();
  await pool?.end();
});

it('dispatches evaluation attempts to exchange jobs and queues pg-boss notification', async () => {
  const actor = await fixture(pool);
  const assessment = await assessmentFor(pool);

  await submissions.save(actor, {
    problemId: assessment.problemId,
    baseRevision: 0,
    source: 'main(): Int64 { println("Hello, World!"); return 0 }',
  });

  const op = await submissions.request(actor, {
    requestKey: 'dispatch-key-1',
    problemId: assessment.problemId,
    workRevision: 1,
    assessment: { topicId: assessment.topicId, revision: assessment.revision },
    kind: 'batch',
  });

  // Check evaluation_dispatch has an entry
  const dispatchRow = (await pool.query('SELECT * FROM evaluation_dispatch WHERE evaluation_id=$1', [op.operationId])).rows[0];
  expect(dispatchRow).toBeDefined();
  expect(dispatchRow.notified_at).toBeNull();

  // Run dispatch
  await dispatch(pool, boss);

  // Exchange job should now be populated
  const exchangeJob = (await pool.query('SELECT * FROM evaluation_exchange.jobs WHERE id=$1', [op.operationId])).rows[0];
  expect(exchangeJob).toBeDefined();
  expect(exchangeJob.payload.requestId).toBe(op.operationId);
  expect(exchangeJob.payload.caseIds).toEqual(assessment.tests.map(t => t.id));

  // evaluation_dispatch notified_at should be updated
  const updatedDispatch = (await pool.query('SELECT * FROM evaluation_dispatch WHERE evaluation_id=$1', [op.operationId])).rows[0];
  expect(updatedDispatch.notified_at).not.toBeNull();
});
