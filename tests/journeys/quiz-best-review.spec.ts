import { test, expect } from "@playwright/test";
import { resetMilestone, resetLearnerToStart } from "./reset.ts";
import { readQuiz } from "../../modules/roadmap/adapters/quiz-content.ts";
const topicId = "getting-started-with-cangjie";
const topic = `/topics/${topicId}`;
test("retains best review, saves retry before review, and continues its draft", async ({
  page,
}) => {
  await resetMilestone();
  await resetLearnerToStart();
  await page.goto(`${topic}/activity`);
  await page.evaluate(async () => {
    await fetch("/api/session", { method: "POST" });
  });
  await page.goto(`${topic}/activity`);
  await expect(page.getByRole("radio").first()).toBeVisible();
  const quiz = await readQuiz(topicId);
  const answers = Object.fromEntries(
    quiz.questions.slice(0, 8).map((q) => [q.id, q.correctChoiceId]),
  );
  await page.evaluate(
    async ({ topicId, answers }) => {
      const ws = await (await fetch(`/api/topics/${topicId}/quiz`)).json();
      const r = await fetch(`/api/topics/${topicId}/quiz/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId: ws.currentAttempt.attemptId,
          requestKey: crypto.randomUUID(),
          answers,
          assessmentRevision: ws.quiz.revision,
          expectedLearnerId: ws.learnerId,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
    },
    { topicId, answers },
  );
  await page.goto(topic);
  await expect(
    page.getByRole("link", { name: /Review best submission/ }),
  ).toContainText("80/100");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("radio").first()).toBeEnabled();
  await page.getByRole("radio").nth(1).check();
  await page.getByRole("button", { name: /Review best submission/ }).click();
  await expect(page).toHaveURL(`${topic}/activity/review`);
  await expect(
    page.getByRole("heading", { name: "Best submission" }),
  ).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Submit activity", exact: true }),
  ).toHaveCount(0);
  const reviewWrites: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() !== "GET" &&
      /quiz\/(draft|submit|retry)/.test(request.url())
    )
      reviewWrites.push(request.url());
  });
  await page.locator(".quiz-review-choices li").first().click();
  await page.getByRole("button", { name: "Questions 6–10" }).click();
  await expect(
    page.getByRole("heading", { name: /Question 10/ }),
  ).toBeVisible();
  expect(reviewWrites).toEqual([]);
  await page.getByRole("link", { name: "Back to topic" }).click();
  await page
    .getByRole("link", { name: "Continue activity", exact: true })
    .click();
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
});

async function prepareRetry(page: import("@playwright/test").Page) {
  await resetMilestone();
  await resetLearnerToStart();
  await page.goto(topic);
  await page.evaluate(async () => {
    await fetch("/api/session", { method: "POST" });
  });
  const quiz = await readQuiz(topicId);
  const answers = Object.fromEntries(
    quiz.questions.slice(0, 8).map((q) => [q.id, q.correctChoiceId]),
  );
  await page.evaluate(
    async ({ topicId, answers }) => {
      const ws = await (await fetch(`/api/topics/${topicId}/quiz`)).json();
      const r = await fetch(`/api/topics/${topicId}/quiz/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId: ws.currentAttempt.attemptId,
          requestKey: crypto.randomUUID(),
          answers,
          assessmentRevision: ws.quiz.revision,
          expectedLearnerId: ws.learnerId,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
    },
    { topicId, answers },
  );
  await page.goto(topic);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("radio").first()).toBeEnabled();
}
test("review waits for a held autosave and saves the newer selection", async ({
  page,
}) => {
  await prepareRetry(page);
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((r) => (release = r)),
    saving = new Promise<void>((r) => (started = r));
  let requests = 0;
  await page.route(`**/api/topics/${topicId}/quiz/draft`, async (route) => {
    requests++;
    const response = await route.fetch();
    if (requests === 1) {
      started();
      await held;
    }
    await route.fulfill({ response });
  });
  try {
    await page.getByRole("radio").nth(0).check();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await saving;
    await page.getByRole("radio").nth(1).check();
    await page.getByRole("button", { name: /Review best submission/ }).click();
    await expect(
      page.getByRole("button", { name: "Saving before review…" }),
    ).toBeVisible();
    expect(page.url()).toMatch(/activity$/);
    release();
    await expect(page).toHaveURL(`${topic}/activity/review`);
    await page.goto(topic);
    await page
      .getByRole("link", { name: "Continue activity", exact: true })
      .click();
    await expect(page.getByRole("radio").nth(1)).toBeChecked();
  } finally {
    release();
  }
});
test("failed draft save blocks review without dropping the selected answer", async ({
  page,
}) => {
  await prepareRetry(page);
  await page.route(`**/api/topics/${topicId}/quiz/draft`, (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Save unavailable. Try again." },
    }),
  );
  await page.getByRole("radio").nth(1).check();
  await page.getByRole("button", { name: /Review best submission/ }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "latest answers" }),
  ).toBeVisible();
  expect(page.url()).toMatch(/activity$/);
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
});
test("a lower retry preserves completion and dismissal reveals current feedback without reopening", async ({
  page,
}) => {
  await prepareRetry(page);
  await page
    .getByRole("button", { name: "Submit activity", exact: true })
    .click();
  await page.getByRole("button", { name: /Submit anyway/ }).click();
  const dialog = page.getByRole("dialog", { name: "Try another attempt" });
  await expect(dialog).toContainText("topic stays complete");
  await expect(dialog.getByRole("button", { name: "Review answers" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Retry", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Review answers" })).toBeFocused();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThan(0); expect(box!.y).toBeGreaterThan(0);

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Topic completed!", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(dialog).toHaveCount(0);
});

test("review drains an older lost-response save before the newest answer", async ({
  page,
}) => {
  await prepareRetry(page);
  await page.clock.install();
  let saves = 0;
  await page.route(`**/api/topics/${topicId}/quiz/draft`, async (route) => {
    saves++;
    if (saves === 1) {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("radio").nth(0).check();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.locator(".quiz-save-button")).toBeEnabled();
  await page.getByRole("radio").nth(1).check();
  await page.getByRole("button", { name: /Review best submission/ }).click();
  await expect(page).toHaveURL(`${topic}/activity/review`);
  expect(saves).toBeGreaterThanOrEqual(3);
  await page.goto(topic);
  await page
    .getByRole("link", { name: "Continue activity", exact: true })
    .click();
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
});
test("answers and submission stay locked until review navigation finishes", async ({
  page,
}) => {
  await prepareRetry(page);
  let release!: () => void, started!: () => void;
  const held = new Promise<void>((r) => (release = r)),
    loading = new Promise<void>((r) => (started = r));
  await page.route("**/activity/review*", async (route) => {
    const response = await route.fetch();
    started();
    await held;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: /Review best submission/ }).click();
    await loading;
    await expect(page.getByRole("radio").first()).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Submit activity", exact: true }),
    ).toBeDisabled();
    release();
    await expect(page).toHaveURL(`${topic}/activity/review`);
  } finally {
    release();
  }
});

test("review direct links enforce sign-in/access and have no answer key before submission", async ({
  page,
}) => {
  await resetMilestone();
  await resetLearnerToStart();
  await page.goto(`${topic}/activity/review`);
  await expect(
    page.getByRole("heading", { name: "Open your learning path" }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await fetch("/api/session", { method: "POST" });
  });
  await page.goto(`${topic}/activity/review`);
  await expect(
    page.getByText("You haven't submitted this activity yet.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Correct answer", { exact: true })).toHaveCount(
    0,
  );
  await page.goto("/topics/installing-the-cangjie-toolchain/activity/review");
  await expect(
    page.getByText(/Complete Getting Started with Cangjie/),
  ).toBeVisible();
  await expect(page.getByText("Correct answer", { exact: true })).toHaveCount(
    0,
  );
  const coding = await page.goto(
    "/topics/running-the-first-cangjie-program/activity/review",
  );
  expect(coding?.status()).toBe(404);
  const unknown = await page.goto("/topics/unknown-quiz/activity/review");
  expect(unknown?.status()).toBe(404);
});
