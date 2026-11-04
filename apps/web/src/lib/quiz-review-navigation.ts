export type QuizReviewNavigationState = {
  identity: string;
  blocked: boolean;
  submitted: boolean;
  dirty: boolean;
};
export type QuizReviewNavigationPorts = {
  read: () => QuizReviewNavigationState;
  settle: () => Promise<void>;
  /** True means confirmed save progress, even when a newer snapshot remains dirty. */
  flush: () => Promise<boolean>;
};
export async function prepareQuizReviewNavigation(
  ports: QuizReviewNavigationPorts,
): Promise<"ready" | "blocked"> {
  const identity = ports.read().identity;
  try {
    for (let i = 0; i < 3; i++) {
      await ports.settle();
      const state = ports.read();
      if (state.identity !== identity || state.blocked) return "blocked";
      if (state.submitted || !state.dirty) return "ready";
      if (!(await ports.flush())) return "blocked";
    }
    const final = ports.read();
    return final.identity === identity && !final.blocked && !final.dirty
      ? "ready"
      : "blocked";
  } catch {
    return "blocked";
  }
}
