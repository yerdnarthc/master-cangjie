import { test, expect, type Page } from '@playwright/test';
import { resetMilestone } from './reset.ts';

test.beforeEach(async () => { await resetMilestone(); });

async function plainTextEditor(page: Page) {
  const toggle = page.getByRole('button', { name: 'Use plain text editor', exact: true });
  const plainTextToggle = page.getByRole('button', { name: 'Use code editor', exact: true });
  await expect(toggle.or(plainTextToggle)).toBeVisible();
  if (await toggle.isVisible()) await toggle.click();
  await expect(plainTextToggle).toBeVisible();
  const editor = page.locator('textarea[aria-label="Cangjie source"]');
  await expect(editor).toBeVisible();
  return editor;
}

async function openWorkspace(page: Page) {
  await page.goto('/topics/running-the-first-cangjie-program/activity');
  const login = page.getByRole('button', { name: 'Open development workspace' });
  await expect(login.or(page.getByRole('heading', { name: 'Hello, World!', exact: true }))).toBeVisible();
  if (await login.isVisible()) await login.click();
  await expect(page.getByRole('heading', { name: 'Hello, World!', exact: true })).toBeVisible();
  return plainTextEditor(page);
}

async function enterCode(page: Page, code: string) {
  const useCodeEditor = page.getByRole('button', { name: 'Use code editor', exact: true });
  if (await useCodeEditor.isVisible()) await useCodeEditor.click();
  const editor = page.locator('.monaco-editor .view-lines');
  await expect(editor).toBeVisible();
  await editor.click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText(code);
}

test('edited code is saved and recovered after a reload', async ({ page }) => {
  const editor = await openWorkspace(page);
  const code = `// saved browser journey\nmain(): Int64 {\n    println("Hello, World!")\n    return 0\n}\n`;
  await editor.fill(code);
  await page.getByRole('button', { name: 'Save code', exact: true }).click();
  await expect(page.getByText('Saved on server', { exact: true })).toBeVisible();
  await page.reload();
  await expect(await plainTextEditor(page)).toHaveValue(code);
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

test('a current tab saves normally and a stale competing tab prompts a conflict', async ({ page, context }) => {
  await openWorkspace(page);
  await enterCode(page, '// Shared saved revision');
  await page.getByRole('button', { name: 'Save code', exact: true }).click();
  await expect(page.getByText('Saved on server', { exact: true })).toBeVisible();
  const second = await context.newPage();
  await openWorkspace(second);
  await enterCode(second, '// New revision from tab B');
  await second.getByRole('button', { name: 'Save code', exact: true }).click();
  await expect(second.getByText('Saved on server', { exact: true })).toBeVisible();
  await expect(second.getByRole('region', { name: 'Draft conflict' })).not.toBeVisible();
  await enterCode(page, '// Competing edit from stale tab A');
  await page.getByRole('button', { name: 'Save code', exact: true }).click();
  const conflict = page.getByRole('region', { name: 'Draft conflict' });
  await expect(conflict).toBeVisible();
  await expect(conflict).toContainText('New revision from tab B');
  await expect(conflict).toContainText('Competing edit from stale tab A');
});

test('choosing my version saves the candidate across a reload', async ({ page, context }) => {
  await openWorkspace(page);
  const second = await context.newPage();
  await openWorkspace(second);

  await enterCode(page, '// Saved server version');
  await page.getByRole('button', { name: 'Save code', exact: true }).click();
  await expect(page.getByText('Saved on server', { exact: true })).toBeVisible();

  const candidate = '// Chosen candidate version';
  await enterCode(second, candidate);
  await second.getByRole('button', { name: 'Save code', exact: true }).click();
  const conflict = second.getByRole('region', { name: 'Draft conflict' });
  await expect(conflict).toBeVisible();
  await second.getByRole('button', { name: 'Keep my version' }).click();
  await expect(conflict).not.toBeVisible();
  await expect(second.getByText('Saved on server', { exact: true })).toBeVisible();

  await second.reload();
  await expect(await plainTextEditor(second)).toHaveValue(candidate);
});

test('competing tabs preserve both versions and newer edits through conflict resolution', async ({ page, context }) => {
  await openWorkspace(page);
  const second = await context.newPage();
  await openWorkspace(second);
  const firstCode = '// First tab';
  const secondCode = '// Second tab';
  const newerLocalCode = '// Edit made while the conflict is open';
  await enterCode(page, firstCode);
  await page.getByRole('button', { name: 'Save code', exact: true }).click();
  await expect(page.getByText('Saved on server', { exact: true })).toBeVisible();
  await enterCode(second, secondCode);
  await second.getByRole('button', { name: 'Save code', exact: true }).click();
  const conflict = second.getByRole('region', { name: 'Draft conflict' });
  await expect(conflict).toBeVisible();
  await expect(conflict).toContainText('First tab');
  await expect(conflict).toContainText('Second tab');
  const changedCandidateCode = '// Candidate from tab B (CHANGED)';
  await enterCode(second, changedCandidateCode);
  await expect(conflict.locator('pre').nth(1)).toHaveText(changedCandidateCode);

  let resolveStarted!: () => void;
  let releaseResolve!: () => void;
  const resolutionStarted = new Promise<void>((resolve) => { resolveStarted = resolve; });
  const resolutionGate = new Promise<void>((resolve) => { releaseResolve = resolve; });
  await second.route('**/api/drafts/resolve', async (route) => {
    resolveStarted();
    await resolutionGate;
    await route.continue();
  });

  await second.getByRole('button', { name: 'Keep my version' }).click();
  await resolutionStarted;
  await enterCode(second, newerLocalCode);

  const laterSave = await page.evaluate(async () => {
    const response = await fetch('/api/drafts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problemId: 'hello-world', source: '// Later server version', baseRevision: 1 }),
    });
    return { status: response.status, body: await response.json() };
  });
  expect(laterSave).toEqual({ status: 200, body: { kind: 'saved', workRevision: 2 } });

  releaseResolve();
  await expect(conflict).toBeVisible();
  await expect(conflict).toContainText('Later server version');
  await expect(conflict).toContainText('Edit made while the conflict is open');
  await second.getByRole('button', { name: 'Keep my version' }).click();
  await expect(conflict).not.toBeVisible();
  await expect(second.locator('.monaco-editor')).toContainText('Edit made while the conflict is open');
  await expect.poll(async () => second.evaluate(async () => {
    const response = await fetch('/api/topics/running-the-first-cangjie-program/coding');
    return (await response.json()).draft.source as string;
  })).toBe(newerLocalCode);
  await second.reload();
  await expect(second.locator('.monaco-editor')).toContainText('Edit made while the conflict is open');
  const restoredSource = await second.evaluate(async () => {
    const response = await fetch('/api/topics/running-the-first-cangjie-program/coding');
    return (await response.json()).draft.source as string;
  });
  expect(restoredSource).toBe(newerLocalCode);
});
