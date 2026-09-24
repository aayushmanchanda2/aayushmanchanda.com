/**
 * image-widths.mjs — the widest box each kind of picture fills on the built
 * site (VET-309b), written to `src/data/image-widths.json` for
 * `scripts/image-budget.mjs`, which holds every file to at most 2x it.
 *
 * A layout fact needs a browser, and CI has none, so this is a tool run by
 * hand, like `scripts/og.mjs`, and its output is committed: re-run it after a
 * layout change, or when the gate names a picture it has no width for. From
 * the repo root, with dist/ served (verify-site's recipe):
 *
 *   npm run build && python3 -m http.server 4329 --directory dist &
 *   node scripts/image-widths.mjs http://localhost:4329
 *
 * A kind is the `<img>`'s first class and the folder its file is in
 * ("crop thumbs", "pc__avatar posts"), the same key the gate computes from
 * the HTML. Every breakpoint edge is visited, where a column is widest, in
 * both layouts of /tools and /sites, and every page with a post's pictures.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:4329";
const VIEWPORTS = [390, 639, 767, 1023, 1279, 1535, 1920];

/** One page of every template that draws a local picture. */
const ROUTES = [
  "/", "/about/", "/design/", "/sites/", "/sites/arc-from-the-browser-company/", "/sites/about-brian-lovin/", "/sites/collection/portfolios/",
  "/tools/", "/tools/agent-browser/", "/library/", "/library/kind/video/", "/library/anthropic-agents-that-run-for-hours/",
  "/notes/",
  ...readdirSync(path.join(process.cwd(), "dist", "library"), { withFileTypes: true })
    .map((entry) => path.join(process.cwd(), "dist", "library", entry.name, "index.html"))
    .filter((file) => existsSync(file) && /src="\/posts\//.test(readFileSync(file, "utf8")))
    .map((file) => `/library/${path.basename(path.dirname(file))}/`),
];

/** @type {Record<string, number>} */
const widths = {};
const browser = await chromium.launch();
for (const [width, layout] of VIEWPORTS.flatMap((w) => /** @type {[number, string][]} */ ([[w, "grid"], [w, "list"]]))) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.addInitScript((view) => {
    localStorage.setItem("tools-view", view);
    localStorage.setItem("sites-view", view);
  }, layout);
  for (const route of ROUTES) {
    await page.goto(base + route, { waitUntil: "load" });
    const rows = await page.evaluate(() =>
      [...document.images]
        .filter((img) => img.getAttribute("src")?.startsWith("/"))
        .map((img) => ({
          key: `${[...img.classList].find((c) => !c.startsWith("astro-")) ?? "(none)"} ${img.getAttribute("src")?.split("/")[1]}`,
          width: img.getBoundingClientRect().width,
        })),
    );
    for (const { key, width: w } of rows) widths[key] = Math.max(widths[key] ?? 0, Math.round(w));
  }
  await page.close();
}
await browser.close();

const out = path.join(process.cwd(), "src", "data", "image-widths.json");
const sorted = Object.fromEntries(Object.entries(widths).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(out, JSON.stringify(sorted, null, 2) + "\n");
console.log(sorted);
