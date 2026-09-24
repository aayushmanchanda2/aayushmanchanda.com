// Every built page at 320 and 390 (touch): can the page scroll sideways?
// node qa/evidence/2026-09-24-vet-57/probe-all.mjs [base]
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:4384";
const pages = [];
(function walk(dir, rel) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) { if (!["_astro", "og", "me"].includes(name)) walk(full, `${rel}${name}/`); }
    else if (name === "index.html") pages.push(rel);
  }
})("dist", "/");

const browser = await chromium.launch();
let bad = 0;
for (const width of [320, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  for (const route of pages) {
    await page.goto(base + route, { waitUntil: "load" });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 0) { bad++; console.log(`FAIL ${width} ${route} +${over}px`); }
  }
  await ctx.close();
}
await browser.close();
console.log(`${pages.length} pages x 2 widths, ${bad} scroll sideways`);
