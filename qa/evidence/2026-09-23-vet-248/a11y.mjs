// VET-248: keyboard focus opens the card on a new trigger, Escape closes it;
// on a touch phone the card node is never built; dark theme shot.
import { writeFileSync } from "node:fs";
import { chromium, devices } from "playwright";
const base = process.argv[2] ?? "http://localhost:4391";
const out = new URL(".", import.meta.url).pathname;
const r = {};
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: "dark" });
  await page.goto(`${base}/library/how-to-unclench`, { waitUntil: "networkidle" });
  // Start from the reader's last highlight so a few Tabs reach the link.
  await page.evaluate(() => { const el = document.querySelector(".full"); el.tabIndex = -1; el.focus(); el.removeAttribute("tabindex"); });
  // Tab until the full-article link has focus (focus-visible needs a real Tab).
  for (let i = 0; i < 400; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => document.activeElement?.classList.contains("full__link"))) break;
  }
  r.focused = await page.evaluate(() => document.activeElement?.className ?? null);
  await page.waitForTimeout(700);
  r.focusOpens = await page.evaluate(() => document.querySelector(".preview-card")?.hasAttribute("data-open") ?? false);
  await page.screenshot({ path: `${out}focus-dark-1280.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  r.escapeCloses = await page.evaluate(() => !document.querySelector(".preview-card")?.hasAttribute("data-open"));

  const phone = await browser.newPage({ ...devices["iPhone 13"] });
  await phone.goto(`${base}/library/how-to-unclench`, { waitUntil: "networkidle" });
  const link = phone.locator(".full__link");
  await link.scrollIntoViewIfNeeded();
  const box = await link.boundingBox();
  await phone.touchscreen.tap(box.x + 5, box.y + 5).catch(() => {});
  await phone.waitForTimeout(600);
  r.touchNoCardNode = await phone.evaluate(() => document.querySelector(".preview-card") === null);
} finally {
  await browser.close();
}
writeFileSync(`${out}a11y.json`, JSON.stringify(r, null, 2));
console.log(JSON.stringify(r));
process.exit([r.focusOpens, r.escapeCloses, r.touchNoCardNode].every(Boolean) ? 0 : 1);
