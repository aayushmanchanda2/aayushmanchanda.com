// VET-306: the rest of the proof, beside taps.mjs.
//
//   node qa/evidence/2026-09-24-vet-306/checks.mjs <base>   (WK=<pw_run.sh> as in taps.mjs)
//
// 1. Desktop mouse (1280x800, no touch): a click on a row's description opens
//    that row in the panel; a second row swaps it without closing; Tab puts
//    the focus ring round the row (screenshot).
// 2. Grids and the filter pages on touch (1024x1366): tiles, cards, and a
//    verdict and a category table open the thing tapped.
// 3. Library on touch (1024x1366): on a post, Videos shows /library/kind/video's
//    right side; Posts keeps the post; a tapped row opens its entry.
// 4. Mat: at 1024x1366, scrolled, then resized to 1024x1536 (the toolbar
//    collapsing), `.mat` still reaches the window's bottom (screenshots); and
//    forced 170px short, the gap under it shows mat, not the page.
import { chromium, webkit } from "playwright";
import { writeFileSync } from "node:fs";

const base = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:4396";
const dir = new URL("./", import.meta.url);
const out = [];
let fails = 0;
const check = (browser, name, ok, detail = "") => {
  if (!ok) fails++;
  out.push({ browser, name, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${browser.padEnd(8)} ${name}${detail ? `  (${detail})` : ""}`);
};
const path = (page) => page.evaluate(() => location.pathname.replace(/\/$/, ""));
const settle = (page, want) =>
  page.waitForFunction((w) => location.pathname.replace(/\/$/, "") === w, want, { timeout: 4000 }).catch(() => {});

for (const [label, type] of [["chromium", chromium], ["webkit", webkit]]) {
  const browser = await type.launch(label === "webkit" && process.env.WK ? { executablePath: process.env.WK } : {});

  // 1. Desktop mouse.
  {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await page.goto(base + "/tools/", { waitUntil: "networkidle" });
    const rows = page.locator("table.dtable tbody tr");
    for (const i of [1, 4]) {
      const want = new URL(await rows.nth(i).locator(".row__link").getAttribute("href"), base).pathname.replace(/\/$/, "");
      await rows.nth(i).locator(".cell--desc").click({ position: { x: 12, y: 12 } });
      await settle(page, want);
      // The panel's fetch: leaving mid-fetch makes the panel fall back to the entry's page.
      await page.waitForFunction(() => !document.querySelector("[data-panel-body]")?.hasAttribute("aria-busy"));
      const open = await page.evaluate(() => document.querySelector("[data-detail-panel]")?.hasAttribute("data-open"));
      check(label, `desktop click row ${i} description opens it in the panel`, (await path(page)) === want && open, `${await path(page)} open=${open}`);
    }
    await page.goto(base + "/tools/", { waitUntil: "networkidle" });
    for (let i = 0; i < 40; i++) {
      // WebKit on macOS skips links on a plain Tab (Safari's default); Option+Tab is its Tab.
      await page.keyboard.press(label === "webkit" ? "Alt+Tab" : "Tab");
      if (await page.evaluate(() => document.activeElement?.classList.contains("row__link"))) break;
    }
    const ring = await page.evaluate(() => {
      const tr = document.activeElement?.closest("tr");
      tr?.scrollIntoView({ block: "center", behavior: "instant" });
      const style = tr && getComputedStyle(tr);
      return { name: document.activeElement?.textContent.trim(), outline: style && `${style.outlineStyle} ${style.outlineWidth}` };
    });
    check(label, "Tab reaches a row link and rings the row", ring.outline === "solid 2px", `${ring.name}: ${ring.outline}`);
    await page.locator("table.dtable tbody tr:has(.row__link:focus-visible)").screenshot({ path: new URL(`focus-ring-${label}.png`, dir).pathname });
    await page.context().close();
  }

  const touch = await browser.newContext({ viewport: { width: 1024, height: 1366 }, hasTouch: true });
  const page = await touch.newPage();
  const tapOpens = async (name, url, prep, selector, pick) => {
    await page.goto(base + url, { waitUntil: "networkidle" });
    if (prep) await prep();
    const el = page.locator(selector).nth(pick);
    await el.evaluate((e) => e.scrollIntoView({ block: "center", behavior: "instant" }));
    const want = await el.evaluate((e) => new URL((e.matches("a") ? e : e.closest("tr, li").querySelector("a[href]")).href).pathname.replace(/\/$/, ""));
    const box = await el.boundingBox();
    await page.touchscreen.tap(box.x + box.width * 0.75, box.y + box.height / 2);
    await settle(page, want);
    check(label, name, (await path(page)) === want, `want ${want} got ${await path(page)}`);
  };

  // 2. Grids and the filter pages.
  const grid = async () => {
    const b = page.locator("[data-view-set='grid']");
    if ((await b.getAttribute("aria-pressed")) !== "true") await b.click();
  };
  for (const pick of [0, 20, 60]) await tapOpens(`tools grid tile ${pick}`, "/tools/", grid, "[data-tool-rows] li.tile:visible", pick);
  for (const pick of [0, 10, 25]) await tapOpens(`sites grid card ${pick}`, "/sites/", grid, "a[data-panel-open]:visible", pick);
  await tapOpens("verdict page (skipped) row 0 date", "/tools/verdict/skipped/", null, "table.dtable tbody tr td:last-child", 0);
  await tapOpens("category page (agent-infra) row 0 date", "/tools/category/agent-infra/", null, "table.dtable tbody tr td:last-child", 0);

  // 3. Library.
  const detail = () => page.evaluate(() => document.querySelector("main")?.innerText.replace(/\s+/g, " ").slice(0, 400));
  await page.goto(base + "/library/kind/video", { waitUntil: "networkidle" });
  const fresh = await detail();
  await page.goto(base + "/library/eight-mistakes-people-make-coding-with-ai", { waitUntil: "networkidle" });
  const before = await detail();
  await page.locator("[data-pane] [data-kind-set='video']").tap();
  await settle(page, "/library/kind/video");
  await page.waitForTimeout(800); // the cross-document view transition
  const after = await detail();
  check(label, "library: Videos on a post shows /library/kind/video", (await path(page)) === "/library/kind/video" && after === fresh && after !== before, `path ${await path(page)}`);
  await page.screenshot({ path: new URL(`library-videos-${label}.png`, dir).pathname });

  await page.goto(base + "/library/eight-mistakes-people-make-coding-with-ai", { waitUntil: "networkidle" });
  await page.locator("[data-pane] [data-kind-set='post']").tap();
  await page.waitForTimeout(300);
  const kept = await page.evaluate(() => location.pathname.replace(/\/$/, "") + location.search);
  check(label, "library: Posts on a post keeps it and filters in place", kept === "/library/eight-mistakes-people-make-coding-with-ai?kind=post" && (await detail()) === before, kept);

  const row = page.locator("[data-pane] [data-rows] > li:not([hidden]) > a").nth(3);
  await row.evaluate((e) => e.scrollIntoView({ block: "center", behavior: "instant" }));
  const want = await row.evaluate((a) => new URL(a.href).pathname.replace(/\/$/, ""));
  await row.tap();
  await settle(page, want);
  check(label, "library: a tapped pane row opens its entry", (await path(page)) === want && (await detail()) !== before, want);

  // 4. Mat to the window's bottom after the window grows.
  for (const route of ["/sites/", "/about/"]) {
    await page.setViewportSize({ width: 1024, height: 1366 });
    await page.goto(base + route, { waitUntil: "networkidle" });
    await page.evaluate(() => scrollTo({ top: 600, behavior: "instant" }));
    await page.setViewportSize({ width: 1024, height: 1536 });
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => ({
      mat: document.querySelector(".mat").getBoundingClientRect().bottom,
      stamp: document.querySelector(".stamp").getBoundingClientRect().bottom,
      h: innerHeight,
    }));
    const name = route.replace(/\//g, "") || "home";
    check(label, `mat reaches the bottom on ${route} after 1366 -> 1536`, Math.abs(m.mat - m.h) < 1 && m.stamp > m.h - 20, JSON.stringify(m));
    await page.screenshot({ path: new URL(`mat-${name}-1536-${label}.png`, dir).pathname });
  }
  // The belt: if a browser still leaves the frame 170px short, the gap is mat.
  await page.addStyleTag({ content: ".mat { height: calc(100dvh - 170px) !important } .stamp { height: calc(100dvh - 170px - 2 * var(--mat-w)) !important }" });
  await page.screenshot({ path: new URL(`mat-about-short-170-${label}.png`, dir).pathname });
  await touch.close();
  await browser.close();
}

writeFileSync(new URL("checks.json", dir), JSON.stringify({ base, fails, out }, null, 2) + "\n");
console.log(fails ? `FAIL: ${fails}` : "PASS");
process.exit(fails ? 1 : 0);
