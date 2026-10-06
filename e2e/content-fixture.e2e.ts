import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { chromium } from 'playwright';
import { localOnly, path } from './support';

test('notes list opens a note and a tip', async ({ app, browser }) => {
  await localOnly(app.baseUrl, browser, 'public');
  await app.open('/notes/');
  await expect(browser.locator('h1')).toContainText('Notes');
  const note = await browser.locator('section:not(:has(#how-i-work)) a[href^="/notes/"]').first().getAttribute('href');
  const tip = await browser.locator('#how-i-work + .list a[href^="/notes/"]').first().getAttribute('href');
  expect(note).toBeTruthy();
  expect(tip).toBeTruthy();
  await browser.goto(note!);
  await expect(browser.locator('article.note .prose')).toBeVisible();
  await browser.goto(tip!);
  await expect(browser.locator('h1')).toBeVisible();
});

test('experiments index has dated rows', async ({ app, browser }) => {
  await localOnly(app.baseUrl, browser, 'public');
  await app.open('/experiments/');
  await expect(browser.locator('h1')).toContainText('Experiments');
  expect(await browser.locator('li.row[data-status] time').count()).toBeGreaterThan(0);
});

test('copy button confirms the copied value', async ({ app, browser }) => {
  await localOnly(app.baseUrl, browser, 'public');
  const ownBrowser = await chromium.launch();
  try {
    const context = await ownBrowser.newContext();
    const origin = new URL(app.baseUrl!).origin;
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(new URL('/design/', origin).href, { waitUntil: 'networkidle' });
    const button = page.locator('button[data-copy]:visible').first();
    const value = await button.getAttribute('data-copy');
    expect(value).toBeTruthy();
    await button.click();
    await button.locator('[data-copy-label]').getByText('copied', { exact: true }).waitFor();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(value!);
  } finally {
    await ownBrowser.close();
  }
});

for (const view of ['entry', 'post', 'video', 'index', 'sign-in', 'unconfigured', 'not-found']) {
  test(`/me fixture ${view} renders from synthetic rows`, async ({ app, browser }) => {
    await localOnly(app.baseUrl, browser, 'fixture');
    await app.open(`/me/fixture/${view}`);
    expect(await path(browser)).toBe(`/me/fixture/${view}`);
    await expect(browser.locator('main h1:visible').first()).toBeVisible();
    if (view === 'entry') await expect(browser.locator('main h1:visible').first()).toContainText('made-up essay');
    if (view === 'post') await expect(browser.locator('main h1:visible').first()).toContainText('invented post');
    if (view === 'video') await expect(browser.locator('main h1:visible').first()).toContainText('invented talk');
    if (view === 'index') await expect(browser.locator('main a[href*="fixture"]:visible').first()).toBeVisible();
    if (view === 'sign-in') await expect(browser.locator('.gate > h1')).toContainText('Private');
    if (view === 'unconfigured') await expect(browser.locator('body')).toContainText('Not configured');
    if (view === 'not-found') await expect(browser.locator('.gate > h1')).toContainText('Not found');
  });
}
