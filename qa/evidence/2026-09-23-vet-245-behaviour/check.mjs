// VET-245 behaviour check against a running preview.
//   node qa/evidence/2026-09-23-vet-245-behaviour/check.mjs http://localhost:4329
// Writes report.json beside itself; exits 1 on any failed check.
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:4329";
const out = new URL("./report.json", import.meta.url);
const report = { base, checks: [] };
const check = (name, ok, detail) => {
  report.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const visibleKinds = () => page.$$eval(".pane [data-rows] > li:not([hidden])", (lis) => lis.map((li) => li.dataset.kind));
const paneTop = () => page.$eval("[data-pane]", (pane) => pane.scrollTop);

try {
  // 1. Posts in the pane, on an article's page.
  await page.goto(`${base}/library/how-gumclaw-works`);
  await page.click('.pane [data-kind-set="post"]');
  let kinds = await visibleKinds();
  check("pane Posts: URL has kind=post", new URL(page.url()).searchParams.get("kind") === "post", page.url());
  check("pane Posts: only posts visible", kinds.length > 0 && kinds.every((k) => k === "post"), { shown: kinds.length });
  check("pane count is live", (await page.textContent("[data-pane] [data-filter-count]")) === `${kinds.length} entries`);

  // 2. Click three entries; the filter and the pane scroll carry.
  await page.$eval("[data-pane]", (pane) => (pane.scrollTop = 900));
  for (let hop = 1; hop <= 3; hop++) {
    const before = await paneTop();
    const target = await page.evaluateHandle(() => {
      const pane = document.querySelector("[data-pane]");
      const box = pane.getBoundingClientRect();
      return [...pane.querySelectorAll("[data-rows] > li:not([hidden]) > a:not([aria-current])")].find((a) => {
        const r = a.getBoundingClientRect();
        return r.top > box.top + 130 && r.bottom < box.bottom - 10;
      });
    });
    const href = await target.evaluate((a) => a.getAttribute("href"));
    await Promise.all([page.waitForURL((url) => url.pathname === new URL(href, base).pathname, { waitUntil: "domcontentloaded" }), target.click()]);
    kinds = await visibleKinds();
    const after = await paneTop();
    const current = await page.$eval('.pane [aria-current="page"]', (a) => a.closest("li").dataset.kind);
    check(`hop ${hop}: filter persists`, new URL(page.url()).searchParams.get("kind") === "post" && kinds.every((k) => k === "post"), page.url());
    check(`hop ${hop}: Posts segment selected`, (await page.getAttribute('.pane [data-kind-set="post"]', "aria-current")) === "true");
    check(`hop ${hop}: pane scroll restored`, Math.abs(after - before) <= 1, { before, after, current });
  }

  // 3. The hint row follows the filter.
  const nextHref = await page.getAttribute('[data-entry-nav] [data-nav="next"]', "href");
  const closeHref = await page.getAttribute('[data-entry-nav] [data-nav="close"]', "href");
  check("next carries the filter", nextHref.includes("kind=post"), nextHref);
  check("close returns to the filtered index", new URL(closeHref, base).pathname === "/library" && closeHref.endsWith("?kind=post"), closeHref);

  // 4. ArrowDown moves only among visible rows.
  await page.focus('.pane [data-rows] a[tabindex="0"]');
  const from = await page.evaluate(() => document.activeElement.getAttribute("href"));
  await page.keyboard.press("ArrowDown");
  const step = await page.evaluate(() => {
    const links = [...document.querySelectorAll(".pane [data-rows] > li:not([hidden]) > a")].map((a) => a.getAttribute("href"));
    const a = document.activeElement;
    return { to: a.getAttribute("href"), kind: a.closest("li").dataset.kind, links, tab: a.tabIndex };
  });
  check("ArrowDown lands on the next visible row", step.links.indexOf(step.to) === step.links.indexOf(from) + 1 && step.kind === "post" && step.tab === 0, { from, to: step.to });

  // 5. The tag select narrows.
  const tag = await page.$eval("[data-pane] select[data-tag-set]", (select) => select.options[1].value);
  await page.selectOption("[data-pane] select[data-tag-set]", tag);
  const tagged = await page.$$eval(".pane [data-rows] > li:not([hidden])", (lis) => lis.map((li) => [li.dataset.kind, li.dataset.tags]));
  const params = new URL(page.url()).searchParams;
  check("tag select narrows", tagged.length > 0 && tagged.every(([k, t]) => k === "post" && t.split(" ").includes(tag)) && params.get("tag") === tag, { tag, shown: tagged.length, url: page.url() });

  // 6. Screen-reader names carry the kind.
  const snapshot = await page.locator(".pane [data-rows] > li:not([hidden]) > a").first().ariaSnapshot();
  check("pane row name includes its kind", /\bpost\b/.test(snapshot), snapshot.split("\n")[0]);

  // 7. Scope: /library itself is untouched until its redesign.
  await page.goto(`${base}/library`);
  check("/library keeps its tab row, no segmented control", (await page.$$(".seg")).length === 0 && (await page.$$(".tabs")).length === 1);
} finally {
  await browser.close();
}

writeFileSync(out, JSON.stringify(report, null, 2));
process.exit(report.checks.every((c) => c.ok) ? 0 : 1);
