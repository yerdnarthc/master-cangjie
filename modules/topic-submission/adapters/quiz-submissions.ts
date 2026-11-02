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
  readQuizDraft,
  readOpenQuizConflict,
  saveQuizDraftIn,
  resolveQuizDraftIn,
  type QuizDraft,
  type SaveQuizResult,
} from "../../activity-draft/adapters/quiz-drafts.ts";
import {
  evaluateQuiz,
  type QuizEvaluation,
} from "../domain/quiz-evaluation.ts";
import { passes, type Score } from "../domain/evaluation.ts";

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
  evaluation: QuizEvaluation;
  progress: {
    bestScore: Score | null;
    completed: boolean;
    canMarkComplete: boolean;
    nextTopicAvailable: boolean;
  };
};

export type QuizWorkspaceView = {
  learnerId: string;
  topicId: string;
  quiz: PublicQuiz;
  draft: QuizDraft;
  conflict: Extract<SaveQuizResult, { kind: "conflict" }> | null;
  progress: {
    bestScore: Score | null;
    completed: boolean;
    canMarkComplete: boolean;
    nextTopicAvailable: boolean;
  };
  latestSubmission?: {
    submissionId: string;
    evaluation: QuizEvaluation;
    submittedAt: string;
  };
};

export class PostgresQuizSubmissions {
  constructor(readonly pool: pg.Pool) {}

  async saveDraft(
    actor: Actor,
    topicId: string,
    request: { baseRevision: number; answers: Record<string, string> },
  ): Promise<SaveQuizResult> {
    return transaction(this.pool, async (c) => {
      await lockActor(c, actor);
      return saveQuizDraftIn(c, actor, topicId, request);
    });
  }

  async resolveDraft(
    actor: Actor,
    topicId: string,
    request: {
      conflictId: string;
      choice: "server" | "candidate";
      baseRevision: number;
    },
  ): Promise<SaveQuizResult> {
    return transaction(this.pool, async (c) => {
      await lockActor(c, actor);
      return resolveQuizDraftIn(c, actor, topicId, request);
    });
  }

  async workspace(actor: Actor, topicId: string): Promise<QuizWorkspaceView> {
    const quiz = await assessmentFor<MultipleChoiceAssessment>(
      this.pool,
      topicId,
    );
    const draft = await readQuizDraft(this.pool, actor, topicId);
    const conflict = await readOpenQuizConflict(this.pool, actor, topicId, draft);
    const p = (
      await this.pool.query(
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
      await this.pool.query(
        "SELECT available FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=(SELECT id FROM topics WHERE position=(SELECT position+1 FROM topics WHERE id=$2))",
        [actor.learnerId, topicId],
      )
    ).rows[0];

    const submissionRow = (
      await this.pool.query(
        "SELECT id, snapshot, score, created_at FROM topic_submissions WHERE learner_id=$1 AND snapshot->>'topicId'=$2 AND state='finalized' ORDER BY created_at DESC LIMIT 1",
        [actor.learnerId, topicId],
      )
    ).rows[0];

    // Check if any historical submission passed
    const passingRows = await this.pool.query(
      "SELECT 1 FROM topic_submissions WHERE learner_id=$1 AND snapshot->>'topicId'=$2 AND state='finalized' AND (score->>'earned')::int >= 60 LIMIT 1",
      [actor.learnerId, topicId],
    );
    const hasPassingSubmission =
      p.completed ||
      (p.best_score && passes(p.best_score)) ||
      (passingRows.rowCount ?? 0) > 0;

    const canMarkComplete = !p.completed && Boolean(hasPassingSubmission);

    return {
      learnerId: actor.learnerId,
      topicId,
      quiz: publicQuiz(quiz),
      draft,
      conflict,
      progress: {
        bestScore: p.best_score,
        completed: p.completed,
        canMarkComplete,
        nextTopicAvailable: !!next?.available,
      },
      latestSubmission: submissionRow
        ? {
            submissionId: submissionRow.id,
            evaluation: submissionRow.snapshot.evaluation,
            submittedAt: new Date(submissionRow.created_at).toISOString(),
          }
        : undefined,
    };
  }

  async submit(
    actor: Actor,
    request: {
      topicId: string;
      requestKey: string;
      answers: Record<string, string>;
      assessmentRevision: number;
    },
  ): Promise<QuizSubmissionResult> {
    keyValid(request.requestKey);

    return transaction(this.pool, async (c) => {
      await lockActor(c, actor);

      const intent = hash(
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
        if (existing.intent_hash !== intent) {
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
            "SELECT available FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=(SELECT id FROM topics WHERE position=(SELECT position+1 FROM topics WHERE id=$2))",
            [actor.learnerId, request.topicId],
          )
        ).rows[0];
        return {
          submissionId: existing.id,
          evaluation: existing.snapshot.evaluation,
          progress: {
            bestScore: p.best_score,
            completed: p.completed,
            canMarkComplete: !p.completed && passes(p.best_score),
            nextTopicAvailable: !!next?.available,
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

      // Fetch published assessment
      const quiz = await assessmentFor<MultipleChoiceAssessment>(
        c,
        request.topicId,
        request.assessmentRevision,
      );

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

      // Best score retention (INV-14: lower retry does not reduce best score)
      const isBetter =
        !progress.best_score ||
        evaluation.score.earned > progress.best_score.earned;

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
          "SELECT available FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=(SELECT id FROM topics WHERE position=(SELECT position+1 FROM topics WHERE id=$2))",
          [actor.learnerId, request.topicId],
        )
      ).rows[0];

      // Eligible to mark complete if passes now or earlier best score passed
      const canMarkComplete =
        !updatedProgress.completed &&
        (passes(evaluation.score) || passes(updatedProgress.best_score));

      return {
        submissionId: id,
        evaluation,
        progress: {
          bestScore: updatedProgress.best_score,
          completed: updatedProgress.completed,
          canMarkComplete,
          nextTopicAvailable: !!next?.available,
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
