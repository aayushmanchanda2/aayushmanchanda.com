/**
 * VET-309 clear-filter proof. From the repo root, against a static server of dist/:
 *   node qa/evidence/2026-09-24-vet-309/clear.mjs --base http://localhost:4410
 *
 * At 390 (touch) and 1280: /sites?hue=blue (the on chip's × and Clear), then a
 * press on Clear (URL, grid, status, survives reload); a collection page (its
 * chip on with a ×, Clear to /sites). Also every /sites picture's rendered size
 * against its file, and the × and Clear hit boxes. Writes clear.json + PNGs.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { chromium } from "playwright";

const i = process.argv.indexOf("--base");
const base = i === -1 ? "http://localhost:4410" : process.argv[i + 1];
const dir = path.dirname(new URL(import.meta.url).pathname);
const shot = (page, name) => page.screenshot({ path: path.join(dir, `${name}.png`) });
const report = {};

const browser = await chromium.launch();
for (const [label, options] of [
  ["390", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["1280", { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }],
]) {
  const context = await browser.newContext({ ...options, reducedMotion: "reduce" });
  const page = await context.newPage();
  const r = (report[label] = {});

  await page.goto(`${base}/sites/?hue=blue`, { waitUntil: "load" });
  const state = () =>
    page.evaluate(() => {
      const on = document.querySelector("[data-hue-set][aria-current]");
      const clear = document.querySelector("[data-hue-clear]");
      const box = (el) => (el && el.checkVisibility() ? el.getBoundingClientRect() : null);
      const hit = (el) => {
        if (!el) return null;
        const after = getComputedStyle(el, "::after");
        const b = el.getBoundingClientRect();
        return Math.round(b.height - 2 * parseFloat(after.top || "0"));
      };
      return {
        url: location.pathname + location.search,
        onChip: on?.getAttribute("aria-label") ?? null,
        xVisible: !!on?.querySelector(".hue__x")?.checkVisibility(),
        clearVisible: !!box(clear),
        clearHitPx: clear?.checkVisibility() ? hit(clear) : null,
        chipHitPx: hit(on ?? document.querySelector("[data-hue-set]")),
        cardsShown: document.querySelectorAll("[data-sites-grid] > [data-hues]:not([hidden])").length,
        status: document.querySelector("[data-hue-status]")?.textContent ?? "",
      };
    });
  r.filtered = await state();
  await page.locator("[data-hue-filter]").scrollIntoViewIfNeeded();
  await shot(page, `sites-hue-${label}`);

  await page.locator("[data-hue-clear]").click();
  r.afterClear = await state();
  await shot(page, `sites-cleared-${label}`);
  await page.reload({ waitUntil: "load" });
  r.afterReload = await state();

  // A tap on the on chip itself is the other way off.
  await page.goto(`${base}/sites/?hue=blue`, { waitUntil: "load" });
  await page.locator("[data-hue-set][aria-current]").click();
  r.afterChipTap = await state();

  await page.goto(`${base}/sites/collection/portfolios/`, { waitUntil: "load" });
  r.collection = await page.evaluate(() => {
    const on = document.querySelector('.collections a[aria-current="page"]');
    return {
      onChip: on?.getAttribute("aria-label") ?? null,
      onHref: on?.getAttribute("href") ?? null,
      clearHref: document.querySelector("[data-hue-clear]")?.getAttribute("href") ?? null,
      clearVisible: !!document.querySelector("[data-hue-clear]")?.checkVisibility(),
    };
  });
  await shot(page, `collection-${label}`);
  await page.locator('.collections a[aria-current="page"]').click();
  await page.waitForLoadState("load");
  r.collectionX = { url: new URL(page.url()).pathname };

  // Every picture on /sites: file width over rendered CSS width (policy: at most 2x).
  await page.goto(`${base}/sites/`, { waitUntil: "load" });
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) {
      scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
  });
  await page.waitForTimeout(1500);
  r.pictures = await page.evaluate(() =>
    [...document.images]
      .filter((img) => img.complete && img.naturalWidth && img.clientWidth && new URL(img.currentSrc).origin === location.origin)
      .map((img) => ({ src: new URL(img.currentSrc).pathname, ratio: Number((img.naturalWidth / img.clientWidth).toFixed(2)) }))
      .reduce((acc, { src, ratio }) => {
        const key = src.split("/")[1];
        acc[key] = { n: (acc[key]?.n ?? 0) + 1, maxRatio: Math.max(acc[key]?.maxRatio ?? 0, ratio), example: acc[key]?.example ?? src };
        return acc;
      }, {}),
  );
  await context.close();
}
await browser.close();
writeFileSync(path.join(dir, "clear.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 1));
