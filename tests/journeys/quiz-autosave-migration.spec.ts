import { test, expect } from "@playwright/test";

test("migrates a dirty legacy quiz draft and restores its answers", async ({
  page,
}) => {
  const topicId = "getting-started-with-cangjie";
  const learnerId = "test";
  const tabId = "legacy-tab";
  const questions = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`,
    prompt: `Question ${i}`,
    choices: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
  }));

  await page.goto("/");
  await page.evaluate(async ({ learnerId, topicId, tabId }) => {
    sessionStorage.setItem("mcj-quiz-tab", tabId);
    const open = indexedDB.open("master-cangjie-work", 1);
    open.onupgradeneeded = () => {
      const database = open.result;
      const drafts = database.createObjectStore("drafts", { keyPath: "key" });
      drafts.createIndex("learnerId", "learnerId");
      const requests = database.createObjectStore("requests", { keyPath: "key" });
      requests.createIndex("learnerId", "learnerId");
    };
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const transaction = database.transaction(["drafts", "requests"], "readwrite");
    transaction.objectStore("drafts").put({
      key: JSON.stringify([learnerId, `quiz:${topicId}:${tabId}`]),
      learnerId,
      problemId: `quiz:${topicId}:${tabId}`,
      source: JSON.stringify({ q0: "b" }),
      baseRevision: 0,
      dirty: true,
    });
    transaction.objectStore("drafts").put({
      key: JSON.stringify([learnerId, "hello-world"]),
      learnerId,
      problemId: "hello-world",
      source: "main() {}",
      baseRevision: 2,
      dirty: true,
    });
    transaction.objectStore("drafts").put({
      key: JSON.stringify([learnerId, `quiz:${topicId}:malformed-tab`]),
      learnerId,
      problemId: `quiz:${topicId}:malformed-tab`,
      source: "not valid JSON",
      baseRevision: 0,
      dirty: true,
    });
    transaction.objectStore("requests").put({
      key: JSON.stringify([learnerId, "quiz-submit:another-topic"]),
      learnerId,
      problemId: "quiz-submit:another-topic",
      url: "/api/topics/another-topic/quiz/submit",
      body: {
        requestKey: "pending-request",
        assessmentRevision: 1,
        answers: { q0: "a" },
      },
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, { learnerId, topicId, tabId });

  await page.clock.install();
  await page.route(`**/api/topics/${topicId}/quiz`, (route) =>
    route.fulfill({
      json: {
        learnerId,
        topicId,
        quiz: { topicId, revision: 1, title: "Quiz", questions },
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

  await page.goto(`/topics/${topicId}/activity`);
  const restoredAnswer = page.locator('input[name="q-q0"][value="b"]');
  await expect(restoredAnswer).toBeChecked();
  await page.reload();
  await expect(restoredAnswer).toBeChecked();
  const stored = await page.evaluate(async () => {
    const open = indexedDB.open("master-cangjie-work");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const readAll = (storeName: string) => new Promise<unknown[]>((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const [drafts, requests, quizDrafts] = await Promise.all([
      readAll("drafts"),
      readAll("requests"),
      readAll("quizDrafts"),
    ]);
    database.close();
    return { drafts, requests, quizDrafts };
  });
  expect(stored.quizDrafts).toEqual([
    expect.objectContaining({
      learnerId,
      topicId,
      tabId,
      answers: { q0: "b" },
      baseRevision: 0,
      dirty: true,
      pendingSave: null,
    }),
  ]);
  expect(stored.drafts).toHaveLength(2);
  expect(stored.drafts).toEqual(expect.arrayContaining([
    expect.objectContaining({ problemId: "hello-world", source: "main() {}" }),
    expect.objectContaining({ problemId: `quiz:${topicId}:malformed-tab`, source: "not valid JSON" }),
  ]));
  expect(stored.requests).toEqual([
    expect.objectContaining({
      problemId: "quiz-submit:another-topic",
      body: {
        requestKey: "pending-request",
        assessmentRevision: 1,
        answers: { q0: "a" },
      },
    }),
  ]);
});
