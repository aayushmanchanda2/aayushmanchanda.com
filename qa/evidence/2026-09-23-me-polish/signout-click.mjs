// Presses each "Sign out" on the /me fixture pages with window.Clerk stubbed
// (the fixture has no Clerk keys) and records what signOut was called with.
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:4331";
const browser = await chromium.launch();
const out = [];
for (const [route, width] of [["/me/fixture/index", 390], ["/me/fixture/index", 1280], ["/me/fixture/entry", 1280]]) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.goto(base + route, { waitUntil: "networkidle" });
  const buttons = page.locator("[data-sign-out]");
  const n = await buttons.count();
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => { window.__calls = []; window.Clerk = { signOut: async (o) => { window.__calls.push(o); } }; });
    const visible = await buttons.nth(i).isVisible();
    if (!visible) { out.push({ route, width, i, visible }); continue; }
    await buttons.nth(i).click();
    await page.waitForTimeout(200);
    out.push({ route, width, i, visible, name: await buttons.nth(i).textContent(), calls: await page.evaluate(() => window.__calls) });
  }
  await page.close();
}
await browser.close();
console.log(JSON.stringify(out));
