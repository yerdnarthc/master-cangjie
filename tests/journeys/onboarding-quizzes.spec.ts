import { test, expect } from "@playwright/test";
import { resetMilestone, resetLearnerToStart } from "./reset.ts";

test.beforeEach(async () => {
  await resetMilestone();
  await resetLearnerToStart();
});

const choiceOrder: Record<string, number> = { a: 0, b: 1, c: 2, d: 3 };
const selectChoice = async (page: import("@playwright/test").Page, questionId: string, choiceId: string) => {
  await page.locator(`#q-${questionId} [role="radio"]`).nth(choiceOrder[choiceId]).click();
};

test("learner attempts quiz, sees incomplete warning, passes with >= 60, automatically completes, and unlocks subsequent topics", async ({
  page,
}) => {
  // 1. Navigate to first topic activity
  await page.goto("/topics/getting-started-with-cangjie/activity");

  // Sign in if dev workspace login is shown
  const login = page.getByRole("button", {
    name: "Open development workspace",
  });
  const heading = page.getByRole("heading", {
    name: "Getting Started with Cangjie",
    exact: true,
  });
  await expect(login.or(heading)).toBeVisible();
  if (await login.isVisible()) {
    await login.click();
  }

  await expect(heading).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Questions answered" })).toHaveAttribute("aria-valuenow", "0");

  // 2. Click submit without answering -> incomplete warning
  await page.getByRole("button", { name: "Submit activity" }).click();
  const incompleteDialog = page.getByRole("dialog");
  await expect(
    incompleteDialog.getByRole("heading", { name: "10 questions left to answer" }),
  ).toBeVisible();
  await expect(
    incompleteDialog.getByText("Unanswered questions receive 0 points with no partial credit."),
  ).toBeVisible();
  await expect(incompleteDialog.locator("#quiz-confirm-unanswered-list li")).toHaveCount(10);

  // Submit anyway with 0 answers -> 0/100
  await page
    .getByRole("button", { name: "Submit anyway (0 points for unanswered)" })
    .click();
  await expect(
    page.getByText("0 / 100 (Needs at least 60 to pass)"),
  ).toBeVisible();
  // Mark complete button must NOT be visible
  await expect(
    page.getByRole("button", { name: "Mark complete" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("progressbar", { name: "Questions answered" })).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByText("0 / 100 (Needs at least 60 to pass)", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("radio").first()).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Submit activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit retry" })).toHaveCount(0);

  // 3. Answer 7 questions correctly (70/100 -> passes)
  // q01: b, q02: a, q03: c, q04: b, q05: b, q06: b, q07: c
  await selectChoice(page, "q01", "b");
  await selectChoice(page, "q02", "a");
  await selectChoice(page, "q03", "c");
  await selectChoice(page, "q04", "b");
  await selectChoice(page, "q05", "b");
  await page.getByRole("link", { name: /Questions 6 to 10/ }).click();
  await selectChoice(page, "q06", "b");
  await selectChoice(page, "q07", "c");

  await page.getByRole("button", { name: "Submit activity" }).click();
  if (
    await page
      .getByRole("button", { name: "Submit anyway (0 points for unanswered)" })
      .isVisible()
  ) {
    await page
      .getByRole("button", { name: "Submit anyway (0 points for unanswered)" })
      .click();
  }

  await expect(page.getByText("70 / 100 (Passed!)")).toBeVisible();

  // Passing finalization completes and unlocks without a second action.
  await expect(page.getByText("Topic completed!", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark complete" })).toHaveCount(0);
  // Continue to the next topic
  const nextLink = page.getByRole("link", { name: "Continue to next topic" });
  await expect(nextLink).toBeVisible();
  await nextLink.click();

  // 5. Land on Topic 2: Installing the Cangjie Toolchain
  await expect(page).toHaveURL(/installing-the-cangjie-toolchain$/);
  await expect(
    page.getByRole("heading", {
      name: "Installing the Cangjie Toolchain",
      exact: true,
    }),
  ).toBeVisible();

  // Open Topic 2 activity
  await page
    .getByRole("link", { name: "Start activity" })
    .click();
  await expect(page).toHaveURL(/installing-the-cangjie-toolchain\/activity$/);
  await expect(
    page.getByRole("heading", {
      name: "Installing the Cangjie Toolchain",
      exact: true,
    }),
  ).toBeVisible();

  // Answer all 10 questions correctly for Topic 2:
  // q01: b, q02: a, q03: b, q04: a, q05: b, q06: b, q07: a, q08: b, q09: b, q10: b
  const t2Answers: Record<string, string> = {
    q01: "b",
    q02: "a",
    q03: "b",
    q04: "a",
    q05: "b",
    q06: "b",
    q07: "a",
    q08: "b",
    q09: "b",
    q10: "b",
  };
  for (const [qId, choiceId] of Object.entries(t2Answers)) {
    if (qId === "q06") await page.getByRole("link", { name: /Questions 6 to 10/ }).click();
    await selectChoice(page, qId, choiceId);
  }

  // Submit Topic 2 activity
  await page.getByRole("button", { name: "Submit activity" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Submit activity" }).click();
  await expect(page.getByText("100 / 100 (Passed!)")).toBeVisible();

  // Mark Topic 2 complete
  await expect(page.getByText("Topic completed!", { exact: true })).toBeVisible();

  // Navigate to Topic 3: Running the First Cangjie Program
  await page.getByRole("link", { name: "Continue to next topic" }).click();
  await expect(page).toHaveURL(/running-the-first-cangjie-program$/);
  await page.getByRole("link", { name: "Open Hello World activity" }).click();

  // Verify Topic 3 coding workspace is unlocked!
  await expect(page).toHaveURL(/running-the-first-cangjie-program\/activity$/);
  await expect(
    page.getByRole("heading", { name: "Hello, World!", exact: true }),
  ).toBeVisible();
});
