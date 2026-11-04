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
const topicId = "getting-started-with-cangjie";
it("lesson/review reads create no draft and zero score remains reviewable", async () => {
  const actor = await freshFixture(pool);
  expect((await app.activityState(actor, topicId)).currentAttempt).toBeNull();
  expect(await app.reviewBest(actor, topicId)).toBeNull();
  expect(
    (
      await pool.query("SELECT id FROM quiz_attempts WHERE learner_id=$1", [
        actor.learnerId,
      ])
    ).rowCount,
  ).toBe(0);
  const ws = await app.workspace(actor, topicId);
  expect((await app.activityState(actor, topicId)).currentAttempt?.state).toBe(
    "answering",
  );
  const submission = await app.submit(actor, {
    topicId,
    attemptId: ws.currentAttempt.attemptId,
    requestKey: randomUUID(),
    answers: {},
    assessmentRevision: ws.quiz.revision,
  });
  expect((await app.reviewBest(actor, topicId))?.submission).toMatchObject({
    submissionId: submission.submissionId,
    score: { earned: 0, possible: 100 },
  });
});

it("retains best identity and original content after lower retries and corrections", async () => {
  const actor = await freshFixture(pool);
  const quiz = await readQuiz(topicId);
  async function submit(count: number) {
    const ws = await app.workspace(actor, topicId);
    return app.submit(actor, {
      topicId,
      attemptId: ws.currentAttempt.attemptId,
      requestKey: randomUUID(),
      assessmentRevision: ws.quiz.revision,
      answers: Object.fromEntries(
        quiz.questions.slice(0, count).map((q) => [q.id, q.correctChoiceId]),
      ),
    });
  }
  async function retry() {
    const ws = await app.workspace(actor, topicId);
    await app.startRetry(actor, topicId, {
      sourceSubmissionId: ws.currentAttempt.submissionId!,
      expectedAttemptId: ws.currentAttempt.attemptId,
      baseRevision: ws.draft.workRevision,
    });
  }
  const first = await submit(8);
  await retry();
  await submit(4);
  expect((await app.reviewBest(actor, topicId))?.submission.submissionId).toBe(
    first.submissionId,
  );
  await retry();
  const higher = await submit(9);
  await retry();
  await submit(9);
  expect((await app.reviewBest(actor, topicId))?.submission.submissionId).toBe(
    higher.submissionId,
  );
  const modified = {
    ...quiz,
    revision: quiz.revision + 100,
    questions: quiz.questions.map((q) => ({
      ...q,
      prompt: "CORRECTED prompt",
      correctChoiceId: q.choices.find((c) => c.id !== q.correctChoiceId)!.id,
    })),
  };
  await pool.query(
    "INSERT INTO assessment_revisions(topic_id,revision,definition,content_hash) VALUES($1,$2,$3,'test-review-revision')",
    [topicId, modified.revision, modified],
  );
  await pool.query("UPDATE topics SET current_revision=$2 WHERE id=$1", [
    topicId,
    modified.revision,
  ]);
  try {
    await pool.query(
      "UPDATE topic_submissions SET snapshot=jsonb_set(snapshot,'{evaluation,questionResults,0}',(snapshot->'evaluation'->'questionResults'->0)-'correctChoiceId') WHERE id=$1",
      [higher.submissionId],
    );
    const review = await app.reviewBest(actor, topicId);
    expect(review?.quiz.questions[0].prompt).toBe(quiz.questions[0].prompt);
    expect(review?.evaluation.questionResults[0].correctChoiceId).toBe(
      quiz.questions[0].correctChoiceId,
    );
    expect(review?.evaluation.score).toEqual({ earned: 90, possible: 100 });
  } finally {
    await pool.query("UPDATE topics SET current_revision=$2 WHERE id=$1", [
      topicId,
      quiz.revision,
    ]);
    await pool.query(
      "DELETE FROM assessment_revisions WHERE topic_id=$1 AND revision=$2",
      [topicId, modified.revision],
    );
  }
});
it("denies foreign evidence and unavailable historical content instead of substituting", async () => {
  const actor = await freshFixture(pool),
    other = await freshFixture(pool);
  const ws = await app.workspace(actor, topicId);
  const submitted = await app.submit(actor, {
    topicId,
    attemptId: ws.currentAttempt.attemptId,
    requestKey: randomUUID(),
    assessmentRevision: ws.quiz.revision,
    answers: {},
  });
  expect(await app.reviewBest(other, topicId)).toBeNull();
  await pool.query(
    "UPDATE learner_topic_progress SET best_score=null,best_submission=null WHERE learner_id=$1 AND topic_id=$2",
    [actor.learnerId, topicId],
  );
  await expect(app.reviewBest(actor, topicId)).rejects.toThrow(
    /could not be loaded/,
  );
  await pool.query(
    "UPDATE learner_topic_progress SET best_score=$3,best_submission=$4 WHERE learner_id=$1 AND topic_id=$2",
    [
      actor.learnerId,
      topicId,
      { earned: 0, possible: 100 },
      submitted.submissionId,
    ],
  );
  await pool.query(
    "UPDATE learner_topic_progress SET best_score=$3,best_submission=$4 WHERE learner_id=$1 AND topic_id=$2",
    [
      other.learnerId,
      topicId,
      { earned: 0, possible: 100 },
      submitted.submissionId,
    ],
  );
  await expect(app.reviewBest(other, topicId)).rejects.toThrow(
    /could not be loaded/,
  );
  await expect(
    app.activityState(actor, "installing-the-cangjie-toolchain"),
  ).rejects.toThrow(/preceding/);
  await expect(
    app.activityState({ learnerId: randomUUID() }, topicId),
  ).rejects.toThrow(/Unknown learner/);
  await pool.query(
    "UPDATE topic_submissions SET snapshot=jsonb_set(snapshot,'{assessment,revision}','999999') WHERE id=$1",
    [submitted.submissionId],
  );
  await expect(app.reviewBest(actor, topicId)).rejects.toThrow(
    /original quiz content/,
  );
});
