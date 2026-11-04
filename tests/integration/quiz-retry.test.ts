import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import type pg from "pg";
import { freshFixture, fixture, testDatabase, testUrl } from "./database.ts";
import { connect, transaction } from "../../infrastructure/persistence/connection.ts";
import { migrate } from "../../infrastructure/persistence/migrate.ts";
import { root, requireEnv } from "../../infrastructure/runtime/config.ts";
import { setupRoles } from "../../infrastructure/persistence/setup-roles.ts";
import { seed } from "../../infrastructure/persistence/seed-milestone.ts";
import { hash, PostgresQuizSubmissions } from "../../modules/topic-submission/adapters/quiz-submissions.ts";
import { readQuiz } from "../../modules/roadmap/adapters/quiz-content.ts";
import { evaluateQuiz } from "../../modules/topic-submission/domain/quiz-evaluation.ts";

let pool: pg.Pool;
let quizSubmissions: PostgresQuizSubmissions;

beforeAll(async () => {
  pool = await testDatabase();
  quizSubmissions = new PostgresQuizSubmissions(pool);
});

afterAll(async () => {
  await pool?.end();
});

async function createSubmittedAttempt(options: {
  workRevision?: number;
  complete?: boolean;
} = {}) {
  const actor = await freshFixture(pool);
  const topicId = "getting-started-with-cangjie";
  const quiz = await readQuiz(topicId);
  const workspace = await quizSubmissions.workspace(actor, topicId);

  const answers = Object.fromEntries(
    quiz.questions.map((question, index) => [
      question.id,
      index < 7
        ? question.correctChoiceId
        : question.choices.find((choice) => choice.id !== question.correctChoiceId)!.id,
    ]),
  );
  const submitted = await quizSubmissions.submit(actor, {
    topicId,
    attemptId: workspace.currentAttempt.attemptId,
    requestKey: randomUUID(),
    answers,
    assessmentRevision: quiz.revision,
  });
  await pool.query(
    "UPDATE quiz_drafts SET answers=$3, work_revision=$4 WHERE learner_id=$1 AND topic_id=$2",
    [actor.learnerId, topicId, answers, options.workRevision ?? 0],
  );

  return {
    actor,
    topicId,
    quiz,
    answers,
    attemptId: workspace.currentAttempt.attemptId,
    submissionId: submitted.submissionId,
  };
}

async function insertLegacySubmission(
  client: pg.Pool,
  learnerId: string,
  topicId: string,
  answers: Record<string, string>,
) {
  const quiz = await readQuiz(topicId);
  const evaluation = evaluateQuiz(quiz, answers);
  const id = randomUUID();
  const snapshot = {
    kind: "multiple-choice",
    topicId,
    assessment: { topicId, revision: quiz.revision },
    answers,
    evaluation,
  };
  await client.query(
    "INSERT INTO topic_submissions(id, learner_id, request_key, intent_hash, snapshot, state, score) VALUES($1, $2, $3, $4, $5, 'finalized', $6)",
    [id, learnerId, randomUUID(), `legacy-${randomUUID()}`, snapshot, evaluation.score],
  );
  await client.query(
    "UPDATE learner_topic_progress SET best_score=$3, best_submission=$4 WHERE learner_id=$1 AND topic_id=$2",
    [learnerId, topicId, evaluation.score, id],
  );
  return { id, snapshot, quiz };
}

it("starts a blank attempt without changing the finalized submission or earned progress", async () => {
  const { actor, topicId, quiz, answers, submissionId, attemptId } =
    await createSubmittedAttempt({ workRevision: 7, complete: true });
  const workRevision = 7;

  const [submissionBefore, progressBefore] = await Promise.all([
    pool.query(
      "SELECT snapshot, score FROM topic_submissions WHERE id=$1",
      [submissionId],
    ),
    pool.query(
      "SELECT best_score, best_submission, completed, available FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=$2",
      [actor.learnerId, topicId],
    ),
  ]);
  const receipt = await quizSubmissions.startRetry(actor, topicId, {
    sourceSubmissionId: submissionId,
    expectedAttemptId: attemptId,
    baseRevision: workRevision,
  });

  const workspace = await quizSubmissions.workspace(actor, topicId);
  expect(receipt.attemptId).not.toBe(attemptId);
  expect(receipt.workRevision).toBe(workRevision + 1);
  expect(workspace.currentAttempt).toMatchObject({
    attemptId: receipt.attemptId,
    assessmentRevision: quiz.revision,
    state: "answering",
    submissionId: null,
  });
  expect(workspace.draft).toEqual({ answers: {}, workRevision: workRevision + 1 });
  expect(await pool.query("SELECT snapshot, score FROM topic_submissions WHERE id=$1", [submissionId]))
    .toMatchObject({ rows: submissionBefore.rows });
  expect(await pool.query(
    "SELECT best_score, best_submission, completed, available FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=$2",
    [actor.learnerId, topicId],
  )).toMatchObject({ rows: progressBefore.rows });
});

it("replays one retry receipt without clearing answers saved after the transition", async () => {
  const { actor, topicId, quiz, attemptId, submissionId } =
    await createSubmittedAttempt({ workRevision: 3 });
  const request = {
    sourceSubmissionId: submissionId,
    expectedAttemptId: attemptId,
    baseRevision: 3,
  };
  const [first, concurrent] = await Promise.all([
    quizSubmissions.startRetry(actor, topicId, request),
    quizSubmissions.startRetry(actor, topicId, request),
  ]);
  expect(concurrent).toEqual(first);

  const newAnswers = { [quiz.questions[0].id]: quiz.questions[0].choices[1].id };
  const saved = await quizSubmissions.saveDraft(actor, topicId, {
    attemptId: first.attemptId,
    baseRevision: first.workRevision,
    answers: newAnswers,
  });
  expect(saved).toEqual({ kind: "saved", workRevision: first.workRevision + 1 });

  const replay = await quizSubmissions.startRetry(actor, topicId, request);
  expect(replay).toEqual(first);
  const workspace = await quizSubmissions.workspace(actor, topicId);
  expect(workspace.currentAttempt.attemptId).toBe(first.attemptId);
  expect(workspace.draft).toEqual({
    answers: newAnswers,
    workRevision: first.workRevision + 1,
  });
  const successors = await pool.query(
    "SELECT id FROM quiz_attempts WHERE learner_id=$1 AND topic_id=$2 AND predecessor_submission_id=$3",
    [actor.learnerId, topicId, submissionId],
  );
  expect(successors.rows).toEqual([{ id: first.attemptId }]);
});

it("submits only once per attempt and Retry opens a blank current workspace", async () => {
  const actor = await freshFixture(pool);
  const topicId = "getting-started-with-cangjie";
  const quiz = await readQuiz(topicId);
  const firstWorkspace = await quizSubmissions.workspace(actor, topicId);
  const answers = Object.fromEntries(
    quiz.questions.map((question) => [question.id, question.correctChoiceId]),
  );
  await expect(quizSubmissions.submit(actor, {
    topicId,
    attemptId: firstWorkspace.currentAttempt.attemptId,
    requestKey: randomUUID(),
    answers,
    assessmentRevision: firstWorkspace.currentAttempt.assessmentRevision + 1,
  })).rejects.toThrow(/assessment changed/i);
  const submitted = await quizSubmissions.submit(actor, {
    topicId,
    attemptId: firstWorkspace.currentAttempt.attemptId,
    requestKey: randomUUID(),
    answers,
    assessmentRevision: firstWorkspace.currentAttempt.assessmentRevision,
  });

  expect(submitted.attemptId).toBe(firstWorkspace.currentAttempt.attemptId);
  await expect(quizSubmissions.submit(actor, {
    topicId,
    attemptId: firstWorkspace.currentAttempt.attemptId,
    requestKey: randomUUID(),
    answers: {},
    assessmentRevision: firstWorkspace.currentAttempt.assessmentRevision,
  })).rejects.toThrow(/already been submitted|retry/i);

  const retry = await quizSubmissions.startRetry(actor, topicId, {
    sourceSubmissionId: submitted.submissionId,
    expectedAttemptId: firstWorkspace.currentAttempt.attemptId,
    baseRevision: firstWorkspace.draft.workRevision,
  });
  const current = await quizSubmissions.workspace(actor, topicId);
  expect(current.currentAttempt).toMatchObject({
    attemptId: retry.attemptId,
    state: "answering",
    submissionId: null,
  });
  expect(current.draft).toEqual({ answers: {}, workRevision: retry.workRevision });
  expect(current.currentSubmission).toBeUndefined();
  expect(current.latestSubmission?.submissionId).toBe(submitted.submissionId);
  expect(current.latestSubmission && "evaluation" in current.latestSubmission).toBe(false);

  await expect(quizSubmissions.saveDraft(actor, topicId, {
    attemptId: firstWorkspace.currentAttempt.attemptId,
    baseRevision: retry.workRevision,
    answers,
  })).rejects.toThrow(/attempt changed|reload/i);
  await expect(quizSubmissions.submit(actor, {
    topicId,
    attemptId: firstWorkspace.currentAttempt.attemptId,
    requestKey: randomUUID(),
    answers,
    assessmentRevision: firstWorkspace.currentAttempt.assessmentRevision,
  })).rejects.toThrow(/attempt changed|reload/i);

  const staleConflictId = randomUUID();
  await pool.query(
    "INSERT INTO quiz_draft_conflicts(id, learner_id, topic_id, attempt_id, base_revision, candidate_answers) VALUES($1,$2,$3,$4,$5,$6)",
    [staleConflictId, actor.learnerId, topicId, firstWorkspace.currentAttempt.attemptId, 0, answers],
  );
  await expect(quizSubmissions.resolveDraft(actor, topicId, {
    attemptId: firstWorkspace.currentAttempt.attemptId,
    conflictId: staleConflictId,
    choice: "server",
    baseRevision: retry.workRevision,
  })).rejects.toThrow(/attempt changed|reload/i);
});

it("rejects retry from an unknown learner, a locked topic, or a different submission", async () => {
  const { actor, topicId, attemptId, submissionId } =
    await createSubmittedAttempt();
  const source = {
    sourceSubmissionId: submissionId,
    expectedAttemptId: attemptId,
    baseRevision: 0,
  };

  await expect(
    quizSubmissions.startRetry({ learnerId: randomUUID() }, topicId, source),
  ).rejects.toThrow(/unknown learner/i);
  await expect(
    quizSubmissions.startRetry(actor, "running-the-first-cangjie-program", {
      ...source,
      sourceSubmissionId: randomUUID(),
    }),
  ).rejects.toThrow(/complete the preceding topic/i);
  await expect(
    quizSubmissions.startRetry(actor, topicId, { ...source, sourceSubmissionId: randomUUID() }),
  ).rejects.toThrow(/finalized submission from this topic/i);
});

it("rejects a stale attempt or work revision without creating a successor", async () => {
  const { actor, topicId, attemptId, submissionId } =
    await createSubmittedAttempt({ workRevision: 2 });
  await expect(
    quizSubmissions.startRetry(actor, topicId, {
      sourceSubmissionId: submissionId,
      expectedAttemptId: attemptId,
      baseRevision: 1,
    }),
  ).rejects.toThrow(/quiz draft changed/i);
  await expect(
    quizSubmissions.startRetry(actor, topicId, {
      sourceSubmissionId: submissionId,
      expectedAttemptId: randomUUID(),
      baseRevision: 2,
    }),
  ).rejects.toThrow(/quiz attempt changed/i);
  const workspace = await quizSubmissions.workspace(actor, topicId);
  expect(workspace.currentAttempt).toMatchObject({ attemptId, state: "submitted" });
  expect(workspace.draft.workRevision).toBe(2);
  const successors = await pool.query(
    "SELECT id FROM quiz_attempts WHERE learner_id=$1 AND topic_id=$2 AND predecessor_submission_id=$3",
    [actor.learnerId, topicId, submissionId],
  );
  expect(successors.rowCount).toBe(0);
});

it("does not start a retry while the current attempt has an unresolved draft conflict", async () => {
  const { actor, topicId, attemptId, submissionId } =
    await createSubmittedAttempt({ workRevision: 1 });
  const quiz = await readQuiz(topicId);
  const wrong = quiz.questions[0].choices.find(
    (choice) => choice.id !== quiz.questions[0].correctChoiceId,
  )!;
  const conflictId = randomUUID();
  // Simulate a legacy stale conflict so the Retry guard continues to protect that data.
  await pool.query(
    "INSERT INTO quiz_draft_conflicts(id, learner_id, topic_id, attempt_id, base_revision, candidate_answers) VALUES($1,$2,$3,$4,$5,$6)",
    [conflictId, actor.learnerId, topicId, attemptId, 0, { [quiz.questions[0].id]: wrong.id }],
  );
  await expect(
    quizSubmissions.startRetry(actor, topicId, {
      sourceSubmissionId: submissionId,
      expectedAttemptId: attemptId,
      baseRevision: 1,
    }),
  ).rejects.toThrow(/resolve the open quiz draft conflict/i);
  const workspace = await quizSubmissions.workspace(actor, topicId);
  expect(workspace.currentAttempt).toMatchObject({ attemptId, state: "submitted" });
  expect(workspace.conflict).not.toBeNull();
  expect(workspace.draft.workRevision).toBe(1);
});

it("backfills matching, divergent, conflicted, and draftless legacy quiz history", async () => {
  const databaseName = `mcj_quiz_retry_${randomUUID().replaceAll("-", "").slice(0, 10)}_test`;
  const legacyUrl = new URL(testUrl);
  legacyUrl.pathname = `/${databaseName}`;
  const url = legacyUrl.toString();
  const admin = connect(requireEnv("MIGRATION_DATABASE_URL")).pool;
  let legacyPool: pg.Pool | undefined;
  let created = false;

  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    legacyPool = connect(url).pool;
    await legacyPool.query(
      "CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const migrationDirectory = resolve(root, "infrastructure/persistence/migrations");
    const legacyMigrations = (await readdir(migrationDirectory))
      .filter((name) => /^000[1-4]_.*\.sql$/.test(name))
      .sort();
    for (const name of legacyMigrations) {
      const sql = await readFile(resolve(migrationDirectory, name), "utf8");
      await transaction(legacyPool, async (client) => {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
      });
    }
    await setupRoles(url);
    await seed(url);

    const matchingLearner = await fixture(legacyPool);
    const topicOne = "getting-started-with-cangjie";
    const quizOne = await readQuiz(topicOne);
    const olderAnswers = Object.fromEntries(quizOne.questions.map((question) => [question.id, question.choices[0].id]));
    const latestAnswers = Object.fromEntries(quizOne.questions.map((question) => [question.id, question.correctChoiceId]));
    await insertLegacySubmission(legacyPool, matchingLearner.learnerId, topicOne, olderAnswers);
    const latestMatching = await insertLegacySubmission(legacyPool, matchingLearner.learnerId, topicOne, latestAnswers);
    await legacyPool.query(
      "INSERT INTO quiz_drafts(learner_id, topic_id, answers, work_revision) VALUES($1, $2, $3, 8)",
      [matchingLearner.learnerId, topicOne, latestAnswers],
    );

    const topicTwo = "installing-the-cangjie-toolchain";
    const quizTwo = await readQuiz(topicTwo);
    const historyOnlyAnswers = Object.fromEntries(quizTwo.questions.map((question) => [question.id, question.correctChoiceId]));
    const latestWithoutDraft = await insertLegacySubmission(legacyPool, matchingLearner.learnerId, topicTwo, historyOnlyAnswers);

    const divergentLearner = await fixture(legacyPool);
    const divergentSubmission = await insertLegacySubmission(legacyPool, divergentLearner.learnerId, topicOne, olderAnswers);
    const divergentAnswers = { [quizOne.questions[0].id]: quizOne.questions[0].choices[1].id };
    const candidateAnswers = { [quizOne.questions[1].id]: quizOne.questions[1].choices[2].id };
    const legacyConflictId = randomUUID();
    await legacyPool.query(
      "INSERT INTO quiz_drafts(learner_id, topic_id, answers, work_revision) VALUES($1, $2, $3, 4)",
      [divergentLearner.learnerId, topicOne, divergentAnswers],
    );
    await legacyPool.query(
      "INSERT INTO quiz_draft_conflicts(id, learner_id, topic_id, base_revision, candidate_answers) VALUES($1, $2, $3, 3, $4)",
      [legacyConflictId, divergentLearner.learnerId, topicOne, candidateAnswers],
    );

    const matchingConflictLearner = await fixture(legacyPool);
    const matchingConflictSubmission = await insertLegacySubmission(
      legacyPool,
      matchingConflictLearner.learnerId,
      topicOne,
      latestAnswers,
    );
    const matchingConflictCandidate = {
      [quizOne.questions[0].id]: quizOne.questions[0].choices.find(
        (choice) => choice.id !== quizOne.questions[0].correctChoiceId,
      )!.id,
    };
    const matchingConflictId = randomUUID();
    await legacyPool.query(
      "INSERT INTO quiz_drafts(learner_id, topic_id, answers, work_revision) VALUES($1, $2, $3, 6)",
      [matchingConflictLearner.learnerId, topicOne, latestAnswers],
    );
    await legacyPool.query(
      "INSERT INTO quiz_draft_conflicts(id, learner_id, topic_id, base_revision, candidate_answers) VALUES($1, $2, $3, 5, $4)",
      [matchingConflictId, matchingConflictLearner.learnerId, topicOne, matchingConflictCandidate],
    );
    const beforeProgress = await legacyPool.query(
      "SELECT best_score, best_submission FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=$2",
      [matchingLearner.learnerId, topicOne],
    );
    await legacyPool.end();
    legacyPool = undefined;

    await migrate(url);
    legacyPool = connect(url).pool;

    const matchingDraft = await legacyPool.query(
      "SELECT d.attempt_id, d.answers, d.work_revision, a.state, a.submission_id, a.is_legacy FROM quiz_drafts d JOIN quiz_attempts a ON a.id=d.attempt_id WHERE d.learner_id=$1 AND d.topic_id=$2",
      [matchingLearner.learnerId, topicOne],
    );
    expect(matchingDraft.rows[0]).toMatchObject({
      attempt_id: latestMatching.id,
      answers: latestAnswers,
      work_revision: 8,
      state: "submitted",
      submission_id: latestMatching.id,
      is_legacy: true,
    });

    const matchingHistory = await legacyPool.query(
      "SELECT id, snapshot FROM topic_submissions WHERE learner_id=$1 AND snapshot->>'topicId'=$2 ORDER BY created_at, id",
      [matchingLearner.learnerId, topicOne],
    );
    expect(matchingHistory.rows).toHaveLength(2);
    expect(matchingHistory.rows[1].snapshot).toEqual(latestMatching.snapshot);
    const preservedProgress = await legacyPool.query(
      "SELECT best_score, best_submission FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=$2",
      [matchingLearner.learnerId, topicOne],
    );
    expect(preservedProgress.rows).toEqual(beforeProgress.rows);

    const draftless = await legacyPool.query(
      "SELECT d.attempt_id, d.answers, d.work_revision, a.state, a.submission_id, a.is_legacy FROM quiz_drafts d JOIN quiz_attempts a ON a.id=d.attempt_id WHERE d.learner_id=$1 AND d.topic_id=$2",
      [matchingLearner.learnerId, topicTwo],
    );
    expect(draftless.rows[0]).toMatchObject({
      attempt_id: latestWithoutDraft.id,
      answers: historyOnlyAnswers,
      work_revision: 0,
      state: "submitted",
      submission_id: latestWithoutDraft.id,
      is_legacy: true,
    });

    const divergentDraft = await legacyPool.query(
      "SELECT d.attempt_id, d.answers, d.work_revision, a.state, a.submission_id, a.is_legacy FROM quiz_drafts d JOIN quiz_attempts a ON a.id=d.attempt_id WHERE d.learner_id=$1 AND d.topic_id=$2",
      [divergentLearner.learnerId, topicOne],
    );
    expect(divergentDraft.rows[0]).toMatchObject({
      answers: divergentAnswers,
      work_revision: 4,
      state: "answering",
      submission_id: null,
      is_legacy: true,
    });
    expect(divergentDraft.rows[0].attempt_id).not.toBe(divergentSubmission.id);
    const preservedConflict = await legacyPool.query(
      "SELECT attempt_id, candidate_answers, resolved FROM quiz_draft_conflicts WHERE id=$1",
      [legacyConflictId],
    );
    expect(preservedConflict.rows[0]).toEqual({
      attempt_id: divergentDraft.rows[0].attempt_id,
      candidate_answers: candidateAnswers,
      resolved: false,
    });

    const recoverableConflictDraft = await legacyPool.query(
      "SELECT d.attempt_id, d.answers, d.work_revision, a.state, a.submission_id, a.is_legacy FROM quiz_drafts d JOIN quiz_attempts a ON a.id=d.attempt_id WHERE d.learner_id=$1 AND d.topic_id=$2",
      [matchingConflictLearner.learnerId, topicOne],
    );
    expect(recoverableConflictDraft.rows[0]).toMatchObject({
      answers: latestAnswers,
      work_revision: 6,
      state: "answering",
      submission_id: null,
      is_legacy: true,
    });
    expect(recoverableConflictDraft.rows[0].attempt_id).not.toBe(matchingConflictSubmission.id);
    const reassignedConflict = await legacyPool.query(
      "SELECT attempt_id, candidate_answers, resolved FROM quiz_draft_conflicts WHERE id=$1",
      [matchingConflictId],
    );
    expect(reassignedConflict.rows[0]).toEqual({
      attempt_id: recoverableConflictDraft.rows[0].attempt_id,
      candidate_answers: matchingConflictCandidate,
      resolved: false,
    });
    const recoveryAdapter = new PostgresQuizSubmissions(legacyPool);
    const recoveredWorkspace = await recoveryAdapter.workspace(matchingConflictLearner, topicOne);
    expect(recoveredWorkspace.currentAttempt.state).toBe("answering");
    expect(recoveredWorkspace.currentSubmission).toBeUndefined();
    expect(recoveredWorkspace.conflict?.conflictId).toBe(matchingConflictId);
    const conflictResolution = await recoveryAdapter.resolveDraft(matchingConflictLearner, topicOne, {
      attemptId: recoveredWorkspace.currentAttempt.attemptId,
      conflictId: matchingConflictId,
      choice: "candidate",
      baseRevision: recoveredWorkspace.draft.workRevision,
    });
    expect(conflictResolution.kind).toBe("saved");
    expect((await recoveryAdapter.workspace(matchingConflictLearner, topicOne)).conflict).toBeNull();
    const originalSubmission = await legacyPool.query(
      "SELECT id FROM topic_submissions WHERE id=$1 AND learner_id=$2",
      [matchingConflictSubmission.id, matchingConflictLearner.learnerId],
    );
    expect(originalSubmission.rowCount).toBe(1);
  } finally {
    await legacyPool?.end();
    if (created) await admin.query(`DROP DATABASE "${databaseName}"`);
    await admin.end();
  }
});

it("replays pre-attempt request hashes only for migrated legacy attempts", async () => {
  const actor = await freshFixture(pool);
  const topicId = "getting-started-with-cangjie";
  const quiz = await readQuiz(topicId);
  const workspace = await quizSubmissions.workspace(actor, topicId);
  await pool.query("UPDATE quiz_attempts SET is_legacy=true WHERE id=$1", [workspace.currentAttempt.attemptId]);
  const answers = Object.fromEntries(quiz.questions.map((question) => [question.id, question.correctChoiceId]));
  const requestKey = randomUUID();
  const request = { topicId, requestKey, answers, assessmentRevision: quiz.revision };

  // A browser request saved before attempt identities existed may still be pending.
  const submitted = await quizSubmissions.submit(actor, request);
  const replay = await quizSubmissions.submit(actor, request);
  expect(replay.submissionId).toBe(submitted.submissionId);
  expect(replay.attemptId).toBe(workspace.currentAttempt.attemptId);

  const newActor = await freshFixture(pool);
  await quizSubmissions.workspace(newActor, topicId);
  await expect(quizSubmissions.submit(newActor, {
    ...request,
    requestKey: randomUUID(),
  })).rejects.toThrow(/missing its attempt identity/i);
});

it("replays a recorded legacy request after its response was lost", async () => {
  const actor = await freshFixture(pool);
  const topicId = "getting-started-with-cangjie";
  const quiz = await readQuiz(topicId);
  const workspace = await quizSubmissions.workspace(actor, topicId);
  const answers = Object.fromEntries(quiz.questions.map((question) => [question.id, question.correctChoiceId]));
  const evaluation = evaluateQuiz(quiz, answers);
  const submissionId = randomUUID();
  const requestKey = randomUUID();
  const intent = hash(JSON.stringify({ topicId, answers, revision: quiz.revision }));
  const snapshot = {
    kind: "multiple-choice",
    topicId,
    assessment: { topicId, revision: quiz.revision },
    answers,
    evaluation,
  };
  await pool.query("UPDATE quiz_attempts SET is_legacy=true WHERE id=$1", [workspace.currentAttempt.attemptId]);
  await pool.query(
    "INSERT INTO topic_submissions(id, learner_id, request_key, intent_hash, snapshot, state, score) VALUES($1,$2,$3,$4,$5,'finalized',$6)",
    [submissionId, actor.learnerId, requestKey, intent, snapshot, evaluation.score],
  );
  await pool.query(
    "UPDATE quiz_attempts SET state='submitted', submission_id=$2 WHERE id=$1",
    [workspace.currentAttempt.attemptId, submissionId],
  );
  await pool.query(
    "UPDATE learner_topic_progress SET best_score=$3, best_submission=$4 WHERE learner_id=$1 AND topic_id=$2",
    [actor.learnerId, topicId, evaluation.score, submissionId],
  );

  const replay = await quizSubmissions.submit(actor, {
    topicId, requestKey, answers, assessmentRevision: quiz.revision,
  });
  expect(replay.submissionId).toBe(submissionId);
  expect(replay.attemptId).toBe(workspace.currentAttempt.attemptId);
  expect((await quizSubmissions.workspace(actor, topicId)).currentSubmission?.submissionId).toBe(submissionId);
});

it("fences old save and submit commands that race with Retry", async () => {
  const { actor, topicId, quiz, attemptId, submissionId } = await createSubmittedAttempt({ workRevision: 2 });
  const retryPromise = quizSubmissions.startRetry(actor, topicId, {
    sourceSubmissionId: submissionId,
    expectedAttemptId: attemptId,
    baseRevision: 2,
  });
  const savePromise = quizSubmissions.saveDraft(actor, topicId, {
    attemptId,
    baseRevision: 2,
    answers: { [quiz.questions[0].id]: quiz.questions[0].correctChoiceId },
  });
  const submitPromise = quizSubmissions.submit(actor, {
    topicId,
    attemptId,
    requestKey: randomUUID(),
    answers: {},
    assessmentRevision: quiz.revision,
  });
  const [retry, save, submit] = await Promise.allSettled([retryPromise, savePromise, submitPromise]);
  expect(retry.status).toBe("fulfilled");
  expect(save.status).toBe("rejected");
  expect(submit.status).toBe("rejected");
  if (save.status !== "rejected" || submit.status !== "rejected") {
    throw new Error("Stale commands unexpectedly survived Retry.");
  }
  expect(save.reason.message).toMatch(/attempt changed|already been submitted/i);
  expect(submit.reason.message).toMatch(/attempt changed|already been submitted/i);
  const current = await quizSubmissions.workspace(actor, topicId);
  expect(current.draft).toEqual({ answers: {}, workRevision: 3 });
  expect(current.currentAttempt.state).toBe("answering");
});

it("retains the best percentage, replaces it when improved, and keeps the earlier submission on a tie", async () => {
  const actor = await freshFixture(pool);
  const topicId = "getting-started-with-cangjie";
  const quiz = await readQuiz(topicId);
  const questions = quiz.questions;
  const makeAnswers = (correctCount: number) => Object.fromEntries(questions.map((question, index) => [
    question.id,
    index < correctCount
      ? question.correctChoiceId
      : question.choices.find((choice) => choice.id !== question.correctChoiceId)!.id,
  ]));
  let workspace = await quizSubmissions.workspace(actor, topicId);
  const first = await quizSubmissions.submit(actor, {
    topicId, attemptId: workspace.currentAttempt.attemptId, requestKey: randomUUID(),
    answers: makeAnswers(7), assessmentRevision: workspace.currentAttempt.assessmentRevision,
  });
  const retry40 = await quizSubmissions.startRetry(actor, topicId, {
    sourceSubmissionId: first.submissionId, expectedAttemptId: first.attemptId,
    baseRevision: workspace.draft.workRevision,
  });
  workspace = await quizSubmissions.workspace(actor, topicId);
  const lower = await quizSubmissions.submit(actor, {
    topicId, attemptId: retry40.attemptId, requestKey: randomUUID(),
    answers: makeAnswers(4), assessmentRevision: workspace.currentAttempt.assessmentRevision,
  });
  expect(lower.progress.bestScore).toEqual({ earned: 70, possible: 100 });

  const retry90 = await quizSubmissions.startRetry(actor, topicId, {
    sourceSubmissionId: lower.submissionId, expectedAttemptId: lower.attemptId,
    baseRevision: workspace.draft.workRevision,
  });
  workspace = await quizSubmissions.workspace(actor, topicId);
  const improved = await quizSubmissions.submit(actor, {
    topicId, attemptId: retry90.attemptId, requestKey: randomUUID(),
    answers: makeAnswers(9), assessmentRevision: workspace.currentAttempt.assessmentRevision,
  });
  expect(improved.progress.bestScore).toEqual({ earned: 90, possible: 100 });

  const retryTie = await quizSubmissions.startRetry(actor, topicId, {
    sourceSubmissionId: improved.submissionId, expectedAttemptId: improved.attemptId,
    baseRevision: workspace.draft.workRevision,
  });
  workspace = await quizSubmissions.workspace(actor, topicId);
  const tied = await quizSubmissions.submit(actor, {
    topicId, attemptId: retryTie.attemptId, requestKey: randomUUID(),
    answers: makeAnswers(9), assessmentRevision: workspace.currentAttempt.assessmentRevision,
  });
  expect(tied.progress.bestScore).toEqual({ earned: 90, possible: 100 });
  const savedBest = await pool.query(
    "SELECT best_submission FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=$2",
    [actor.learnerId, topicId],
  );
  expect(savedBest.rows[0].best_submission).toBe(improved.submissionId);
});
