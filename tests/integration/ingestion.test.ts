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

it('ingests execution outcome, scores correctly, and marks solved achievements', async () => {
  const actor = await fixture(pool);
  const assessment = await assessmentFor(pool);
  const source = 'main(): Int64 { println("Hello, World!"); return 0 }';

  await submissions.save(actor, {
    problemId: assessment.problemId,
    baseRevision: 0,
    source,
  });

  const op = await submissions.request(actor, {
    requestKey: 'ingest-key-1',
    problemId: assessment.problemId,
    workRevision: 1,
    assessment: { topicId: assessment.topicId, revision: assessment.revision },
    kind: 'batch',
  });

  await dispatch(pool, boss);

  // Worker claims job
  const claim = (await pool.query('SELECT evaluation_exchange.claim_job($1) AS res', [op.operationId])).rows[0].res;
  expect(claim.generation).toBe(1);

  // Worker finishes with passing output
  const outcome = {
    contractVersion: 1,
    requestId: op.operationId,
    sourceHash: hash(source),
    assessment: { topicId: assessment.topicId, revision: assessment.revision },
    generation: 1,
    cases: [{
      caseId: assessment.tests[0].id,
      outcome: 'completed',
      stdoutBase64: Buffer.from('Hello, World!\n').toString('base64'),
      compilerVersion: '1.0.5',
      diagnostics: '',
      cleanupConfirmed: true,
    }],
  };

  const finish = (await pool.query('SELECT evaluation_exchange.finish_job($1, $2, $3) AS accepted', [op.operationId, 1, outcome])).rows[0].accepted;
  expect(finish).toBe(true);

  // Ingest outcome
  await ingestAvailable(pool, submissions);

  // Check evaluation is confirmed with 10/10 score
  const updatedOp = await submissions.read(actor, op.operationId);
  expect(updatedOp.state).toBe('confirmed');
  expect(updatedOp.score).toEqual({ earned: 10, possible: 10 });
  expect(updatedOp.feedback[0].status).toBe('pass');

  // Solved achievement should be recorded for batch pass
  const solved = (await pool.query('SELECT * FROM solved_achievements WHERE learner_id=$1 AND problem_id=$2', [actor.learnerId, assessment.problemId])).rows;
  expect(solved.length).toBe(1);

  // Exchange job should be acknowledged
  const exchangeJob = (await pool.query('SELECT acknowledged FROM evaluation_exchange.jobs WHERE id=$1', [op.operationId])).rows[0];
  expect(exchangeJob.acknowledged).toBe(true);
});
