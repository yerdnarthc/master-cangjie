export type QuizAttemptState = "answering" | "submitted";

type QuizAttemptIdentity = Readonly<{
  attemptId: string;
  assessmentRevision: number;
}>;

export type QuizAttempt = QuizAttemptIdentity &
  (
    | Readonly<{
        state: "answering";
        submissionId: null;
      }>
    | Readonly<{
        state: "submitted";
        submissionId: string;
      }>
  );

export type QuizAttemptLifecycleErrorReason =
  | "attempt-already-submitted"
  | "attempt-not-submitted"
  | "retry-source-mismatch";

export class QuizAttemptLifecycleError extends Error {
  constructor(readonly reason: QuizAttemptLifecycleErrorReason, message: string) {
    super(message);
    this.name = "QuizAttemptLifecycleError";
    Object.setPrototypeOf(this, QuizAttemptLifecycleError.prototype);
  }
}

/** Submitted answer sheets are immutable; editing requires a separate retry attempt. */
export function assertQuizAttemptEditable(
  attempt: QuizAttempt,
): asserts attempt is QuizAttempt & { state: "answering"; submissionId: null } {
  if (attempt.state !== "answering") {
    throw new QuizAttemptLifecycleError(
      "attempt-already-submitted",
      "This quiz attempt has already been submitted.",
    );
  }
}

/** Retry can only transition from the finalized submission that names its source. */
export function assertQuizRetrySource(
  attempt: QuizAttempt,
  sourceSubmissionId: string,
): void {
  if (attempt.state !== "submitted") {
    throw new QuizAttemptLifecycleError(
      "attempt-not-submitted",
      "Only a submitted quiz attempt can be retried.",
    );
  }
  if (attempt.submissionId !== sourceSubmissionId) {
    throw new QuizAttemptLifecycleError(
      "retry-source-mismatch",
      "The retry source does not match this quiz attempt.",
    );
  }
}
