/**
 * VET-285: the iPad checks, written to check.json beside this file.
 *
 *   node qa/evidence/2026-09-24-vet-285/check.mjs [base] [webkit pw_run.sh]
 *
 * Chromium, iPad (gen 7) and iPad Pro 11 in both orientations (touch, the
 * device's iPad Safari UA): a real tap on the first, middle and last row of
 * /tools (list, grid, and with the verdict select set) and /sites (grid,
 * list, and a collection) must load that row's own page with no panel; touch
 * flings (CDP `synthesizeScrollGesture`, touch source) must move the page on
 * /tools, /sites and an entry page, and move /library's pane and page each on
 * their own; a fling on /sites/<slug> is shot mid-flight, with the canvas
 * colour and the mat's filter recorded.
 *
 * WebKit, when a Playwright WebKit build is passed: the scroll routing that
 * broke on the device (a wheel is routed the way an iOS drag is): over
 * /library's pane, and over the desktop panel's shot on /sites, the box under
 * the pointer moves and the page does not. Both engines: the stamp's edge
 * still takes a click in the band (K2).
 */
import { writeFileSync } from "node:fs";
import { chromium, devices, webkit } from "playwright";

const [base = "http://localhost:4391", wk] = process.argv.slice(2);
const OUT = new URL(".", import.meta.url).pathname;
const out = { base, taps: [], scroll: [], fling: [], webkit: null, band: [] };
let fails = 0;
const check = (ok, record) => {
  if (!ok) fails++;
  return { ok, ...record };
};

const PAGES = [
  { route: "/tools/", view: ["tools-view", "list"], rows: "tr[data-tool]:not([hidden])" },
  { route: "/tools/", view: ["tools-view", "grid"], rows: "li.tile[data-tool]:not([hidden])" },
  { route: "/tools/", view: ["tools-view", "list"], rows: "tr[data-tool]:not([hidden])", verdict: "using" },
  { route: "/tools/", view: ["tools-view", "grid"], rows: "li.tile[data-tool]:not([hidden])", verdict: "using" },
  { route: "/sites/", view: ["sites-view", "grid"], rows: "li.card" },
  { route: "/sites/", view: ["sites-view", "list"], rows: "table[data-sites-list] tbody tr" },
  { route: "/sites/collection/portfolios/", view: ["sites-view", "grid"], rows: "li.card" },
];

const fling = (cdp, x, y, dy) =>
  cdp.send("Input.synthesizeScrollGesture", { x, y, yDistance: -dy, speed: 2500, gestureSourceType: "touch" });
const tops = (page, selector) =>
  page.evaluate((s) => ({ page: Math.round(scrollY), max: document.documentElement.scrollHeight - innerHeight, box: s ? Math.round(document.querySelector(s)?.scrollTop ?? -1) : null }), selector);

const chrome = await chromium.launch();
for (const [name, device] of [["iPad (gen 7)", devices["iPad (gen 7)"]], ["iPad Pro 11", devices["iPad Pro 11"]]]) {
  for (const orientation of ["portrait", "landscape"]) {
    const { width, height } = device.viewport;
    const viewport = orientation === "portrait" ? { width, height } : { width: height, height: width };
    const context = await chrome.newContext({ ...device, viewport });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const where = `${name} ${orientation} ${viewport.width}x${viewport.height}`;

    for (const { route, view, rows, verdict } of PAGES) {
      await page.goto(base + route, { waitUntil: "networkidle" });
      await page.evaluate(([key, value]) => localStorage.setItem(key, value), view);
      for (const pick of ["first", "middle", "last"]) {
        await page.goto(base + route, { waitUntil: "networkidle" });
        if (verdict) await page.selectOption("#filter-verdict", verdict);
        const all = page.locator(rows);
        const count = await all.count();
        const row = all.nth(pick === "first" ? 0 : pick === "middle" ? Math.floor(count / 2) : count - 1);
        const link = row.locator("a[data-panel-open]").first();
        const want = await link.getAttribute("href");
        await row.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
        const box = await row.boundingBox();
        // The row's centre, away from the name: where a finger lands on a row.
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("a")?.getAttribute("href") ?? null, [x, y]);
        await Promise.all([page.waitForURL((url) => url.pathname !== new URL(route, base).pathname, { timeout: 5000 }).catch(() => {}), page.touchscreen.tap(x, y)]);
        await page.waitForLoadState("load");
        const got = new URL(page.url()).pathname;
        const panel = await page.evaluate(() => document.querySelector("[data-detail-panel][data-open]") !== null);
        out.taps.push(check(got.replace(/\/$/, "") === want.replace(/\/$/, "") && !panel && hit === want, { where, route, view: view[1], verdict: verdict ?? null, pick, of: count, want, hitAtCentre: hit, got, panelOpen: panel }));
      }
    }

    // Touch scroll: the list pages, an entry page, and both /library columns.
    for (const route of ["/tools/", "/sites/", "/tools/paperclip/", "/tools/roughdraft/", "/sites/about-brian-lovin/", "/sites/inspora/"]) {
      await page.goto(base + route, { waitUntil: "networkidle" });
      const before = await tops(page);
      await fling(cdp, viewport.width / 2, viewport.height * 0.7, 400);
      await page.waitForTimeout(400);
      const after = await tops(page);
      // A page shorter than the window has nothing to scroll: that is a pass, and says so.
      out.scroll.push(check(after.page > before.page || before.max <= 0, { where, route, column: "page", before, after }));
    }
    await page.goto(base + "/library/", { waitUntil: "networkidle" });
    // Under 48rem of container (an 810 iPad in portrait) there is one column, the phone list.
    const pane = await page.locator("[data-pane]").boundingBox();
    if (!pane) out.scroll.push({ ok: true, where, route: "/library/", column: "none: one column at this width" });
    for (const [column, x] of pane === null ? [] : [["left (pane)", pane.x + pane.width / 2], ["right (page)", pane.x + pane.width + (viewport.width - pane.x - pane.width) / 2]]) {
      const before = await tops(page, "[data-pane]");
      await fling(cdp, x, viewport.height * 0.7, 400);
      await page.waitForTimeout(400);
      const after = await tops(page, "[data-pane]");
      const moved = column.startsWith("left") ? after.box > before.box && after.page === before.page : after.page > before.page && after.box === before.box;
      out.scroll.push(check(moved, { where, route: "/library/", column, before, after }));
    }

    // Mid-fling on a site's page, portrait only (where Aayush saw the smear).
    if (orientation === "portrait") {
      await page.goto(base + "/sites/about-brian-lovin/", { waitUntil: "networkidle" });
      const paint = await page.evaluate(() => ({
        canvas: getComputedStyle(document.documentElement).backgroundColor,
        paper: getComputedStyle(document.body).backgroundColor,
        matFilter: getComputedStyle(document.querySelector(".mat__shade")).filter,
      }));
      // Every frame of the fling: the mat's box is the window. Shots come from the
      // surface: Playwright's page.screenshot mid-gesture offsets the whole frame.
      await page.evaluate(() => {
        window.__mat = [];
        const frame = () => {
          const r = document.querySelector(".mat").getBoundingClientRect();
          window.__mat.push(r.top === 0 && r.height === innerHeight);
          if (window.__mat.length < 90) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      const flying = fling(cdp, viewport.width / 2, viewport.height * 0.8, 3000);
      const shots = [];
      for (let i = 0; i < 3; i++) {
        await page.waitForTimeout(80);
        const file = `fling-${name.replace(/\W+/g, "")}-${i}.png`;
        const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
        writeFileSync(OUT + file, Buffer.from(data, "base64"));
        shots.push({ file, pageY: Math.round(await page.evaluate(() => scrollY)) });
      }
      await flying;
      const frames = await page.evaluate(() => window.__mat);
      const matFixedEveryFrame = frames.every(Boolean);
      out.fling.push(check(paint.canvas === paint.paper && paint.matFilter === "none" && matFixedEveryFrame, { where, ...paint, frames: frames.length, matFixedEveryFrame, shots }));
    }

    // K2: a tap on the band still lands on the stamp's edge, not a row.
    await page.goto(base + "/tools/", { waitUntil: "networkidle" });
    const band = await page.evaluate(() => [[innerWidth / 2, 4], [4, innerHeight / 2], [innerWidth - 4, innerHeight / 2], [innerWidth / 2, innerHeight - 4]].map(([x, y]) => document.elementFromPoint(x, y)?.className ?? null));
    out.band.push(check(band.every((c) => c === "stamp__edge"), { where, engine: "chromium", hits: band }));
    await context.close();
  }
}
await chrome.close();

if (wk) {
  const browser = await webkit.launch({ executablePath: wk });
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  const runs = [];
  await page.goto(base + "/library/", { waitUntil: "networkidle" });
  await page.mouse.move(150, 500);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(600);
  const library = await tops(page, "[data-pane]");
  runs.push(check(library.box > 0 && library.page === 0, { route: "/library/", over: "pane", ...library }));
  await page.goto(base + "/sites/", { waitUntil: "networkidle" });
  await page.locator("a[data-panel-open]:visible").first().click();
  await page.waitForTimeout(1200);
  await page.mouse.move(1000, 500);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(600);
  const sites = await tops(page, "[data-detail-panel] .scroller");
  runs.push(check(sites.box > 0 && sites.page === 0, { route: "/sites/ panel", over: "shot", ...sites }));
  const band = await page.evaluate(() => [[innerWidth / 2, 4], [4, innerHeight / 2]].map(([x, y]) => document.elementFromPoint(x, y)?.className ?? null));
  out.band.push(check(band.every((c) => c === "stamp__edge"), { where: "1280x820", engine: "webkit", hits: band }));
  out.webkit = runs;
  await browser.close();
}

out.fails = fails;
writeFileSync(OUT + "check.json", JSON.stringify(out, null, 2) + "\n");
console.log(`${fails ? "FAIL" : "ok"}: ${out.taps.length} taps, ${out.scroll.length} scrolls, ${out.fling.length} flings, webkit ${out.webkit?.length ?? "skipped"}, ${fails} failing`);
process.exit(fails ? 1 : 0);
