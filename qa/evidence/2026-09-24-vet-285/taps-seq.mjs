import { chromium, webkit, devices } from "playwright";
const base = process.argv[2] ?? "http://localhost:4391";
const WK = process.env.WK;
const browser = WK ? await webkit.launch({ executablePath: WK }) : await chromium.launch();
const opts = { ...devices["iPad (gen 7)"] }; if (WK) delete opts.isMobile;
const page = await (await browser.newContext(opts)).newPage();
for (const [route, sel] of [["/tools/?verdict=using", "tr[data-tool]:not([hidden])"], ["/tools/", "tr[data-tool]"], ["/sites/", "li.card"]]) {
  await page.goto(base + route, { waitUntil: "networkidle" });
  for (const i of [0, 3, 1, 6]) {
    const a = page.locator(sel).nth(i).locator("a").first();
    const want = await a.getAttribute("href");
    const box = await a.boundingBox();
    const r = await page.locator(sel).nth(i).boundingBox();
    // tap the row away from the name, near its left third
    const [x, y] = [r.x + Math.min(r.width * 0.6, 300), r.y + r.height / 2];
    const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && e.tagName + "." + e.className + " in " + (e.closest("a")?.getAttribute("href") ?? e.closest("[data-detail-panel]") ? "panel" : "-"); }, [x, y]);
    console.log("  tap at", Math.round(x), Math.round(y), hit);
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(700);
    console.log(WK ? "wk" : "cr", route, i, want, "->", new URL(page.url()).pathname);
  }
}
await browser.close();
