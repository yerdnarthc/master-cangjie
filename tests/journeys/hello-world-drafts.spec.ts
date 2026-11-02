import { test, expect, type Page } from '@playwright/test';
import { resetMilestone } from './reset.ts';

test.beforeEach(async () => { await resetMilestone(); });

async function openWorkspace(page: Page) {
  await page.goto('/topics/running-the-first-cangjie-program/activity');
  const login = page.getByRole('button', { name: 'Open development workspace' });
  await expect(login.or(page.getByRole('heading', { name: 'Hello, World!', exact: true }))).toBeVisible();
  if (await login.isVisible()) await login.click();
  await expect(page.getByRole('heading', { name: 'Hello, World!', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use plain text editor' }).click();
  return page.getByRole('textbox', { name: 'Cangjie source' });
}

test('edited code is saved and recovered after a reload', async ({ page }) => {
  const editor = await openWorkspace(page);
  const code = `// saved browser journey\nmain(): Int64 {\n    println("Hello, World!")\n    return 0\n}\n`;
  await editor.fill(code);
  await page.getByRole('button', { name: 'Save code', exact: true }).click();
  await expect(page.getByText('Saved on server', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Use plain text editor' }).click();
  await expect(page.getByRole('textbox', { name: 'Cangjie source' })).toHaveValue(code);
});

test('offline code survives leaving and is saved after reconnection', async ({ page, context }) => {
  const editor = await openWorkspace(page);
  const code = `// offline browser journey\nmain(): Int64 {\n    println("Hello, World!")\n    return 0\n}\n`;
  await context.setOffline(true);
  await editor.fill(code);
  await expect(page.getByText('Offline · changes kept on this device', { exact: true })).toBeVisible();
  await page.close();
  await context.setOffline(false);
  const reopened = await context.newPage();
  const restored = await openWorkspace(reopened);
  await expect(restored).toHaveValue(code);
  await expect(reopened.getByText('Saved on server', { exact: true })).toBeVisible();
});

test('competing tabs preserve both drafts until the learner chooses', async ({ page, context }) => {
  const editor = await openWorkspace(page);
  const second = await context.newPage();
  const competing = await openWorkspace(second);
  const firstCode = 'main(): Int64 {\n    println("First tab")\n    return 0\n}\n';
  const secondCode = 'main(): Int64 {\n    println("Second tab")\n    return 0\n}\n';
  await editor.fill(firstCode);
  await page.getByRole('button', { name: 'Save code', exact: true }).click();
  await expect(page.getByText('Saved on server', { exact: true })).toBeVisible();
  await competing.fill(secondCode);
  await second.getByRole('button', { name: 'Save code', exact: true }).click();
  const conflict = second.getByRole('region', { name: 'Draft conflict' });
  await expect(conflict).toBeVisible();
  await expect(conflict).toContainText('First tab');
  await expect(conflict).toContainText('Second tab');
  await second.getByRole('button', { name: 'Keep my version' }).click();
  await expect(competing).toHaveValue(secondCode);
  await expect(conflict).not.toBeVisible();
  await second.reload();
  await second.getByRole('button', { name: 'Use plain text editor' }).click();
  await expect(second.getByRole('textbox', { name: 'Cangjie source' })).toHaveValue(secondCode);
});
