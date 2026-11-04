import { it, expect } from "vitest";
import { quizActivityAction } from "./quiz-activity-actions.ts";
it.each([
  [false, false, "start"],
  [false, true, "continue"],
  [true, false, "retry"],
  [true, true, "continue"],
] as const)(
  "submission=%s answering=%s offers %s",
  (hasSubmission, hasAnsweringAttempt, expected) => {
    expect(quizActivityAction({ hasSubmission, hasAnsweringAttempt })).toBe(
      expected,
    );
  },
);
