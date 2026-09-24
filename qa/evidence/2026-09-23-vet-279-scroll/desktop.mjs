// Desktop keeps the slide-over: at 1280 a click on the first /sites tile and /tools row opens the panel in place.
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://127.0.0.1:4340";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
for (const index of ["/sites/", "/tools/"]) {
  await page.goto(base + index);
  await page.locator("a[data-panel-open]:visible").first().click();
  await page.waitForSelector("[data-detail-panel][data-open] [data-detail]", { timeout: 5000 }).catch(() => null);
  console.log(index, JSON.stringify(await page.evaluate(() => ({ url: location.pathname, open: document.querySelector("[data-detail-panel]")?.hasAttribute("data-open"), rows: document.querySelectorAll("a[data-panel-open]").length }))));
}
await browser.close();
