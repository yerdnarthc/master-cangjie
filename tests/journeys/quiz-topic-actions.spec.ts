import { test, expect } from "@playwright/test";
import { resetMilestone, resetLearnerToStart } from "./reset.ts";
const topic = "/topics/getting-started-with-cangjie";
test("topic actions follow persisted state and failure dialog retries directly", async ({
  page,
}) => {
  await resetMilestone();
  await resetLearnerToStart();
  await page.goto(topic);
  await page.evaluate(async () => {
    await fetch("/api/session", { method: "POST" });
  });
  await page.goto(topic);
  await page.getByRole("link", { name: "Start activity", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Submit activity", exact: true }),
  ).toBeVisible();
  await page.goto(topic);
  await page
    .getByRole("link", { name: "Continue activity", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Submit activity", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Submit anyway (0 points for unanswered)" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Try another attempt" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("60/100");
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Questions answered" }),
  ).toHaveAttribute("aria-valuenow", "0");
  await expect(
    page.getByRole("button", { name: /Review best submission/ }),
  ).toContainText("0/100");
  await page.goto(topic);
  await expect(
    page.getByRole("link", { name: "Continue activity", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Review best submission/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toHaveCount(0);
});

test("topic Retry from a stale tab resumes an existing successor without resetting answers", async ({
  page,
  context,
}) => {
  await resetMilestone();
  await resetLearnerToStart();
  await page.goto(`${topic}/activity`);
  await page.evaluate(async () => {
    await fetch("/api/session", { method: "POST" });
  });
  await page.goto(`${topic}/activity`);
  await expect(page.getByRole("radio").first()).toBeVisible();
  await page
    .getByRole("button", { name: "Submit activity", exact: true })
    .click();
  await page.getByRole("button", { name: /Submit anyway/ }).click();
  await page
    .getByRole("dialog", { name: "Try another attempt" })
    .getByRole("button", { name: "Review answers" })
    .click();
  await page.goto(topic);
  const stale = await context.newPage();
  try {
    await stale.goto(topic);
    await expect(
      stale.getByRole("button", { name: "Retry", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("radio").nth(1).check();
    await expect(
      page.getByText("Saved on server", { exact: true }),
    ).toBeVisible();
    await stale
      .getByRole("button", { name: "Retry", exact: true })
      .or(stale.getByRole("link", { name: "Continue activity", exact: true }))
      .click();
    await expect(stale.getByRole("radio").nth(1)).toBeChecked();
  } finally {
    await stale.close();
  }
});
