import { beforeAll, afterAll, it, expect } from 'vitest';
import type pg from 'pg';
import { testDatabase, fixture } from './database.ts';
import { PostgresSubmissions, hash } from '../../modules/topic-submission/adapters/postgres.ts';
import { assessmentFor, HELLO_TOPIC } from '../../modules/roadmap/application/content.ts';
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

it('reviews, confirms, and atomically finalizes passing submission, unlocking Identifiers', async () => {
  const actor = await fixture(pool);
  const assessment = await assessmentFor(pool);
  const source = 'main(): Int64 { println("Hello, World!"); return 0 }';

  // 1. Unattempted starter review requires explicit zero-point acknowledgement
  const unattemptedReview = await submissions.review(actor, HELLO_TOPIC);
  expect(unattemptedReview.unattempted).toBe(true);

  await expect(
    submissions.confirm(actor, {
      requestKey: 'unattempted-confirm-1',
      reviewToken: unattemptedReview.reviewToken,
      acknowledgeUnattempted: false,
    })
  ).rejects.toThrow(/unattempted problem contributes zero/i);

  // 2. Edit code and validate
  await submissions.save(actor, {
    problemId: assessment.problemId,
    baseRevision: 0,
    source,
  });

  const valOp = await submissions.request(actor, {
    requestKey: 'val-key-pass',
    problemId: assessment.problemId,
    workRevision: 1,
    assessment: { topicId: assessment.topicId, revision: assessment.revision },
    kind: 'batch',
  });

  await dispatch(pool, boss);
  const claim = (await pool.query('SELECT evaluation_exchange.claim_job($1) AS res', [valOp.operationId])).rows[0].res;
  await pool.query('SELECT evaluation_exchange.finish_job($1, $2, $3)', [
    valOp.operationId,
    claim.generation,
    {
      contractVersion: 1,
      requestId: valOp.operationId,
      sourceHash: hash(source),
      assessment: { topicId: assessment.topicId, revision: assessment.revision },
      generation: claim.generation,
      cases: [{ caseId: assessment.tests[0].id, outcome: 'completed', stdoutBase64: Buffer.from('Hello, World!\n').toString('base64'), compilerVersion: '1.0.5', diagnostics: '', cleanupConfirmed: true }],
    },
  ]);
  await ingestAvailable(pool, submissions);

  // 3. Review attempted work
  const review = await submissions.review(actor, HELLO_TOPIC);
  expect(review.unattempted).toBe(false);

  // 4. Confirm submission (reuses existing qualifying batch)
  const subOp = await submissions.confirm(actor, {
    requestKey: 'sub-key-1',
    reviewToken: review.reviewToken,
    acknowledgeUnattempted: false,
  });

  expect(subOp.state).toBe('confirmed');
  expect(subOp.score).toEqual({ earned: 10, possible: 10 });

  // 5. Verify progress in database: Hello World is completed, and Identifiers is unlocked
  const hwProgress = (await pool.query('SELECT * FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=$2', [actor.learnerId, HELLO_TOPIC])).rows[0];
  expect(hwProgress.completed).toBe(true);
  expect(hwProgress.best_score).toEqual({ earned: 10, possible: 10 });

  const idProgress = (await pool.query("SELECT * FROM learner_topic_progress WHERE learner_id=$1 AND topic_id='identifiers'", [actor.learnerId])).rows[0];
  expect(idProgress.available).toBe(true);

  // 6. Retrying with a failing 0/10 submission preserves best score (10/10) and completion
  await submissions.save(actor, {
    problemId: assessment.problemId,
    baseRevision: 1,
    source: 'main(): Int64 { println("Wrong"); return 0 }',
  });

  const failReview = await submissions.review(actor, HELLO_TOPIC);
  // Confirm will dispatch a new evaluation since no passing batch matches this new source
  const failSub = await submissions.confirm(actor, {
    requestKey: 'fail-sub-key',
    reviewToken: failReview.reviewToken,
    acknowledgeUnattempted: false,
  });

  // Evaluate the failing batch
  await dispatch(pool, boss);
  const failEvalId = (await pool.query('SELECT evaluation_id FROM topic_submissions WHERE id=$1', [failSub.operationId])).rows[0].evaluation_id;
  const failClaim = (await pool.query('SELECT evaluation_exchange.claim_job($1) AS res', [failEvalId])).rows[0].res;
  await pool.query('SELECT evaluation_exchange.finish_job($1, $2, $3)', [
    failEvalId,
    failClaim.generation,
    {
      contractVersion: 1,
      requestId: failEvalId,
      sourceHash: hash('main(): Int64 { println("Wrong"); return 0 }'),
      assessment: { topicId: assessment.topicId, revision: assessment.revision },
      generation: failClaim.generation,
      cases: [{ caseId: assessment.tests[0].id, outcome: 'completed', stdoutBase64: Buffer.from('Wrong\n').toString('base64'), compilerVersion: '1.0.5', diagnostics: '', cleanupConfirmed: true }],
    },
  ]);
  await ingestAvailable(pool, submissions);

  // Hello World progress still retains best score 10/10 and completed=true
  const hwProgressAfterFail = (await pool.query('SELECT * FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=$2', [actor.learnerId, HELLO_TOPIC])).rows[0];
  expect(hwProgressAfterFail.completed).toBe(true);
  expect(hwProgressAfterFail.best_score).toEqual({ earned: 10, possible: 10 });
  expect(idProgress.available).toBe(true);
});
