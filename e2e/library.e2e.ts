import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { localOnly } from './support';

test('library kind, tag, and domain filters lead to an entry', async ({ app, browser }) => {
  await localOnly(app.baseUrl, browser, 'public');
  await browser.goto('/library/', { waitUntil: 'networkidle' });
  await expect(browser.locator('[data-view=""]')).toBeVisible();
  await browser.locator('a[data-kind-set="article"]:visible').first().tap();
  await expect(browser).toHaveURL(/\/library\/kind\/article\/?$/);
  const before = await browser.locator('nav[data-pane] [data-rows] > li[data-tags]:visible').count();
  await browser.locator('details.ltags__box:visible > summary').first().tap();
  await browser.locator('label.ltags__tag:visible').first().tap();
  await expect(browser).toHaveURL(/[?&]tags=/);
  expect(await browser.locator('nav[data-pane] [data-rows] > li[data-tags]:visible').count()).toBeLessThan(before);
  await browser.goto('/library/', { waitUntil: 'networkidle' });
  const entry = browser.locator('nav[data-pane] [data-rows] a').first();
  await entry.tap();
  await expect(browser).toHaveURL(/\/library\/[^/]+\/?(?:\?.*)?$/);
  await expect(browser.locator('h1.page-title--entry')).toBeVisible();
  await browser.goto('/library/', { waitUntil: 'networkidle' });
  const withDomain = await browser.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLAnchorElement>('nav[data-pane] [data-rows] li[data-kind] > a')];
    const domain = (row: HTMLAnchorElement) => row.querySelector('small span')?.textContent?.trim() ?? '';
    return rows.find((row) => domain(row) && rows.some((other) => other !== row && domain(other) === domain(row)))?.href ?? null;
  });
  expect(withDomain).toBeTruthy();
  await browser.goto(withDomain!);
  const domain = browser.locator('a[href*="/library/domain/"]:visible').first();
  await expect(domain).toBeVisible();
  await domain.tap();
  await expect(browser).toHaveURL(/\/library\/domain\/[^/]+\/?$/);
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
  await expect(browser).toHaveURL(/\/library\/kind\/article\/?$/);
  await browser.locator('nav[data-pane] [data-rows] > li:not([hidden]) > a').first().tap();
  await expect(browser).toHaveURL(/\/library\/[^/]+\/?(?:\?.*)?$/);
  await expect(browser.locator('h1.page-title--entry')).toBeVisible();
});

for (const kind of ['post', 'video'] as const) {
  test(`library ${kind} view renders entries`, async ({ app, browser }) => {
    await localOnly(app.baseUrl, browser, 'public');
    await browser.goto('/library/', { waitUntil: 'networkidle' });
    await browser.locator(`a[data-kind-set="${kind}"]:visible`).first().tap();
    await expect(browser).toHaveURL(new RegExp(`/library/kind/${kind}/?$`));
    await expect(browser.locator(`[data-view="${kind}"]`)).toBeVisible();
    expect(await browser.locator(`[data-view="${kind}"] a[href*="/library/"]`).count()).toBeGreaterThan(0);
  });
}

test('library Articles view shows an inline detail', async ({ app, browser }) => {
  await localOnly(app.baseUrl, browser, 'public');
  await browser.goto('/library/', { waitUntil: 'networkidle' });
  await browser.locator('a[data-kind-set="article"]:visible').first().tap();
  await expect(browser).toHaveURL(/\/library\/kind\/article\/?$/);
  await expect(browser.locator('[data-view="article"] .view__reader h2.page-title--entry')).toBeVisible();
});
