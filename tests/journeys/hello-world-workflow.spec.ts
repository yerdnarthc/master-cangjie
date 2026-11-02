import { test, expect } from '@playwright/test';
import { resetMilestone } from './reset.ts';

test.beforeEach(async () => { await resetMilestone(); });

const correct = 'main(): Int64 {\n    println("Hello, World!")\n    return 0\n}\n';

test('untouched starter is reviewed as unattempted and needs zero-point acknowledgement', async ({ page }) => {
  await page.goto('/topics/running-the-first-cangjie-program/activity');
  const login = page.getByRole('button', { name: 'Open development workspace' });
  await expect(login.or(page.getByRole('heading', { name: 'Hello, World!', exact: true }))).toBeVisible();
  if (await login.isVisible()) await login.click();
  await page.getByRole('button', { name: 'Review submission' }).click();
  const review = page.getByRole('region', { name: 'Submission review' });
  await expect(review).toContainText('unattempted and will contribute 0/10');
  await expect(review.getByRole('button', { name: 'Confirm submission' })).toBeDisabled();
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  const afterCancel = await (await page.request.get('/api/workspace')).json();
  expect(afterCancel.progress.bestScore).toBeNull();
  await page.getByRole('button', { name: 'Review submission' }).click();
  await review.getByRole('checkbox').check();
  await review.getByRole('button', { name: 'Confirm submission' }).click();
  const results = page.getByRole('region', { name: 'Evaluation results' });
  await expect(results).toContainText('0/10', { timeout: 90000 });
  await expect(page.getByText('Topic not yet complete', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Next: Identifiers' })).not.toBeVisible();
});

test('run, validate, submit and restore the retained completion', async ({ page }) => {
  await page.goto('/topics/running-the-first-cangjie-program/activity');
  const login = page.getByRole('button', { name: 'Open development workspace' });
  await expect(login.or(page.getByRole('heading', { name: 'Hello, World!', exact: true }))).toBeVisible();
  if (await login.isVisible()) await login.click();
  await expect(page.getByRole('heading', { name: 'Hello, World!', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use plain text editor' }).click();
  await page.getByRole('textbox', { name: 'Cangjie source' }).fill(correct);
  await page.getByRole('button', { name: 'Save code', exact: true }).click();
  await expect(page.getByText('Saved on server', { exact: true })).toBeVisible();
  const before = await (await page.request.get('/api/workspace')).json();
  await page.getByRole('button', { name: 'Run test', exact: true }).click();
  const results = page.getByRole('region', { name: 'Evaluation results' });
  await expect(results).toContainText('Individual test run');
  await expect(results).toContainText('Result confirmed.', { timeout: 90000 });
  await expect(results).toContainText('case-01: pass');
  const afterRun = await (await page.request.get('/api/workspace')).json();
  expect(afterRun.progress).toEqual(before.progress);

  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(results).toContainText('Batch validation');
  await expect(results).toContainText('Result confirmed.', { timeout: 90000 });
  await expect(results).toContainText('10/10');
  const afterValidation = await (await page.request.get('/api/workspace')).json();
  expect(afterValidation.progress.completed).toBe(before.progress.completed);

  await page.getByRole('button', { name: 'Review submission' }).click();
  const review = page.getByRole('region', { name: 'Submission review' });
  await expect(review).toContainText('Hello, World!');
  await review.getByRole('button', { name: 'Confirm submission' }).click();
  await expect(results).toContainText('Topic submission');
  await expect(results).toContainText('Result confirmed.', { timeout: 90000 });
  await expect(page.getByText('Topic complete', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Next: Identifiers' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Topic complete', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Next: Identifiers' })).toBeVisible();

  await page.getByRole('button', { name: 'Use plain text editor' }).click();
  await page.getByRole('textbox', { name: 'Cangjie source' }).fill('main(): Int64 {\n    println("Wrong greeting")\n    return 0\n}\n');
  await page.getByRole('button', { name: 'Save code', exact: true }).click();
  await expect(page.getByText('Saved on server', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review submission' }).click();
  await page.getByRole('region', { name: 'Submission review' }).getByRole('button', { name: 'Confirm submission' }).click();
  await expect(results).toContainText('0/10', { timeout: 90000 });
  const retained = await (await page.request.get('/api/workspace')).json();
  expect(retained.progress.bestScore).toEqual({ earned: 10, possible: 10 });
  expect(retained.progress.completed).toBe(true);
  expect(retained.progress.nextTopicAvailable).toBe(true);
});

test('a formatting mismatch is explained and does not erase prior progress', async ({ page }) => {
  await page.goto('/topics/running-the-first-cangjie-program/activity');
  const login = page.getByRole('button', { name: 'Open development workspace' });
  await expect(login.or(page.getByRole('heading', { name: 'Hello, World!', exact: true }))).toBeVisible();
  if (await login.isVisible()) await login.click();
  await expect(page.getByRole('heading', { name: 'Hello, World!', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use plain text editor' }).click();
  await page.getByRole('textbox', { name: 'Cangjie source' }).fill('main(): Int64 {\n    print("Hello, World!")\n    return 0\n}\n');
  await page.getByRole('button', { name: 'Save code', exact: true }).click();
  await expect(page.getByText('Saved on server', { exact: true })).toBeVisible();
  const before = await (await page.request.get('/api/workspace')).json();
  await page.getByRole('button', { name: 'Run test', exact: true }).click();
  const results = page.getByRole('region', { name: 'Evaluation results' });
  await expect(results).toContainText('Result confirmed.', { timeout: 90000 });
  await expect(results.getByRole('heading', { name: /case-01:.*format/i })).toBeVisible();
  await expect(results.getByRole('heading', { name: 'Expected output' })).toBeVisible();
  await expect(results.getByRole('heading', { name: 'Actual output' })).toBeVisible();
  const after = await (await page.request.get('/api/workspace')).json();
  expect(after.progress).toEqual(before.progress);
});
