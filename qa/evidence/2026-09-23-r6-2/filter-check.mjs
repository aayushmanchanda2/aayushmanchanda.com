// The kind filter on an entry page: the live count stays the main feed's, Also saved recounts itself.
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:4337/library/how-gumclaw-works/?kind=post");
console.log(JSON.stringify({
  count: await page.locator(".pane [data-filter-count]").innerText(),
  also: (await page.locator(".pane .pane__also").innerText()).replace(/\s+/g, " "),
  shownAlso: await page.locator(".pane li[data-also]:not([hidden])").count(),
  shownMain: await page.locator(".pane [data-rows] > li[data-kind]:not([data-also]):not([hidden])").count(),
}));
await browser.close();
