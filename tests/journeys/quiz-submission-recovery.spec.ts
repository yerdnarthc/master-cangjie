import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { resetMilestone, resetLearnerToStart } from "./reset.ts";
import {
  LEARNER,
  OTHER_LEARNER,
} from "../../modules/learner-account/adapters/development-session.ts";

const quizClockStart = new Date("2026-01-01T00:00:00Z");
const quizClockPaused = new Date("2026-01-01T00:10:00Z");

const confirmedResult = {
  submissionId: "confirmed",
  attemptId: "00000000-0000-4000-8000-000000000001",
  evaluation: {
    score: { earned: 0, possible: 100 },
    passed: false,
    totalQuestions: 10,
    correctCount: 0,
    unansweredCount: 0,
    questionResults: Array.from({ length: 10 }, (_, i) => ({
      questionId: `q${i}`,
      selectedChoiceId: "a",
      correct: false,
      earned: 0,
      explanation: "Explanation",
    })),
  },
  progress: {
    bestScore: { earned: 0, possible: 100 },
    completed: false,
    canMarkComplete: false,
    nextTopicAvailable: false,
    nextTopicId: null,
  },
};

async function mockDraftSave(page: Page) {
  await page.route("**/api/topics/*/quiz/draft", (route) => {
    const body = route.request().postDataJSON();
    return route.fulfill({
      json: { kind: "saved", workRevision: body.baseRevision + 1 },
    });
  });
}

async function openMockActivity(page: Page, topic = "getting-started-with-cangjie") {
  await page.goto(`/topics/${topic}/activity`);
  const signIn = page.getByRole("button", { name: "Open development workspace" });
  if (await signIn.isVisible().catch(() => false)) await signIn.click();
}

test("replays the fixed submission after its committed response is lost", async ({
  page,
}) => {
  await resetMilestone();
  await resetLearnerToStart();
  const topic = "getting-started-with-cangjie";
  const bodies: {
    requestKey: string;
    answers: Record<string, string>;
    assessmentRevision: number;
  }[] = [];
  await page.route(`**/api/topics/${topic}/quiz/submit`, async (route) => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) {
      const response = await route.fetch();
      expect(response.ok()).toBeTruthy();
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });
  await page.goto(`/topics/${topic}/activity`);
  const open = page.getByRole("button", { name: "Open development workspace" });
  await expect(open).toBeVisible();
  await open.click();
  await page.locator('#q-q01 [role="radio"]').nth(1).click();
  await expect(
    page.getByText("Saved on server", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Submit activity" }).click();
  await page
    .getByRole("button", { name: "Submit anyway (0 points for unanswered)" })
    .click();
  await expect(
    page.getByRole("button", { name: "Recover submission" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Recover submission" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Recover submission" }).click();
  await expect(
    page.getByRole("button", { name: "Recover submission" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("10 / 100 (Needs at least 60 to pass)", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("progressbar", { name: "Questions answered" })).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByRole("radio").first()).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Submit activity" })).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
  await page.locator('#q-q01 [role="radio"]').nth(0).click();
  await expect(
    page.getByText("Saved on server", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Submit activity" }).click();
  await page
    .getByRole("button", { name: "Submit anyway (0 points for unanswered)" })
    .click();
  await expect(
    page.getByText("0 / 100 (Needs at least 60 to pass)", { exact: true }),
  ).toBeVisible();
  expect(bodies).toHaveLength(3);
  expect(bodies[2].requestKey).not.toBe(bodies[0].requestKey);
  expect(bodies[2].answers).toEqual({ q01: "a" });
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw new Error("Dedicated test database required");
  const pool = new pg.Pool({ connectionString: url });
  try {
    const rows = await pool.query(
      "SELECT request_key, snapshot FROM topic_submissions WHERE learner_id=$1 AND snapshot->>'topicId'=$2",
      [LEARNER, topic],
    );
    expect(rows.rowCount).toBe(2);
    expect(
      rows.rows.find((row) => row.request_key === bodies[0].requestKey).snapshot
        .answers,
    ).toEqual(bodies[0].answers);
  } finally {
    await pool.end();
  }
});

test("two tabs share the unresolved submission identity", async ({
  page,
  context,
}) => {
  await resetMilestone();
  await resetLearnerToStart();
  const topic = "getting-started-with-cangjie";
  const bodies: {
    requestKey: string;
    answers: Record<string, string>;
    assessmentRevision: number;
  }[] = [];
  let release!: () => void;
  let committed!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const firstCommitted = new Promise<void>((resolve) => {
    committed = resolve;
  });
  await context.route(`**/api/topics/${topic}/quiz/submit`, async (route) => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) {
      const response = await route.fetch();
      expect(response.ok()).toBeTruthy();
      committed();
      await held;
      await route.abort("failed");
    } else await route.continue();
  });
  const second = await context.newPage();
  try {
    await page.goto(`/topics/${topic}/activity`);
    await page
      .getByRole("button", { name: "Open development workspace" })
      .click();
    await expect(
      page.getByRole("button", { name: "Submit activity" }),
    ).toBeVisible();
    await second.goto(`/topics/${topic}/activity`);
    await expect(
      second.getByRole("button", { name: "Submit activity" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Submit activity" }).click();
    await page
      .getByRole("button", { name: "Submit anyway (0 points for unanswered)" })
      .click();
    await firstCommitted;
    await second.getByRole("button", { name: "Submit activity" }).click();
    await second
      .getByRole("button", { name: "Submit anyway (0 points for unanswered)" })
      .click();
    await expect(
      second.getByRole("button", { name: "Recover submission" }),
    ).toBeVisible();
    expect(bodies).toHaveLength(1);
    await second.getByRole("button", { name: "Recover submission" }).click();
    await expect(
      second.getByText("0 / 100 (Needs at least 60 to pass)"),
    ).toBeVisible();
    expect(bodies[1]).toEqual(bodies[0]);
    release();
    await expect(
      page.getByRole("button", { name: "Recover submission" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Recover submission" }).click();
    await expect(
      page.getByText("0 / 100 (Needs at least 60 to pass)"),
    ).toBeVisible();
    expect(bodies[2]).toEqual(bodies[0]);
    const pool = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    try {
      const records = await pool.query(
        "SELECT id FROM topic_submissions WHERE learner_id=$1 AND request_key=$2",
        [LEARNER, bodies[0].requestKey],
      );
      expect(records.rowCount).toBe(1);
      const all = await pool.query(
        "SELECT id FROM topic_submissions WHERE learner_id=$1",
        [LEARNER],
      );
      expect(all.rowCount).toBe(1);
    } finally {
      await pool.end();
    }
  } finally {
    release();
    await second.close();
    await context.unroute(`**/api/topics/${topic}/quiz/submit`);
  }
});

test("two tabs cannot create duplicate submissions while a draft save is pending", async ({
  page,
  context,
}) => {
  await resetMilestone();
  await resetLearnerToStart();
  const topic = "getting-started-with-cangjie";
  const bodies: { requestKey: string }[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let draftRequests = 0;
  await context.route(`**/api/topics/${topic}/quiz/submit`, (route) => {
    bodies.push(route.request().postDataJSON());
    return route.continue();
  });
  const second = await context.newPage();
  await second.route(`**/api/topics/${topic}/quiz/draft`, async (route) => {
    draftRequests++;
    await held;
    await route.continue();
  });
  try {
    await page.clock.install({ time: quizClockStart });
    await page.goto(`/topics/${topic}/activity`);
    await page
      .getByRole("button", { name: "Open development workspace" })
      .click();
    await expect(
      page.getByRole("button", { name: "Submit activity" }),
    ).toBeVisible();
    await page.clock.pauseAt(quizClockPaused);
    await second.clock.install({ time: quizClockStart });
    await second.goto(`/topics/${topic}/activity`);
    await expect(
      second.getByRole("button", { name: "Submit activity" }),
    ).toBeVisible();
    await second.clock.pauseAt(quizClockPaused);
    await page.locator('#q-q01 [role="radio"]').nth(1).click();
    await second.locator('#q-q01 [role="radio"]').nth(1).click();
    await second.getByRole("button", { name: "Submit activity" }).click();
    await second
      .getByRole("button", { name: "Submit anyway (0 points for unanswered)" })
      .click();
    await expect.poll(() => draftRequests).toBe(1);
    await page.getByRole("button", { name: "Submit activity" }).click();
    await page
      .getByRole("button", { name: "Submit anyway (0 points for unanswered)" })
      .click();
    await expect(
      page.getByRole("button", { name: "Recover submission" }),
    ).toBeVisible();
    expect(bodies).toHaveLength(0);
    await page.getByRole("button", { name: "Recover submission" }).click();
    await expect(
      page.getByText(
        "This submission is still being prepared. Try again in a moment.",
      ),
    ).toBeVisible();
    expect(bodies).toHaveLength(0);
    release();
    await expect(
      second.getByText("10 / 100 (Needs at least 60 to pass)"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Recover submission" }).click();
    await expect(
      page.getByText("10 / 100 (Needs at least 60 to pass)"),
    ).toBeVisible();
    expect(bodies).toHaveLength(1);
    const pool = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    try {
      expect(
        (
          await pool.query(
            "SELECT id FROM topic_submissions WHERE learner_id=$1",
            [LEARNER],
          )
        ).rowCount,
      ).toBe(1);
    } finally {
      await pool.end();
    }
  } finally {
    release();
    await second.close();
  }
});

test("replays a request that failed before reaching the server", async ({
  page,
}) => {
  await resetMilestone();
  await resetLearnerToStart();
  const topic = "getting-started-with-cangjie";
  const bodies: { requestKey: string }[] = [];
  await page.route(`**/api/topics/${topic}/quiz/submit`, async (route) => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) await route.abort("failed");
    else await route.continue();
  });
  await page.goto(`/topics/${topic}/activity`);
  await page
    .getByRole("button", { name: "Open development workspace" })
    .click();
  await page.getByRole("button", { name: "Submit activity" }).click();
  await page
    .getByRole("button", { name: "Submit anyway (0 points for unanswered)" })
    .click();
  await expect(
    page.getByRole("button", { name: "Recover submission" }),
  ).toBeVisible();
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw new Error("Dedicated test database required");
  const pool = new pg.Pool({ connectionString: url });
  try {
    expect(
      (
        await pool.query(
          "SELECT id FROM topic_submissions WHERE learner_id=$1",
          [LEARNER],
        )
      ).rowCount,
    ).toBe(0);
    await page.reload();
    await page.getByRole("button", { name: "Recover submission" }).click();
    await expect(
      page.getByText("0 / 100 (Needs at least 60 to pass)"),
    ).toBeVisible();
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(
      (
        await pool.query(
          "SELECT id FROM topic_submissions WHERE learner_id=$1 AND request_key=$2",
          [LEARNER, bodies[0].requestKey],
        )
      ).rowCount,
    ).toBe(1);
  } finally {
    await pool.end();
  }
});

test("recovers a lost draft-preparation response when answer order differs from PostgreSQL", async ({
  page,
}) => {
  await resetMilestone();
  await resetLearnerToStart();
  const topic = "getting-started-with-cangjie";
  await page.goto(`/topics/${topic}/activity`);
  await page
    .getByRole("button", { name: "Open development workspace" })
    .click();
  await page.locator('#q-q02 [role="radio"]').nth(0).click();
  await page.locator('#q-q01 [role="radio"]').nth(1).click();
  await expect(
    page.getByText("Saved on server", { exact: true }),
  ).toBeVisible();
  let draftAttempts = 0;
  await page.route(`**/api/topics/${topic}/quiz/draft`, async (route) => {
    draftAttempts++;
    if (draftAttempts === 1) {
      const response = await route.fetch();
      expect(response.ok()).toBeTruthy();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Submit activity" }).click();
  await page
    .getByRole("button", { name: "Submit anyway (0 points for unanswered)" })
    .click();
  await expect(
    page.getByRole("button", { name: "Recover submission" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Recover submission" }).click();
  await expect(
    page.getByText("20 / 100 (Needs at least 60 to pass)", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Choose which answers to keep" }),
  ).toHaveCount(0);
  expect(draftAttempts).toBe(2);
});

test("submits the confirmed newer answers when an earlier autosave is in flight", async ({
  page,
}) => {
  await resetMilestone();
  await resetLearnerToStart();
  const topic = "getting-started-with-cangjie";
  let release!: () => void;
  let committed!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const firstCommitted = new Promise<void>((resolve) => {
    committed = resolve;
  });
  let saves = 0;
  const bodies: { answers: Record<string, string> }[] = [];
  await page.route(`**/api/topics/${topic}/quiz/draft`, async (route) => {
    saves++;
    if (saves === 1) {
      const response = await route.fetch();
      expect(response.ok()).toBeTruthy();
      committed();
      await held;
      await route.fulfill({ response });
    } else await route.continue();
  });
  await page.route(`**/api/topics/${topic}/quiz/submit`, (route) => {
    bodies.push(route.request().postDataJSON());
    return route.continue();
  });
  try {
    await page.clock.install({ time: quizClockStart });
    await page.goto(`/topics/${topic}/activity`);
    await page
      .getByRole("button", { name: "Open development workspace" })
      .click();
    await expect(page.locator('#q-q01 [role="radio"]').nth(1)).toBeVisible();
    await page.clock.pauseAt(quizClockPaused);
    await page.locator('#q-q01 [role="radio"]').nth(1).click();
    await page.clock.fastForward(1500);
    await expect.poll(() => saves).toBe(1);
    await firstCommitted;
    await page.locator('#q-q02 [role="radio"]').nth(0).click();
    await page.getByRole("button", { name: "Submit activity" }).click();
    await page
      .getByRole("button", { name: "Submit anyway (0 points for unanswered)" })
      .click();
    expect(bodies).toHaveLength(0);
    release();
    await expect(
      page.getByText("20 / 100 (Needs at least 60 to pass)", { exact: true }),
    ).toBeVisible();
    expect(bodies).toHaveLength(1);
    expect(bodies[0].answers).toEqual({ q01: "b", q02: "a" });
  } finally {
    release();
  }
});

test("does not send a submission if recovery storage is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores, mode, options) {
      const names = typeof stores === "string" ? [stores] : Array.from(stores);
      if (names.includes("requests") && mode === "readwrite")
        throw new DOMException("Unavailable", "UnknownError");
      return original.call(this, stores, mode, options);
    };
  });
  const questions = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`,
    prompt: `Question ${i}`,
    choices: [{ id: "a", text: "A" }],
  }));
  const answers = Object.fromEntries(questions.map((q) => [q.id, "a"]));
  await mockDraftSave(page);
  let posts = 0;
  await page.route("**/api/topics/*/quiz", (route) =>
    route.fulfill({
      json: {
        learnerId: "storage-test",

        currentAttempt: { attemptId: "00000000-0000-4000-8000-000000000001", assessmentRevision: 1, state: "answering", submissionId: null },
        currentAttemptIsLegacy: false,
        quiz: { title: "Quiz", revision: 1, questions },
        draft: { answers, workRevision: 0 },
        progress: {},
      },
    }),
  );
  await page.route("**/api/topics/*/quiz/submit", (route) => {
    posts++;
    return route.abort();
  });
  await openMockActivity(page);
  await page.getByRole("button", { name: "Submit activity" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Submit activity" }).click();
  await expect(
    page.getByText(
      "Could not prepare your submission. Check browser storage and try again.",
    ),
  ).toBeVisible();
  expect(posts).toBe(0);
  await expect(
    page.getByRole("button", { name: "Submit activity" }),
  ).toBeEnabled();
});

test("a stalled response becomes recoverable with the same request", async ({
  page,
}) => {
  const questions = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`,
    prompt: `Question ${i}`,
    choices: [{ id: "a", text: "A" }],
  }));
  const answers = Object.fromEntries(questions.map((q) => [q.id, "a"]));
  await mockDraftSave(page);
  const bodies: unknown[] = [];
  let serverSubmitted = false;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/topics/*/quiz", (route) =>
    route.fulfill({
      json: {
        learnerId: "timeout-test",

        currentAttempt: {
          attemptId: "00000000-0000-4000-8000-000000000001",
          assessmentRevision: 1,
          state: serverSubmitted ? "submitted" : "answering",
          submissionId: serverSubmitted ? "confirmed" : null,
        },
        ...(serverSubmitted ? {
          currentSubmission: {
            submissionId: "confirmed",
            evaluation: confirmedResult.evaluation,
            submittedAt: "2026-01-01T00:00:00Z",
          },
        } : {}),
        currentAttemptIsLegacy: false,
        quiz: { title: "Quiz", revision: 1, questions },
        draft: { answers, workRevision: 0 },
        progress: {},
      },
    }),
  );
  await page.route("**/api/topics/*/quiz/submit", async (route) => {
    bodies.push(route.request().postDataJSON());
    serverSubmitted = true;
    if (bodies.length === 1) {
      await held;
      await route.abort().catch(() => {});
    } else await route.fulfill({ json: confirmedResult });
  });
  try {
    await openMockActivity(page);
    await page.getByRole("button", { name: "Submit activity" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Submit activity" }).click();
    await expect(
      page.getByRole("button", { name: "Recover submission" }),
    ).toBeVisible({ timeout: 22000 });
    await expect(page.getByRole("radio").first()).toBeDisabled();
    release();
    await page.getByRole("button", { name: "Recover submission" }).click();
    await expect(
      page.getByText("0 / 100 (Needs at least 60 to pass)"),
    ).toBeVisible();
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
  } finally {
    release();
  }
});

test("a reloaded preparation can be recovered after its lease expires", async ({
  page,
}) => {
  const questions = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`,
    prompt: `Question ${i}`,
    choices: [{ id: "a", text: "A" }],
  }));
  const answers = Object.fromEntries(questions.map((q) => [q.id, "a"]));
  let drafts = 0;
  let serverSubmitted = false;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const bodies: { requestKey: string }[] = [];
  await page.route("**/api/topics/*/quiz", (route) =>
    route.fulfill({
      json: {
        learnerId: "preparation-test",

        currentAttempt: {
          attemptId: "00000000-0000-4000-8000-000000000001",
          assessmentRevision: 1,
          state: serverSubmitted ? "submitted" : "answering",
          submissionId: serverSubmitted ? "confirmed" : null,
        },
        ...(serverSubmitted ? { currentSubmission: {
          submissionId: "confirmed",
          evaluation: confirmedResult.evaluation,
          submittedAt: "2026-01-01T00:00:00Z",
        } } : {}),
        currentAttemptIsLegacy: false,
        quiz: { title: "Quiz", revision: 1, questions },
        draft: { answers, workRevision: 0 },
        progress: {},
      },
    }),
  );
  await page.route("**/api/topics/*/quiz/draft", async (route) => {
    drafts++;
    if (drafts === 1) {
      await held;
      await route.abort().catch(() => {});
    } else await route.fulfill({ json: { kind: "saved", workRevision: 1 } });
  });
  await page.route("**/api/topics/*/quiz/submit", (route) => {
    bodies.push(route.request().postDataJSON());
    serverSubmitted = true;
    return route.fulfill({ json: confirmedResult });
  });
  try {
    await openMockActivity(page);
    await page.getByRole("button", { name: "Submit activity" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Submit activity" }).click();
    await expect.poll(() => drafts).toBe(1);
    const storedKey = await page.evaluate(
      () =>
        new Promise<string>((resolve, reject) => {
          const opening = indexedDB.open("master-cangjie-work");
          opening.onerror = () => reject(opening.error);
          opening.onsuccess = () => {
            const db = opening.result;
            const query = db
              .transaction("requests")
              .objectStore("requests")
              .getAll();
            query.onerror = () => reject(query.error);
            query.onsuccess = () => {
              const entry = query.result.find(
                (item) => item.learnerId === "preparation-test",
              );
              db.close();
              resolve(entry.body.requestKey);
            };
          };
        }),
    );
    await page.reload();
    await page.getByRole("button", { name: "Recover submission" }).click();
    await expect(
      page.getByText(
        "This submission is still being prepared. Try again in a moment.",
      ),
    ).toBeVisible();
    expect(bodies).toHaveLength(0);
    release();
    await page.evaluate(() => {
      const now = Date.now.bind(Date);
      Date.now = () => now() + 31000;
    });
    await page.getByRole("button", { name: "Recover submission" }).click();
    await expect(
      page.getByText("0 / 100 (Needs at least 60 to pass)", { exact: true }),
    ).toBeVisible();
    expect(bodies).toHaveLength(1);
    expect(bodies[0].requestKey).toBe(storedKey);
  } finally {
    release();
  }
});

test("a stalled draft preparation offers recovery without sending a submission", async ({
  page,
}) => {
  const questions = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`,
    prompt: `Question ${i}`,
    choices: [{ id: "a", text: "A" }],
  }));
  const answers = Object.fromEntries(questions.map((q) => [q.id, "a"]));
  let drafts = 0;
  let serverSubmitted = false;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const bodies: { answers: Record<string, string> }[] = [];
  await page.route("**/api/topics/*/quiz", (route) =>
    route.fulfill({
      json: {
        learnerId: "draft-timeout-test",

        currentAttempt: {
          attemptId: "00000000-0000-4000-8000-000000000001",
          assessmentRevision: 1,
          state: serverSubmitted ? "submitted" : "answering",
          submissionId: serverSubmitted ? "confirmed" : null,
        },
        ...(serverSubmitted ? { currentSubmission: {
          submissionId: "confirmed",
          evaluation: confirmedResult.evaluation,
          submittedAt: "2026-01-01T00:00:00Z",
        } } : {}),
        currentAttemptIsLegacy: false,
        quiz: { title: "Quiz", revision: 1, questions },
        draft: { answers, workRevision: 0 },
        progress: {},
      },
    }),
  );
  await page.route("**/api/topics/*/quiz/draft", async (route) => {
    drafts++;
    if (drafts === 1) {
      await held;
      await route.abort().catch(() => {});
    } else await route.fulfill({ json: { kind: "saved", workRevision: 1 } });
  });
  await page.route("**/api/topics/*/quiz/submit", (route) => {
    bodies.push(route.request().postDataJSON());
    serverSubmitted = true;
    return route.fulfill({ json: confirmedResult });
  });
  try {
    await openMockActivity(page);
    await page.getByRole("button", { name: "Submit activity" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Submit activity" }).click();
    await expect(
      page.getByText(
        "Could not finish preparing your submission. Recover it to try again.",
      ),
    ).toBeVisible({ timeout: 22000 });
    await expect(
      page.getByRole("button", { name: "Recover submission" }),
    ).toBeEnabled();
    expect(bodies).toHaveLength(0);
    release();
    await page.getByRole("button", { name: "Recover submission" }).click();
    await expect(
      page.getByText("0 / 100 (Needs at least 60 to pass)", { exact: true }),
    ).toBeVisible();
    expect(bodies).toHaveLength(1);
    expect(bodies[0].answers).toEqual(answers);
  } finally {
    release();
  }
});

test("a stalled earlier autosave eventually releases submission recovery", async ({
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
  const answers = Object.fromEntries(questions.map((q) => [q.id, "a"]));
  let drafts = 0;
  let serverSubmitted = false;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const bodies: { answers: Record<string, string> }[] = [];
  await page.route("**/api/topics/*/quiz", (route) =>
    route.fulfill({
      json: {
        learnerId: "autosave-timeout-test",

        currentAttempt: {
          attemptId: "00000000-0000-4000-8000-000000000001",
          assessmentRevision: 1,
          state: serverSubmitted ? "submitted" : "answering",
          submissionId: serverSubmitted ? "confirmed" : null,
        },
        ...(serverSubmitted ? { currentSubmission: {
          submissionId: "confirmed",
          evaluation: confirmedResult.evaluation,
          submittedAt: "2026-01-01T00:00:00Z",
        } } : {}),
        currentAttemptIsLegacy: false,
        quiz: { title: "Quiz", revision: 1, questions },
        draft: { answers, workRevision: 0 },
        progress: {},
      },
    }),
  );
  await page.route("**/api/topics/*/quiz/draft", async (route) => {
    drafts++;
    if (drafts === 1) {
      await held;
      await route.abort().catch(() => {});
    } else await route.fulfill({ json: { kind: "saved", workRevision: 1 } });
  });
  await page.route("**/api/topics/*/quiz/submit", (route) => {
    bodies.push(route.request().postDataJSON());
    serverSubmitted = true;
    return route.fulfill({ json: confirmedResult });
  });
  try {
    await openMockActivity(page);
    await expect(page.locator('#q-q0 [role="radio"]').nth(1)).toBeVisible();
    await page.locator('#q-q0 [role="radio"]').nth(1).click();
    await expect.poll(() => drafts).toBe(1);
    await page.getByRole("button", { name: "Submit activity" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Submit activity" }).click();
    await expect(
      page.getByRole("button", { name: "Recover submission" }),
    ).toBeVisible({ timeout: 22000 });
    await expect(
      page.getByText("Draft save timed out. Try again."),
    ).toBeVisible({ timeout: 22000 });
    await expect(
      page.getByText("signal is aborted without reason"),
    ).toHaveCount(0);
    expect(bodies).toHaveLength(0);
    release();
    await page.getByRole("button", { name: "Recover submission" }).click();
    await expect(
      page.getByText("0 / 100 (Needs at least 60 to pass)", { exact: true }),
    ).toBeVisible();
    expect(bodies).toHaveLength(1);
    expect(bodies[0].answers).toEqual({ ...answers, q0: "b" });
  } finally {
    release();
  }
});

test("a former preparation owner cannot submit after another tab takes over", async ({
  page,
  context,
}) => {
  const topic = "getting-started-with-cangjie";
  const questions = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`,
    prompt: `Question ${i}`,
    choices: [{ id: "a", text: "A" }],
  }));
  const answers = Object.fromEntries(questions.map((q) => [q.id, "a"]));
  let finished = false;
  let heldRequests = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const bodies: unknown[] = [];
  await context.route("**/api/topics/*/quiz", (route) =>
    route.fulfill({
      json: {
        learnerId: "lease-owner-test",

        currentAttempt: { attemptId: "00000000-0000-4000-8000-000000000001", assessmentRevision: 1, state: "answering", submissionId: null },
        currentAttemptIsLegacy: false,
        quiz: { title: "Quiz", revision: 1, questions },
        draft: { answers, workRevision: 0 },
        progress: {},
        ...(finished
          ? {
              currentAttempt: { attemptId: "00000000-0000-4000-8000-000000000001", assessmentRevision: 1, state: "submitted", submissionId: "confirmed" },
              currentSubmission: {
                submissionId: "confirmed",
                evaluation: confirmedResult.evaluation,
                submittedAt: "2026-01-01T00:00:00Z",
              },
            }
          : {}),
      },
    }),
  );
  await context.route("**/api/topics/*/quiz/draft", (route) =>
    route.fulfill({ json: { kind: "saved", workRevision: 1 } }),
  );
  await context.route("**/api/topics/*/quiz/submit", (route) => {
    bodies.push(route.request().postDataJSON());
    finished = true;
    return route.fulfill({ json: confirmedResult });
  });
  const second = await context.newPage();
  await second.route("**/api/topics/*/quiz/draft", async (route) => {
    heldRequests++;
    await held;
    await route.fulfill({ json: { kind: "saved", workRevision: 1 } });
  });
  try {
    await page.clock.install({ time: quizClockStart });
    await openMockActivity(page, topic);
    await expect(
      page.getByRole("button", { name: "Submit activity" }),
    ).toBeVisible();
    await page.clock.pauseAt(quizClockPaused);
    await second.clock.install({ time: quizClockStart });
    await second.goto(`/topics/${topic}/activity`);
    await expect(
      second.getByRole("button", { name: "Submit activity" }),
    ).toBeVisible();
    await second.clock.pauseAt(quizClockPaused);
    await second.getByRole("button", { name: "Submit activity" }).click();
    await second.getByRole("dialog").getByRole("button", { name: "Submit activity" }).click();
    await expect.poll(() => heldRequests).toBe(1);
    await page.getByRole("button", { name: "Submit activity" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Submit activity" }).click();
    await expect(
      page.getByRole("button", { name: "Recover submission" }),
    ).toBeVisible();
    await page.clock.setSystemTime(new Date(quizClockPaused.getTime() + 31000));
    await page.getByRole("button", { name: "Recover submission" }).click();
    await expect(
      page.getByText("0 / 100 (Needs at least 60 to pass)", { exact: true }),
    ).toBeVisible();
    expect(bodies).toHaveLength(1);
    release();
    await expect(
      second.getByText("0 / 100 (Needs at least 60 to pass)", { exact: true }),
    ).toBeVisible();
    expect(bodies).toHaveLength(1);
  } finally {
    release();
    await second.close();
  }
});

test("a draft conflict during preparation stops submission until the learner chooses", async ({
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
  const answers = Object.fromEntries(questions.map((q) => [q.id, "a"]));
  const serverAnswers = { ...answers, q0: "b" };
  let drafts = 0;
  let posts = 0;
  let serverSubmitted = false;
  await page.route("**/api/topics/*/quiz", (route) =>
    route.fulfill({
      json: {
        learnerId: "prepare-conflict-test",

        currentAttempt: {
          attemptId: "00000000-0000-4000-8000-000000000001",
          assessmentRevision: 1,
          state: serverSubmitted ? "submitted" : "answering",
          submissionId: serverSubmitted ? "confirmed" : null,
        },
        ...(serverSubmitted ? { currentSubmission: {
          submissionId: "confirmed",
          evaluation: confirmedResult.evaluation,
          submittedAt: "2026-01-01T00:00:00Z",
        } } : {}),
        currentAttemptIsLegacy: false,
        quiz: { title: "Quiz", revision: 1, questions },
        draft: { answers, workRevision: 0 },
        progress: {},
      },
    }),
  );
  await page.route("**/api/topics/*/quiz/draft", (route) => {
    drafts++;
    return route.fulfill({
      json:
        drafts === 1
          ? {
              kind: "conflict",
              conflictId: "draft-conflict",
              server: { answers: serverAnswers, workRevision: 1 },
              candidate: { answers, workRevision: 0 },
            }
          : { kind: "saved", workRevision: 3 },
    });
  });
  await page.route("**/api/topics/*/quiz/draft/resolve", (route) =>
    route.fulfill({
      json: { kind: "saved", workRevision: 2, nextConflict: null },
    }),
  );
  await page.route("**/api/topics/*/quiz/submit", (route) => {
    posts++;
    serverSubmitted = true;
    return route.fulfill({ json: confirmedResult });
  });
  await openMockActivity(page);
  await page.getByRole("button", { name: "Submit activity" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Submit activity" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose which answers to keep" }),
  ).toBeVisible();
  expect(posts).toBe(0);
  await expect(
    page.getByRole("button", { name: "Recover submission" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Keep saved answers" }).click();
  await expect(page.getByText("Draft choice saved")).toBeVisible();
  await page.getByRole("button", { name: "Submit activity" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Submit activity" }).click();
  await expect(
    page.getByText("0 / 100 (Needs at least 60 to pass)", { exact: true }),
  ).toBeVisible();
  expect(posts).toBe(1);
});

test("keeps the original snapshot through repeated service failures and changed workspace data", async ({
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
  const originalAnswers = Object.fromEntries(questions.map((q) => [q.id, "a"]));
  const changedAnswers = Object.fromEntries(questions.map((q) => [q.id, "b"]));
  await mockDraftSave(page);
  let serverSubmitted = false;
  const bodies: {
    requestKey: string;
    answers: Record<string, string>;
    assessmentRevision: number;
  }[] = [];
  let changed = false;
  await page.route("**/api/topics/*/quiz", (route) =>
    route.fulfill({
      json: {
        learnerId: "repeat-test",

        currentAttempt: {
          attemptId: "00000000-0000-4000-8000-000000000001",
          assessmentRevision: 1,
          state: serverSubmitted ? "submitted" : "answering",
          submissionId: serverSubmitted ? "confirmed" : null,
        },
        ...(serverSubmitted ? { currentSubmission: {
          submissionId: "confirmed",
          evaluation: confirmedResult.evaluation,
          submittedAt: "2026-01-01T00:00:00Z",
        } } : {}),
        currentAttemptIsLegacy: false,
        quiz: { title: "Quiz", revision: changed ? 2 : 1, questions },
        draft: {
          answers: changed ? changedAnswers : originalAnswers,
          workRevision: 0,
        },
        progress: {},
      },
    }),
  );
  await page.route("**/api/topics/*/quiz/submit", async (route) => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length < 3)
      await route.fulfill({
        status: 503,
        json: { error: "Temporary failure" },
      });
    else {
      serverSubmitted = true;
      await route.fulfill({ json: confirmedResult });
    }
  });
  await openMockActivity(page);
  await page.getByRole("button", { name: "Submit activity" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Submit activity" }).click();
  await expect(
    page.getByRole("button", { name: "Recover submission" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Recover submission" }).click();
  await expect(
    page.getByRole("button", { name: "Recover submission" }),
  ).toBeEnabled();
  changed = true;
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Recover submission" }),
  ).toBeVisible();
  await expect(page.locator('#q-q0 [role="radio"]').nth(1)).toBeDisabled();
  await page.getByRole("button", { name: "Recover submission" }).click();
  await expect(
    page.getByText("0 / 100 (Needs at least 60 to pass)"),
  ).toBeVisible();
  expect(bodies).toHaveLength(3);
  expect(bodies[1]).toEqual(bodies[0]);
  expect(bodies[2]).toEqual(bodies[0]);
  expect(bodies[0].answers).toEqual(originalAnswers);
  expect(bodies[0].assessmentRevision).toBe(1);
});

test("keeps the request through session expiry and workspace re-entry", async ({
  page,
}) => {
  const questions = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`,
    prompt: `Question ${i}`,
    choices: [{ id: "a", text: "A" }],
  }));
  const answers = Object.fromEntries(questions.map((q) => [q.id, "a"]));
  await mockDraftSave(page);
  let serverSubmitted = false;
  const bodies: unknown[] = [];
  await page.route("**/api/topics/*/quiz", (route) =>
    route.fulfill({
      json: {
        learnerId: "session-test",

        currentAttempt: {
          attemptId: "00000000-0000-4000-8000-000000000001",
          assessmentRevision: 1,
          state: serverSubmitted ? "submitted" : "answering",
          submissionId: serverSubmitted ? "confirmed" : null,
        },
        ...(serverSubmitted ? { currentSubmission: {
          submissionId: "confirmed",
          evaluation: confirmedResult.evaluation,
          submittedAt: "2026-01-01T00:00:00Z",
        } } : {}),
        currentAttemptIsLegacy: false,
        quiz: { title: "Quiz", revision: 1, questions },
        draft: { answers, workRevision: 0 },
        progress: {},
      },
    }),
  );
  await page.route("**/api/session", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { signedIn: true } })
      : route.continue(),
  );
  await page.route("**/api/topics/*/quiz/submit", async (route) => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1)
      await route.fulfill({ status: 401, json: { error: "Session expired" } });
    else {
      serverSubmitted = true;
      await route.fulfill({ json: confirmedResult });
    }
  });
  await openMockActivity(page);
  await page.getByRole("button", { name: "Submit activity" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Submit activity" }).click();
  await expect(
    page.getByText(
      "Your session has ended. Open the workspace again to recover your submission.",
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open development workspace" })
    .click();
  await expect(
    page.getByRole("button", { name: "Recover submission" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Recover submission" }).click();
  await expect(
    page.getByText("0 / 100 (Needs at least 60 to pass)"),
  ).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
});

test("keeps pending submissions scoped to their learner account", async ({
  page,
}) => {
  const questions = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`,
    prompt: `Question ${i}`,
    choices: [{ id: "a", text: "A" }],
  }));
  const answers = Object.fromEntries(questions.map((q) => [q.id, "a"]));
  await mockDraftSave(page);
  const bodies: { requestKey: string }[] = [];
  let learner = "account-a";
  let submittedLearner: string | null = null;
  await page.route("**/api/topics/*/quiz", (route) =>
    route.fulfill({
      json: {
        learnerId: learner,

        currentAttempt: {
          attemptId: "00000000-0000-4000-8000-000000000001",
          assessmentRevision: 1,
          state: submittedLearner === learner ? "submitted" : "answering",
          submissionId: submittedLearner === learner ? "confirmed" : null,
        },
        ...(submittedLearner === learner ? { currentSubmission: {
          submissionId: "confirmed",
          evaluation: confirmedResult.evaluation,
          submittedAt: "2026-01-01T00:00:00Z",
        } } : {}),
        currentAttemptIsLegacy: false,
        quiz: { title: "Quiz", revision: 1, questions },
        draft: { answers, workRevision: 0 },
        progress: {},
      },
    }),
  );
  await page.route("**/api/topics/*/quiz/submit", async (route) => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) await route.abort("failed");
    else {
      submittedLearner = learner;
      await route.fulfill({ json: confirmedResult });
    }
  });
  await openMockActivity(page);
  await page.getByRole("button", { name: "Submit activity" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Submit activity" }).click();
  await expect(
    page.getByRole("button", { name: "Recover submission" }),
  ).toBeVisible();
  learner = "account-b";
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Submit activity" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Submit activity" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Submit activity" }).click();
  await expect(
    page.getByText("0 / 100 (Needs at least 60 to pass)"),
  ).toBeVisible();
  expect(bodies[1].requestKey).not.toBe(bodies[0].requestKey);
  learner = "account-a";
  await page.reload();
  await page.getByRole("button", { name: "Recover submission" }).click();
  await expect(
    page.getByText("0 / 100 (Needs at least 60 to pass)"),
  ).toBeVisible();
  expect(bodies[2]).toEqual(bodies[0]);
});

test("rejects preparation and submission if the signed-in account changed", async ({
  page,
}) => {
  await resetMilestone();
  await resetLearnerToStart();
  const topic = "getting-started-with-cangjie";
  await page.goto(`/topics/${topic}/activity`);
  await page
    .getByRole("button", { name: "Open development workspace" })
    .click();
  await expect(page.getByRole("radio").first()).toBeVisible();
  const results = await page.evaluate(
    async ({ topic, expectedLearnerId }) => {
      const endpoint = `/api/topics/${topic}/quiz`;
      const current = await (await fetch(endpoint)).json();
      const draft = await fetch(`${endpoint}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseRevision: current.draft.workRevision,
          answers: {},
          expectedLearnerId,
        }),
      });
      const submit = await fetch(`${endpoint}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKey: "wrong-account-test",
          answers: {},
          assessmentRevision: current.quiz.revision,
          expectedLearnerId,
        }),
      });
      const after = await (await fetch(endpoint)).json();
      return {
        draft: draft.status,
        submit: submit.status,
        beforeRevision: current.draft.workRevision,
        afterRevision: after.draft.workRevision,
      };
    },
    { topic, expectedLearnerId: OTHER_LEARNER },
  );
  expect(results.draft).toBe(409);
  expect(results.submit).toBe(409);
  expect(results.afterRevision).toBe(results.beforeRevision);
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw new Error("Dedicated test database required");
  const pool = new pg.Pool({ connectionString: url });
  try {
    expect(
      (
        await pool.query(
          "SELECT id FROM topic_submissions WHERE learner_id=$1",
          [LEARNER],
        )
      ).rowCount,
    ).toBe(0);
  } finally {
    await pool.end();
  }
});

test("retains the request when a success response does not contain a confirmed result", async ({
  page,
}) => {
  const questions = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`,
    prompt: `Question ${i}`,
    choices: [{ id: "a", text: "A" }],
  }));
  const answers = Object.fromEntries(questions.map((q) => [q.id, "a"]));
  await mockDraftSave(page);
  let serverSubmitted = false;
  const bodies: unknown[] = [];
  await page.route("**/api/topics/*/quiz", (route) =>
    route.fulfill({
      json: {
        learnerId: "malformed-test",

        currentAttempt: {
          attemptId: "00000000-0000-4000-8000-000000000001",
          assessmentRevision: 1,
          state: serverSubmitted ? "submitted" : "answering",
          submissionId: serverSubmitted ? "confirmed" : null,
        },
        ...(serverSubmitted ? { currentSubmission: {
          submissionId: "confirmed",
          evaluation: confirmedResult.evaluation,
          submittedAt: "2026-01-01T00:00:00Z",
        } } : {}),
        currentAttemptIsLegacy: false,
        quiz: { title: "Quiz", revision: 1, questions },
        draft: { answers, workRevision: 0 },
        progress: {},
      },
    }),
  );
  await page.route("**/api/topics/*/quiz/submit", async (route) => {
    bodies.push(route.request().postDataJSON());
    serverSubmitted = true;
    await route.fulfill({
      json:
        bodies.length === 1
          ? {
              submissionId: "incomplete",
              evaluation: { score: {} },
              progress: {},
            }
          : confirmedResult,
    });
  });
  await openMockActivity(page);
  await page.getByRole("button", { name: "Submit activity" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Submit activity" }).click();
  await expect(
    page.getByRole("button", { name: "Recover submission" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Recover submission" }).click();
  await expect(
    page.getByText("0 / 100 (Needs at least 60 to pass)"),
  ).toBeVisible();
  expect(bodies[1]).toEqual(bodies[0]);
});
