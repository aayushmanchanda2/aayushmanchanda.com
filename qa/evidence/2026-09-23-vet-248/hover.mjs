// VET-248 hover check: each outbound link type opens the card with its picture
// 350ms after a mouse arrives; a /sites grid tile still opens none. Also records
// every non-local host requested. Usage: node hover.mjs [base] [--only name]
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.argv[2]?.startsWith("http") ? process.argv[2] : "http://localhost:4391";
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
const out = new URL(".", import.meta.url).pathname;
const CASES = [
  { name: "tool-website", path: "/tools/paperclip", sel: ".source a.ext[data-preview]" },
  { name: "library-pane-row-article", path: "/library/how-to-unclench", sel: '.pane a[data-preview^="/previews/library/"]:not([aria-current])' },
  { name: "library-pane-row-video", path: "/library/how-to-unclench", sel: '.pane a[data-preview^="/shots/"]' },
  { name: "library-domain-link", path: "/library/how-to-unclench", sel: "header .out a[data-preview]" },
  { name: "read-full-article", path: "/library/how-to-unclench", sel: ".full__link[data-preview]" },
  { name: "video-domain-link", path: "/library/philosopher-ceo-kareem-amin", sel: "header .out a[data-preview]" },
  { name: "library-list-source", path: "/library/tag/agents", sel: ".row__source[data-preview]" },
  { name: "sites-list-row", path: "/sites", click: '[data-view-set="list"]', sel: "[data-sites-list] [data-preview]" },
  { name: "site-detail-link", path: "/sites/designengineer-tools", sel: ".fact a.ext[data-preview]" },
  { name: "note-link", path: "/notes/building-this-site", sel: ".also a[data-preview]", optional: true },
  { name: "sites-grid-tile", path: "/sites", sel: "[data-sites-grid] a[data-site-open]", expectNone: true },
];

const hosts = new Set();
const results = [];
const browser = await chromium.launch();
try {
  for (const c of CASES.filter((c) => !only || c.name === only)) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on("request", (r) => { const h = new URL(r.url()).hostname; if (h !== "localhost") hosts.add(h); });
    await page.goto(base + c.path, { waitUntil: "networkidle" });
    if (c.click) { await page.click(c.click); await page.waitForTimeout(300); }
    const link = page.locator(c.sel).nth(c.expectNone ? 1 : 0);
    if ((await link.count()) === 0) { results.push({ ...c, pass: !!c.optional, note: "no trigger on page" }); await page.close(); continue; }
    await link.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const box = await link.boundingBox();
    const t0 = Date.now();
    await page.mouse.move(box.x + Math.min(20, box.width / 2), box.y + box.height / 2);
    // Time to a painted card: open and past opacity 0. Polled, so the number is honest.
    const visibleMs = await page
      .waitForFunction(() => { const c = document.querySelector(".preview-card"); return c?.hasAttribute("data-open") && c.checkVisibility({ checkOpacity: true }); }, null, { timeout: c.expectNone ? 700 : 3000, polling: 10 })
      .then(() => Date.now() - t0, () => null);
    await page.waitForTimeout(Math.max(0, 350 - (Date.now() - t0)));
    const state = await page.evaluate((sel) => {
      const card = document.querySelector(".preview-card");
      const img = card?.querySelector("img");
      const trigger = document.querySelector(sel);
      return {
        open: card?.hasAttribute("data-open") ?? false,
        visible: card ? card.checkVisibility({ checkOpacity: true }) : false,
        noImage: card?.hasAttribute("data-no-image") ?? null,
        img: img?.getAttribute("src") ?? null,
        natural: img ? img.naturalWidth : 0,
        want: trigger?.getAttribute("data-preview") ?? null,
        ariaHidden: card?.getAttribute("aria-hidden") ?? null,
        name: card?.querySelector(".preview-card__name")?.textContent ?? null,
      };
    }, c.sel);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${out}${c.name}.png` });
    const pass = c.expectNone ? !state.open && visibleMs === null : state.open && !state.noImage && state.natural > 0 && state.ariaHidden === "true" && state.img === state.want;
    Object.assign(state, { visibleMs });
    results.push({ name: c.name, path: c.path, pass, ...state });
    console.log(pass ? "PASS" : "FAIL", c.name, JSON.stringify(state));
    await page.close();
  }
} finally {
  await browser.close();
}
const report = { base, at: new Date().toISOString(), results, thirdPartyHosts: [...hosts].sort() };
writeFileSync(`${out}hover${only ? "-" + only : ""}.json`, JSON.stringify(report, null, 2));
console.log("third-party hosts:", report.thirdPartyHosts.join(", ") || "none");
process.exit(results.every((r) => r.pass) ? 0 : 1);
