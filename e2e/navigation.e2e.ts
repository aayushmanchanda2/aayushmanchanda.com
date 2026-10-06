import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { localOnly, path } from './support';

test('home and mobile navigation open and close at 375px', async ({ app, browser }) => {
  await localOnly(app.baseUrl, browser, 'public');
  await browser.setViewport({ width: 375, height: 812 });
  await app.open('/');
  await expect(browser.locator('main')).toBeVisible();
  await browser.locator('[data-mnav-toggle]').tap();
  await expect(browser.locator('[data-mnav-panel]')).toHaveAttribute('data-open', '');
  await browser.locator('[data-mnav-close]').tap();
  await expect(browser.locator('[data-mnav-panel]')).toBeHidden();
});

test('theme toggle persists across navigation', async ({ app, browser }) => {
  await localOnly(app.baseUrl, browser, 'public');
  await app.open('/');
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
    await app.open('/');
    await browser.keyboard.press(shortcut);
    await expect(browser.locator('[data-palette]')).toHaveAttribute('data-open', '');
    await browser.locator('[data-palette-input]').fill('Tools');
    await expect(browser.locator('[data-palette-row]').first()).toBeVisible();
    await browser.keyboard.press('Escape');
    await expect(browser.locator('[data-palette]')).toBeHidden();
    await browser.keyboard.press(shortcut);
    await browser.locator('[data-palette-input]').fill('Tools');
    await browser.locator('[data-palette-row][href="/tools"]').first().tap();
    expect(await path(browser)).toMatch(/^\/tools\/?$/);
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
  await expect(browser.locator('a.mailto')).toHaveAttribute('href', /^mailto:aayushmanchanda2@gmail\.com\?subject=Hello%20from%20aayushmanchanda\.com/);
  expect(await browser.locator('form').count()).toBe(0);
});

test('404 recovery page and unknown URL', async ({ app, browser }) => {
  await localOnly(app.baseUrl, browser, 'public');
  await app.open('/404.html');
  await expect(browser.locator('h1')).toContainText(/nothing here/i);
  await expect(browser.locator('nav.ways a[href="/tools"]')).toBeVisible();
  const response = await fetch(new URL('/this-route-does-not-exist/', app.baseUrl));
  expect(response.status).toBe(404);
});

test('machine endpoints respond with content', async ({ app, browser }) => {
  await localOnly(app.baseUrl, browser, 'public');
  for (const endpoint of ['/rss.xml', '/llms.txt', '/search.json', '/robots.txt']) {
    const response = await fetch(new URL(endpoint, app.baseUrl));
    expect(response.status).toBe(200);
    expect((await response.text()).length).toBeGreaterThan(10);
  }
});
