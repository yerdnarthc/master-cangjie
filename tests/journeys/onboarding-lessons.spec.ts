import { test, expect } from '@playwright/test';
import { resetMilestone, resetLearnerToStart } from './reset.ts';
const first = '/topics/getting-started-with-cangjie';

test.beforeEach(async ({ page }) => {
  await resetMilestone();
  await resetLearnerToStart();
  await page.goto('/');
  const session = await page.evaluate(async () => {
    const response = await fetch('/api/session', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    return { status: response.status, body: await response.json() };
  });
  expect(session.status).toBe(200);
  await page.goto('/');
});

test('reads the first unlocked handout and opens its activity', async ({ page }) => {
  await page.getByRole('link', { name: 'Start the first lesson', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(first + '$'));
  await expect(page.getByRole('heading', { name: 'Meet Cangjie', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Summary', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start multiple-choice activity' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark complete', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Start multiple-choice activity' }).click();
  await expect(page).toHaveURL(/getting-started-with-cangjie\/activity$/);
  await expect(page.getByRole('button', { name: 'Submit activity' })).toBeVisible();
});

test('lesson navigation works on a small screen without making activity requests', async ({ page }) => {
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/')) {
      mutations.push(request.url());
    }
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(first);
  await page.getByRole('navigation', { name: 'On this page', exact: true }).getByRole('link', { name: 'Summary', exact: true }).click();
  await expect(page).toHaveURL(/#summary$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Summary', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(mutations).toEqual([]);
  await expect(page.locator('[aria-current="page"]')).toHaveText('Getting Started with Cangjie');
});

test('locked topics hide handouts and activities on the roadmap and direct routes', async ({ page }) => {
  const roadmapHtml = await page.content();
  expect(roadmapHtml).not.toContain('cjc -v');
  expect(roadmapHtml).not.toContain('Choose an SDK');
  const installationCard = page.locator('.topic-list li').filter({
    has: page.getByRole('heading', { name: 'Installing the Cangjie Toolchain', exact: true }),
  });
  await expect(installationCard).toContainText('Locked');
  await expect(installationCard).toContainText('Complete Getting Started with Cangjie to unlock this topic.');
  await expect(installationCard.getByRole('link')).toHaveCount(0);
  await expect(page.getByText('cjc -v', { exact: false })).toHaveCount(0);
  await expect(installationCard).not.toContainText('Multiple-choice activity available');

  const lockedLesson = await page.goto('/topics/installing-the-cangjie-toolchain');
  expect(lockedLesson?.status()).toBe(200);
  const lockedLessonHtml = await lockedLesson?.text();
  expect(lockedLessonHtml).not.toContain('cjc -v');
  expect(lockedLessonHtml).not.toContain('Choose an SDK');
  await expect(page.getByRole('heading', { name: 'Installing the Cangjie Toolchain', exact: true })).toBeVisible();
  await expect(page.getByText('Complete Getting Started with Cangjie to unlock this topic.')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Lesson handout' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Start multiple-choice activity' })).toHaveCount(0);
  await expect(page.getByText('cjc -v', { exact: false })).toHaveCount(0);

  const apiRequests: string[] = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/api/topics/identifiers/')) apiRequests.push(pathname);
  });
  const lockedActivity = await page.goto('/topics/identifiers/activity');
  expect(lockedActivity?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Identifiers', exact: true })).toBeVisible();
  await expect(page.getByText('Complete Running the First Cangjie Program to unlock this topic.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit activity' })).toHaveCount(0);
  await expect(page.getByText('Question 1', { exact: false })).toHaveCount(0);
  expect(apiRequests).toEqual([]);
});

test('unknown topic routes remain not found', async ({ page }) => {
  expect((await page.goto('/topics/not-a-topic'))?.status()).toBe(404);
});
