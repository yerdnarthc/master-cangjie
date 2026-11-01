import { beforeAll, afterAll, it, expect } from 'vitest';
import type pg from 'pg';
import { testDatabase, fixture } from './database.ts';
import { PostgresSubmissions, hash } from '../../modules/topic-submission/adapters/postgres.ts';
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

it('manages exchange job claims, generations, heartbeats, and fences stale outcomes', async () => {
  const actor = await fixture(pool);
  const assessment = await assessmentFor(pool);
  const source = 'main(): Int64 { println("Hello, World!"); return 0 }';

  await submissions.save(actor, {
    problemId: assessment.problemId,
    baseRevision: 0,
    source,
  });

  const op = await submissions.request(actor, {
    requestKey: 'claims-key-1',
    problemId: assessment.problemId,
    workRevision: 1,
    assessment: { topicId: assessment.topicId, revision: assessment.revision },
    kind: 'batch',
  });

  await dispatch(pool, boss);

  // Claim the job
  const claim1 = (await pool.query('SELECT evaluation_exchange.claim_job($1) AS res', [op.operationId])).rows[0].res;
  expect(claim1).toBeDefined();
  expect(claim1.generation).toBe(1);
  expect(claim1.payload.requestId).toBe(op.operationId);

  // Second immediate claim attempt fails because lease is active
  const claimDuplicate = (await pool.query('SELECT evaluation_exchange.claim_job($1) AS res', [op.operationId])).rows[0].res;
  expect(claimDuplicate).toBeNull();

  // Heartbeat extends the lease
  const hbSuccess = (await pool.query('SELECT evaluation_exchange.heartbeat($1, $2) AS alive', [op.operationId, 1])).rows[0].alive;
  expect(hbSuccess).toBe(true);

  // Heartbeat with wrong generation returns false
  const hbWrongGen = (await pool.query('SELECT evaluation_exchange.heartbeat($1, $2) AS alive', [op.operationId, 999])).rows[0].alive;
  expect(hbWrongGen).toBe(false);

  // Expire the lease manually in the DB to test renewal
  await pool.query("UPDATE evaluation_exchange.jobs SET lease_until = now() - interval '1 second' WHERE id=$1", [op.operationId]);

  // Claiming again now succeeds and increments the generation
  const claim2 = (await pool.query('SELECT evaluation_exchange.claim_job($1) AS res', [op.operationId])).rows[0].res;
  expect(claim2).toBeDefined();
  expect(claim2.generation).toBe(2);

  // Trying to finish with the old generation (1) is rejected
  const staleOutcome = {
    contractVersion: 1,
    requestId: op.operationId,
    sourceHash: hash(source),
    assessment: { topicId: assessment.topicId, revision: assessment.revision },
    generation: 1,
    cases: [{ caseId: assessment.tests[0].id, outcome: 'completed', stdoutBase64: Buffer.from('Hello, World!\n').toString('base64'), compilerVersion: '1.0.5', diagnostics: '', cleanupConfirmed: true }],
  };

  const finishStale = (await pool.query('SELECT evaluation_exchange.finish_job($1, $2, $3) AS accepted', [op.operationId, 1, staleOutcome])).rows[0].accepted;
  expect(finishStale).toBe(false);

  // Finishing with the current generation (2) is accepted
  const validOutcome = { ...staleOutcome, generation: 2 };
  const finishValid = (await pool.query('SELECT evaluation_exchange.finish_job($1, $2, $3) AS accepted', [op.operationId, 2, validOutcome])).rows[0].accepted;
  expect(finishValid).toBe(true);
});
