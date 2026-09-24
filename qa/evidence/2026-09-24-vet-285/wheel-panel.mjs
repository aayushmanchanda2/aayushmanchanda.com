import { chromium, webkit } from "playwright";
const base = process.argv[2] ?? "http://localhost:4391";
const WK = process.env.WK;
const browser = WK ? await webkit.launch({ executablePath: WK }) : await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
for (const route of ["/tools/", "/sites/"]) {
  await page.goto(base + route, { waitUntil: "networkidle" });
  await page.locator("a[data-panel-open]:visible").nth(2).click();
  await page.waitForTimeout(1200);
  await page.mouse.move(900, 500);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(600);
  const a = await page.evaluate(() => ({ panel: document.querySelector("[data-detail-panel]").scrollTop, page: scrollY }));
  await page.mouse.move(200, 500);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(600);
  const b = await page.evaluate(() => ({ panel: document.querySelector("[data-detail-panel]").scrollTop, page: scrollY }));
  console.log(WK ? "webkit" : "chromium", route, "wheel over panel", JSON.stringify(a), "then over list", JSON.stringify(b));
}
await browser.close();
