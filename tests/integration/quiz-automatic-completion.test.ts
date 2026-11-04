import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import type pg from "pg";
import { testDatabase, freshFixture } from "./database.ts";
import { PostgresQuizSubmissions } from "../../modules/topic-submission/adapters/quiz-submissions.ts";
import { readQuiz } from "../../modules/roadmap/adapters/quiz-content.ts";
let pool: pg.Pool;
let app: PostgresQuizSubmissions;
beforeAll(async () => {
  pool = await testDatabase();
  app = new PostgresQuizSubmissions(pool);
});
afterAll(async () => {
  await pool?.end();
});
it("passing finalization completes and unlocks atomically, including concurrent replay", async () => {
  const actor = await freshFixture(pool);
  const topicId = "getting-started-with-cangjie";
  const quiz = await readQuiz(topicId);
  const ws = await app.workspace(actor, topicId);
  const request = {
    topicId,
    attemptId: ws.currentAttempt.attemptId,
    requestKey: randomUUID(),
    assessmentRevision: quiz.revision,
    answers: Object.fromEntries(
      quiz.questions.slice(0, 6).map((q) => [q.id, q.correctChoiceId]),
    ),
  };
  const [a, b] = await Promise.all([
    app.submit(actor, request),
    app.submit(actor, request),
  ]);
  expect(a.submissionId).toBe(b.submissionId);
  expect(a.progress).toMatchObject({
    completed: true,
    nextTopicAvailable: true,
    nextTopicId: "installing-the-cangjie-toolchain",
  });
  expect(b.progress).toMatchObject({
    completed: true,
    nextTopicAvailable: true,
  });
  const next = await app.workspace(actor, "installing-the-cangjie-toolchain");
  expect(next.currentAttempt.state).toBe("answering");
  const retry = await app.startRetry(actor, topicId, {
    sourceSubmissionId: a.submissionId,
    expectedAttemptId: ws.currentAttempt.attemptId,
    baseRevision: ws.draft.workRevision,
  });
  const lower = await app.submit(actor, {
    ...request,
    attemptId: retry.attemptId,
    requestKey: randomUUID(),
    answers: {},
  });
  expect(lower.progress).toMatchObject({
    completed: true,
    nextTopicAvailable: true,
    bestScore: { earned: 60, possible: 100 },
  });
});

it("first failure stays incomplete and final quiz pass has no invented successor", async () => {
  const actor = await freshFixture(pool);
  const topicId = "getting-started-with-cangjie";
  const ws = await app.workspace(actor, topicId);
  const result = await app.submit(actor, {
    topicId,
    attemptId: ws.currentAttempt.attemptId,
    requestKey: randomUUID(),
    assessmentRevision: ws.quiz.revision,
    answers: {},
  });
  expect(result.progress).toMatchObject({
    completed: false,
    nextTopicAvailable: false,
  });
  const last = (
    await pool.query(
      "SELECT id FROM topics WHERE kind='multiple-choice' ORDER BY position DESC LIMIT 1",
    )
  ).rows[0].id;
  await pool.query(
    "UPDATE learner_topic_progress SET available=true WHERE learner_id=$1 AND topic_id=$2",
    [actor.learnerId, last],
  );
  const position = (
    await pool.query("SELECT position FROM topics WHERE id=$1", [last])
  ).rows[0].position;
  await pool.query(
    "UPDATE topics SET position=(SELECT MAX(position)+1 FROM topics) WHERE id=$1",
    [last],
  );
  try {
    const w = await app.workspace(actor, last);
    const definition = (
      await pool.query(
        "SELECT definition FROM assessment_revisions WHERE topic_id=$1 AND revision=$2",
        [last, w.quiz.revision],
      )
    ).rows[0].definition;
    const passed = await app.submit(actor, {
      topicId: last,
      attemptId: w.currentAttempt.attemptId,
      requestKey: randomUUID(),
      assessmentRevision: w.quiz.revision,
      answers: Object.fromEntries(
        definition.questions.map((q: any) => [q.id, q.correctChoiceId]),
      ),
    });
    expect(passed.progress.completed).toBe(true);
    expect(passed.progress.nextTopicId).toBeNull();
    expect(passed.progress.nextTopicAvailable).toBe(false);
  } finally {
    await pool.query("UPDATE topics SET position=$2 WHERE id=$1", [
      last,
      position,
    ]);
  }
});
it("rolls back the finalized submission and completion if unlocking fails", async () => {
  const actor = await freshFixture(pool);
  const topicId = "getting-started-with-cangjie";
  const quiz = await readQuiz(topicId);
  const ws = await app.workspace(actor, topicId);
  await pool.query(
    `CREATE FUNCTION fail_quiz_unlock() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.learner_id='${actor.learnerId}'::uuid AND NEW.topic_id='installing-the-cangjie-toolchain' THEN RAISE EXCEPTION 'forced unlock failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_quiz_unlock BEFORE UPDATE ON learner_topic_progress FOR EACH ROW EXECUTE FUNCTION fail_quiz_unlock()`,
  );
  try {
    await expect(
      app.submit(actor, {
        topicId,
        attemptId: ws.currentAttempt.attemptId,
        requestKey: randomUUID(),
        assessmentRevision: quiz.revision,
        answers: Object.fromEntries(
          quiz.questions.map((q) => [q.id, q.correctChoiceId]),
        ),
      }),
    ).rejects.toThrow("forced unlock failure");
    const recovered = await app.workspace(actor, topicId);
    expect(recovered.currentAttempt.state).toBe("answering");
    expect(recovered.progress).toMatchObject({
      completed: false,
      bestScore: null,
      nextTopicAvailable: false,
    });
  } finally {
    await pool.query(
      "DROP TRIGGER fail_quiz_unlock ON learner_topic_progress; DROP FUNCTION fail_quiz_unlock()",
    );
  }
});
it("backfills only valid historical passing quizzes, preserving drafts and best evidence", async () => {
  const actor = await freshFixture(pool);
  const topicId = "getting-started-with-cangjie";
  const quiz = await readQuiz(topicId);
  const ws = await app.workspace(actor, topicId);
  const passed = await app.submit(actor, {
    topicId,
    attemptId: ws.currentAttempt.attemptId,
    requestKey: randomUUID(),
    assessmentRevision: quiz.revision,
    answers: Object.fromEntries(
      quiz.questions.slice(0, 7).map((q) => [q.id, q.correctChoiceId]),
    ),
  });
  await pool.query(
    "UPDATE learner_topic_progress SET completed=false WHERE learner_id=$1 AND topic_id=$2",
    [actor.learnerId, topicId],
  );
  await pool.query(
    "UPDATE learner_topic_progress SET available=false WHERE learner_id=$1 AND topic_id='installing-the-cangjie-toolchain'",
    [actor.learnerId],
  );
  const before = await app.workspace(actor, topicId);
  const sql = await readFile(
    new URL(
      "../../infrastructure/persistence/migrations/0008_quiz_automatic_completion.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await pool.query(sql);
  await pool.query(sql);
  const after = await app.workspace(actor, topicId);
  expect(after.progress).toMatchObject({
    completed: true,
    nextTopicAvailable: true,
    bestScore: { earned: 70, possible: 100 },
  });
  expect(after.draft).toEqual(before.draft);
  expect(after.currentAttempt).toEqual(before.currentAttempt);
  const evidence = (
    await pool.query(
      "SELECT best_submission FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=$2",
      [actor.learnerId, topicId],
    )
  ).rows[0];
  expect(evidence.best_submission).toBe(passed.submissionId);
});

it("completion backfill excludes failing and malformed/foreign assessment evidence", async () => {
  const sql = await readFile(
    new URL(
      "../../infrastructure/persistence/migrations/0008_quiz_automatic_completion.sql",
      import.meta.url,
    ),
    "utf8",
  );
  for (const kind of ["failing", "malformed-score", "foreign-topic"]) {
    const actor = await freshFixture(pool);
    const topicId = "getting-started-with-cangjie";
    const quiz = await readQuiz(topicId);
    const ws = await app.workspace(actor, topicId);
    const result = await app.submit(actor, {
      topicId,
      attemptId: ws.currentAttempt.attemptId,
      requestKey: randomUUID(),
      assessmentRevision: quiz.revision,
      answers:
        kind === "failing"
          ? {}
          : Object.fromEntries(
              quiz.questions.slice(0, 7).map((q) => [q.id, q.correctChoiceId]),
            ),
    });
    if (kind === "malformed-score")
      await pool.query("UPDATE topic_submissions SET score=$2 WHERE id=$1", [
        result.submissionId,
        { earned: "oops", possible: 100 },
      ]);
    if (kind === "foreign-topic")
      await pool.query(
        "UPDATE topic_submissions SET snapshot=jsonb_set(snapshot,'{assessment,topicId}','\"identifiers\"') WHERE id=$1",
        [result.submissionId],
      );
    await pool.query(
      "UPDATE learner_topic_progress SET completed=false WHERE learner_id=$1 AND topic_id=$2",
      [actor.learnerId, topicId],
    );
    await pool.query(
      "UPDATE learner_topic_progress SET available=false WHERE learner_id=$1 AND topic_id='installing-the-cangjie-toolchain'",
      [actor.learnerId],
    );
    await pool.query(sql);
    const progress = (
      await pool.query(
        "SELECT completed FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=$2",
        [actor.learnerId, topicId],
      )
    ).rows[0];
    expect(progress.completed).toBe(false);
  }
});
