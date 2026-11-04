import { describe, expect, it } from "vitest";
import {
  assertQuizAttemptEditable,
  assertQuizRetrySource,
  type QuizAttempt,
} from "./quiz-attempt.ts";

describe("multiple-choice attempt lifecycle", () => {
  it("allows edits only before the attempt has a finalized submission", () => {
    const answering: QuizAttempt = {
      attemptId: "attempt-1",
      assessmentRevision: 2,
      state: "answering",
      submissionId: null,
    };
    const submitted: QuizAttempt = {
      attemptId: "attempt-1",
      assessmentRevision: 2,
      state: "submitted",
      submissionId: "submission-1",
    };

    expect(() => assertQuizAttemptEditable(answering)).not.toThrow();
    expect(() => assertQuizAttemptEditable(submitted)).toThrow(/already been submitted/i);
  });

  it("allows retry only from the submitted attempt that owns the source submission", () => {
    const answering: QuizAttempt = {
      attemptId: "attempt-1",
      assessmentRevision: 2,
      state: "answering",
      submissionId: null,
    };
    const submitted: QuizAttempt = {
      attemptId: "attempt-2",
      assessmentRevision: 2,
      state: "submitted",
      submissionId: "submission-2",
    };

    expect(() => assertQuizRetrySource(submitted, "submission-2")).not.toThrow();
    expect(() => assertQuizRetrySource(answering, "submission-1")).toThrow(
      /only a submitted quiz attempt can be retried/i,
    );
    expect(() => assertQuizRetrySource(submitted, "submission-1")).toThrow(
      /retry source does not match/i,
    );
  });
});
