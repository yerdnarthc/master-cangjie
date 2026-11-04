import type pg from "pg";
import { randomUUID } from "node:crypto";
import {
  OperationError,
  type Actor,
} from "../../learner-account/application/actor.ts";
import type { QuizAttempt } from "../../topic-submission/domain/quiz-attempt.ts";
import { assertQuizAttemptEditable, QuizAttemptLifecycleError } from "../../topic-submission/domain/quiz-attempt.ts";
import { accessible } from "./postgres.ts";

export type QuizAttemptDraft = Readonly<{
  currentAttempt: QuizAttempt;
  isLegacy: boolean;
  answers: Record<string, string>;
  workRevision: number;
}>;

export async function readQuizAttemptDraftIn(
  client: pg.PoolClient,
  actor: Actor,
  topicId: string,
  currentAssessmentRevision: number,
  lock = false,
): Promise<QuizAttemptDraft> {
  await accessible(client, actor, topicId);

  const selectCurrent = () => client.query(
    `SELECT d.answers, d.work_revision, a.id AS attempt_id,
            a.assessment_revision, a.state, a.submission_id, a.is_legacy
     FROM quiz_drafts d
     JOIN quiz_attempts a
       ON a.id = d.attempt_id AND a.learner_id = d.learner_id AND a.topic_id = d.topic_id
     WHERE d.learner_id=$1 AND d.topic_id=$2${lock ? " FOR UPDATE OF d, a" : ""}`,
    [actor.learnerId, topicId],
  );

  let result = await selectCurrent();
  if (!result.rowCount) {
    const attemptId = randomUUID();
    await client.query(
      "INSERT INTO quiz_attempts(id, learner_id, topic_id, assessment_revision, state, started_work_revision) VALUES($1, $2, $3, $4, 'answering', 0)",
      [attemptId, actor.learnerId, topicId, currentAssessmentRevision],
    );
    await client.query(
      "INSERT INTO quiz_drafts(learner_id, topic_id, attempt_id, answers, work_revision) VALUES($1, $2, $3, '{}'::jsonb, 0)",
      [actor.learnerId, topicId, attemptId],
    );
    result = await selectCurrent();
  }

  const row = result.rows[0];
  if (!row) throw new OperationError(500, "The quiz attempt could not be loaded.");
  const currentAttempt = {
    attemptId: row.attempt_id as string,
    assessmentRevision: row.assessment_revision as number,
    state: row.state as QuizAttempt["state"],
    submissionId: row.submission_id as string | null,
  } as QuizAttempt;

  return {
    currentAttempt,
    isLegacy: row.is_legacy as boolean,
    answers: row.answers as Record<string, string>,
    workRevision: row.work_revision as number,
  };
}

/** Bind each mutation to the active attempt; legacy omission is restricted to backfilled rows. */
export function assertQuizAttemptRequest(
  attempt: QuizAttemptDraft,
  requestedAttemptId?: string,
): void {
  if (requestedAttemptId !== undefined && requestedAttemptId !== attempt.currentAttempt.attemptId) {
    throw new OperationError(409, "The quiz attempt changed. Reload before continuing.");
  }
  if (requestedAttemptId === undefined && !attempt.isLegacy) {
    throw new OperationError(409, "This quiz request is missing its attempt identity. Reload before continuing.");
  }
  try {
    assertQuizAttemptEditable(attempt.currentAttempt);
  } catch (error) {
    if (error instanceof QuizAttemptLifecycleError) {
      throw new OperationError(409, error.message);
    }
    throw error;
  }
}
