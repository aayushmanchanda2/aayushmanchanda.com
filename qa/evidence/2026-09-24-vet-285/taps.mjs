// Real taps: which entry does a tap on row i open (panel title / URL)?
import { chromium, webkit, devices } from "playwright";
const base = process.argv[2] ?? "http://localhost:4391";
const WK = process.env.WK;
const browser = WK ? await webkit.launch({ executablePath: WK }) : await chromium.launch();
const dev = devices["iPad (gen 7)"];
const opts = { ...dev };
if (WK) delete opts.isMobile;
const ctx = await browser.newContext(opts);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
for (const [route, view, sel] of [["/tools/", "list", "tr[data-tool]"], ["/sites/", "grid", "li.card"]]) {
  for (const i of [0, 5, 20]) {
    await page.goto(base + route, { waitUntil: "networkidle" });
    const loc = page.locator(sel).nth(i);
    await loc.scrollIntoViewIfNeeded();
    const want = await loc.locator("a").first().getAttribute("href");
    await loc.locator("a").first().tap();
    await page.waitForTimeout(800);
    const got = new URL(page.url()).pathname;
    const open = await page.evaluate(() => document.querySelector("[data-detail-panel]")?.hasAttribute("data-open"));
    console.log(route, view, i, "want", want, "got", got, "panel", open);
  }
}
await browser.close();
