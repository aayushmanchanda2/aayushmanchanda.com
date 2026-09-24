// G2: one count per view, the same everywhere. On each kind route, at 1280 and
// 390: the segment's count, the live count, the rows the list shows and the
// items the view draws are one number; All is every entry in library.json; no
// "Also saved" heading anywhere. node qa/evidence/2026-09-24-vet-284/counts.mjs [base]
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:4384";
const data = JSON.parse(readFileSync("src/data/library.json", "utf8"));
const total = { "": data.length };
for (const e of data) total[e.kind] = (total[e.kind] ?? 0) + 1;
const views = { "": "/library/", article: "/library/kind/article/", post: "/library/kind/post/", video: "/library/kind/video/" };
const items = { article: ".view .feed > li", post: ".view .wall > li", video: ".view .vgrid > li" };

const browser = await chromium.launch();
let fails = 0;
for (const width of [1280, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  for (const [kind, route] of Object.entries(views)) {
    await page.goto(base + route, { waitUntil: "networkidle" });
    const got = await page.evaluate(([kind, sel]) => {
      const shown = (s) => [...document.querySelectorAll(s)].filter((el) => !el.closest("[hidden]")).length;
      return {
        segment: Number(document.querySelector(`[data-kind-count="${kind}"]`)?.textContent),
        live: parseInt(document.querySelector("[data-filter-count]")?.textContent ?? ""),
        paneRows: shown("[data-pane] [data-rows] > li[data-kind]"),
        viewItems: sel ? shown(sel) : null,
        alsoSaved: /also saved/i.test(document.body.innerText),
      };
    }, [kind, items[kind]]);
    const want = total[kind];
    const ok = got.segment === want && got.live === want && got.paneRows === want && (got.viewItems === null || got.viewItems === want) && !got.alsoSaved;
    if (!ok) fails++;
    console.log(`${ok ? "ok  " : "FAIL"} ${width} ${route} want ${want}: ${JSON.stringify(got)}`);
  }
  await page.close();
}
await browser.close();
console.log(fails ? `${fails} failed` : "every count agrees");
process.exitCode = fails ? 1 : 0;
