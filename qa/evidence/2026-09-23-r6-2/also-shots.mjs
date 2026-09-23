// The Also saved group: pane scrolled to its bottom, and the All view's foot, at 1280 light and 390 light.
import { chromium } from "playwright";
const BASE = "http://localhost:4337", DIR = "qa/evidence/2026-09-23-r6-2";
const browser = await chromium.launch();
for (const [w, h] of [[1280, 800], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: "light" });
  await page.goto(`${BASE}/library/`);
  if (w > 800) {
    await page.$eval(".pane", (p) => (p.scrollTop = p.scrollHeight));
    await page.screenshot({ path: `${DIR}/also-pane-${w}-light.png` });
  }
  await page.locator("#mix-also").scrollIntoViewIfNeeded();
  await page.evaluate(() => scrollBy(0, 200));
  await page.screenshot({ path: `${DIR}/also-allview-${w}-light.png` });
}
await browser.close();
