import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { LEARNER } from "../../modules/learner-account/adapters/development-session.ts";
import { resetMilestone, resetLearnerToStart } from "./reset.ts";

async function readQuizDraft(page: Page, learnerId: string, topicId: string) {
  return page.evaluate(async ({ learnerId, topicId }) => {
    const workspace = await fetch(`/api/topics/${encodeURIComponent(topicId)}/quiz`).then(response => response.json());
    return new Promise<{
    dirty: boolean;
    pendingSave: unknown;
  } | null>((resolve) => {
    const open = indexedDB.open("master-cangjie-work");
    open.onerror = () => resolve(null);
    open.onsuccess = () => {
      const database = open.result;
      const tabId = sessionStorage.getItem("mcj-quiz-tab");
      if (!tabId || !database.objectStoreNames.contains("quizDrafts")) {
        database.close();
        resolve(null);
        return;
      }
      const transaction = database.transaction("quizDrafts", "readonly");
      const get = transaction.objectStore("quizDrafts").get(
        JSON.stringify([learnerId, `quiz:${topicId}:${tabId}`, workspace.currentAttempt.attemptId]),
      );
      get.onsuccess = () => {
        const row = get.result;
        resolve(row ? { dirty: row.dirty, pendingSave: row.pendingSave } : null);
        database.close();
      };
      get.onerror = () => {
        database.close();
        resolve(null);
      };
    };
  });
  }, { learnerId, topicId });
}

test("preserves an answer selected while a real database save response is pending", async ({
  page,
}) => {
  const topic = "getting-started-with-cangjie";
  await resetMilestone();
  await resetLearnerToStart();
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw new Error("A dedicated test database is required.");
  const pool = new pg.Pool({ connectionString: url });
  try {
    await pool.query(
      "DELETE FROM quiz_drafts WHERE learner_id=$1 AND topic_id=$2",
      [LEARNER, topic],
    );
  } finally {
    await pool.end();
  }
  const saves: { baseRevision: number; answers: Record<string, string> }[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.clock.install();
  await page.route(`**/api/topics/${topic}/quiz/draft`, async (route) => {
    const body = route.request().postDataJSON();
    saves.push(body);
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    if (saves.length === 1) await held;
    await route.fulfill({ response });
  });
  await page.goto(`/topics/${topic}/activity`);
  const open = page.getByRole("button", { name: "Open development workspace" });
  await expect(open).toBeVisible();
  await open.click();
  const first = page.locator('#q-q01 [role="radio"]').nth(1);
  const second = page.locator('#q-q02 [role="radio"]').nth(0);
  await expect(first).toBeVisible();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
  const firstResponse = page.waitForResponse((response) =>
    response.url().includes("/quiz/draft"),
  );
  try {
    await first.click();
    await page.clock.fastForward(1500);
    await expect.poll(() => saves.length).toBe(1);
    await second.click();
    await page.clock.fastForward(1500);
  } finally {
    release();
  }
  await firstResponse;
  await expect.poll(() => readQuizDraft(page, LEARNER, topic))
    .toMatchObject({ dirty: true, pendingSave: null });
  await page.clock.fastForward(1500);
  await expect.poll(() => saves.length).toBe(2);
  await expect.poll(() => readQuizDraft(page, LEARNER, topic))
    .toMatchObject({ dirty: false, pendingSave: null });
  expect(saves[1].baseRevision).toBe(saves[0].baseRevision + 1);
  await page.reload();
  await expect(
    page.locator('#q-q01 [role="radio"]').nth(1),
  ).toBeChecked();
  await expect(
    page.locator('#q-q02 [role="radio"]').nth(0),
  ).toBeChecked();
});

test("recovers a committed quiz save after its response is lost", async ({
  page,
}) => {
  const topic = "getting-started-with-cangjie";
  await resetMilestone();
  await resetLearnerToStart();
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw new Error("A dedicated test database is required.");
  const pool = new pg.Pool({ connectionString: url });
  try {
    await pool.query(
      "DELETE FROM quiz_drafts WHERE learner_id=$1 AND topic_id=$2",
      [LEARNER, topic],
    );
  } finally {
    await pool.end();
  }

  const saves: { baseRevision: number; answers: Record<string, string> }[] = [];
  let releaseFirst!: () => void;
  let signalFirstCommitted!: () => void;
  let signalFirstResponseLost!: () => void;
  const holdFirst = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const firstCommitted = new Promise<void>((resolve) => {
    signalFirstCommitted = resolve;
  });
  const firstResponseLost = new Promise<void>((resolve) => {
    signalFirstResponseLost = resolve;
  });

  await page.clock.install();
  await page.route(`**/api/topics/${topic}/quiz/draft`, async (route) => {
    saves.push(route.request().postDataJSON());
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    if (saves.length === 1) {
      signalFirstCommitted();
      await holdFirst;
      try {
        await route.abort();
      } finally {
        signalFirstResponseLost();
      }
      return;
    }
    await route.fulfill({ response });
  });

  await page.goto(`/topics/${topic}/activity`);
  const open = page.getByRole("button", { name: "Open development workspace" });
  await expect(open).toBeVisible();
  await open.click();
  const first = page.locator('#q-q01 [role="radio"]').nth(1);
  const second = page.locator('#q-q02 [role="radio"]').nth(0);
  await expect(first).toBeVisible();
  const firstValue = "b";
  const secondValue = "a";
  const firstQuestionId = "q01";
  const secondQuestionId = "q02";

  await first.click();
  await page.clock.fastForward(1500);
  await firstCommitted;
  await second.click();
  await page.clock.fastForward(1500);
  releaseFirst();
  await firstResponseLost;

  await page.clock.fastForward(1000);
  await expect.poll(() => saves.length).toBe(2);
  expect(saves[1]).toEqual(saves[0]);
  expect(saves[1]).toMatchObject({ baseRevision: 0 });

  await page.clock.fastForward(1500);
  await expect.poll(() => saves.length).toBe(3);
  expect(saves[2]).toMatchObject({
    baseRevision: 1,
    answers: { [firstQuestionId]: firstValue, [secondQuestionId]: secondValue },
  });
  await expect(
    page.getByText("Saved on server", { exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(page.locator('#q-q01 [role="radio"]').nth(1)).toBeChecked();
  await expect(page.locator('#q-q02 [role="radio"]').nth(0)).toBeChecked();
  const workspaceResponse = await page.request.get(`/api/topics/${topic}/quiz`);
  expect(workspaceResponse.ok()).toBeTruthy();
  const workspace = await workspaceResponse.json();
  expect(workspace.draft).toEqual({
    answers: { [firstQuestionId]: firstValue, [secondQuestionId]: secondValue },
    workRevision: 2,
  });
});
