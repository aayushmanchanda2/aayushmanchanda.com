// Presses the "Private" segment on the /me/library fixture at phone and desktop widths and counts what shows.
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:4331";
const browser = await chromium.launch();
const out = [];
for (const width of [390, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.goto(base + "/me/fixture/index", { waitUntil: "networkidle" });
  const shown = () => page.evaluate(() => [...document.querySelectorAll("[data-rows] > li[data-kind]:not([hidden])")].map((li) => li.dataset.kind));
  const before = (await shown()).length;
  await page.locator('[data-kind-set="private"]').first().click();
  const after = await shown();
  out.push({ width, before, after: after.length, allPrivate: after.every((k) => k === "private"), url: new URL(page.url()).search,
    count: await page.locator("[data-filter-count]").first().textContent(), hrefs: await page.evaluate(() => [...document.querySelectorAll('[data-rows] > li[data-kind="private"] > a')].map((a) => a.pathname)) });
  await page.close();
}
await browser.close();
console.log(JSON.stringify(out));
