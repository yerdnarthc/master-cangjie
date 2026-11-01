import { beforeAll, afterAll, it, expect } from 'vitest';
import type pg from 'pg';
import { testDatabase, fixture } from './database.ts';
import { PostgresSubmissions } from '../../modules/topic-submission/adapters/postgres.ts';
import { assessmentFor } from '../../modules/roadmap/application/content.ts';

let pool: pg.Pool;
let submissions: PostgresSubmissions;

beforeAll(async () => {
  pool = await testDatabase();
  submissions = new PostgresSubmissions(pool);
});

afterAll(async () => {
  await pool?.end();
});

it('enforces a 5-second cooldown and prevents concurrent manual validations', async () => {
  const actor = await fixture(pool);
  const assessment = await assessmentFor(pool);

  // Edit and save code first so attempted is true
  const source = 'main(): Int64 { println("Hello, World!"); return 0 }';
  await submissions.save(actor, {
    problemId: assessment.problemId,
    baseRevision: 0,
    source,
  });

  // First manual validation request
  const op1 = await submissions.request(actor, {
    requestKey: 'val-key-1',
    problemId: assessment.problemId,
    workRevision: 1,
    assessment: { topicId: assessment.topicId, revision: assessment.revision },
    kind: 'batch',
  });
  expect(op1.operationId).toBeDefined();
  expect(op1.state).toBe('pending');

  // Concurrent second validation with different key must fail with 409 pending
  await expect(
    submissions.request(actor, {
      requestKey: 'val-key-2',
      problemId: assessment.problemId,
      workRevision: 1,
      assessment: { topicId: assessment.topicId, revision: assessment.revision },
      kind: 'batch',
    })
  ).rejects.toThrow(/already pending/i);

  // Re-requesting with the EXACT SAME requestKey returns the existing operation (idempotent)
  const op1Repeat = await submissions.request(actor, {
    requestKey: 'val-key-1',
    problemId: assessment.problemId,
    workRevision: 1,
    assessment: { topicId: assessment.topicId, revision: assessment.revision },
    kind: 'batch',
  });
  expect(op1Repeat.operationId).toBe(op1.operationId);

  // Reusing the same requestKey with different payload is rejected with 409
  await expect(
    submissions.request(actor, {
      requestKey: 'val-key-1',
      problemId: assessment.problemId,
      workRevision: 1,
      assessment: { topicId: assessment.topicId, revision: assessment.revision },
      kind: 'single',
      caseId: 'case-01',
    })
  ).rejects.toThrow(/different work/i);
});
