import { test, expect } from '@playwright/test';

test('recovers newer edits across reload and presents them after the earlier conflict', async ({ page }) => {
  const questions = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, prompt: `Question ${i}`, choices: [{ id: 'a', text: 'Alpha' }, { id: 'b', text: 'Beta' }] }));
  const server = { answers: { q0: 'b' }, workRevision: 1 };
  const candidate = { answers: { q0: 'a' }, workRevision: 0 };
  let conflict: unknown = null;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let saves = 0;
  let resolutions = 0;
  await page.route('**/api/topics/*/quiz', route => route.fulfill({ json: { learnerId: 'newer-test', quiz: { title: 'Quiz', revision: 1, questions }, draft: { answers: {}, workRevision: 0 }, progress: {}, conflict } }));
  await page.route('**/api/topics/*/quiz/draft', async route => {
    saves++;
    const body = route.request().postDataJSON();
    if (saves === 1) {
      conflict = { kind: 'conflict', conflictId: 'first', server, candidate };
      await held;
    } else {
      expect(body.answers).toEqual({ q0: 'a', q1: 'b' });
      conflict = { kind: 'conflict', conflictId: 'newer', server: { ...server, workRevision: 2 }, candidate: { answers: body.answers, workRevision: body.baseRevision } };
    }
    await route.fulfill({ json: conflict });
  });
  await page.route('**/api/topics/*/quiz/draft/resolve', async route => {
    resolutions++;
    conflict = null;
    await route.fulfill({ json: { kind: 'saved', workRevision: resolutions + 1, nextConflict: null } });
  });
  await page.goto('/topics/getting-started-with-cangjie/activity');
  try {
    await page.locator('input[name="q-q0"][value="a"]').check();
    await expect.poll(() => saves).toBe(1);
    await page.locator('input[name="q-q1"][value="b"]').check();
  } finally { release(); }
  await expect(page.getByRole('heading', { name: 'Choose which answers to keep' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Choose which answers to keep' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep saved answers' }).click();
  await expect(page.getByText('Question 1: Beta')).toBeVisible();
  expect(resolutions).toBe(1);
  await page.getByRole('button', { name: 'Keep my answers' }).click();
  await expect(page.getByText('Draft choice saved')).toBeVisible();
  expect(resolutions).toBe(2);
});
