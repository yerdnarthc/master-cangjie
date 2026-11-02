import { test, expect } from "@playwright/test";
import { resetMilestone, resetLearnerToStart } from "./reset.ts";

test.beforeEach(async () => {
  await resetMilestone();
  await resetLearnerToStart();
});

test("learner attempts quiz, sees incomplete warning, passes with >= 60, marks complete, and unlocks subsequent topics", async ({
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
  await expect(page.getByText("0 of 10 answered (10 remaining)")).toBeVisible();

  // 2. Click submit without answering -> incomplete warning
  await page.getByRole("button", { name: "Submit activity" }).click();
  await expect(page.getByText("Incomplete Activity Warning")).toBeVisible();
  await expect(
    page.getByText("You have 10 unanswered questions"),
  ).toBeVisible();

  // Submit anyway with 0 answers -> 0/100
  await page
    .getByRole("button", { name: "Submit anyway (0 points for unanswered)" })
    .click();
  await expect(
    page.getByText("0 / 100 (Needs at least 60 to pass)"),
  ).toBeVisible();
  // Mark complete button must NOT be visible
  await expect(
    page.getByRole("button", { name: "Mark complete ✓" }),
  ).toHaveCount(0);

  // 3. Answer 7 questions correctly (70/100 -> passes)
  // q01: b, q02: a, q03: c, q04: b, q05: b, q06: b, q07: c
  await page.locator('input[name="q-q01"][value="b"]').check();
  await page.locator('input[name="q-q02"][value="a"]').check();
  await page.locator('input[name="q-q03"][value="c"]').check();
  await page.locator('input[name="q-q04"][value="b"]').check();
  await page.locator('input[name="q-q05"][value="b"]').check();
  await page.locator('input[name="q-q06"][value="b"]').check();
  await page.locator('input[name="q-q07"][value="c"]').check();

  // Submit retry
  await page.getByRole("button", { name: "Submit retry" }).click();
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

  // Invariant UC-13-AC2: Topic is NOT complete yet, but Mark complete button IS available
  await expect(page.getByText("Passed · Awaiting completion")).toBeVisible();
  await page.goto("/");
  const firstTopicCard = page.locator(".topic-list li").filter({
    has: page.getByRole("link", { name: "Getting Started with Cangjie", exact: true }),
  });
  await expect(firstTopicCard).toContainText("Passed · Awaiting completion");
  const secondTopicCard = page.locator(".topic-list li").filter({
    has: page.getByRole("heading", { name: "Installing the Cangjie Toolchain", exact: true }),
  });
  await expect(secondTopicCard).toContainText("Locked");
  await expect(secondTopicCard).toContainText("Complete Getting Started with Cangjie to unlock this topic.");
  await page.goto("/topics/getting-started-with-cangjie/activity");

  const markCompleteBtn = page.getByRole("button", { name: "Mark complete ✓" });
  await expect(markCompleteBtn).toBeVisible();

  // 4. Click "Mark complete ✓" (UC-14)
  await markCompleteBtn.click();
  await expect(page.getByText("✓ Topic completed!")).toBeVisible();

  // "Continue to next topic →" link is visible
  const nextLink = page.getByRole("link", { name: "Continue to next topic →" });
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
    .getByRole("link", { name: "Start multiple-choice activity" })
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
    await page.locator(`input[name="q-${qId}"][value="${choiceId}"]`).check();
  }

  // Submit Topic 2 activity
  await page.getByRole("button", { name: "Submit activity" }).click();
  await expect(page.getByText("100 / 100 (Passed!)")).toBeVisible();

  // Mark Topic 2 complete
  await page.getByRole("button", { name: "Mark complete ✓" }).click();
  await expect(page.getByText("✓ Topic completed!")).toBeVisible();

  // Navigate to Topic 3: Running the First Cangjie Program
  await page.getByRole("link", { name: "Continue to next topic →" }).click();
  await expect(page).toHaveURL(/running-the-first-cangjie-program$/);
  await page.getByRole("link", { name: "Open Hello World activity" }).click();

  // Verify Topic 3 coding workspace is unlocked!
  await expect(page).toHaveURL(/running-the-first-cangjie-program\/activity$/);
  await expect(
    page.getByRole("heading", { name: "Hello, World!", exact: true }),
  ).toBeVisible();
});
