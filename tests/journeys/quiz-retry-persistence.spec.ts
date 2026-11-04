import { expect, test } from "@playwright/test";
import pg from "pg";
import { resetMilestone, resetLearnerToStart } from "./reset.ts";
import { LEARNER } from "../../modules/learner-account/adapters/development-session.ts";

test("keeps an obsolete dirty local draft out of a newly confirmed retry", async ({ page }) => {
  await resetMilestone();
  await resetLearnerToStart();
  const topicId = "getting-started-with-cangjie";
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test")) {
    throw new Error("A dedicated test database is required.");
  }
  const pool = new pg.Pool({ connectionString: url });

  try {
    await page.goto(`/topics/${topicId}/activity`);
    const open = page.getByRole("button", { name: "Open development workspace" });
    if (await open.isVisible()) await open.click();
    await page.getByRole("radio").nth(1).check();
    await expect(page.getByText("Saved on server", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Submit activity" }).click();
    await page.getByRole("button", { name: "Submit anyway (0 points for unanswered)" }).click();
    await expect(page.getByText("10 / 100 (Needs at least 60 to pass)", { exact: true })).toBeVisible();

    const workspace = await page.evaluate(async (topicId) => {
      const response = await fetch(`/api/topics/${encodeURIComponent(topicId)}/quiz`);
      return response.json();
    }, topicId);
    expect(workspace.currentAttempt.state).toBe("submitted");
    const tabId = await page.evaluate(() => sessionStorage.getItem("mcj-quiz-tab"));
    if (!tabId) throw new Error("Quiz tab identity was not initialized.");

    // Simulate an older tab that still has unsynced choices for the submitted attempt.
    await page.evaluate(async ({ learnerId, topicId, tabId, baseRevision }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open("master-cangjie-work");
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("quizDrafts", "readwrite");
        transaction.objectStore("quizDrafts").put({
          key: JSON.stringify([learnerId, `quiz:${topicId}:${tabId}`]),
          learnerId,
          topicId,
          tabId,
          answers: { q01: "a" },
          baseRevision,
          dirty: true,
          pendingSave: null,
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    }, {
      learnerId: LEARNER,
      topicId,
      tabId,
      baseRevision: workspace.draft.workRevision + 1,
    });

    const retry = await page.evaluate(async ({ topicId, workspace, learnerId }) => {
      const response = await fetch(`/api/topics/${encodeURIComponent(topicId)}/quiz/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceSubmissionId: workspace.currentAttempt.submissionId,
          expectedAttemptId: workspace.currentAttempt.attemptId,
          baseRevision: workspace.draft.workRevision,
          expectedLearnerId: learnerId,
        }),
      });
      return { ok: response.ok, body: await response.json() };
    }, { topicId, workspace, learnerId: LEARNER });
    expect(retry.ok).toBe(true);

    await page.reload();
    await expect(page.getByRole("progressbar", { name: "Questions answered" })).toHaveAttribute("aria-valuenow", "0");
    await expect(page.getByRole("radio").nth(0)).not.toBeChecked();
    await expect(page.getByText("10 / 100 (Needs at least 60 to pass)", { exact: true })).toHaveCount(0);

    const current = await page.evaluate(async (topicId) => {
      const response = await fetch(`/api/topics/${encodeURIComponent(topicId)}/quiz`);
      return response.json();
    }, topicId);
    expect(current.currentAttempt).toMatchObject({ attemptId: retry.body.attemptId, state: "answering" });
    expect(current.draft.answers).toEqual({});

    const localAttempts = await pool.query(
      "SELECT id, state FROM quiz_attempts WHERE learner_id=$1 AND topic_id=$2 ORDER BY created_at",
      [LEARNER, topicId],
    );
    expect(localAttempts.rowCount).toBe(2);
    expect(localAttempts.rows[0].state).toBe("submitted");
    expect(localAttempts.rows[1].state).toBe("answering");
  } finally {
    await pool.end();
  }
});

test("replays a persisted Retry intent after its committed response is lost", async ({ page }) => {
  await resetMilestone();
  await resetLearnerToStart();
  const topicId = "getting-started-with-cangjie";
  await page.goto(`/topics/${topicId}/activity`);
  const open = page.getByRole("button", { name: "Open development workspace" });
  if (await open.isVisible()) await open.click();
  await page.getByRole("button", { name: "Submit activity" }).click();
  await page.getByRole("button", { name: "Submit anyway (0 points for unanswered)" }).click();
  await expect(page.getByText("0 / 100 (Needs at least 60 to pass)", { exact: true })).toBeVisible();

  const workspace = await page.evaluate(async (topicId) => {
    const response = await fetch(`/api/topics/${encodeURIComponent(topicId)}/quiz`);
    return response.json();
  }, topicId);
  const intent = {
    sourceSubmissionId: workspace.currentAttempt.submissionId,
    expectedAttemptId: workspace.currentAttempt.attemptId,
    baseRevision: workspace.draft.workRevision,
  };
  await page.evaluate(async ({ learnerId, topicId, intent }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("master-cangjie-work");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("quizRetryRequests", "readwrite");
      transaction.objectStore("quizRetryRequests").put({
        key: JSON.stringify([learnerId, `quiz-retry:${topicId}:${intent.sourceSubmissionId}`]),
        learnerId,
        topicId,
        intent,
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, { learnerId: LEARNER, topicId, intent });

  const retryBodies: unknown[] = [];
  await page.route(`**/api/topics/${topicId}/quiz/retry`, async (route) => {
    retryBodies.push(route.request().postDataJSON());
    if (retryBodies.length === 1) {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });
  const firstAttempt = await page.evaluate(async ({ topicId, intent, learnerId }) => {
    try {
      await fetch(`/api/topics/${encodeURIComponent(topicId)}/quiz/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...intent, expectedLearnerId: learnerId }),
      });
      return "response-received";
    } catch {
      return "response-lost";
    }
  }, { topicId, intent, learnerId: LEARNER });
  expect(firstAttempt).toBe("response-lost");

  await page.reload();
  await expect(page.getByRole("progressbar", { name: "Questions answered" })).toHaveAttribute("aria-valuenow", "0");
  await expect.poll(() => retryBodies.length).toBe(2);
  expect(retryBodies[1]).toEqual(retryBodies[0]);

  const storedRetryCount = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("master-cangjie-work");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const transaction = database.transaction("quizRetryRequests", "readonly");
      const request = transaction.objectStore("quizRetryRequests").count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return count;
  });
  expect(storedRetryCount).toBe(0);
});

test("does not apply a delayed submission response after another client starts Retry", async ({ page }) => {
  await resetMilestone();
  await resetLearnerToStart();
  const topicId = "getting-started-with-cangjie";
  let releaseSubmission!: () => void;
  let signalSubmissionCommitted!: () => void;
  const responseHold = new Promise<void>(resolve => { releaseSubmission = resolve; });
  const submissionCommitted = new Promise<void>(resolve => { signalSubmissionCommitted = resolve; });

  await page.goto(`/topics/${topicId}/activity`);
  const open = page.getByRole("button", { name: "Open development workspace" });
  if (await open.isVisible()) await open.click();
  await page.route(`**/api/topics/${topicId}/quiz/submit`, async route => {
    const response = await route.fetch();
    signalSubmissionCommitted();
    await responseHold;
    await route.fulfill({ response });
  });

  await page.getByRole("button", { name: "Submit activity" }).click();
  await page.getByRole("button", { name: "Submit anyway (0 points for unanswered)" }).click();
  await submissionCommitted;

  const retryResult = await page.evaluate(async ({ topicId, learnerId }) => {
    const workspaceResponse = await fetch(`/api/topics/${encodeURIComponent(topicId)}/quiz`);
    const workspace = await workspaceResponse.json();
    const response = await fetch(`/api/topics/${encodeURIComponent(topicId)}/quiz/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceSubmissionId: workspace.currentAttempt.submissionId,
        expectedAttemptId: workspace.currentAttempt.attemptId,
        baseRevision: workspace.draft.workRevision,
        expectedLearnerId: learnerId,
      }),
    });
    return { ok: response.ok, receipt: await response.json() };
  }, { topicId, learnerId: LEARNER });
  expect(retryResult.ok).toBe(true);

  releaseSubmission();
  await expect(page.getByRole("progressbar", { name: "Questions answered" })).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByRole("button", { name: "Submit activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit retry" })).toHaveCount(0);
  await expect(page.getByText(/\/ 100 \((Passed!|Needs at least 60 to pass)\)/)).toHaveCount(0);
});

test("a delayed old-attempt autosave acknowledgement cannot refill a retry from another tab", async ({
  page,
  context,
}) => {
  await resetMilestone();
  await resetLearnerToStart();
  const topicId = "getting-started-with-cangjie";
  let releaseSave!: () => void;
  let signalSaveCommitted!: () => void;
  let signalSaveAcknowledged!: () => void;
  const holdSaveResponse = new Promise<void>(resolve => { releaseSave = resolve; });
  const saveCommitted = new Promise<void>(resolve => { signalSaveCommitted = resolve; });
  const saveAcknowledged = new Promise<void>(resolve => { signalSaveAcknowledged = resolve; });
  const secondTab = await context.newPage();

  await page.route(`**/api/topics/${topicId}/quiz/draft`, async route => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    signalSaveCommitted();
    await holdSaveResponse;
    await route.fulfill({ response });
    signalSaveAcknowledged();
  });

  try {
    await page.goto(`/topics/${topicId}/activity`);
    const signIn = page.getByRole("button", { name: "Open development workspace" });
    if (await signIn.isVisible()) await signIn.click();
    await expect(page.locator('#q-q01 [role="radio"]').nth(1)).toBeVisible();
    await page.locator('#q-q01 [role="radio"]').nth(1).click();
    await page.getByRole("button", { name: "Save draft" }).click();
    await saveCommitted;

    await secondTab.goto(`/topics/${topicId}/activity`);
    const secondSignIn = secondTab.getByRole("button", { name: "Open development workspace" });
    if (await secondSignIn.isVisible()) await secondSignIn.click();
    await expect(secondTab.locator('#q-q01 [role="radio"]').nth(1)).toBeChecked();
    await secondTab.getByRole("button", { name: "Submit activity" }).click();
    await secondTab.getByRole("dialog").getByRole("button", {
      name: "Submit anyway (0 points for unanswered)",
    }).click();
    await expect(secondTab.getByRole("button", { name: "Retry" })).toBeVisible();
    await secondTab.getByRole("button", { name: "Retry" }).click();
    await expect(secondTab.getByRole("progressbar", { name: "Questions answered" })).toHaveAttribute("aria-valuenow", "0");

    const retriedWorkspace = await secondTab.evaluate(async topicId => {
      const response = await fetch(`/api/topics/${encodeURIComponent(topicId)}/quiz`);
      return response.json();
    }, topicId);
    expect(retriedWorkspace.currentAttempt.state).toBe("answering");
    expect(retriedWorkspace.draft.answers).toEqual({});

    releaseSave();
    await saveAcknowledged;
    await page.reload();
    await expect(page.getByRole("progressbar", { name: "Questions answered" })).toHaveAttribute("aria-valuenow", "0");
    await expect(page.locator('#q-q01 [role="radio"]').nth(1)).not.toBeChecked();
    await expect(secondTab.locator('#q-q01 [role="radio"]').nth(1)).not.toBeChecked();
  } finally {
    releaseSave();
    await secondTab.close();
  }
});
