import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { localOnly, path } from './support';

test('library kind, tag, and domain filters lead to an entry', async ({ app, browser }) => {
  await localOnly(app.baseUrl, browser, 'public');
  await app.open('/library/');
  await expect(browser.locator('[data-view=""]')).toBeVisible();
  await browser.locator('a[data-kind-set="article"]:visible').first().tap();
  expect(await path(browser)).toMatch(/\/library\/kind\/article\/?$/);
  await browser.locator('details.ltags__box:visible > summary').first().tap();
  await browser.locator('label.ltags__tag:visible').first().tap();
  expect(new URL(await browser.url()).searchParams.has('tags')).toBe(true);
  await browser.goto('/library/');
  const entry = browser.locator('nav[data-pane] [data-rows] a').first();
  await entry.tap();
  expect(await path(browser)).toMatch(/^\/library\/[^/]+\/?$/);
  await expect(browser.locator('h1.page-title--entry')).toBeVisible();
  const domain = browser.locator('a[href^="/library/domain/"]:visible').first();
  if (await domain.count()) await domain.tap();
  else await browser.goto('/library/domain/x-com/');
  expect(await path(browser)).toMatch(/^\/library\/domain\//);
});

test('library search narrows the list at phone width', async ({ app, browser }) => {
  await localOnly(app.baseUrl, browser, 'public');
  await browser.setViewport({ width: 375, height: 812 });
  await app.open('/library/');
  const count = browser.locator('[data-filter-count]:visible').first();
  const before = await count.textContent();
  await browser.locator('input[data-filter-q]:visible').first().fill('a phrase with no matches qzxqzx');
  await expect(count).toContainText('0 entries');
  await expect(browser.locator('[data-filter-empty]:visible').first()).toBeVisible();
  await browser.locator('input[data-filter-q]:visible').first().fill('');
  await expect(count).toHaveText(before ?? '');
});

test('agent finds articles, then opens one detail', async ({ app, browser, agent }) => {
  await localOnly(app.baseUrl, browser, 'public');
  await app.open('/library/');
  await agent.act('Use the Articles kind filter in the library. Stay on this site.');
  expect(await path(browser)).toMatch(/\/library\/kind\/article\/?$/);
  await browser.locator('nav[data-pane] [data-rows] > li:not([hidden]) > a').first().tap();
  expect(await path(browser)).toMatch(/^\/library\/[^/]+\/?$/);
  await expect(browser.locator('h1.page-title--entry')).toBeVisible();
});
