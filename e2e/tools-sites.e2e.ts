import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { localOnly, path } from './support';

test('tools list/grid persists and filters', async ({ app, browser }) => {
  await localOnly(app.baseUrl, browser, 'public');
  await browser.setViewport({ width: 1280, height: 800 });
  await browser.goto('/tools/', { waitUntil: 'networkidle' });
  await browser.locator('[data-view-attribute="data-tools-view"] [data-view-set="grid"]').tap();
  await expect(browser.locator('html')).toHaveAttribute('data-tools-view', 'grid');
  await browser.reload();
  await expect(browser.locator('html')).toHaveAttribute('data-tools-view', 'grid');
  await browser.locator('[data-view-attribute="data-tools-view"] [data-view-set="list"]').tap();
  await browser.locator('#filter-verdict').selectOption({ index: 1 });
  expect(new URL(await browser.url()).searchParams.has('verdict')).toBe(true);
  await browser.locator('#filter-category').selectOption({ index: 1 });
  expect(new URL(await browser.url()).searchParams.has('category')).toBe(true);
});

test('tool category and verdict routes link from a detail', async ({ app, browser }) => {
  await localOnly(app.baseUrl, browser, 'public');
  await app.open('/tools/agent-browser/');
  await expect(browser.locator('h1.page-title--entry')).toBeVisible();
  const category = await browser.locator('a[href^="/tools/category/"]').first().getAttribute('href');
  const verdict = await browser.locator('a[href^="/tools/verdict/"]').first().getAttribute('href');
  expect(category).toBeTruthy();
  expect(verdict).toBeTruthy();
  await browser.goto(category!);
  await expect(browser.locator('h1')).toBeVisible();
  await browser.goto(verdict!);
  await expect(browser.locator('h1')).toBeVisible();
});

test('agent filters tools and reads a detail', async ({ app, browser, agent }) => {
  await localOnly(app.baseUrl, browser, 'public');
  await app.open('/tools/');
  await agent.act('Filter tools to the Using verdict and open one matching tool. Stay on this site.');
  await expect(browser.locator('[data-detail-panel][data-open] #detail-panel-title, main [data-detail-title]')).toBeVisible();
});

test('sites grid/list, collection, panel, domain, and detail', async ({ app, browser }) => {
  await localOnly(app.baseUrl, browser, 'public');
  await browser.setViewport({ width: 1280, height: 800 });
  await browser.goto('/sites/', { waitUntil: 'networkidle' });
  await browser.locator('[data-view-set="list"]').tap();
  await expect(browser.locator('html')).toHaveAttribute('data-sites-view', 'list');
  await browser.locator('[data-view-set="grid"]').tap();
  await browser.goto('/sites/collection/portfolios/');
  await expect(browser.locator('h1')).toBeVisible();
  await browser.goto('/sites/', { waitUntil: 'networkidle' });
  await browser.locator('[data-view-set="list"]').tap();
  await browser.locator('[data-sites-list] a[data-panel-open]:visible').first().tap();
  await expect(browser.locator('[data-detail-panel][data-open]')).toBeVisible();
  await browser.locator('[data-panel-close]').tap();
  await expect(browser.locator('[data-detail-panel]')).toBeHidden();
  await browser.goto('/sites/about-brian-lovin/');
  await expect(browser.locator('h1.page-title--entry')).toBeVisible();
  await expect(browser.locator('[data-shot-actions]')).toBeVisible();
  await browser.locator('a[href^="/sites/domain/"]').first().tap();
  expect(await path(browser)).toMatch(/^\/sites\/domain\//);
});

test('agent finds a site in a collection and opens its detail', async ({ app, browser, agent }) => {
  await localOnly(app.baseUrl, browser, 'public');
  await app.open('/sites/');
  await agent.act('Open a collection of saved sites, then open one site in that collection. Stay on this site.');
  await expect(browser.locator('[data-detail-panel][data-open] #detail-panel-title, main [data-detail-title]')).toBeVisible();
});
