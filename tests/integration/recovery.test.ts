import { beforeAll, afterAll, it, expect } from 'vitest';
import type pg from 'pg';
import { testDatabase, fixture } from './database.ts';
import { PostgresSubmissions, hash } from '../../modules/topic-submission/adapters/postgres.ts';
import { assessmentFor } from '../../modules/roadmap/application/content.ts';
import { dispatch, ingestAvailable } from '../../infrastructure/evaluation-transport/postgres.ts';
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

it('recovers from operational failures and exhausted worker deliveries via retryable-error', async () => {
  const actor = await fixture(pool);
  const assessment = await assessmentFor(pool);
  const source = 'main(): Int64 { println("Hello, World!"); return 0 }';

  await submissions.save(actor, {
    problemId: assessment.problemId,
    baseRevision: 0,
    source,
  });

  const op = await submissions.request(actor, {
    requestKey: 'recovery-key-1',
    problemId: assessment.problemId,
    workRevision: 1,
    assessment: { topicId: assessment.topicId, revision: assessment.revision },
    kind: 'batch',
  });

  await dispatch(pool, boss);

  // Claim the job
  const claim = (await pool.query('SELECT evaluation_exchange.claim_job($1) AS res', [op.operationId])).rows[0].res;

  // Simulate an operational/interrupted worker error
  const failedOutcome = {
    contractVersion: 1,
    requestId: op.operationId,
    sourceHash: hash(source),
    assessment: { topicId: assessment.topicId, revision: assessment.revision },
    generation: claim.generation,
    cases: [{
      caseId: assessment.tests[0].id,
      outcome: 'operational-error',
      stdoutBase64: '',
      compilerVersion: '1.0.5',
      diagnostics: 'gVisor sandbox container terminated abnormally',
      cleanupConfirmed: false,
    }],
  };

  await pool.query('SELECT evaluation_exchange.finish_job($1, $2, $3)', [op.operationId, claim.generation, failedOutcome]);

  // Ingest
  await ingestAvailable(pool, submissions);

  // Status should be retryable-error, NOT confirmed 0/10
  const errorOp = await submissions.read(actor, op.operationId);
  expect(errorOp.state).toBe('retryable-error');
  expect(errorOp.score).toBeUndefined();
  expect(errorOp.message).toContain('Evaluation service interrupted');

  // Learner triggers retry
  const retriedOp = await submissions.retry(actor, op.operationId);
  expect(retriedOp.state).toBe('pending');

  // Verify DB state is reset to allow re-dispatch
  const attemptRow = (await pool.query('SELECT * FROM evaluation_attempts WHERE id=$1', [op.operationId])).rows[0];
  expect(attemptRow.state).toBe('pending');
  expect(attemptRow.result).toBeNull();

  const exchangeRow = (await pool.query('SELECT * FROM evaluation_exchange.jobs WHERE id=$1', [op.operationId])).rows[0];
  expect(exchangeRow.deliveries).toBe(0);
  expect(exchangeRow.outcome).toBeNull();
  expect(exchangeRow.acknowledged).toBe(false);
});
