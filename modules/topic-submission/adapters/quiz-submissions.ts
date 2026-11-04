import type pg from "pg";
import { createHash, randomUUID } from "node:crypto";
import { transaction } from "../../../infrastructure/persistence/connection.ts";
import {
  OperationError,
  type Actor,
} from "../../learner-account/application/actor.ts";
import {
  assessmentFor,
  type MultipleChoiceAssessment,
} from "../../roadmap/application/content.ts";
import {
  publicQuiz,
  type PublicQuiz,
} from "../../roadmap/adapters/quiz-content.ts";
import {
  readOpenQuizConflict,
  saveQuizDraftIn,
  resolveQuizDraftIn,
  type QuizDraft,
  type SaveQuizResult,
} from "../../activity-draft/adapters/quiz-drafts.ts";
import {
  assertQuizAttemptRequest,
  readQuizAttemptDraftIn,
} from "../../activity-draft/adapters/quiz-attempt-drafts.ts";
import {
  evaluateQuiz,
  type QuizEvaluation,
} from "../domain/quiz-evaluation.ts";
import {
  assertQuizRetrySource,
  QuizAttemptLifecycleError,
  type QuizAttempt,
} from "../domain/quiz-attempt.ts";
import { betterScore, passes, type Score } from "../domain/evaluation.ts";

export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const keyValid = (key: string) => {
  if (typeof key !== "string" || !key.length || key.length > 100) {
    throw new OperationError(400, "A request identity is required.");
  }
};

const lockActor = async (c: pg.PoolClient, a: Actor) => {
  if (
    !(
      await c.query(
        "SELECT id FROM learner_accounts WHERE id=$1 FOR NO KEY UPDATE",
        [a.learnerId],
      )
    ).rowCount
  ) {
    throw new OperationError(401, "Unknown learner.");
  }
};

export type QuizSubmissionResult = {
  submissionId: string;
  attemptId: string;
  evaluation: QuizEvaluation;
  progress: {
    bestScore: Score | null;
    completed: boolean;
    canMarkComplete: boolean;
    nextTopicAvailable: boolean;
    nextTopicId: string | null;
  };
};

export type QuizWorkspaceView = {
  learnerId: string;
  topicId: string;
  quiz: PublicQuiz;
  draft: QuizDraft;
  currentAttempt: QuizAttempt;
  currentAttemptIsLegacy: boolean;
  conflict: Extract<SaveQuizResult, { kind: "conflict" }> | null;
  progress: {
    bestScore: Score | null;
    completed: boolean;
    canMarkComplete: boolean;
    nextTopicAvailable: boolean;
    nextTopicId: string | null;
  };
  currentSubmission?: {
    submissionId: string;
    evaluation: QuizEvaluation;
    submittedAt: string;
  };
  latestSubmission?: {
    submissionId: string;
    submittedAt: string;
    score: Score;
  };
};

export class PostgresQuizSubmissions {
  constructor(readonly pool: pg.Pool) {}

  async saveDraft(
    actor: Actor,
    topicId: string,
    request: { attemptId?: string; baseRevision: number; answers: Record<string, string> },
  ): Promise<SaveQuizResult> {
    return transaction(this.pool, async (c) => {
      await lockActor(c, actor);
      const quiz = await assessmentFor<MultipleChoiceAssessment>(c, topicId);
      const attempt = await readQuizAttemptDraftIn(c, actor, topicId, quiz.revision, true);
      assertQuizAttemptRequest(attempt, request.attemptId);
      return saveQuizDraftIn(c, actor, topicId, request);
    });
  }

  async resolveDraft(
    actor: Actor,
    topicId: string,
    request: {
      attemptId?: string;
      conflictId: string;
      choice: "server" | "candidate";
      baseRevision: number;
    },
  ): Promise<SaveQuizResult> {
    return transaction(this.pool, async (c) => {
      await lockActor(c, actor);
      const quiz = await assessmentFor<MultipleChoiceAssessment>(c, topicId);
      const attempt = await readQuizAttemptDraftIn(c, actor, topicId, quiz.revision, true);
      assertQuizAttemptRequest(attempt, request.attemptId);
      return resolveQuizDraftIn(c, actor, topicId, request);
    });
  }

  async workspace(actor: Actor, topicId: string): Promise<QuizWorkspaceView> {
    return transaction(this.pool, async (c) => {
      await lockActor(c, actor);
      const publishedQuiz = await assessmentFor<MultipleChoiceAssessment>(c, topicId);
      const attemptDraft = await readQuizAttemptDraftIn(
        c,
        actor,
        topicId,
        publishedQuiz.revision,
        true,
      );
      const quiz = attemptDraft.currentAttempt.assessmentRevision === publishedQuiz.revision
        ? publishedQuiz
        : await assessmentFor<MultipleChoiceAssessment>(
          c,
          topicId,
          attemptDraft.currentAttempt.assessmentRevision,
        );
      const draft: QuizDraft = {
        answers: attemptDraft.answers,
        workRevision: attemptDraft.workRevision,
      };
      const conflict = await readOpenQuizConflict(c, actor, topicId, draft);
      const p = (
        await c.query(
          "SELECT * FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=$2",
          [actor.learnerId, topicId],
        )
      ).rows[0];

      if (!p || !p.available) {
        throw new OperationError(
          403,
          "Complete the preceding topic to unlock this activity.",
        );
      }

      const next = (
        await c.query(
          "SELECT id, (SELECT available FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=t.id) as available FROM topics t WHERE position=(SELECT position+1 FROM topics WHERE id=$2)",
          [actor.learnerId, topicId],
        )
      ).rows[0];

      const latestSubmissionRow = (
        await c.query(
          "SELECT id, score, created_at FROM topic_submissions WHERE learner_id=$1 AND snapshot->>'topicId'=$2 AND state='finalized' ORDER BY created_at DESC, id DESC LIMIT 1",
          [actor.learnerId, topicId],
        )
      ).rows[0];

      const currentSubmissionRow = attemptDraft.currentAttempt.state === "submitted"
        ? (await c.query(
          "SELECT id, snapshot, created_at FROM topic_submissions WHERE id=$1 AND learner_id=$2 AND state='finalized'",
          [attemptDraft.currentAttempt.submissionId, actor.learnerId],
        )).rows[0]
        : undefined;
      if (attemptDraft.currentAttempt.state === "submitted" && !currentSubmissionRow) {
        throw new OperationError(500, "The current quiz result could not be loaded.");
      }

      const passingRows = await c.query(
        "SELECT 1 FROM topic_submissions WHERE learner_id=$1 AND snapshot->>'topicId'=$2 AND state='finalized' AND (score->>'earned')::int >= 60 LIMIT 1",
        [actor.learnerId, topicId],
      );
      const hasPassingSubmission =
        p.completed ||
        (p.best_score && passes(p.best_score)) ||
        (passingRows.rowCount ?? 0) > 0;

      return {
        learnerId: actor.learnerId,
        topicId,
        quiz: publicQuiz(quiz),
        draft,
        currentAttempt: attemptDraft.currentAttempt,
        currentAttemptIsLegacy: attemptDraft.isLegacy,
        conflict,
        progress: {
          bestScore: p.best_score,
          completed: p.completed,
          canMarkComplete: !p.completed && Boolean(hasPassingSubmission),
          nextTopicAvailable: !!next?.available,
          nextTopicId: next?.id ?? null,
        },
        currentSubmission: currentSubmissionRow
          ? {
              submissionId: currentSubmissionRow.id,
              evaluation: currentSubmissionRow.snapshot.evaluation,
              submittedAt: new Date(currentSubmissionRow.created_at).toISOString(),
            }
          : undefined,
        latestSubmission: latestSubmissionRow
          ? {
              submissionId: latestSubmissionRow.id,
              submittedAt: new Date(latestSubmissionRow.created_at).toISOString(),
              score: latestSubmissionRow.score,
            }
          : undefined,
      };
    });
  }

  async startRetry(
    actor: Actor,
    topicId: string,
    request: {
      sourceSubmissionId: string;
      expectedAttemptId: string;
      baseRevision: number;
    },
  ): Promise<{ attemptId: string; workRevision: number }> {
    keyValid(request.sourceSubmissionId);
    keyValid(request.expectedAttemptId);
    if (!Number.isSafeInteger(request.baseRevision) || request.baseRevision < 0) {
      throw new OperationError(400, "Invalid base revision.");
    }

    return transaction(this.pool, async (c) => {
      await lockActor(c, actor);
      const progress = (
        await c.query(
          "SELECT available FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=$2 FOR UPDATE",
          [actor.learnerId, topicId],
        )
      ).rows[0];
      if (!progress?.available) {
        throw new OperationError(
          403,
          "Complete the preceding topic to unlock this activity.",
        );
      }

      const source = await c.query(
        "SELECT id FROM topic_submissions WHERE id=$1 AND learner_id=$2 AND snapshot->>'topicId'=$3 AND state='finalized'",
        [request.sourceSubmissionId, actor.learnerId, topicId],
      );
      if (!source.rowCount) {
        throw new OperationError(409, "Retry requires a finalized submission from this topic.");
      }

      // Check the transition identity before stale-attempt/revision checks so a lost
      // response can recover its receipt without moving the active draft backward.
      const existingSuccessor = (
        await c.query(
          "SELECT id, started_work_revision FROM quiz_attempts WHERE learner_id=$1 AND topic_id=$2 AND predecessor_submission_id=$3",
          [actor.learnerId, topicId, request.sourceSubmissionId],
        )
      ).rows[0];
      if (existingSuccessor) {
        return {
          attemptId: existingSuccessor.id,
          workRevision: existingSuccessor.started_work_revision,
        };
      }

      const currentQuiz = await assessmentFor<MultipleChoiceAssessment>(c, topicId);
      const current = await readQuizAttemptDraftIn(
        c,
        actor,
        topicId,
        currentQuiz.revision,
        true,
      );
      if (current.currentAttempt.attemptId !== request.expectedAttemptId) {
        throw new OperationError(409, "The quiz attempt changed. Reload before retrying.");
      }
      if (current.workRevision !== request.baseRevision) {
        throw new OperationError(409, "The quiz draft changed. Reload before retrying.");
      }
      try {
        assertQuizRetrySource(current.currentAttempt, request.sourceSubmissionId);
      } catch (error) {
        if (error instanceof QuizAttemptLifecycleError) {
          throw new OperationError(409, error.message);
        }
        throw error;
      }

      const conflict = await readOpenQuizConflict(c, actor, topicId, {
        answers: current.answers,
        workRevision: current.workRevision,
      });
      if (conflict) {
        throw new OperationError(409, "Resolve the open quiz draft conflict before retrying.");
      }

      const successorQuiz = await assessmentFor<MultipleChoiceAssessment>(c, topicId);
      const attemptId = randomUUID();
      const workRevision = current.workRevision + 1;
      await c.query(
        "INSERT INTO quiz_attempts(id, learner_id, topic_id, assessment_revision, state, predecessor_submission_id, started_work_revision) VALUES($1, $2, $3, $4, 'answering', $5, $6)",
        [
          attemptId,
          actor.learnerId,
          topicId,
          successorQuiz.revision,
          request.sourceSubmissionId,
          workRevision,
        ],
      );
      const updated = await c.query(
        "UPDATE quiz_drafts SET attempt_id=$3, answers='{}'::jsonb, work_revision=work_revision+1, updated_at=now() WHERE learner_id=$1 AND topic_id=$2 AND attempt_id=$4 AND work_revision=$5",
        [
          actor.learnerId,
          topicId,
          attemptId,
          current.currentAttempt.attemptId,
          request.baseRevision,
        ],
      );
      if (updated.rowCount !== 1) {
        throw new OperationError(409, "The quiz draft changed. Reload before retrying.");
      }
      return { attemptId, workRevision };
    });
  }

  async submit(
    actor: Actor,
    request: {
      topicId: string;
      attemptId?: string;
      requestKey: string;
      answers: Record<string, string>;
      assessmentRevision: number;
    },
  ): Promise<QuizSubmissionResult> {
    keyValid(request.requestKey);

    return transaction(this.pool, async (c) => {
      await lockActor(c, actor);

      const legacyIntent = hash(
        JSON.stringify({
          topicId: request.topicId,
          answers: request.answers,
          revision: request.assessmentRevision,
        }),
      );

      // Idempotency
      const existing = (
        await c.query(
          "SELECT * FROM topic_submissions WHERE learner_id=$1 AND request_key=$2",
          [actor.learnerId, request.requestKey],
        )
      ).rows[0];

      if (existing) {
        const association = (await c.query(
          "SELECT id, is_legacy FROM quiz_attempts WHERE submission_id=$1 AND learner_id=$2",
          [existing.id, actor.learnerId],
        )).rows[0];
        const attemptIntent = association && hash(JSON.stringify({
          topicId: request.topicId,
          attemptId: association.id,
          answers: request.answers,
          revision: request.assessmentRevision,
        }));
        const legacyReplay = request.attemptId === undefined && association?.is_legacy && existing.intent_hash === legacyIntent;
        const attemptReplay = request.attemptId !== undefined && request.attemptId === association?.id
          && existing.intent_hash === attemptIntent;
        if (!association || (!legacyReplay && !attemptReplay)) {
          throw new OperationError(
            409,
            "Request identity was reused for different work.",
          );
        }
        const p = (
          await c.query(
            "SELECT * FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=$2",
            [actor.learnerId, request.topicId],
          )
        ).rows[0];
        const next = (
          await c.query(
            "SELECT id, (SELECT available FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=t.id) as available FROM topics t WHERE position=(SELECT position+1 FROM topics WHERE id=$2)",
            [actor.learnerId, request.topicId],
          )
        ).rows[0];
        return {
          submissionId: existing.id,
          attemptId: association.id,
          evaluation: existing.snapshot.evaluation,
          progress: {
            bestScore: p.best_score,
            completed: p.completed,
          canMarkComplete: !p.completed && Boolean(p.best_score && passes(p.best_score)),
            nextTopicAvailable: !!next?.available,
            nextTopicId: next?.id ?? null,
          },
        };
      }

      // Check availability
      const progress = (
        await c.query(
          "SELECT * FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=$2 FOR UPDATE",
          [actor.learnerId, request.topicId],
        )
      ).rows[0];

      if (!progress?.available) {
        throw new OperationError(
          403,
          "Complete the preceding topic to unlock this activity.",
        );
      }

      // New submissions bind to the active attempt. Only a backfilled legacy
      // attempt accepts a client that has not learned the attempt identity yet.
      const publishedQuiz = await assessmentFor<MultipleChoiceAssessment>(c, request.topicId);
      const attemptDraft = await readQuizAttemptDraftIn(
        c,
        actor,
        request.topicId,
        publishedQuiz.revision,
        true,
      );
      assertQuizAttemptRequest(attemptDraft, request.attemptId);
      const openConflict = await readOpenQuizConflict(c, actor, request.topicId, {
        answers: attemptDraft.answers,
        workRevision: attemptDraft.workRevision,
      });
      if (openConflict) {
        throw new OperationError(409, "Resolve the open quiz draft conflict before submitting.");
      }
      if (request.assessmentRevision !== attemptDraft.currentAttempt.assessmentRevision) {
        throw new OperationError(409, "The quiz assessment changed. Reload before submitting.");
      }
      const attemptId = attemptDraft.currentAttempt.attemptId;
      const quiz = attemptDraft.currentAttempt.assessmentRevision === publishedQuiz.revision
        ? publishedQuiz
        : await assessmentFor<MultipleChoiceAssessment>(
          c,
          request.topicId,
          attemptDraft.currentAttempt.assessmentRevision,
        );
      const intent = request.attemptId === undefined
        ? legacyIntent
        : hash(JSON.stringify({
          topicId: request.topicId,
          attemptId,
          answers: request.answers,
          revision: attemptDraft.currentAttempt.assessmentRevision,
        }));

      // Pure domain scoring
      const evaluation = evaluateQuiz(quiz, request.answers);

      const id = randomUUID();
      const snapshot = {
        kind: "multiple-choice",
        topicId: request.topicId,
        assessment: {
          topicId: request.topicId,
          revision: request.assessmentRevision,
        },
        answers: request.answers,
        evaluation,
      };

      await c.query(
        "INSERT INTO topic_submissions(id, learner_id, request_key, review_id, intent_hash, snapshot, evaluation_id, state, score) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [
          id,
          actor.learnerId,
          request.requestKey,
          null,
          intent,
          snapshot,
          null,
          "finalized",
          evaluation.score,
        ],
      );

      const finalizedAttempt = await c.query(
        "UPDATE quiz_attempts SET state='submitted', submission_id=$2 WHERE id=$1 AND learner_id=$3 AND topic_id=$4 AND state='answering'",
        [attemptId, id, actor.learnerId, request.topicId],
      );
      if (finalizedAttempt.rowCount !== 1) {
        throw new OperationError(409, "The quiz attempt changed. Reload before submitting.");
      }

      // Best score retention (INV-14: lower retry does not reduce best score)
      const isBetter = betterScore(evaluation.score, progress.best_score);

      if (isBetter) {
        await c.query(
          "UPDATE learner_topic_progress SET best_score=$3, best_submission=$4 WHERE learner_id=$1 AND topic_id=$2",
          [actor.learnerId, request.topicId, evaluation.score, id],
        );
      }

      const updatedProgress = (
        await c.query(
          "SELECT * FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=$2",
          [actor.learnerId, request.topicId],
        )
      ).rows[0];

      const next = (
        await c.query(
          "SELECT id, (SELECT available FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=t.id) as available FROM topics t WHERE position=(SELECT position+1 FROM topics WHERE id=$2)",
          [actor.learnerId, request.topicId],
        )
      ).rows[0];

      // Eligible to mark complete if passes now or earlier best score passed
      const canMarkComplete =
        !updatedProgress.completed &&
        (passes(evaluation.score) || passes(updatedProgress.best_score));

      return {
        submissionId: id,
        attemptId,
        evaluation,
        progress: {
          bestScore: updatedProgress.best_score,
          completed: updatedProgress.completed,
          canMarkComplete,
          nextTopicAvailable: !!next?.available,
          nextTopicId: next?.id ?? null,
        },
      };
    });
  }

  async markComplete(
    actor: Actor,
    topicId: string,
  ): Promise<{
    completed: boolean;
    nextTopicAvailable: boolean;
  }> {
    return transaction(this.pool, async (c) => {
      await lockActor(c, actor);

      const p = (
        await c.query(
          "SELECT * FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=$2 FOR UPDATE",
          [actor.learnerId, topicId],
        )
      ).rows[0];

      if (!p || !p.available) {
        throw new OperationError(
          403,
          "Complete the preceding topic to unlock this activity.",
        );
      }

      if (p.completed) {
        // Already completed - idempotent
        const next = (
          await c.query(
            "SELECT available FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=(SELECT id FROM topics WHERE position=(SELECT position+1 FROM topics WHERE id=$2))",
            [actor.learnerId, topicId],
          )
        ).rows[0];
        return { completed: true, nextTopicAvailable: !!next?.available };
      }

      // Check whether passing evidence exists (best_score >= 60 or historical passing submission)
      const passingRows = await c.query(
        "SELECT 1 FROM topic_submissions WHERE learner_id=$1 AND snapshot->>'topicId'=$2 AND state='finalized' AND (score->>'earned')::int >= 60 LIMIT 1",
        [actor.learnerId, topicId],
      );
      const hasPassingEvidence =
        (p.best_score && passes(p.best_score)) ||
        (passingRows.rowCount ?? 0) > 0;

      if (!hasPassingEvidence) {
        throw new OperationError(
          400,
          "A passing score of at least 60/100 is required before marking this topic complete.",
        );
      }

      // Complete this topic
      await c.query(
        "UPDATE learner_topic_progress SET completed=true WHERE learner_id=$1 AND topic_id=$2",
        [actor.learnerId, topicId],
      );

      // Unlock the next sequential topic
      await c.query(
        "UPDATE learner_topic_progress SET available=true WHERE learner_id=$1 AND topic_id=(SELECT id FROM topics WHERE position=(SELECT position+1 FROM topics WHERE id=$2))",
        [actor.learnerId, topicId],
      );

      return { completed: true, nextTopicAvailable: true };
    });
  }
}
