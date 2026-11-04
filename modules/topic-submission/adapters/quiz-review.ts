import type pg from "pg";
import {
  OperationError,
  type Actor,
} from "../../learner-account/application/actor.ts";
import {
  assessmentFor,
  type MultipleChoiceAssessment,
} from "../../roadmap/application/content.ts";
import { publicQuiz } from "../../roadmap/adapters/quiz-content.ts";
import type { QuizEvaluation } from "../domain/quiz-evaluation.ts";
import { assertScore } from "../domain/evaluation.ts";
import type {
  QuizActivityState,
  QuizBestReview,
  QuizBestSummary,
} from "../application/quiz-review.ts";

export async function readQuizEvidence(
  c: pg.PoolClient,
  actor: Actor,
  topicId: string,
) {
  const row = (
    await c.query(
      `SELECT t.kind,p.available,p.completed,p.best_score,p.best_submission,
   EXISTS(SELECT 1 FROM topic_submissions history WHERE history.learner_id=$1 AND history.snapshot->>'topicId'=t.id AND history.snapshot->>'kind'='multiple-choice' AND history.state='finalized') AS has_submissions,
   s.id,s.learner_id,s.snapshot,s.score,s.state AS submission_state,s.created_at,
   a.id AS attempt_id,a.state AS attempt_state,a.assessment_revision,a.submission_id,d.work_revision
 FROM topics t
 LEFT JOIN learner_topic_progress p ON p.topic_id=t.id AND p.learner_id=$1
 LEFT JOIN topic_submissions s ON s.id=p.best_submission
 LEFT JOIN quiz_drafts d ON d.learner_id=p.learner_id AND d.topic_id=t.id
 LEFT JOIN quiz_attempts a ON a.id=d.attempt_id AND a.learner_id=d.learner_id AND a.topic_id=d.topic_id
 WHERE t.id=$2`,
      [actor.learnerId, topicId],
    )
  ).rows[0];
  if (!row) throw new OperationError(404, "This topic could not be found.");
  if (!row.available)
    throw new OperationError(
      403,
      "Complete the preceding topic to unlock this activity.",
    );
  if (row.kind !== "multiple-choice")
    throw new OperationError(404, "This topic has no multiple-choice review.");
  let bestSubmission: QuizBestSummary | null = null;
  if (row.best_submission || row.best_score || row.has_submissions) {
    const snapshot = row.snapshot;
    if (
      !row.id ||
      row.learner_id !== actor.learnerId ||
      row.submission_state !== "finalized" ||
      snapshot?.kind !== "multiple-choice" ||
      snapshot.topicId !== topicId ||
      snapshot.assessment?.topicId !== topicId ||
      !Number.isSafeInteger(snapshot.assessment?.revision) ||
      snapshot.assessment.revision < 1
    )
      throw new OperationError(
        503,
        "Your best submission could not be loaded. Return to the topic and try again.",
      );
    try {
      assertScore(row.score);
      assertScore(row.best_score);
    } catch {
      throw new OperationError(
        503,
        "Your best submission score could not be loaded.",
      );
    }
    if (
      row.score.earned !== row.best_score.earned ||
      row.score.possible !== row.best_score.possible
    )
      throw new OperationError(
        503,
        "Your best submission score is inconsistent.",
      );
    bestSubmission = {
      submissionId: row.id,
      score: row.score,
      submittedAt: new Date(row.created_at).toISOString(),
    };
  }
  const state: QuizActivityState = {
    learnerId: actor.learnerId,
    topicId,
    bestSubmission,
    completed: row.completed,
    currentAttempt: row.attempt_id
      ? {
          attemptId: row.attempt_id,
          state: row.attempt_state,
          assessmentRevision: row.assessment_revision,
          submissionId: row.submission_id,
        }
      : null,
    workRevision: row.work_revision ?? null,
  };
  return { state, snapshot: row.snapshot };
}
export async function readBestQuizReview(
  c: pg.PoolClient,
  actor: Actor,
  topicId: string,
): Promise<QuizBestReview | null> {
  const { state, snapshot } = await readQuizEvidence(c, actor, topicId);
  if (!state.bestSubmission) return null;
  let quiz: MultipleChoiceAssessment;
  try {
    quiz = await assessmentFor<MultipleChoiceAssessment>(
      c,
      topicId,
      snapshot.assessment.revision,
    );
  } catch {
    throw new OperationError(
      503,
      "The original quiz content is unavailable. Return to the topic and try again.",
    );
  }
  const evaluation = snapshot.evaluation as QuizEvaluation;
  if (
    quiz.kind !== "multiple-choice" ||
    quiz.topicId !== topicId ||
    quiz.revision !== snapshot.assessment.revision ||
    !Array.isArray(quiz.questions) ||
    quiz.questions.length !== 10 ||
    !evaluation ||
    !Array.isArray(evaluation.questionResults) ||
    evaluation.questionResults.length !== 10 ||
    evaluation.score?.earned !== state.bestSubmission.score.earned ||
    evaluation.score?.possible !== state.bestSubmission.score.possible ||
    !snapshot.answers ||
    typeof snapshot.answers !== "object"
  )
    throw new OperationError(
      503,
      "Your original submission feedback is unavailable.",
    );
  const seen = new Set<string>();
  const questionResults = evaluation.questionResults.map((result) => {
    const q = quiz.questions.find((q) => q.id === result.questionId);
    if (
      !q ||
      seen.has(q.id) ||
      typeof result.explanation !== "string" ||
      typeof result.correct !== "boolean" ||
      (result.selectedChoiceId !== null &&
        !q.choices.some((c) => c.id === result.selectedChoiceId)) ||
      (snapshot.answers[q.id] ?? null) !== result.selectedChoiceId ||
      !q.choices.some(
        (c) => c.id === (result.correctChoiceId ?? q.correctChoiceId),
      )
    )
      throw new OperationError(
        503,
        "Your original submission feedback is unavailable.",
      );
    seen.add(q.id);
    return {
      ...result,
      correctChoiceId: result.correctChoiceId ?? q.correctChoiceId,
    };
  });
  return {
    learnerId: actor.learnerId,
    topicId,
    submission: state.bestSubmission,
    quiz: publicQuiz(quiz),
    answers: snapshot.answers,
    evaluation: { ...evaluation, questionResults },
  };
}
