import { test, expect } from "@playwright/test";
import pg from "pg";
import { LEARNER } from "../../modules/learner-account/adapters/development-session.ts";

test("preserves an answer selected while a real database save response is pending", async ({
  page,
}) => {
  const topic = "getting-started-with-cangjie";
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
  const inputs = page.locator("input[type=radio]");
  await expect(inputs.first()).toBeVisible();
  const first = inputs.first();
  const firstName = await first.getAttribute("name");
  const second = inputs
    .locator(`xpath=following::input[@type="radio" and @name!="${firstName}"]`)
    .first();
  const secondName = await second.getAttribute("name");
  const firstValue = await first.inputValue();
  const secondValue = await second.inputValue();
  try {
    await first.check();
    await expect.poll(() => saves.length).toBe(1);
    await second.check();
    await page.waitForTimeout(1700);
  } finally {
    release();
  }
  await expect.poll(() => saves.length).toBe(2);
  await expect(
    page.getByText("Saved on server", { exact: true }),
  ).toBeVisible();
  expect(saves[1].baseRevision).toBe(saves[0].baseRevision + 1);
  await page.reload();
  await expect(
    page.locator(`input[name="${firstName}"][value="${firstValue}"]`),
  ).toBeChecked();
  await expect(
    page.locator(`input[name="${secondName}"][value="${secondValue}"]`),
  ).toBeChecked();
});
