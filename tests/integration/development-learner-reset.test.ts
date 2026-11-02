import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { testDatabase, freshFixture } from './database.ts';
import { resetDevelopmentLearner } from '../../infrastructure/persistence/reset-development-learner.ts';
import { assertDevelopmentResetTarget, isResetConfirmation, openPoolAfterResetConfirmation } from '../../tools/development/reset-local-learner.ts';

let pool: pg.Pool;

beforeAll(async () => {
  pool = await testDatabase();
});

afterAll(async () => {
  await pool?.end();
});

async function addLearnerActivity(learnerId: string, label: string) {
  const attemptId = randomUUID();
  const reviewId = randomUUID();
  const submissionId = randomUUID();
  const codingConflictId = randomUUID();
  const quizConflictId = randomUUID();

  await pool.query(
    `INSERT INTO evaluation_attempts
      (id, learner_id, request_key, intent_hash, kind, context, state, result)
     VALUES ($1, $2, $3, $4, 'batch', $5::jsonb, 'confirmed', $6::jsonb)`,
    [attemptId, learnerId, `request-${label}`, `hash-${label}`, JSON.stringify({ topicId: 'running-the-first-cangjie-program' }), JSON.stringify({ state: 'completed' })],
  );
  await pool.query(
    'INSERT INTO evaluation_exchange.jobs (id, payload) VALUES ($1, $2::jsonb)',
    [attemptId, JSON.stringify({ requestId: attemptId })],
  );
  await pool.query('INSERT INTO evaluation_dispatch (evaluation_id) VALUES ($1)', [attemptId]);
  await pool.query(
    'INSERT INTO validation_windows (learner_id, problem_id, pending_batch) VALUES ($1, $2, $3)',
    [learnerId, `problem-${label}`, attemptId],
  );
  await pool.query(
    'INSERT INTO solved_achievements (learner_id, problem_id, evaluation_id) VALUES ($1, $2, $3)',
    [learnerId, `problem-${label}`, attemptId],
  );
  await pool.query(
    'INSERT INTO submission_reviews (id, learner_id, snapshot) VALUES ($1, $2, $3::jsonb)',
    [reviewId, learnerId, JSON.stringify({ source: `source-${label}` })],
  );
  await pool.query(
    `INSERT INTO topic_submissions
      (id, learner_id, request_key, review_id, intent_hash, snapshot, evaluation_id, state, score)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'finalized', $8::jsonb)`,
    [submissionId, learnerId, `submit-${label}`, reviewId, `submit-hash-${label}`, JSON.stringify({ answers: { q0: 'a' } }), attemptId, JSON.stringify({ earned: 10, possible: 10 })],
  );
  await pool.query(
    'INSERT INTO coding_drafts (learner_id, problem_id, source, work_revision, attempted) VALUES ($1, $2, $3, 1, true)',
    [learnerId, `problem-${label}`, `main(): Int64 { // ${label}\n  return 0\n}`],
  );
  await pool.query(
    'INSERT INTO draft_conflicts (id, learner_id, problem_id, base_revision, candidate_source) VALUES ($1, $2, $3, 0, $4)',
    [codingConflictId, learnerId, `problem-${label}`, `candidate-${label}`],
  );
  await pool.query(
    'INSERT INTO quiz_drafts (learner_id, topic_id, answers, work_revision) VALUES ($1, $2, $3::jsonb, 1)',
    [learnerId, 'getting-started-with-cangjie', JSON.stringify({ q0: 'a' })],
  );
  await pool.query(
    'INSERT INTO quiz_draft_conflicts (id, learner_id, topic_id, base_revision, candidate_answers) VALUES ($1, $2, $3, 0, $4::jsonb)',
    [quizConflictId, learnerId, 'getting-started-with-cangjie', JSON.stringify({ q0: 'b' })],
  );
  await pool.query(
    `UPDATE learner_topic_progress
     SET available = true, completed = true, best_score = $2::jsonb,
         best_submission = $3, provenance = $4
     WHERE learner_id = $1`,
    [learnerId, JSON.stringify({ earned: 10, possible: 10 }), submissionId, `test-${label}`],
  );

  return { attemptId, reviewId, submissionId, codingConflictId, quizConflictId };
}

async function learnerActivityCounts(learnerId: string, attemptId: string) {
  const [jobs, dispatches, validationWindows, achievements, submissions, reviews, attempts, codingDrafts, codingConflicts, quizDrafts, quizConflicts] = await Promise.all([
    pool.query('SELECT count(*)::int AS count FROM evaluation_exchange.jobs WHERE id = $1', [attemptId]),
    pool.query('SELECT count(*)::int AS count FROM evaluation_dispatch WHERE evaluation_id = $1', [attemptId]),
    pool.query('SELECT count(*)::int AS count FROM validation_windows WHERE learner_id = $1', [learnerId]),
    pool.query('SELECT count(*)::int AS count FROM solved_achievements WHERE learner_id = $1', [learnerId]),
    pool.query('SELECT count(*)::int AS count FROM topic_submissions WHERE learner_id = $1', [learnerId]),
    pool.query('SELECT count(*)::int AS count FROM submission_reviews WHERE learner_id = $1', [learnerId]),
    pool.query('SELECT count(*)::int AS count FROM evaluation_attempts WHERE learner_id = $1', [learnerId]),
    pool.query('SELECT count(*)::int AS count FROM coding_drafts WHERE learner_id = $1', [learnerId]),
    pool.query('SELECT count(*)::int AS count FROM draft_conflicts WHERE learner_id = $1', [learnerId]),
    pool.query('SELECT count(*)::int AS count FROM quiz_drafts WHERE learner_id = $1', [learnerId]),
    pool.query('SELECT count(*)::int AS count FROM quiz_draft_conflicts WHERE learner_id = $1', [learnerId]),
  ]);
  return {
    jobs: jobs.rows[0].count,
    dispatches: dispatches.rows[0].count,
    validationWindows: validationWindows.rows[0].count,
    achievements: achievements.rows[0].count,
    submissions: submissions.rows[0].count,
    reviews: reviews.rows[0].count,
    attempts: attempts.rows[0].count,
    codingDrafts: codingDrafts.rows[0].count,
    codingConflicts: codingConflicts.rows[0].count,
    quizDrafts: quizDrafts.rows[0].count,
    quizConflicts: quizConflicts.rows[0].count,
  };
}

it('resets one learner to the first topic and preserves another learner and published content', async () => {
  const target = await freshFixture(pool);
  const other = await freshFixture(pool);
  const targetActivity = await addLearnerActivity(target.learnerId, 'target');
  const otherActivity = await addLearnerActivity(other.learnerId, 'other');
  await pool.query(
    'DELETE FROM learner_topic_progress WHERE learner_id = $1 AND topic_id = $2',
    [target.learnerId, 'identifiers'],
  );

  const contentBefore = await pool.query(
    `SELECT (SELECT count(*)::int FROM topics) AS topics,
            (SELECT count(*)::int FROM assessment_revisions) AS revisions`,
  );
  const otherProgressBefore = await pool.query(
    `SELECT topic_id, available, completed, best_score, best_submission, provenance
     FROM learner_topic_progress WHERE learner_id = $1 ORDER BY topic_id`,
    [other.learnerId],
  );
  const accountsBefore = await pool.query(
    'SELECT count(*)::int AS count FROM learner_accounts WHERE id = ANY($1::uuid[])',
    [[target.learnerId, other.learnerId]],
  );

  const result = await resetDevelopmentLearner(pool, target.learnerId);

  expect(result).toEqual({
    jobs: 1,
    dispatches: 1,
    validationWindows: 1,
    achievements: 1,
    submissions: 1,
    reviews: 1,
    attempts: 1,
    codingDrafts: 1,
    codingConflicts: 1,
    quizDrafts: 1,
    quizConflicts: 1,
  });
  expect(await learnerActivityCounts(target.learnerId, targetActivity.attemptId)).toEqual({
    jobs: 0,
    dispatches: 0,
    validationWindows: 0,
    achievements: 0,
    submissions: 0,
    reviews: 0,
    attempts: 0,
    codingDrafts: 0,
    codingConflicts: 0,
    quizDrafts: 0,
    quizConflicts: 0,
  });
  expect(await learnerActivityCounts(other.learnerId, otherActivity.attemptId)).toEqual({
    jobs: 1,
    dispatches: 1,
    validationWindows: 1,
    achievements: 1,
    submissions: 1,
    reviews: 1,
    attempts: 1,
    codingDrafts: 1,
    codingConflicts: 1,
    quizDrafts: 1,
    quizConflicts: 1,
  });

  const progress = await pool.query(
    `SELECT topic_id, available, completed, best_score, best_submission, provenance
     FROM learner_topic_progress WHERE learner_id = $1 ORDER BY topic_id`,
    [target.learnerId],
  );
  expect(progress.rowCount).toBe(contentBefore.rows[0].topics);
  expect(progress.rows.filter((row) => row.available).map((row) => row.topic_id)).toEqual(['getting-started-with-cangjie']);
  for (const row of progress.rows) {
    expect(row.completed).toBe(false);
    expect(row.best_score).toBeNull();
    expect(row.best_submission).toBeNull();
    expect(row.provenance).toBeNull();
  }

  const otherProgressAfter = await pool.query(
    `SELECT topic_id, available, completed, best_score, best_submission, provenance
     FROM learner_topic_progress WHERE learner_id = $1 ORDER BY topic_id`,
    [other.learnerId],
  );
  expect(otherProgressAfter.rows).toEqual(otherProgressBefore.rows);
  expect((await pool.query(
    'SELECT count(*)::int AS count FROM learner_accounts WHERE id = ANY($1::uuid[])',
    [[target.learnerId, other.learnerId]],
  )).rows[0].count).toBe(accountsBefore.rows[0].count);
  const contentAfter = await pool.query(
    `SELECT (SELECT count(*)::int FROM topics) AS topics,
            (SELECT count(*)::int FROM assessment_revisions) AS revisions`,
  );
  expect(contentAfter.rows[0]).toEqual(contentBefore.rows[0]);
});

it('rolls back activity deletions if resetting progress fails', async () => {
  const target = await freshFixture(pool);
  const activity = await addLearnerActivity(target.learnerId, 'rollback');
  const functionName = 'mcj_test_fail_development_reset_progress';
  const triggerName = 'mcj_test_fail_development_reset_progress';

  await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON learner_topic_progress`);
  await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
  await pool.query(`
    CREATE FUNCTION ${functionName}() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'intentional reset rollback test';
    END;
    $$
  `);
  await pool.query(`
    CREATE TRIGGER ${triggerName}
    BEFORE UPDATE ON learner_topic_progress
    FOR EACH ROW
    WHEN (NEW.learner_id = '${target.learnerId}'::uuid)
    EXECUTE FUNCTION ${functionName}()
  `);

  try {
    await expect(resetDevelopmentLearner(pool, target.learnerId)).rejects.toThrow('intentional reset rollback test');
    expect(await learnerActivityCounts(target.learnerId, activity.attemptId)).toEqual({
      jobs: 1,
      dispatches: 1,
      validationWindows: 1,
      achievements: 1,
      submissions: 1,
      reviews: 1,
      attempts: 1,
      codingDrafts: 1,
      codingConflicts: 1,
      quizDrafts: 1,
      quizConflicts: 1,
    });
    const progress = await pool.query(
      'SELECT bool_and(completed) AS completed FROM learner_topic_progress WHERE learner_id = $1',
      [target.learnerId],
    );
    expect(progress.rows[0].completed).toBe(true);
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON learner_topic_progress`);
    await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
  }
});
const LOCAL_MIGRATION_URL = 'postgresql://migrate:example-secret@127.0.0.1:15432/mcj_hello';
const LOCAL_RUNTIME_URL = 'postgresql://app:example-secret@127.0.0.1:15432/mcj_hello';
const DEVELOPMENT_ENV = { developmentIdentity: 'true', nodeEnv: 'development' };

it('accepts matching local development database URLs with separate roles', () => {
  expect(() => assertDevelopmentResetTarget(LOCAL_MIGRATION_URL, LOCAL_RUNTIME_URL, DEVELOPMENT_ENV)).not.toThrow();
});

it('rejects a remote database host', () => {
  const remote = 'postgresql://migrate:secret@db.example.test:15432/mcj_hello';
  expect(() => assertDevelopmentResetTarget(remote, remote, DEVELOPMENT_ENV)).toThrow();
});

it('rejects a query-string host override despite a local URL authority', () => {
  const redirected = `${LOCAL_MIGRATION_URL}?host=db.example.test`;
  expect(() => assertDevelopmentResetTarget(redirected, LOCAL_RUNTIME_URL, DEVELOPMENT_ENV)).toThrow();
  expect(() => assertDevelopmentResetTarget(redirected, redirected, DEVELOPMENT_ENV)).toThrow();
});

it('rejects a query-string port override despite a local URL authority', () => {
  const redirected = `${LOCAL_MIGRATION_URL}?port=15433`;
  expect(() => assertDevelopmentResetTarget(redirected, LOCAL_RUNTIME_URL, DEVELOPMENT_ENV)).toThrow();
});

it('rejects PGPORT overriding an omitted URL port', () => {
  const migrationWithoutPort = 'postgresql://migrate:example-secret@127.0.0.1/mcj_hello';
  const runtimeAtDefaultPort = 'postgresql://app:example-secret@127.0.0.1:5432/mcj_hello';
  const previousPgPort = process.env.PGPORT;
  process.env.PGPORT = '15433';
  try {
    expect(() => assertDevelopmentResetTarget(migrationWithoutPort, runtimeAtDefaultPort, DEVELOPMENT_ENV)).toThrow();
  } finally {
    if (previousPgPort === undefined) delete process.env.PGPORT;
    else process.env.PGPORT = previousPgPort;
  }
});

it('rejects mismatched runtime and migration database targets', () => {
  const otherHost = 'postgresql://app:secret@localhost:15432/mcj_hello';
  const otherPort = 'postgresql://app:secret@127.0.0.1:15433/mcj_hello';
  const otherDatabase = 'postgresql://app:secret@127.0.0.1:15432/mcj_other';
  expect(() => assertDevelopmentResetTarget(LOCAL_MIGRATION_URL, otherHost, DEVELOPMENT_ENV)).toThrow();
  expect(() => assertDevelopmentResetTarget(LOCAL_MIGRATION_URL, otherPort, DEVELOPMENT_ENV)).toThrow();
  expect(() => assertDevelopmentResetTarget(LOCAL_MIGRATION_URL, otherDatabase, DEVELOPMENT_ENV)).toThrow();
});

it('rejects test databases and local databases other than mcj_hello', () => {
  const testUrl = 'postgresql://migrate:secret@127.0.0.1:15432/mcj_hello_test';
  const otherUrl = 'postgresql://migrate:secret@127.0.0.1:15432/other';
  expect(() => assertDevelopmentResetTarget(testUrl, testUrl, DEVELOPMENT_ENV)).toThrow();
  expect(() => assertDevelopmentResetTarget(otherUrl, otherUrl, DEVELOPMENT_ENV)).toThrow();
});

it('rejects malformed URLs, missing development identity, and production mode', () => {
  expect(() => assertDevelopmentResetTarget('not a URL', LOCAL_RUNTIME_URL, DEVELOPMENT_ENV)).toThrow();
  expect(() => assertDevelopmentResetTarget(LOCAL_MIGRATION_URL, LOCAL_RUNTIME_URL, { nodeEnv: 'development' })).toThrow();
  expect(() => assertDevelopmentResetTarget(LOCAL_MIGRATION_URL, LOCAL_RUNTIME_URL, { ...DEVELOPMENT_ENV, nodeEnv: 'production' })).toThrow();
});

it('authorizes only an exact reset confirmation and rejects missing input', () => {
  expect(isResetConfirmation(' reset ')).toBe(true);
  expect(isResetConfirmation('reset now')).toBe(false);
  expect(isResetConfirmation('Reset')).toBe(false);
  expect(isResetConfirmation('yes')).toBe(false);
  expect(isResetConfirmation(undefined)).toBe(false);
});

it('does not open a database pool before interactive exact confirmation', () => {
  const pool = { end: vi.fn() };
  const openPool = vi.fn(() => pool);

  expect(openPoolAfterResetConfirmation(false, 'reset', openPool)).toBeUndefined();
  expect(openPoolAfterResetConfirmation(true, 'no', openPool)).toBeUndefined();
  expect(openPool).not.toHaveBeenCalled();

  expect(openPoolAfterResetConfirmation(true, 'reset', openPool)).toBe(pool);
  expect(openPool).toHaveBeenCalledTimes(1);
});
