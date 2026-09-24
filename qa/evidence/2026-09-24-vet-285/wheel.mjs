// Does a wheel over a nested scroller scroll it, or the page behind? (UI-side scroll hit-test)
import { chromium, webkit } from "playwright";
const base = process.argv[2] ?? "http://localhost:4391";
const WK = process.env.WK;
const browser = WK ? await webkit.launch({ executablePath: WK }) : await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(base + "/library/", { waitUntil: "networkidle" });
if (process.env.CSS) await page.addStyleTag({ content: process.env.CSS });
await page.waitForTimeout(300);
await page.mouse.move(150, 500);
await page.mouse.wheel(0, 400);
await page.waitForTimeout(600);
console.log(WK ? "webkit" : "chromium", await page.evaluate(() => ({ pane: document.querySelector("[data-pane]").scrollTop, page: scrollY })));
await browser.close();
