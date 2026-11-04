import type { Score } from "../domain/evaluation.ts";
import type { QuizAttempt } from "../domain/quiz-attempt.ts";
import type { QuizEvaluation } from "../domain/quiz-evaluation.ts";
import type { PublicQuiz } from "../../roadmap/adapters/quiz-content.ts";
export type QuizBestSummary = {
  submissionId: string;
  score: Score;
  submittedAt: string;
};
export type QuizActivityState = {
  learnerId: string;
  topicId: string;
  bestSubmission: QuizBestSummary | null;
  currentAttempt: QuizAttempt | null;
  workRevision: number | null;
  completed: boolean;
};
export type QuizBestReview = {
  learnerId: string;
  topicId: string;
  submission: QuizBestSummary;
  quiz: PublicQuiz;
  answers: Record<string, string>;
  evaluation: QuizEvaluation;
};
