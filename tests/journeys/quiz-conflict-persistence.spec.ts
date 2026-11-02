import { test, expect } from "@playwright/test";
import pg from "pg";
import { LEARNER } from "../../modules/learner-account/adapters/development-session.ts";

test("advances two real persisted conflicts and restores the chosen draft", async ({
  page,
}) => {
  const topic = "getting-started-with-cangjie";
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw new Error("A dedicated test database is required.");
  const pool = new pg.Pool({ connectionString: url });
  try {
    await pool.query(
      "DELETE FROM quiz_draft_conflicts WHERE learner_id=$1 AND topic_id=$2",
      [LEARNER, topic],
    );
    await pool.query(
      "DELETE FROM quiz_drafts WHERE learner_id=$1 AND topic_id=$2",
      [LEARNER, topic],
    );
  } finally {
    await pool.end();
  }
  await page.goto(`/topics/${topic}/activity`);
  await page
    .getByRole("button", { name: "Open development workspace" })
    .click();
  await expect(page.locator("input[type=radio]").first()).toBeVisible();
  const setup = await page.evaluate(async (topic) => {
    const endpoint = `/api/topics/${topic}/quiz`;
    const ws = await (await fetch(endpoint)).json();
    const [one, two] = ws.quiz.questions;
    const put = async (answers: Record<string, string>) => {
      const response = await fetch(`${endpoint}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseRevision: ws.draft.workRevision, answers }),
      });
      if (!response.ok) throw new Error(`Save failed: ${response.status}`);
      return response.json();
    };
    const original = { [one.id]: one.choices[0].id };
    await put(original);
    const first = await put({ [one.id]: one.choices[1].id });
    const second = await put({ [two.id]: two.choices[1].id });
    return { original, kinds: [first.kind, second.kind] };
  }, topic);
  expect(setup.kinds).toEqual(["conflict", "conflict"]);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Choose which answers to keep" }),
  ).toBeVisible();
  const resolve = () =>
    page.getByRole("button", { name: "Keep saved answers" }).click();
  const response = page.waitForResponse((r) =>
    r.url().endsWith("/draft/resolve"),
  );
  await resolve();
  expect((await (await response).json()).nextConflict).toBeTruthy();
  await expect(
    page.getByRole("button", { name: "Keep saved answers" }),
  ).toBeEnabled();
  await resolve();
  await expect(page.getByText("Draft choice saved")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Choose which answers to keep" }),
  ).toHaveCount(0);
  const [id, value] = Object.entries(setup.original)[0];
  await expect(
    page.locator(`input[name="q-${id}"][value="${value}"]`),
  ).toBeChecked();
});
