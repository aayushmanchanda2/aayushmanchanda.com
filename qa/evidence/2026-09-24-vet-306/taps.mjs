// VET-306 proof: does a tap on a /tools or /sites list row open THAT row?
//
// iPadOS WebKit ignored `position: relative` on the table rows, so each row's
// stretched `::after` spanned the whole page and the last row took every tap.
// Playwright's WebKit honours it, so `--static` forces the old engine's
// behaviour (`tr { position: static }`) in both browsers.
//
//   node qa/evidence/2026-09-24-vet-306/taps.mjs <base> [--static] [--out name]
//
// WK=<path to pw_run.sh> picks an installed WebKit build when the pinned one
// is missing (this machine: ~/Library/Caches/ms-playwright/webkit-2359).
//
// Per browser x viewport x page: `elementFromPoint` at the Name, Description
// (Domain) and Date (Saved) cells of rows first, middle and last must land in
// that row, and a real touch tap on row 1's middle cell must open row 1.
// Exit 1 on any miss. Writes <out>.json next to this file.
import { chromium, webkit } from "playwright";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith("http")) ?? "http://localhost:4396";
const forceStatic = args.includes("--static");
const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : forceStatic ? "taps-static" : "taps";

const PAGES = [
  { name: "tools", path: "/tools/", view: "[data-view-set='list']" },
  { name: "tools?skipped", path: "/tools/?verdict=skipped", view: "[data-view-set='list']" },
  { name: "sites", path: "/sites/", view: "[data-view-set='list']" },
];
const SIZES = [
  [1024, 1366],
  [1366, 1024],
];

const results = [];
let misses = 0;

for (const [label, type] of [["chromium", chromium], ["webkit", webkit]]) {
  const browser = await type.launch(label === "webkit" && process.env.WK ? { executablePath: process.env.WK } : {});
  for (const [width, height] of SIZES) {
    for (const spec of PAGES) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
      const page = await context.newPage();
      const go = async () => {
        await page.goto(base + spec.path, { waitUntil: "networkidle" });
        const button = page.locator(spec.view);
        if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
        if (forceStatic) await page.addStyleTag({ content: "tr { position: static !important; }" });
      };
      await go();

      const rows = await page.evaluate(() =>
        [...document.querySelectorAll("table.dtable tbody tr")].filter((tr) => tr.getClientRects().length).length,
      );
      const picks = [...new Set([0, Math.floor(rows / 2), rows - 1])];
      const hits = [];
      for (const i of picks) {
        const probe = await page.evaluate((i) => {
          const tr = [...document.querySelectorAll("table.dtable tbody tr")].filter((r) => r.getClientRects().length)[i];
          tr.scrollIntoView({ block: "center", behavior: "instant" });
          const cells = [...tr.cells].filter((td) => td.getClientRects().length);
          const link = tr.querySelector(".row__link");
          const spots = { name: link, middle: cells[1], date: cells.at(-1) };
          return Object.entries(spots).map(([column, el]) => {
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return { column, ok: hit?.closest("tr") === tr, hit: hit?.closest("tr")?.querySelector(".row__link")?.textContent.trim() };
          });
        }, i);
        for (const p of probe) hits.push({ row: i, ...p });
      }

      // A real tap on row 1's middle cell, then where did it go.
      await go();
      const tap = await page.evaluate(() => {
        const tr = [...document.querySelectorAll("table.dtable tbody tr")].find((r) => r.getClientRects().length);
        tr.scrollIntoView({ block: "center", behavior: "instant" });
        const r = [...tr.cells].filter((td) => td.getClientRects().length)[1].getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, want: new URL(tr.querySelector(".row__link").href).pathname };
      });
      await page.touchscreen.tap(tap.x, tap.y);
      await page.waitForFunction((want) => location.pathname.replace(/\/$/, "") === want.replace(/\/$/, ""), tap.want, { timeout: 4000 }).catch(() => {});
      const got = await page.evaluate(() => location.pathname);
      const tapOk = got.replace(/\/$/, "") === tap.want.replace(/\/$/, "");

      const bad = hits.filter((h) => !h.ok).length + (tapOk ? 0 : 1);
      misses += bad;
      results.push({ browser: label, size: `${width}x${height}`, page: spec.name, rows, hits, tap: { want: tap.want, got, ok: tapOk } });
      console.log(
        `${label.padEnd(8)} ${width}x${height} ${spec.name.padEnd(13)} rows=${String(rows).padStart(3)} ` +
          `elementFromPoint ${hits.length - hits.filter((h) => !h.ok).length}/${hits.length}  tap ${tapOk ? "ok" : `MISS want ${tap.want} got ${got}`}`,
      );
      await context.close();
    }
  }
  await browser.close();
}

writeFileSync(new URL(`./${out}.json`, import.meta.url), JSON.stringify({ base, forceStatic, misses, results }, null, 2) + "\n");
console.log(misses ? `FAIL: ${misses} misses` : "PASS");
process.exit(misses ? 1 : 0);
