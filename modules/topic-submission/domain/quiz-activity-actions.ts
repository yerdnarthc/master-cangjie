export function quizActivityAction(input: {
  hasSubmission: boolean;
  hasAnsweringAttempt: boolean;
}): "start" | "continue" | "retry" {
  return input.hasAnsweringAttempt
    ? "continue"
    : input.hasSubmission
      ? "retry"
      : "start";
}
