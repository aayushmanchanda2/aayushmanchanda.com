/**
 * Signed-in mode, scripted (VET-276). Run from the repo root against two
 * static servers: this branch's dist on :4330 and main's on :4331.
 *
 *   node --experimental-strip-types qa/evidence/2026-09-23-signed-in/check.mjs
 *
 * Nobody but Aayush can sign in as Aayush, so the signed-in state is faked
 * at the two edges the module talks to: `window.Clerk` (a stub with a session)
 * and `/me/api/rows` (answered with the synthetic fixture rows). The cookie is
 * a made-up `__client_uat`. Everything between is the shipped build.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

import { FIXTURE_ROWS } from "../../../src/fixtures/private.ts";
import { paneRows, toEntries } from "../../../src/lib/private.ts";

const OUT = new URL(".", import.meta.url).pathname;
const BRANCH = "http://127.0.0.1:4330";
const MAIN = "http://127.0.0.1:4331";
const ROWS = paneRows(toEntries(FIXTURE_ROWS));
const MAIN_ROWS = ROWS.filter((row) => !row.also).length;
const report = { checks: [], delta: [], pageErrors: [] };
const check = (name, ok, detail = "") => {
  report.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
};

const CLERK_STUB = () => {
  window.Clerk = {
    loaded: true,
    session: { getToken: async () => "synthetic-token" },
    load: async () => {},
    addListener: () => () => {},
    signOut: async ({ redirectUrl }) => {
      document.cookie = "__client_uat=0; path=/";
      location.href = redirectUrl;
    },
  };
};

const browser = await chromium.launch({ headless: true });

/** A context: signed out, or with the cookie, optionally the Clerk stub and the mocked endpoint. */
async function open({ cookie = false, clerk = false, rows = false, width = 1280, height = 800, theme = "light" } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion: "reduce" });
  await context.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch {} }, theme);
  if (cookie) await context.addCookies([{ name: "__client_uat", value: "1727000000", url: BRANCH }]);
  if (clerk) await context.addInitScript(CLERK_STUB);
  if (rows) await context.route("**/me/api/rows", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "cache-control": "private, no-store" }, body: JSON.stringify(ROWS) }));
  const page = await context.newPage();
  page.on("pageerror", (error) => report.pageErrors.push(`${page.url()}: ${error.message}`));
  return { context, page };
}

/** JS and HTML bytes a signed-out visitor downloads for a route. */
async function bytes(base, route) {
  const { context, page } = await open();
  const js = new Map();
  let html = 0;
  page.on("response", async (response) => {
    const url = response.url();
    const body = await response.body().catch(() => Buffer.alloc(0));
    if (response.request().resourceType() === "script") js.set(url, body.length);
    else if (response.request().resourceType() === "document") html = body.length;
  });
  await page.goto(base + route, { waitUntil: "networkidle" });
  const inline = await page.evaluate(() => [...document.scripts].filter((s) => !s.src).reduce((n, s) => n + s.text.length, 0));
  await context.close();
  return { js: [...js.values()].reduce((a, b) => a + b, 0), files: js.size, inline, html, urls: [...js.keys()] };
}

// 1. Signed out: the check is inert, and the downloads match main but for it.
for (const route of ["/", "/library", "/tools/", "/sites/"]) {
  const [before, after] = [await bytes(MAIN, route), await bytes(BRANCH, route)];
  report.delta.push({ route, mainJs: before.js, branchJs: after.js, mainFiles: before.files, branchFiles: after.files, inlineDelta: after.inline - before.inline, htmlDelta: after.html - before.html });
  check(`signed out ${route}: same JS files and bytes as main`, before.js === after.js && before.files === after.files, `${before.js} -> ${after.js} bytes, ${after.files} files`);
  check(`signed out ${route}: no signed-in module requested`, !after.urls.some((url) => url.includes("signed-in")));
}

// 2. Signed in (stubbed): the bar on any page, the rows in /library's pane, ⌘K.
{
  const { context, page } = await open({ cookie: true, clerk: true, rows: true });
  for (const route of ["/tools/", "/about/"]) {
    await page.goto(BRANCH + route);
    await page.waitForSelector("[data-sign-out]", { timeout: 5000 }).catch(() => null);
    const bar = await page.evaluate(() => ({ link: document.querySelector('.me-bar a[href="/me/library"]')?.textContent?.trim(), outs: document.querySelectorAll("[data-sign-out]").length }));
    check(`signed in ${route}: Private link and one Sign out in the bar`, bar.link === `Private ${MAIN_ROWS}` && bar.outs === 1, JSON.stringify(bar));
  }
  await page.goto(`${BRANCH}/library`);
  await page.waitForSelector('[data-pane] li[data-kind="private"]', { timeout: 5000 }).catch(() => null);
  const pane = await page.evaluate(() => {
    const pane = document.querySelector("[data-pane]");
    const privateRows = [...pane.querySelectorAll('li[data-kind="private"]')];
    return {
      rows: privateRows.length,
      locks: pane.querySelectorAll('li[data-kind="private"] svg[aria-label="Private"]').length,
      tips: pane.querySelectorAll('li[data-kind="private"] .tip').length,
      hrefs: privateRows.map((li) => li.querySelector("a").pathname),
      segment: pane.querySelector('[data-kind-set="private"]')?.textContent?.trim(),
      months: [...pane.querySelectorAll("[data-month]")].map((li) => li.textContent.trim()).slice(0, 4),
      firstUnderSeptember: (() => { const head = [...pane.querySelectorAll("[data-month]")][0]; return head?.nextElementSibling?.dataset.kind; })(),
    };
  });
  check("/library: every private row is in the pane, lock-marked, with its tip", pane.rows === ROWS.length && pane.locks === ROWS.length && pane.tips === ROWS.filter((r) => r.tip).length, JSON.stringify(pane));
  check("/library: private rows open /me/library/<slug>", pane.hrefs.every((href) => href.startsWith("/me/library/")));
  check("/library: the Private segment carries its count", pane.segment === `Private ${MAIN_ROWS}`, pane.segment);
  check("/library: month headers are rebuilt with counts", pane.months.length > 1 && pane.months.every((m) => /^[A-Z][a-z]+ \d{4} · \d+$|^Also saved · \d+$/.test(m)), pane.months.join(" | "));

  // The tag filter takes the private rows: tick a tag only private rows carry.
  await page.click("[data-pane] .ltags__sum");
  await page.click('[data-pane] input[data-tag-set][value="fixture"]', { force: true });
  const tagged = await page.evaluate(() => ({ url: location.search, shown: [...document.querySelectorAll("[data-pane] [data-rows] > li[data-kind]:not([hidden])")].map((li) => li.dataset.kind) }));
  check("/library: ticking a private tag filters to the private rows carrying it", tagged.url === "?tags=fixture" && tagged.shown.length === ROWS.filter((row) => row.tags.some((tag) => tag.slug === "fixture")).length && tagged.shown.every((kind) => kind === "private"), JSON.stringify(tagged));

  // The kind filter: on /library "Private" goes to /me/library; on an entry page it filters in place.
  await page.goto(`${BRANCH}/library`);
  await page.waitForSelector('[data-pane] [data-kind-set="private"]');
  await Promise.all([page.waitForURL("**/me/library**"), page.click('[data-pane] [data-kind-set="private"]')]);
  check("/library: the Private segment goes to /me/library?kind=private", page.url().endsWith("/me/library?kind=private"), page.url());
  const slug = await (await fetch(`${BRANCH}/library`)).text().then((html) => html.match(/href="\/library\/([a-z0-9-]+)"/)?.[1]);
  await page.goto(`${BRANCH}/library/${slug}`);
  await page.waitForSelector('[data-pane] [data-kind-set="private"]');
  await page.click('[data-pane] [data-kind-set="private"]');
  const kinds = await page.evaluate(() => ({ url: location.search, shown: [...document.querySelectorAll("[data-pane] [data-rows] > li[data-kind]:not([hidden])")].map((li) => li.dataset.kind) }));
  check("entry page: the Private segment filters the pane in place", kinds.url === "?kind=private" && kinds.shown.length === ROWS.length && kinds.shown.every((kind) => kind === "private"), JSON.stringify(kinds));

  // ⌘K finds a private entry.
  await page.goto(`${BRANCH}/tools/`);
  await page.waitForSelector("[data-sign-out]");
  await page.keyboard.press("Meta+k");
  await page.fill("[data-palette-input]", "reading list honest");
  await page.waitForSelector('[data-palette-results] a[href="/me/library/fixture-private-article"]', { timeout: 5000 }).catch(() => null);
  const hit = await page.$('[data-palette-results] a[href="/me/library/fixture-private-article"]');
  check("⌘K: a private entry is searchable", hit !== null);
  await page.keyboard.press("Escape");

  // Sign out from a public page lands back on it, signed out.
  await page.click("[data-sign-out]");
  await page.waitForLoadState("load");
  await page.waitForTimeout(500);
  check("sign out on /tools returns to /tools, controls gone", new URL(page.url()).pathname === "/tools/" && (await page.$("[data-sign-out]")) === null, page.url());
  await context.close();
}

// 3. A fake cookie: the real 404 from the endpoint, or no Clerk at all. Nothing shows, nothing throws.
for (const [name, options] of [["fake cookie, real 404 endpoint", { cookie: true, clerk: true }], ["fake cookie, Clerk not loadable", { cookie: true }]]) {
  const errors = report.pageErrors.length;
  const { context, page } = await open(options);
  const asked = [];
  page.on("request", (request) => request.url().includes("/me/api/rows") && asked.push(request.url()));
  await page.goto(`${BRANCH}/library`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => ({ bar: document.querySelectorAll(".me-bar").length, rows: document.querySelectorAll('[data-pane] li[data-kind="private"]').length, seg: document.querySelectorAll('[data-kind-set="private"]').length }));
  check(`${name}: page unchanged, no page errors`, state.bar === 0 && state.rows === 0 && state.seg === 0 && report.pageErrors.length === errors, `${JSON.stringify(state)} rows requests ${asked.length}`);
  await context.close();
}

// 4. Screenshots, signed in (stubbed).
for (const [route, width, height, theme, name] of [
  ["/library", 390, 844, "light", "library-390-light"],
  ["/library", 1280, 800, "light", "library-1280-light"],
  ["/library", 1600, 1000, "light", "library-1600-light"],
  ["/library", 1280, 800, "dark", "library-1280-dark"],
  ["/tools/", 1280, 800, "light", "tools-1280-light"],
  ["/tools/", 390, 844, "light", "tools-390-light"],
]) {
  const { context, page } = await open({ cookie: true, clerk: true, rows: true, width, height, theme });
  await page.goto(BRANCH + route);
  await page.waitForSelector("[data-sign-out]", { timeout: 5000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}${name}.png`, animations: "disabled" });
  await context.close();
}

await browser.close();
writeFileSync(`${OUT}report.json`, `${JSON.stringify(report, null, 2)}\n`);
const failed = report.checks.filter((c) => !c.ok).length + report.pageErrors.length;
console.log(`${report.checks.length - report.checks.filter((c) => !c.ok).length}/${report.checks.length} checks, ${report.pageErrors.length} page errors`);
process.exit(failed ? 1 : 0);
