import { test, expect } from "@playwright/test";

test("saves selections made while an earlier save is pending", async ({
  page,
}) => {
  const questions = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`,
    prompt: `Question ${i}`,
    choices: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
  }));
  const saves: { baseRevision: number; answers: Record<string, string> }[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/topics/*/quiz", (route) =>
    route.fulfill({
      json: {
        learnerId: "test",
        topicId: "getting-started-with-cangjie",
        quiz: {
          topicId: "getting-started-with-cangjie",
          revision: 1,
          title: "Quiz",
          questions,
        },
        draft: { answers: {}, workRevision: 0 },
        progress: {
          bestScore: null,
          completed: false,
          canMarkComplete: false,
          nextTopicAvailable: false,
          nextTopicId: null,
        },
      },
    }),
  );
  await page.route("**/api/topics/*/quiz/draft", async (route) => {
    saves.push(route.request().postDataJSON());
    if (saves.length === 1) await held;
    await route.fulfill({
      json: { kind: "saved", workRevision: saves.length },
    });
  });
  await page.goto("/topics/getting-started-with-cangjie/activity");
  await page.locator('input[name="q-q0"][value="a"]').check();
  await expect.poll(() => saves.length).toBe(1);
  await page.locator('input[name="q-q1"][value="b"]').check();
  await page.waitForTimeout(1700); // The debounce fires while the first response is held.
  release();
  await expect.poll(() => saves.length, { timeout: 6000 }).toBe(2);
  expect(saves[1]).toEqual({ baseRevision: 1, answers: { q0: "a", q1: "b" } });
  await expect(
    page.getByText("Saved on server", { exact: true }),
  ).toBeVisible();
});
