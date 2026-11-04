import { it, expect } from "vitest";
import {
  prepareQuizReviewNavigation,
  type QuizReviewNavigationState,
} from "../../apps/web/src/lib/quiz-review-navigation.ts";
it("waits for older saves and flushes newer answers before review", async () => {
  let state: QuizReviewNavigationState = {
    identity: "learner:attempt",
    blocked: false,
    submitted: false,
    dirty: true,
  };
  let saved = false;
  const result = await prepareQuizReviewNavigation({
    read: () => state,
    settle: async () => {},
    flush: async () => {
      saved = true;
      state = { ...state, dirty: false };
      return true;
    },
  });
  expect(result).toBe("ready");
  expect(saved).toBe(true);
});
it.each(["conflict", "identity", "failure"])(
  "blocks %s without claiming a saved navigation",
  async (kind) => {
    let state: QuizReviewNavigationState = {
      identity: "learner:attempt",
      blocked: kind === "conflict",
      submitted: false,
      dirty: true,
    };
    const result = await prepareQuizReviewNavigation({
      read: () => state,
      settle: async () => {
        if (kind === "identity")
          state = { ...state, identity: "other:attempt" };
      },
      flush: async () => false,
    });
    expect(result).toBe("blocked");
  },
);
it("clean and submitted states do not need a save", async () => {
  for (const submitted of [false, true])
    expect(
      await prepareQuizReviewNavigation({
        read: () => ({
          identity: "same",
          blocked: false,
          submitted,
          dirty: false,
        }),
        settle: async () => {},
        flush: async () => {
          throw new Error("unexpected write");
        },
      }),
    ).toBe("ready");
});

it("continues draining after confirmed progress leaves a newer snapshot dirty", async () => {
  let dirty = true,
    flushes = 0;
  expect(
    await prepareQuizReviewNavigation({
      read: () => ({
        identity: "same",
        submitted: false,
        blocked: false,
        dirty,
      }),
      settle: async () => {},
      flush: async () => {
        flushes++;
        if (flushes === 2) dirty = false;
        return true;
      },
    }),
  ).toBe("ready");
  expect(flushes).toBe(2);
});
