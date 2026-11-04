import { test, expect, type Page } from "@playwright/test";

async function openActivity(page: Page) {
  await page.goto("/topics/getting-started-with-cangjie/activity");
  const signIn = page.getByRole("button", { name: "Open development workspace" });
  if (await signIn.isVisible().catch(() => false)) await signIn.click();
}

test("recovers newer edits across reload and presents them after the earlier conflict", async ({
  page,
}) => {
  const questions = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`,
    prompt: `Question ${i}`,
    choices: [
      { id: "a", text: "Alpha" },
      { id: "b", text: "Beta" },
    ],
  }));
  const server = { answers: { q0: "b" }, workRevision: 1 };
  const candidate = { answers: { q0: "a" }, workRevision: 0 };
  let conflict: unknown = null;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let saves = 0;
  let resolutions = 0;
  await page.route("**/api/topics/*/quiz", (route) =>
    route.fulfill({
      json: {
        learnerId: "newer-test",

        currentAttempt: { attemptId: "00000000-0000-4000-8000-000000000001", assessmentRevision: 1, state: "answering", submissionId: null },
        currentAttemptIsLegacy: false,
        quiz: { title: "Quiz", revision: 1, questions },
        draft: { answers: {}, workRevision: 0 },
        progress: {},
        conflict,
      },
    }),
  );
  await page.route("**/api/topics/*/quiz/draft", async (route) => {
    saves++;
    const body = route.request().postDataJSON();
    if (saves === 1) {
      const firstResponse = { kind: "conflict" as const, conflictId: "first", server, candidate };
      conflict = firstResponse;
      await held;
      await route.fulfill({ json: firstResponse });
      return;
    }
    expect(body.answers).toEqual({ q0: "a", q1: "b" });
    const newerResponse = {
      kind: "conflict" as const,
      conflictId: "newer",
      server: { ...server, workRevision: 2 },
      candidate: { answers: body.answers, workRevision: body.baseRevision },
    };
    conflict = newerResponse;
    await route.fulfill({ json: newerResponse });
  });
  await page.route("**/api/topics/*/quiz/draft/resolve", async (route) => {
    resolutions++;
    conflict = null;
    await route.fulfill({
      json: {
        kind: "saved",
        workRevision: resolutions + 1,
        nextConflict: null,
      },
    });
  });
  await page.clock.install();
  await openActivity(page);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
  try {
    await page.locator('#q-q0 [role="radio"]').nth(0).click();
    await page.clock.fastForward(1500);
    await expect.poll(() => saves).toBe(1);
    await page.locator('#q-q1 [role="radio"]').nth(1).click();
    await page.clock.fastForward(1500);
  } finally {
    release();
  }
  await expect(
    page.getByRole("heading", { name: "Choose which answers to keep" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Choose which answers to keep" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep saved answers" }).click();
  await expect(page.getByText("Question 1: Beta")).toBeVisible();
  expect(resolutions).toBe(1);
  await page.getByRole("button", { name: "Keep my answers" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose which answers to keep" }),
  ).toHaveCount(0);
  expect(resolutions).toBe(2);
});
