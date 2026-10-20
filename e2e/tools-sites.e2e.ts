import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { localOnly } from './support';

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
  await browser.goto('/tools/', { waitUntil: 'networkidle' });
  const detail = await browser.locator('a[data-panel-open]:visible').first().getAttribute('href');
  expect(detail).toBeTruthy();
  await browser.goto(detail!);
  await expect(browser.locator('h1.page-title--entry')).toBeVisible();
  const category = await browser.locator('a[href*="/tools/category/"]').first().getAttribute('href');
  const verdict = await browser.locator('a[href*="/tools/verdict/"]').first().getAttribute('href');
  expect(category).toBeTruthy();
  expect(verdict).toBeTruthy();
  await browser.goto(category!);
  await expect(browser.locator('h1')).toBeVisible();
  await browser.goto(verdict!);
  await expect(browser.locator('h1')).toBeVisible();
});

test('agent filters tools and reads a detail', async ({ app, browser, agent }) => {
  await localOnly(app.baseUrl, browser, 'public');
  await browser.goto('/tools/', { waitUntil: 'networkidle' });
  await agent.act('Filter tools to the Using verdict. Stay on this site.');
  await expect(browser).toHaveURL(/[?&]verdict=using(?:&|$)/);
  await agent.assert('The tools list is filtered to the Using verdict.');
  await agent.act('Open one tool from the filtered list. Stay on this site.');
  await expect(browser.locator('[data-detail-panel][data-open] #detail-panel-title, main [data-detail-title]')).toBeVisible();
  await agent.assert('The opened tool has a Using verdict.');
});

test('sites grid/list, collection, panel, domain, and detail', async ({ app, browser }) => {
  await localOnly(app.baseUrl, browser, 'public');
  await browser.setViewport({ width: 1280, height: 800 });
  await browser.goto('/sites/', { waitUntil: 'networkidle' });
  await browser.locator('[data-view-set="list"]').tap();
  await expect(browser.locator('html')).toHaveAttribute('data-sites-view', 'list');
  await browser.locator('[data-view-set="grid"]').tap();
  const collection = await browser.locator('a[href*="/sites/collection/"]:visible').first().getAttribute('href');
  expect(collection).toBeTruthy();
  await browser.goto(collection!);
  await expect(browser.locator('h1')).toBeVisible();
  await browser.goto('/sites/', { waitUntil: 'networkidle' });
  await browser.evaluate(async () => {
    const pageScript = [...document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')]
      .find((script) => /\/_astro\/page\./.test(script.src));
    if (!pageScript) throw new Error('Sites page script missing');
    await import(pageScript.src);
    return true;
  });
  await browser.locator('[data-view-set="list"]').tap();
  await browser.locator('[data-sites-list] a[data-panel-open]:visible').first().tap();
  await expect(browser.locator('[data-detail-panel][data-open]')).toBeVisible();
  await browser.locator('[data-panel-close]').tap();
  await expect(browser.locator('[data-detail-panel]')).toBeHidden();
  await browser.goto('/sites/', { waitUntil: 'networkidle' });
  const detail = await browser.locator('a[data-panel-open]:visible').first().getAttribute('href');
  expect(detail).toBeTruthy();
  await browser.goto(detail!);
  await expect(browser.locator('h1.page-title--entry')).toBeVisible();
  await expect(browser.locator('[data-shot-actions]')).toBeVisible();
  await browser.locator('a[href*="/sites/domain/"]').first().tap();
  await expect(browser).toHaveURL(/\/sites\/domain\/[^/]+\/?$/);
});

test('agent finds a site in a collection and opens its detail', async ({ app, browser, agent }) => {
  await localOnly(app.baseUrl, browser, 'public');
  await browser.goto('/sites/', { waitUntil: 'networkidle' });
  await agent.act('Open any named collection of saved sites. Stay on this site.');
  await expect(browser).toHaveURL(/\/sites\/collection\/[^/]+\/?$/);
  await agent.assert('This page shows a named collection of saved sites.');
  await agent.act('Open one saved site from this collection. Stay on this site.');
  await expect(browser.locator('[data-detail-panel][data-open] #detail-panel-title, main [data-detail-title]')).toBeVisible();
});
