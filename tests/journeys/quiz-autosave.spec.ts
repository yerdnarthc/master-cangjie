import { test, expect, type Page } from "@playwright/test";

async function readQuizDraft(page: Page, topicId: string) {
  return page.evaluate((topic) => new Promise<{
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
        JSON.stringify(["test", `quiz:${topic}:${tabId}`]),
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
  }), topicId);
}

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
    const responseBody = { kind: "saved", workRevision: saves.length };
    if (saves.length === 1) await held;
    await route.fulfill({ json: responseBody });
  });
  await page.clock.install();
  await page.goto("/topics/getting-started-with-cangjie/activity");
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
  await page.locator('input[name="q-q0"][value="a"]').check();
  await page.clock.fastForward(1500);
  await expect.poll(() => saves.length).toBe(1);
  await page.locator('input[name="q-q1"][value="b"]').check();
  await page.clock.fastForward(1500);
  const firstResponse = page.waitForResponse((response) =>
    response.url().includes("/quiz/draft"),
  );
  release();
  await firstResponse;
  await expect.poll(() => readQuizDraft(page, "getting-started-with-cangjie"))
    .toMatchObject({ dirty: true, pendingSave: null });
  await page.clock.fastForward(1500);
  await expect.poll(() => saves.length, { timeout: 6000 }).toBe(2);
  expect(saves[1]).toEqual({
    baseRevision: 1,
    answers: { q0: "a", q1: "b" },
    expectedLearnerId: "test",
  });
  await expect(
    page.getByText("Saved on server", { exact: true }),
  ).toBeVisible();
});

test("keeps a completion error visible when a pending quiz save succeeds", async ({ page }) => {
  const topic = "getting-started-with-cangjie";
  const questions = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`,
    prompt: `Question ${i}`,
    choices: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
  }));
  const evaluation = {
    score: { earned: 100, possible: 100 },
    passed: true,
    totalQuestions: 10,
    correctCount: 10,
    unansweredCount: 0,
    questionResults: questions.map((question) => ({
      questionId: question.id,
      selectedChoiceId: "a",
      correct: true,
      earned: 10,
      explanation: "Good work.",
    })),
  };
  let releaseSave!: () => void;
  let signalSaveStarted!: () => void;
  const heldSave = new Promise<void>((resolve) => { releaseSave = resolve; });
  const saveStarted = new Promise<void>((resolve) => { signalSaveStarted = resolve; });

  await page.clock.install();
  await page.route(`**/api/topics/${topic}/quiz`, (route) => route.fulfill({
    json: {
      learnerId: "test",
      topicId: topic,
      quiz: { topicId: topic, revision: 1, title: "Quiz", questions },
      draft: { answers: {}, workRevision: 0 },
      progress: {
        bestScore: { earned: 100, possible: 100 },
        completed: false,
        canMarkComplete: true,
        nextTopicAvailable: false,
        nextTopicId: null,
      },
      latestSubmission: {
        submissionId: "passed-attempt",
        evaluation,
        submittedAt: "2026-01-01T00:00:00Z",
      },
    },
  }));
  await page.route(`**/api/topics/${topic}/complete`, (route) =>
    route.fulfill({ status: 503, json: { error: "Temporary outage." } }),
  );
  await page.route(`**/api/topics/${topic}/quiz/draft`, async (route) => {
    signalSaveStarted();
    await heldSave;
    await route.fulfill({ json: { kind: "saved", workRevision: 1 } });
  });

  await page.goto(`/topics/${topic}/activity`);
  await page.getByRole("button", { name: "Mark complete ✓" }).click();
  await expect(page.locator("main .panel.error"))
    .toContainText("Temporary outage.");

  await page.locator('input[name="q-q0"][value="b"]').check();
  await page.clock.fastForward(1500);
  await saveStarted;
  const draftResponse = page.waitForResponse((response) =>
    response.url().includes("/quiz/draft"),
  );
  releaseSave();
  await draftResponse;
  await expect.poll(() => readQuizDraft(page, topic))
    .toMatchObject({ dirty: false, pendingSave: null });

  await expect(page.locator("main .panel.error"))
    .toContainText("Temporary outage.");
});

test("replays a persisted pending quiz save before syncing newer answers after reload", async ({
  page,
}) => {
  const topic = "getting-started-with-cangjie";
  const questions = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`,
    prompt: `Question ${i}`,
    choices: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
  }));
  const saves: {
    baseRevision: number;
    answers: Record<string, string>;
    expectedLearnerId?: string;
  }[] = [];
  let releaseFirst!: () => void;
  let signalFirstStarted!: () => void;
  let signalFirstAborted!: () => void;
  let signalReplayAcknowledged!: () => void;
  const holdFirst = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const firstStarted = new Promise<void>((resolve) => {
    signalFirstStarted = resolve;
  });
  const firstAborted = new Promise<void>((resolve) => {
    signalFirstAborted = resolve;
  });
  const replayAcknowledged = new Promise<void>((resolve) => {
    signalReplayAcknowledged = resolve;
  });

  await page.clock.install();
  await page.route(`**/api/topics/${topic}/quiz`, (route) =>
    route.fulfill({
      json: {
        learnerId: "test",
        topicId: topic,
        quiz: { topicId: topic, revision: 1, title: "Quiz", questions },
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
  await page.route(`**/api/topics/${topic}/quiz/draft`, async (route) => {
    saves.push(route.request().postDataJSON());
    if (saves.length === 1) {
      signalFirstStarted();
      await holdFirst;
      try {
        await route.abort();
      } finally {
        signalFirstAborted();
      }
      return;
    }

    const revision = saves.length - 1;
    await route.fulfill({ json: { kind: "saved", workRevision: revision } });
    if (saves.length === 2) signalReplayAcknowledged();
  });

  await page.goto(`/topics/${topic}/activity`);
  await page.locator('input[name="q-q0"][value="a"]').check();
  await page.clock.fastForward(1500);
  await firstStarted;

  await page.locator('input[name="q-q1"][value="b"]').check();
  await page.clock.fastForward(1500);
  releaseFirst();
  await firstAborted;

  await page.reload();
  await expect(page.locator('input[name="q-q0"][value="a"]')).toBeChecked();
  await expect(page.locator('input[name="q-q1"][value="b"]')).toBeChecked();
  await page.clock.fastForward(1500);
  await expect.poll(() => saves.length).toBe(2);
  expect(saves[1]).toEqual({
    baseRevision: 0,
    answers: { q0: "a" },
    expectedLearnerId: "test",
  });

  await replayAcknowledged;
  await page.clock.fastForward(1500);
  await expect.poll(() => saves.length).toBe(3);
  expect(saves[2]).toEqual({
    baseRevision: 1,
    answers: { q0: "a", q1: "b" },
    expectedLearnerId: "test",
  });
  await expect(
    page.getByText("Saved on server", { exact: true }),
  ).toBeVisible();
});

test("recovers a pending save after reopening the activity offline and reconnecting", async ({
  page,
}) => {
  const topic = "getting-started-with-cangjie";
  const questions = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`,
    prompt: `Question ${i}`,
    choices: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
  }));
  let offline = false;
  let releaseOfflineWorkspace!: () => void;
  let signalOfflineWorkspaceStarted!: () => void;
  const holdOfflineWorkspace = new Promise<void>((resolve) => {
    releaseOfflineWorkspace = resolve;
  });
  const offlineWorkspaceStarted = new Promise<void>((resolve) => {
    signalOfflineWorkspaceStarted = resolve;
  });
  const saves: { baseRevision: number; answers: Record<string, string> }[] = [];
  await page.clock.install();
  await page.route(`**/api/topics/${topic}/quiz`, (route) => {
    if (offline) {
      signalOfflineWorkspaceStarted();
      return holdOfflineWorkspace.then(() => route.abort("internetdisconnected"));
    }
    return route.fulfill({
      json: {
        learnerId: "test",
        topicId: topic,
        quiz: { topicId: topic, revision: 1, title: "Quiz", questions },
        draft: { answers: {}, workRevision: 0 },
        progress: {
          bestScore: null,
          completed: false,
          canMarkComplete: false,
          nextTopicAvailable: false,
          nextTopicId: null,
        },
      },
    });
  });
  await page.route(`**/api/topics/${topic}/quiz/draft`, async (route) => {
    saves.push(route.request().postDataJSON());
    if (saves.length === 1) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({ json: { kind: "saved", workRevision: 1 } });
  });

  await page.goto(`/topics/${topic}/activity`);
  const answer = page.locator('input[name="q-q0"][value="a"]');
  await expect(answer).toBeVisible();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
  await answer.check();
  await page.clock.fastForward(1500);
  await expect.poll(() => saves.length).toBe(1);

  offline = true;
  await page.reload();
  await offlineWorkspaceStarted;
  offline = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  releaseOfflineWorkspace();

  const restoredAnswer = page.locator('input[name="q-q0"][value="a"]');
  await expect(restoredAnswer).toBeVisible();
  await expect(restoredAnswer).toBeChecked();
  await page.clock.fastForward(1500);
  await expect.poll(() => saves.length).toBe(2);
  expect(saves[1]).toEqual(saves[0]);
  await expect(page.getByText("Saved on server", { exact: true })).toBeVisible();
});

test("retries a timed-out quiz save with the same snapshot before saving newer answers", async ({
  page,
}) => {
  const topic = "getting-started-with-cangjie";
  const questions = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`,
    prompt: `Question ${i}`,
    choices: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
  }));
  const saves: { baseRevision: number; answers: Record<string, string> }[] = [];
  let releaseFirst!: () => void;
  let signalFirstStarted!: () => void;
  let signalFirstAborted!: () => void;
  const holdFirst = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const firstStarted = new Promise<void>((resolve) => {
    signalFirstStarted = resolve;
  });
  const firstAborted = new Promise<void>((resolve) => {
    signalFirstAborted = resolve;
  });

  await page.clock.install();
  await page.route(`**/api/topics/${topic}/quiz`, (route) =>
    route.fulfill({
      json: {
        learnerId: "test",
        topicId: topic,
        quiz: { topicId: topic, revision: 1, title: "Quiz", questions },
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
  await page.route(`**/api/topics/${topic}/quiz/draft`, async (route) => {
    saves.push(route.request().postDataJSON());
    if (saves.length === 1) {
      signalFirstStarted();
      await holdFirst;
      try {
        await route.abort();
      } finally {
        signalFirstAborted();
      }
      return;
    }
    const revision = saves.length - 1;
    await route.fulfill({ json: { kind: "saved", workRevision: revision } });
  });

  await page.goto(`/topics/${topic}/activity`);
  await page.locator('input[name="q-q0"][value="a"]').check();
  await page.clock.fastForward(1500);
  await firstStarted;
  await page.locator('input[name="q-q1"][value="b"]').check();
  await page.clock.fastForward(1500);
  await page.clock.fastForward(15000);
  await expect(page.getByText("Draft save timed out. Try again.")).toBeVisible();
  releaseFirst();
  await firstAborted;

  await page.clock.fastForward(1000);
  await expect.poll(() => saves.length).toBe(2);
  expect(saves[1]).toEqual({
    baseRevision: 0,
    answers: { q0: "a" },
    expectedLearnerId: "test",
  });

  await page.clock.fastForward(1500);
  await expect.poll(() => saves.length).toBe(3);
  expect(saves[2]).toEqual({
    baseRevision: 1,
    answers: { q0: "a", q1: "b" },
    expectedLearnerId: "test",
  });
  await expect(
    page.getByText("Saved on server", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("main .panel.error")).toHaveCount(0);
});

test("stops after three automatic retries and lets the learner retry manually", async ({
  page,
}) => {
  const topic = "getting-started-with-cangjie";
  const questions = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`,
    prompt: `Question ${i}`,
    choices: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
  }));
  const saves: { baseRevision: number; answers: Record<string, string> }[] = [];
  await page.clock.install();
  await page.route(`**/api/topics/${topic}/quiz`, (route) =>
    route.fulfill({
      json: {
        learnerId: "test",
        topicId: topic,
        quiz: { topicId: topic, revision: 1, title: "Quiz", questions },
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
  await page.route(`**/api/topics/${topic}/quiz/draft`, async (route) => {
    saves.push(route.request().postDataJSON());
    if (saves.length <= 4) {
      await route.fulfill({ status: 503, json: { error: "Draft service is unavailable." } });
      return;
    }
    await route.fulfill({ json: { kind: "saved", workRevision: 1 } });
  });

  await page.goto(`/topics/${topic}/activity`);
  await page.locator('input[name="q-q0"][value="a"]').check();
  await page.clock.fastForward(1500);
  await expect.poll(() => saves.length).toBe(1);
  await expect(page.getByText("Retrying draft save…")).toBeVisible();

  for (const [retry, delay] of [1000, 2000, 4000].entries()) {
    await page.clock.fastForward(delay);
    await expect.poll(() => saves.length).toBe(retry + 2);
    if (retry < 2) await expect(page.getByText("Retrying draft save…")).toBeVisible();
  }

  await expect(page.getByText("Failed to save draft")).toBeVisible();
  await page.clock.fastForward(10000);
  expect(saves).toHaveLength(4);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => saves.length).toBe(5);
  expect(saves.slice(1).every((save) => JSON.stringify(save) === JSON.stringify(saves[0]))).toBe(true);
  await expect(page.getByText("Saved on server", { exact: true })).toBeVisible();
});

test("retries the pending quiz save when connectivity returns", async ({
  page,
}) => {
  const topic = "getting-started-with-cangjie";
  const questions = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`,
    prompt: `Question ${i}`,
    choices: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
  }));
  const saves: { baseRevision: number; answers: Record<string, string> }[] = [];
  await page.clock.install();
  await page.route(`**/api/topics/${topic}/quiz`, (route) =>
    route.fulfill({
      json: {
        learnerId: "test",
        topicId: topic,
        quiz: { topicId: topic, revision: 1, title: "Quiz", questions },
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
  await page.route(`**/api/topics/${topic}/quiz/draft`, async (route) => {
    saves.push(route.request().postDataJSON());
    if (saves.length === 1) {
      await route.abort();
      return;
    }
    await route.fulfill({ json: { kind: "saved", workRevision: 1 } });
  });

  await page.goto(`/topics/${topic}/activity`);
  await expect(page.locator('input[name="q-q0"][value="a"]')).toBeVisible();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
  await page.locator('input[name="q-q0"][value="a"]').check();
  await page.clock.fastForward(1500);
  await expect.poll(() => saves.length).toBe(1);
  await expect(page.getByText("Retrying draft save…")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => saves.length).toBe(2);
  expect(saves[1]).toEqual(saves[0]);
  await expect(page.getByText("Saved on server", { exact: true })).toBeVisible();
});

test("does not retry an expired-session response", async ({ page }) => {
  const topic = "getting-started-with-cangjie";
  const questions = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`,
    prompt: `Question ${i}`,
    choices: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
  }));
  let saves = 0;
  await page.clock.install();
  await page.route(`**/api/topics/${topic}/quiz`, (route) =>
    route.fulfill({
      json: {
        learnerId: "test",
        topicId: topic,
        quiz: { topicId: topic, revision: 1, title: "Quiz", questions },
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
  await page.route(`**/api/topics/${topic}/quiz/draft`, async (route) => {
    saves++;
    await route.fulfill({ status: 401, json: { error: "Session expired." } });
  });

  await page.goto(`/topics/${topic}/activity`);
  await expect(page.locator('input[name="q-q0"][value="a"]')).toBeVisible();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
  await page.locator('input[name="q-q0"][value="a"]').check();
  await page.clock.fastForward(1500);
  await expect(page.getByRole("button", { name: "Open development workspace" })).toBeVisible();
  await page.clock.fastForward(10_000);
  expect(saves).toBe(1);
});

test("does not retry an account-change response", async ({ page }) => {
  const topic = "getting-started-with-cangjie";
  const questions = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`,
    prompt: `Question ${i}`,
    choices: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
  }));
  let saves = 0;
  await page.clock.install();
  await page.route(`**/api/topics/${topic}/quiz`, (route) =>
    route.fulfill({
      json: {
        learnerId: "test",
        topicId: topic,
        quiz: { topicId: topic, revision: 1, title: "Quiz", questions },
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
  await page.route(`**/api/topics/${topic}/quiz/draft`, async (route) => {
    saves++;
    await route.fulfill({ status: 409, json: { error: "The learner account changed." } });
  });

  await page.goto(`/topics/${topic}/activity`);
  await expect(page.locator('input[name="q-q0"][value="a"]')).toBeVisible();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
  await page.locator('input[name="q-q0"][value="a"]').check();
  await page.clock.fastForward(1500);
  await expect(page.getByText("Failed to save draft", { exact: true })).toBeVisible();
  await page.locator('input[name="q-q1"][value="b"]').check();
  await page.clock.fastForward(1500);
  expect(saves).toBe(1);
  await page.clock.fastForward(10_000);
  expect(saves).toBe(1);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => saves).toBe(2);
});

test("keeps an unsynced answer visible when browser storage and the network fail", async ({
  page,
}) => {
  const topic = "getting-started-with-cangjie";
  const questions = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`,
    prompt: `Question ${i}`,
    choices: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
  }));
  await page.addInitScript(() => {
    Object.defineProperty(IDBFactory.prototype, "open", {
      configurable: true,
      value() {
        throw new DOMException("Storage is unavailable.", "UnknownError");
      },
    });
  });
  await page.clock.install();
  await page.route(`**/api/topics/${topic}/quiz`, (route) =>
    route.fulfill({
      json: {
        learnerId: "test",
        topicId: topic,
        quiz: { topicId: topic, revision: 1, title: "Quiz", questions },
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
  await page.route(`**/api/topics/${topic}/quiz/draft`, (route) => route.abort());

  await page.goto(`/topics/${topic}/activity`);
  const answer = page.locator('input[name="q-q0"][value="a"]');
  await expect(answer).toBeVisible();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
  await expect(page.getByRole("status").filter({ hasText: "Browser storage is unavailable" })).toBeVisible();
  await answer.check();
  await page.clock.fastForward(1500);
  await expect(answer).toBeChecked();
  await expect(page.getByText("Retrying draft save…")).toBeVisible();
  await expect(page.getByText("Saved on server", { exact: true })).toHaveCount(0);
});
