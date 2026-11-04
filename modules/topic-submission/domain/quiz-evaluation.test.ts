import { describe, it, expect } from "vitest";
import {
  evaluateQuiz,
  retainQuizSubmissionProgress,
  markQuizTopicComplete,
  type QuizDefinition,
  type MultipleChoiceProgress,
} from "./quiz-evaluation.ts";

const sampleQuiz: QuizDefinition = {
  questions: Array.from({ length: 10 }, (_, i) => ({
    id: `q${i + 1}`,
    choices: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
    correctChoiceId: "b",
    explanation: `Explanation for q${i + 1}`,
  })),
};

describe("Multiple-choice domain evaluation (UC-13)", () => {
  it("awards 100/100 and passes when all 10 answers are correct", () => {
    const answers = Object.fromEntries(
      sampleQuiz.questions.map((q) => [q.id, "b"]),
    );
    const result = evaluateQuiz(sampleQuiz, answers);
    expect(result.score).toEqual({ earned: 100, possible: 100 });
    expect(result.passed).toBe(true);
    expect(result.correctCount).toBe(10);
    expect(result.unansweredCount).toBe(0);
    expect(
      result.questionResults.every(
        (r) => r.correct && r.earned === 10 && r.correctChoiceId === "b",
      ),
    ).toBe(true);
  });

  it("UC-13-AC1: exactly 6 correct answers yield 60/100 and pass", () => {
    const answers: Record<string, string> = {
      q1: "b",
      q2: "b",
      q3: "b",
      q4: "b",
      q5: "b",
      q6: "b", // 6 correct
      q7: "a",
      q8: "c",
      q9: "d",
      q10: "a", // 4 incorrect
    };
    const result = evaluateQuiz(sampleQuiz, answers);
    expect(result.score).toEqual({ earned: 60, possible: 100 });
    expect(result.passed).toBe(true);
    expect(result.correctCount).toBe(6);
  });

  it("UC-13-AC1: exactly 5 correct answers yield 50/100 and fail", () => {
    const answers: Record<string, string> = {
      q1: "b",
      q2: "b",
      q3: "b",
      q4: "b",
      q5: "b", // 5 correct
      q7: "a",
      q8: "c",
      q9: "d",
      q10: "a", // 4 incorrect
      // q6 omitted (unanswered)
    };
    const result = evaluateQuiz(sampleQuiz, answers);
    expect(result.score).toEqual({ earned: 50, possible: 100 });
    expect(result.passed).toBe(false);
    expect(result.correctCount).toBe(5);
    expect(result.unansweredCount).toBe(1);
    expect(result.questionResults[6]).toMatchObject({
      selectedChoiceId: "a",
      correct: false,
      correctChoiceId: "b",
    });
  });

  it("unanswered questions earn zero and are counted explicitly", () => {
    const result = evaluateQuiz(sampleQuiz, {});
    expect(result.score).toEqual({ earned: 0, possible: 100 });
    expect(result.passed).toBe(false);
    expect(result.unansweredCount).toBe(10);
    expect(result.correctCount).toBe(0);
    expect(
      result.questionResults.every(
        (r) =>
          !r.correct &&
          r.earned === 0 &&
          r.selectedChoiceId === null &&
          r.correctChoiceId === "b",
      ),
    ).toBe(true);
  });

  it("rejects an invalid choice that does not exist in the question", () => {
    expect(() => evaluateQuiz(sampleQuiz, { q1: "z" })).toThrow(
      /Selected choice "z" is not valid/,
    );
  });

  it("rejects a quiz definition with anything other than 10 questions", () => {
    const invalidQuiz: QuizDefinition = {
      questions: sampleQuiz.questions.slice(0, 9),
    };
    expect(() => evaluateQuiz(invalidQuiz, {})).toThrow(
      /must have exactly 10 questions/,
    );
  });
});

describe("Multiple-choice topic progression (UC-13 & UC-14)", () => {
  const initialProgress: MultipleChoiceProgress = {
    bestScore: null,
    completed: false,
    nextTopicAvailable: false,
    canMarkComplete: false,
  };

  it("UC-13-AC2: a passing score enables canMarkComplete but does NOT complete the topic or unlock the next topic", () => {
    const afterPass = retainQuizSubmissionProgress(initialProgress, {
      earned: 70,
      possible: 100,
    });
    expect(afterPass.bestScore).toEqual({ earned: 70, possible: 100 });
    expect(afterPass.canMarkComplete).toBe(true);
    expect(afterPass.completed).toBe(false);
    expect(afterPass.nextTopicAvailable).toBe(false);
  });

  it("UC-14-AC1: selecting Mark complete completes the topic and unlocks the next", () => {
    const afterPass = retainQuizSubmissionProgress(initialProgress, {
      earned: 60,
      possible: 100,
    });
    const finalized = markQuizTopicComplete(afterPass);
    expect(finalized.completed).toBe(true);
    expect(finalized.nextTopicAvailable).toBe(true);
  });

  it("UC-14-AC2: a retained passing score followed by a failing retry still permits completion", () => {
    const firstPass = retainQuizSubmissionProgress(initialProgress, {
      earned: 70,
      possible: 100,
    });
    expect(firstPass.bestScore).toEqual({ earned: 70, possible: 100 });

    // Lower retry (40/100)
    const afterFailingRetry = retainQuizSubmissionProgress(firstPass, {
      earned: 40,
      possible: 100,
    });
    expect(afterFailingRetry.bestScore).toEqual({ earned: 70, possible: 100 }); // Retains 70/100
    expect(afterFailingRetry.canMarkComplete).toBe(true); // Still eligible!

    // Learner can still mark complete!
    const completed = markQuizTopicComplete(afterFailingRetry);
    expect(completed.completed).toBe(true);
    expect(completed.nextTopicAvailable).toBe(true);
  });

  it("retains the higher normalized percentage when score denominators differ", () => {
    const previous = retainQuizSubmissionProgress(initialProgress, {
      earned: 70,
      possible: 100,
    });
    const improved = retainQuizSubmissionProgress(previous, {
      earned: 30,
      possible: 40,
    });
    expect(improved.bestScore).toEqual({ earned: 30, possible: 40 });
  });

  it("keeps the earlier best submission on a normalized percentage tie", () => {
    const previous = retainQuizSubmissionProgress(initialProgress, {
      earned: 60,
      possible: 100,
    });
    const tied = retainQuizSubmissionProgress(previous, {
      earned: 30,
      possible: 50,
    });
    expect(tied.bestScore).toEqual({ earned: 60, possible: 100 });
  });

  it("rejects Mark complete if the topic has no passing submission", () => {
    const failedAttempt = retainQuizSubmissionProgress(initialProgress, {
      earned: 50,
      possible: 100,
    });
    expect(failedAttempt.canMarkComplete).toBe(false);
    expect(() => markQuizTopicComplete(failedAttempt)).toThrow(
      /passing score of at least 60\/100 is required/,
    );
  });
});
