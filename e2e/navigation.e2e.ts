import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { localOnly } from './support';

test('home and mobile navigation open and close at 375px', async ({ app, browser }) => {
  await localOnly(app.baseUrl, browser, 'public');
  await browser.setViewport({ width: 375, height: 812 });
  await browser.goto('/', { waitUntil: 'networkidle' });
  await expect(browser.locator('main')).toBeVisible();
  await browser.locator('[data-mnav-toggle]').tap();
  await expect(browser.locator('[data-mnav-panel]')).toHaveAttribute('data-open', '');
  await browser.locator('[data-mnav-close]').tap();
  await expect(browser.locator('[data-mnav-panel]')).toBeHidden();
  await browser.locator('[data-mnav-toggle]').tap();
  await browser.keyboard.press('Escape');
  await expect(browser.locator('[data-mnav-panel]')).toBeHidden();
  await browser.locator('[data-mnav-toggle]').tap();
  await browser.locator('[data-mnav-panel] a[href="/tools"]').tap();
  await expect(browser).toHaveURL(/\/tools\/?$/);
});

test('theme toggle persists across navigation', async ({ app, browser }) => {
  await localOnly(app.baseUrl, browser, 'public');
  await browser.goto('/', { waitUntil: 'networkidle' });
  await browser.locator('[data-theme-toggle][data-variant="quiet"]').tap();
  const theme = await browser.evaluate(() => document.documentElement.dataset.theme ?? null);
  expect(['light', 'dark']).toContain(theme);
  await browser.goto('/about/');
  expect(await browser.evaluate(() => document.documentElement.dataset.theme ?? null)).toBe(theme);
});

test('sound toggle persists its pressed state', async ({ app, browser }) => {
  await localOnly(app.baseUrl, browser, 'public');
  await browser.goto('/', { waitUntil: 'networkidle' });
  const toggle = browser.locator('footer [data-sound-toggle]');
  const before = await toggle.getAttribute('aria-pressed');
  await toggle.tap();
  const after = await toggle.getAttribute('aria-pressed');
  expect(after).not.toBe(before);
  await browser.goto('/about/');
  await expect(browser.locator('html')).toHaveAttribute('data-sound', after === 'true' ? 'on' : 'off');
});

for (const shortcut of ['Control+k', 'Meta+k']) {
  test(`search ${shortcut}: type, choose result, and Escape closes`, async ({ app, browser }) => {
    await localOnly(app.baseUrl, browser, 'public');
    await browser.goto('/', { waitUntil: 'networkidle' });
    await browser.keyboard.press(shortcut);
    await expect(browser.locator('[data-palette]')).toHaveAttribute('data-open', '');
    await browser.locator('[data-palette-input]').fill('Tools');
    await expect(browser.locator('[data-palette-row]').first()).toBeVisible();
    await browser.keyboard.press('Escape');
    await expect(browser.locator('[data-palette]')).toBeHidden();
    await browser.keyboard.press(shortcut);
    await browser.locator('[data-palette-input]').fill('Tools');
    if (shortcut === 'Meta+k') {
      await browser.keyboard.press('ArrowDown');
      await browser.keyboard.press('ArrowUp');
      await browser.keyboard.press('Enter');
    } else {
      await browser.locator('[data-palette-row][href="/tools"]').first().tap();
    }
    await expect(browser).toHaveURL(/\/tools\/?$/);
  });
}

test('footer pages render and contact exposes a real mailto without a form', async ({ app, browser }) => {
  await localOnly(app.baseUrl, browser, 'public');
  for (const route of ['/about/', '/now/', '/privacy/', '/design/', '/experiments/']) {
    await browser.goto(route);
    await expect(browser.locator('h1')).toBeVisible();
  }
  await browser.goto('/contact/');
  await expect(browser.locator('h1')).toContainText('Contact');
  const address = ['aayushmanchanda2', 'gmail.com'].join('@');
  const href = await browser.locator('a.mailto').getAttribute('href');
  expect(href?.startsWith(`mailto:${address}?subject=Hello%20from%20aayushmanchanda.com&body=`)).toBe(true);
  expect(await browser.locator('form').count()).toBe(0);
});

test('404 recovery page renders the site fallback', async ({ app, browser }) => {
  await localOnly(app.baseUrl, browser, 'public');
  // Python's server owns unknown URLs locally; Vercel serves this built page for them.
  await app.open('/404.html');
  await expect(browser.locator('h1')).toContainText(/nothing here/i);
  await expect(browser.locator('nav.ways a[href="/tools"]')).toBeVisible();
});

test('machine endpoints return usable content', async ({ app, browser }) => {
  await localOnly(app.baseUrl, browser, 'public');
  const get = async (endpoint: string) => {
    const response = await fetch(new URL(endpoint, app.baseUrl));
    expect(response.status).toBe(200);
    return response.text();
  };
  const search = JSON.parse(await get('/search.json')) as unknown;
  expect(Array.isArray(search)).toBe(true);
  expect((search as unknown[]).length).toBeGreaterThan(0);
  const rss = await get('/rss.xml');
  expect(rss).toMatch(/<rss\b/);
  expect(rss).toMatch(/<item\b/);
  expect(await get('/robots.txt')).toMatch(/Sitemap:/);
  expect(await get('/llms.txt')).toMatch(/^# /);
});
