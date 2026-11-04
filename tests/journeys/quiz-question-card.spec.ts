import { test, expect } from "@playwright/test";

const topic = "getting-started-with-cangjie";
const questions = Array.from({ length: 10 }, (_, index) => ({
  id: `q${index}`,
  prompt: index === 0 ? "What type of programming language is Cangjie?" : `Question ${index + 1}`,
  choices: index === 0
    ? [
        { id: "a", text: "A domain-specific query language designed only for databases." },
        { id: "b", text: "A general-purpose language supporting imperative, functional, and object-oriented programming." },
        { id: "c", text: "A purely functional scripting language that disallows variables and functions." },
        { id: "d", text: "An assembly language executed directly by hardware without a compiler." },
      ]
    : [
        { id: "a", text: `First choice for question ${index + 1}` },
        { id: "b", text: `Correct choice for question ${index + 1}` },
      ],
}));

const evaluation = {
  score: { earned: 0, possible: 100 },
  passed: false,
  totalQuestions: 10,
  correctCount: 0,
  unansweredCount: 9,
  questionResults: questions.map((question, index) => ({
    questionId: question.id,
    selectedChoiceId: index === 0 ? "a" : null,
    correctChoiceId: "b",
    correct: false,
    earned: 0,
    explanation: `Explanation for question ${index + 1}.`,
  })),
};
const correctEvaluation = {
  ...evaluation,
  score: { earned: 10, possible: 100 },
  correctCount: 1,
  questionResults: evaluation.questionResults.map((result, index) =>
    index === 0
      ? { ...result, selectedChoiceId: "b", correct: true, earned: 10 }
      : result,
  ),
};

test("keeps answers across both pages and submits them together", async ({ page }) => {
  const progress = { bestScore: null, completed: false, canMarkComplete: false, nextTopicAvailable: false, nextTopicId: null };
  const attemptId = "00000000-0000-4000-8000-000000000001";
  let attemptState: "answering" | "submitted" = "answering";
  let currentSubmission: { submissionId: string; submittedAt: string; evaluation: typeof evaluation } | undefined;
  let serverDraft = { answers: {} as Record<string, string>, workRevision: 0 };
  const choice = (questionId: string, choiceId: string) => page
    .locator(`#q-${questionId}`)
    .getByRole("radio")
    .nth(questions.find(question => question.id === questionId)!.choices.findIndex(option => option.id === choiceId));
  await page.route(`**/api/topics/${topic}/quiz`, route => route.fulfill({ json: {
    learnerId: "pagination-test",
    topicId: topic,
    currentAttempt: { attemptId, assessmentRevision: 1, state: attemptState, submissionId: currentSubmission?.submissionId ?? null },
    currentAttemptIsLegacy: false,
    quiz: { topicId: topic, revision: 1, title: "Quiz", questions },
    draft: serverDraft,
    ...(currentSubmission ? { currentSubmission } : {}),
    progress,
  } }));
  await page.route(`**/api/topics/${topic}/quiz/draft`, route => {
    const body = route.request().postDataJSON();
    serverDraft = { answers: body.answers, workRevision: serverDraft.workRevision + 1 };
    return route.fulfill({ json: { kind: "saved", workRevision: serverDraft.workRevision } });
  });
  let submittedAnswers: Record<string, string> = {};
  await page.route(`**/api/topics/${topic}/quiz/submit`, route => {
    submittedAnswers = route.request().postDataJSON().answers;
    const submittedEvaluation = {
      ...evaluation,
      unansweredCount: 8,
      questionResults: evaluation.questionResults.map((result) => ({
        ...result,
        selectedChoiceId: submittedAnswers[result.questionId] ?? null,
      })),
    };
    attemptState = "submitted";
    currentSubmission = {
      submissionId: "pagination-result",
      submittedAt: "2026-11-04T00:00:00.000Z",
      evaluation: submittedEvaluation,
    };
    return route.fulfill({ json: {
      submissionId: "pagination-result",
      attemptId,
      evaluation: submittedEvaluation,
      progress: { ...progress, bestScore: { earned: 0, possible: 100 } },
    } });
  });

  await page.goto(`/topics/${topic}/activity`);
  const open = page.getByRole("button", { name: "Open development workspace" });
  if (await open.isVisible()) await open.click();
  await expect(page.locator(".quiz-question-card")).toHaveCount(5);
  await choice("q0", "a").click();
  await page.getByRole("link", { name: /Questions 6 to 10/ }).click();
  await expect(page.getByRole("heading", { name: "Questions 6–10" })).toBeFocused();
  await expect(page.locator("#q-q0")).toHaveCount(0);
  await expect(page.locator(".quiz-question-card")).toHaveCount(5);
  await choice("q5", "a").click();
  await page.getByRole("link", { name: /Questions 1 to 5/ }).click();
  await expect(choice("q0", "a")).toBeChecked();
  await page.getByRole("link", { name: /Questions 6 to 10/ }).click();
  await expect(choice("q5", "a")).toBeChecked();
  await page.getByRole("button", { name: "Submit activity" }).click();
  const incompleteDialog = page.getByRole("dialog");
  await expect(
    incompleteDialog.getByRole("heading", { name: "8 questions left to answer" }),
  ).toBeFocused();
  await expect(incompleteDialog.locator("#quiz-confirm-unanswered-list li")).toHaveText([
    "Q2", "Q3", "Q4", "Q5", "Q7", "Q8", "Q9", "Q10",
  ]);
  await page.getByRole("button", { name: "Review unanswered questions" }).click();
  await expect(page.getByRole("heading", { name: /Questions 1/ })).toBeFocused();
  await page.getByRole("link", { name: /Questions 6 to 10/ }).click();
  await choice("q5", "b").click();
  await expect(incompleteDialog).toHaveCount(0);
  await choice("q5", "a").click();
  await page.getByRole("button", { name: "Submit activity" }).click();
  await expect(
    incompleteDialog.getByRole("heading", { name: "8 questions left to answer" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Review unanswered questions" }).click();
  await expect(page.getByRole("heading", { name: /Questions 1/ })).toBeFocused();
  await page.getByRole("link", { name: /Questions 6 to 10/ }).click();
  await page.getByRole("button", { name: "Submit activity" }).click();
  await page.getByRole("button", { name: /Submit anyway/ }).click();
  await expect(page.locator("#q-q5").getByText("Mistake", { exact: true })).toBeVisible();
  expect(submittedAnswers).toMatchObject({ q0: "a", q5: "a" });
  await page.getByRole("dialog").getByRole("button", { name: "Review answers", exact: true }).click();
  await page.getByRole("link", { name: /Questions 1 to 5/ }).click();
  await expect(page.locator("#q-q0").getByText("Mistake", { exact: true })).toBeVisible();
});

test("keeps submitted answers read-only until Retry starts a blank attempt", async ({ page }) => {
  const firstAttemptId = "00000000-0000-4000-8000-000000000001";
  const secondAttemptId = "00000000-0000-4000-8000-000000000002";
  const progress = {
    bestScore: { earned: 80, possible: 100 },
    completed: true,
    nextTopicAvailable: true,
    nextTopicId: "next-topic",
  };
  let attemptId = firstAttemptId;
  let attemptState: "answering" | "submitted" = "answering";
  let currentSubmission: { submissionId: string; submittedAt: string; evaluation: typeof evaluation } | undefined;
  let serverDraft = { answers: {} as Record<string, string>, workRevision: 0 };
  let submitRequestCount = 0;
  let retryBody: Record<string, unknown> | null = null;

  await page.route(`**/api/topics/${topic}/quiz`, route => route.fulfill({ json: {
    learnerId: "test",
    topicId: topic,
    currentAttempt: {
      attemptId,
      assessmentRevision: 1,
      state: attemptState,
      submissionId: currentSubmission?.submissionId ?? null,
    },
    currentAttemptIsLegacy: false,
    quiz: { topicId: topic, revision: 1, title: "Quiz", questions },
    draft: serverDraft,
    ...(currentSubmission ? { currentSubmission } : {}),
    progress,
  } }));
  await page.route(`**/api/topics/${topic}/quiz/draft`, route => {
    const body = route.request().postDataJSON();
    serverDraft = { answers: body.answers, workRevision: serverDraft.workRevision + 1 };
    return route.fulfill({ json: { kind: "saved", workRevision: serverDraft.workRevision } });
  });
  await page.route(`**/api/topics/${topic}/quiz/submit`, route => {
    submitRequestCount += 1;
    const submissionId = "mistake-review";
    const submittedEvaluation = {
      ...evaluation,
      questionResults: evaluation.questionResults.map((result, index) =>
        index === 0
          ? { ...result, selectedChoiceId: serverDraft.answers.q0 ?? null }
          : result,
      ),
    };
    attemptState = "submitted";
    serverDraft = { answers: { ...serverDraft.answers }, workRevision: serverDraft.workRevision + 1 };
    currentSubmission = {
      submissionId,
      submittedAt: "2026-11-04T00:00:00.000Z",
      evaluation: submittedEvaluation,
    };
    return route.fulfill({ json: {
      submissionId,
      attemptId: firstAttemptId,
      evaluation: submittedEvaluation,
      progress,
    } });
  });
  await page.route(`**/api/topics/${topic}/quiz/retry`, route => {
    retryBody = route.request().postDataJSON();
    attemptId = secondAttemptId;
    attemptState = "answering";
    currentSubmission = undefined;
    serverDraft = { answers: {}, workRevision: serverDraft.workRevision + 1 };
    return route.fulfill({ json: { attemptId: secondAttemptId, workRevision: serverDraft.workRevision } });
  });

  await page.goto(`/topics/${topic}/activity`);
  const open = page.getByRole("button", { name: "Open development workspace" });
  if (await open.isVisible()) await open.click();
  const firstCard = page.locator("#q-q0");
  const wrongChoice = firstCard.getByRole("radio", {
    name: "A domain-specific query language designed only for databases.",
  });

  await wrongChoice.check();
  await page.getByRole("button", { name: "Submit activity" }).click();
  await page.getByRole("button", { name: /Submit anyway/ }).click();
  await expect(firstCard.getByText("Mistake", { exact: true })).toBeVisible();
  await expect(wrongChoice).toBeChecked();
  await expect(wrongChoice).toBeDisabled();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit retry" })).toHaveCount(0);

  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("Connect to the internet before starting Retry.");
  expect(retryBody).toBeNull();
  await page.context().setOffline(false);
  await page.getByRole("button", { name: "Retry" }).click();

  expect(retryBody).toMatchObject({
    sourceSubmissionId: "mistake-review",
    expectedAttemptId: firstAttemptId,
    expectedLearnerId: "test",
  });
  expect(submitRequestCount).toBe(1);
  await expect(page.getByRole("progressbar", { name: "Questions answered" })).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByRole("heading", { name: "Questions 1–5" })).toBeVisible();
  await expect(page.getByRole("radio").first()).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Submit activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit retry" })).toHaveCount(0);
  await expect(page.getByText("Latest submission result", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Mistake", { exact: true })).toHaveCount(0);
  await expect(page.locator(".quiz-sidebar")).toContainText("80");
  await expect(page.getByRole("button", { name: "Mark complete" })).toHaveCount(0);
  await expect(page.getByText("Topic completed!", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Continue to next topic/ })).toHaveAttribute("href", "/topics/next-topic");

  await page.setViewportSize({ width: 390, height: 844 });
  const pageWidths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(pageWidths.content).toBeLessThanOrEqual(pageWidths.viewport);
});

test("does not show historical answer feedback in a fresh retry", async ({ page }) => {
  await page.route(`**/api/topics/${topic}/quiz`, (route) =>
    route.fulfill({
      json: {
        learnerId: "test",
        currentAttempt: { attemptId: "00000000-0000-4000-8000-000000000001", assessmentRevision: 1, state: "answering", submissionId: null },
        currentAttemptIsLegacy: false,
        topicId: topic,
        quiz: { topicId: topic, revision: 1, title: "Quiz", questions },
        draft: { answers: {}, workRevision: 2 },
        progress: {
          bestScore: { earned: 0, possible: 100 },
          completed: false,
          canMarkComplete: false,
          nextTopicAvailable: false,
          nextTopicId: null,
        },
        latestSubmission: {
          submissionId: "legacy-result",
          submittedAt: "2026-11-03T00:00:00.000Z",
          score: { earned: 0, possible: 100 },
        },
      },
    }),
  );

  await page.goto(`/topics/${topic}/activity`);
  await page.getByRole("button", { name: "Open development workspace" }).click();
  const firstCard = page.locator("#q-q0");
  await expect(page.getByRole("progressbar", { name: "Questions answered" })).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByRole("radio").first()).not.toBeChecked();
  await expect(firstCard.getByText("Mistake", { exact: true })).toHaveCount(0);
  await expect(firstCard.getByText("Your answer", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Correct answer", { exact: true })).toHaveCount(0);
});

test("marks the submitted choice correct after a confirmed result", async ({ page }) => {
  await page.route(`**/api/topics/${topic}/quiz`, (route) =>
    route.fulfill({
      json: {
        learnerId: "test",
        currentAttempt: { attemptId: "00000000-0000-4000-8000-000000000001", assessmentRevision: 1, state: "submitted", submissionId: "correct-result" },
        currentAttemptIsLegacy: false,
        topicId: topic,
        quiz: { topicId: topic, revision: 1, title: "Quiz", questions },
        draft: { answers: { q0: "b" }, workRevision: 1 },
        progress: {
          bestScore: { earned: 10, possible: 100 },
          completed: false,
          canMarkComplete: false,
          nextTopicAvailable: false,
          nextTopicId: null,
        },
        currentSubmission: {
          submissionId: "correct-result",
          submittedAt: "2026-11-03T00:00:00.000Z",
          evaluation: correctEvaluation,
        },
      },
    }),
  );

  await page.goto(`/topics/${topic}/activity`);
  await page.getByRole("button", { name: "Open development workspace" }).click();
  const firstCard = page.locator("#q-q0");
  await expect(firstCard.getByText("Correct", { exact: true })).toBeVisible();
  await expect(firstCard.getByText("Your answer", { exact: true })).toBeVisible();
  await expect(firstCard.getByText("Correct answer", { exact: true })).toBeVisible();
  await expect(firstCard.getByRole("radio", {
    name: "A general-purpose language supporting imperative, functional, and object-oriented programming.",
  })).toBeChecked();
  await expect(firstCard.getByText("Mistake", { exact: true })).toHaveCount(0);
});
