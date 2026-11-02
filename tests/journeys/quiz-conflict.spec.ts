import { test, expect } from "@playwright/test";

test("asks before resolving a conflict and asks again if the server changes", async ({
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
  const draft = (answer: string, workRevision: number) => ({
    answers: { q0: answer },
    workRevision,
  });
  const calls: { conflictId: string; choice: string; baseRevision: number }[] =
    [];
  await page.route("**/api/topics/*/quiz", (route) =>
    route.fulfill({
      json: {
        quiz: { title: "Quiz", revision: 1, questions },
        learnerId: "conflict-test",
        draft: { answers: {}, workRevision: 0 },
        progress: {},
      },
    }),
  );
  await page.route("**/api/topics/*/quiz/draft", (route) =>
    route.fulfill({
      json: {
        kind: "conflict",
        conflictId: "conflict",
        server: draft("b", 2),
        candidate: draft("a", 0),
      },
    }),
  );
  await page.route("**/api/topics/*/quiz/draft/resolve", async (route) => {
    calls.push(route.request().postDataJSON());
    await route.fulfill({
      json:
        calls.length === 1
          ? {
              kind: "conflict",
              conflictId: "conflict",
              server: draft("a", 3),
              candidate: draft("a", 0),
            }
          : { kind: "saved", workRevision: 4 },
    });
  });
  await page.goto("/topics/getting-started-with-cangjie/activity");
  await page.locator('input[name="q-q0"][value="a"]').check();
  await expect(
    page.getByRole("heading", { name: "Choose which answers to keep" }),
  ).toBeVisible();
  expect(calls).toHaveLength(0);
  await expect(page.getByText("Question 0: Beta")).toBeVisible();
  await page.getByRole("button", { name: "Keep my answers" }).click();
  await expect(
    page.getByText(
      "The saved answers changed again. Review both versions and choose again.",
    ),
  ).toBeVisible();
  expect(calls[0]).toEqual({
    conflictId: "conflict",
    choice: "candidate",
    baseRevision: 2,
  });
  await page.getByRole("button", { name: "Keep saved answers" }).click();
  await expect(page.getByText("Draft choice saved")).toBeVisible();
  expect(calls[1]).toEqual({
    conflictId: "conflict",
    choice: "server",
    baseRevision: 3,
  });
});

test("restores a postponed choice after reopening the activity", async ({
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
  const server = { answers: { q0: "a" }, workRevision: 1 };
  const candidate = { answers: { q0: "b" }, workRevision: 0 };
  let open = true;
  await page.route("**/api/topics/*/quiz", (route) =>
    route.fulfill({
      json: {
        learnerId: "postponed-test",
        quiz: { title: "Quiz", revision: 1, questions },
        draft: server,
        conflict: open
          ? { kind: "conflict", conflictId: "one", server, candidate }
          : null,
        progress: {},
      },
    }),
  );
  await page.route("**/api/topics/*/quiz/draft/resolve", (route) => {
    open = false;
    return route.fulfill({ json: { kind: "saved", workRevision: 2 } });
  });
  await page.goto("/topics/getting-started-with-cangjie/activity");
  await expect(page.getByText("Question 0: Beta")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Choose which answers to keep" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep my answers" }).click();
  await expect(page.getByText("Draft choice saved")).toBeVisible();
});
