import { assertScore, betterScore, passes, type Score } from "./evaluation.ts";

/** Answer sheet: selection or null/undefined (unanswered) for each question. */
export type AnswerSheet = Record<string, string | null | undefined>;

export type QuestionFeedback = Readonly<{
  questionId: string;
  selectedChoiceId: string | null;
  /** Optional only for historical persisted results created before this field was added. */
  correctChoiceId?: string;
  correct: boolean;
  earned: number; // 10 or 0
  explanation: string;
}>;

export type QuizEvaluation = Readonly<{
  score: Score;
  passed: boolean;
  totalQuestions: 10;
  correctCount: number;
  unansweredCount: number;
  questionResults: readonly QuestionFeedback[];
}>;

export type QuizQuestionDefinition = Readonly<{
  id: string;
  choices: readonly Readonly<{ id: string }>[];
  correctChoiceId: string;
  explanation: string;
}>;

export type QuizDefinition = Readonly<{
  questions: readonly QuizQuestionDefinition[];
}>;

/**
 * Pure domain evaluation for a multiple-choice activity.
 * Exactly 10 questions.
 * Correct = 10 pts, incorrect/unanswered = 0 pts. Total = 100.
 * Passing is >= 60/100 (passes function checks 5 * earned >= 3 * possible).
 */
export function evaluateQuiz(
  quiz: QuizDefinition,
  answers: AnswerSheet,
): QuizEvaluation {
  if (quiz.questions.length !== 10) {
    throw new Error(
      "A multiple-choice activity must have exactly 10 questions.",
    );
  }

  let correctCount = 0;
  let unansweredCount = 0;
  const questionResults: QuestionFeedback[] = [];

  for (const q of quiz.questions) {
    const rawChoice = answers[q.id];
    const selected =
      typeof rawChoice === "string" && rawChoice.trim().length > 0
        ? rawChoice.trim()
        : null;

    if (selected === null) {
      unansweredCount += 1;
      questionResults.push({
        questionId: q.id,
        selectedChoiceId: null,
        correctChoiceId: q.correctChoiceId,
        correct: false,
        earned: 0,
        explanation: q.explanation,
      });
      continue;
    }

    // Verify choice belongs to question
    const validChoice = q.choices.some((c) => c.id === selected);
    if (!validChoice) {
      throw new Error(
        `Selected choice "${selected}" is not valid for question "${q.id}".`,
      );
    }

    const correct = selected === q.correctChoiceId;
    if (correct) {
      correctCount += 1;
      questionResults.push({
        questionId: q.id,
        selectedChoiceId: selected,
        correctChoiceId: q.correctChoiceId,
        correct: true,
        earned: 10,
        explanation: q.explanation,
      });
    } else {
      questionResults.push({
        questionId: q.id,
        selectedChoiceId: selected,
        correctChoiceId: q.correctChoiceId,
        correct: false,
        earned: 0,
        explanation: q.explanation,
      });
    }
  }

  const score: Score = { earned: correctCount * 10, possible: 100 };
  assertScore(score);

  return {
    score,
    passed: passes(score),
    totalQuestions: 10,
    correctCount,
    unansweredCount,
    questionResults,
  };
}

export type MultipleChoiceProgress = Readonly<{
  bestScore: Score | null;
  completed: boolean;
  nextTopicAvailable: boolean;
}>;

/** A finalized passing quiz completes the topic; retries preserve earned progress. */
export function retainQuizSubmissionProgress(previous: MultipleChoiceProgress, finalizedScore: Score): MultipleChoiceProgress {
  assertScore(finalizedScore);
  const bestScore = betterScore(finalizedScore, previous.bestScore) ? { ...finalizedScore } : previous.bestScore;
  const completed = previous.completed || Boolean(bestScore && passes(bestScore));
  return { bestScore, completed, nextTopicAvailable: previous.nextTopicAvailable || completed };
}
