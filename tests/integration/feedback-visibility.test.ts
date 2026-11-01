import { beforeAll, afterAll, it, expect } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { testDatabase, fixture } from './database.ts';
import { PostgresSubmissions } from '../../modules/topic-submission/adapters/postgres.ts';

let pool: pg.Pool;
let submissions: PostgresSubmissions;

beforeAll(async () => {
  pool = await testDatabase();
  submissions = new PostgresSubmissions(pool);
});

afterAll(async () => {
  await pool?.end();
});

it('filters hidden test feedback so actual outputs, expected outputs and diagnostics are never exposed', async () => {
  const actor = await fixture(pool);
  const testId = randomUUID().slice(0, 8);

  // Seed a topic with both a visible and a hidden test
  const topicId = `feedback-topic-${testId}`;
  const problemId = `feedback-problem-${testId}`;
  await pool.query('INSERT INTO topics VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING', [
    topicId, 'Feedback Topic', 'Expressions', Math.floor(Math.random() * 10000) + 200, 'coding', 1
  ]);

  const definition = {
    topicId,
    problemId,
    languageVersion: '1.0.5',
    starter: 'main(): Int64 { return 0 }',
    requirements: [],
    tests: [
      { id: 'case-visible', visibility: 'visible', inputBase64: '', expectedBase64: Buffer.from('visible\n').toString('base64') },
      { id: 'case-hidden', visibility: 'hidden', inputBase64: '', expectedBase64: Buffer.from('secret-key-12345\n').toString('base64') },
    ]
  };

  await pool.query('INSERT INTO assessment_revisions VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [
    topicId, 1, definition, `dummy-hash-${testId}`
  ]);
  await pool.query('INSERT INTO learner_topic_progress VALUES($1,$2,true,false,null,null,$3) ON CONFLICT DO NOTHING', [
    actor.learnerId, topicId, 'fixture'
  ]);

  // Insert a confirmed evaluation with results for both tests
  const evalId = randomUUID();
  const fixedContext = {
    learnerId: actor.learnerId,
    problemId,
    languageVersion: '1.0.5',
    workRevision: 1,
    source: 'main(): Int64 { return 0 }',
    assessment: { topicId, revision: 1 },
    caseIds: ['case-visible', 'case-hidden'],
  };

  const result = {
    kind: 'confirmed',
    score: { earned: 10, possible: 20 },
    solved: false,
    feedback: [
      { caseId: 'case-visible', status: 'pass', actual: 'visible\n', expected: 'visible\n', diagnostics: '' },
      { caseId: 'case-hidden', status: 'fail', actual: 'wrong\n', expected: 'secret-key-12345\n', diagnostics: 'secret failure trace' },
    ]
  };

  await pool.query('INSERT INTO evaluation_attempts(id,learner_id,request_key,intent_hash,kind,context,state,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [
    evalId, actor.learnerId, `req-key-${evalId}`, 'intent-hash', 'batch', fixedContext, 'confirmed', result
  ]);

  // Read through submissions API
  const view = await submissions.read(actor, evalId);

  // Visible case includes expected and actual
  const visibleCase = view.feedback.find(f => f.caseId === 'case-visible');
  expect(visibleCase).toBeDefined();
  expect(visibleCase?.actual).toBe('visible\n');
  expect(visibleCase?.expected).toBe('visible\n');

  // Hidden case strips actual, expected, and diagnostics!
  const hiddenCase = view.feedback.find(f => f.caseId === 'case-hidden');
  expect(hiddenCase).toBeDefined();
  expect(hiddenCase?.status).toBe('fail');
  expect(hiddenCase?.actual).toBeUndefined();
  expect(hiddenCase?.expected).toBeUndefined();
  expect(hiddenCase?.diagnostics).toBeUndefined();
});
