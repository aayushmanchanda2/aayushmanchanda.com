/**
 * VET-279, scripted. Run from the repo root against two static servers: this
 * branch's dist on :4340 and main's (built from b794607) on :4341.
 *
 *   node --experimental-strip-types qa/evidence/2026-09-23-vet-279/check.mjs
 *
 * 1. Signed out: every route downloads the same JS files and bytes as main.
 * 2. Public entries: the three boxes, in order; no "In my words" box on them.
 * 3. Signed in (stubbed as in `2026-09-23-signed-in/check.mjs`): on a phone,
 *    /library's All view carries the private rows, lock-marked with the tip;
 *    at desktop width that list is hidden and the pane has them.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

import { FIXTURE_ROWS } from "../../../src/fixtures/private.ts";
import { paneRows, toEntries } from "../../../src/lib/private.ts";

const OUT = new URL(".", import.meta.url).pathname;
const BRANCH = "http://127.0.0.1:4340";
const MAIN = "http://127.0.0.1:4341";
const ROWS = paneRows(toEntries(FIXTURE_ROWS));
const SHOWN = ROWS.filter((row) => !row.also);
const report = { checks: [], delta: [], pageErrors: [] };
const check = (name, ok, detail = "") => {
  report.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
};

const CLERK_STUB = () => {
  window.Clerk = { loaded: true, session: { getToken: async () => "synthetic-token" }, load: async () => {}, addListener: () => () => {}, signOut: async () => {} };
};

const browser = await chromium.launch({ headless: true });

async function open({ signedIn = false, width = 1280, height = 800, theme = "light" } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion: "reduce" });
  await context.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch {} }, theme);
  if (signedIn) {
    await context.addCookies([{ name: "__client_uat", value: "1727000000", url: BRANCH }]);
    await context.addInitScript(CLERK_STUB);
    await context.route("**/me/api/rows", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ROWS) }));
  }
  const page = await context.newPage();
  page.on("pageerror", (error) => report.pageErrors.push(`${page.url()}: ${error.message}`));
  return { context, page };
}

async function scripts(base, route) {
  const { context, page } = await open();
  const js = new Map();
  page.on("response", async (response) => {
    if (response.request().resourceType() !== "script") return;
    js.set(new URL(response.url()).pathname, (await response.body().catch(() => Buffer.alloc(0))).length);
  });
  await page.goto(base + route, { waitUntil: "networkidle" });
  const inline = await page.evaluate(() => [...document.scripts].filter((s) => !s.src).reduce((n, s) => n + s.text.length, 0));
  await context.close();
  return { bytes: [...js.values()].reduce((a, b) => a + b, 0), files: js.size, inline, urls: [...js.keys()] };
}

// 1. Signed out.
for (const route of ["/", "/library", "/library/kind/article", "/library/jason-liu-codex-operating-system", "/library/how-gumclaw-works", "/tools/", "/sites/"]) {
  const [main, branch] = [await scripts(MAIN, route), await scripts(BRANCH, route)];
  report.delta.push({ route, mainJs: main.bytes, branchJs: branch.bytes, files: branch.files, inlineDelta: branch.inline - main.inline });
  // Inline may only shrink: an article no longer renders the empty Moments,
  // so its 510-byte seek script (inert with no moments) is not shipped.
  check(`signed out ${route}: no added JS`, main.bytes === branch.bytes && main.files === branch.files && branch.inline <= main.inline && !branch.urls.some((u) => u.includes("signed-in")), `${main.bytes} -> ${branch.bytes} bytes, inline ${main.inline} -> ${branch.inline}`);
}

// 2. Public entries.
for (const route of ["/library/jason-liu-codex-operating-system", "/library/how-gumclaw-works", "/library/most-valuable-skill-2026-managing-ai-agents"]) {
  const { context, page } = await open();
  await page.goto(BRANCH + route);
  const heads = await page.$$eval(".sec__head", (els) => els.map((el) => el.lastChild.textContent.trim()));
  check(`${route}: AI box, then the source, no "In my words"`, heads.join(" | ") === "Written by AI | The source", heads.join(" | "));
  await context.close();
}

// 3. Signed in.
{
  const { context, page } = await open({ signedIn: true, width: 390, height: 844 });
  await page.goto(`${BRANCH}/library`);
  await page.waitForSelector(".me-phone li", { timeout: 5000 }).catch(() => null);
  const phone = await page.evaluate(() => {
    const part = document.querySelector(".me-phone");
    return {
      visible: part?.checkVisibility() ?? false,
      first: part === part?.parentElement?.firstElementChild,
      head: part?.querySelector("h2")?.textContent?.trim(),
      rows: part?.querySelectorAll("li").length ?? 0,
      locks: part?.querySelectorAll('svg[aria-label="Private"]').length ?? 0,
      tips: part?.querySelectorAll(".tip").length ?? 0,
      hrefs: [...(part?.querySelectorAll("li > a") ?? [])].map((a) => a.pathname),
    };
  });
  check("phone /library: private rows on top of the All view", phone.visible && phone.first && phone.head === `PrivateAll ${SHOWN.length}` && phone.rows === SHOWN.length, JSON.stringify(phone));
  check("phone /library: each row lock-marked, tips shown, opens /me/library/<slug>", phone.locks === SHOWN.length && phone.tips === SHOWN.filter((r) => r.tip).length && phone.hrefs.every((h) => h.startsWith("/me/library/")), JSON.stringify(phone));
  await context.close();
}
{
  const { context, page } = await open({ signedIn: true });
  await page.goto(`${BRANCH}/library`);
  await page.waitForSelector('[data-pane] li[data-kind="private"]', { timeout: 5000 }).catch(() => null);
  const desk = await page.evaluate(() => ({ phoneVisible: document.querySelector(".me-phone")?.checkVisibility() ?? null, pane: document.querySelectorAll('[data-pane] li[data-kind="private"]').length }));
  check("desktop /library: the phone list hides, the pane has the rows", desk.phoneVisible === false && desk.pane === ROWS.length, JSON.stringify(desk));
  await context.close();
}

// Screenshots of the phone list, signed in.
for (const [width, height, theme] of [[390, 844, "light"], [390, 844, "dark"], [1280, 800, "light"], [1600, 1000, "light"], [1280, 800, "dark"]]) {
  const { context, page } = await open({ signedIn: true, width, height, theme });
  await page.goto(`${BRANCH}/library`);
  await page.waitForSelector(".me-phone li", { timeout: 5000 }).catch(() => null);
  await page.screenshot({ path: `${OUT}library-signed-in-${width}-${theme}.png`, animations: "disabled" });
  await context.close();
}

await browser.close();
writeFileSync(`${OUT}report.json`, `${JSON.stringify(report, null, 2)}\n`);
const failed = report.checks.filter((c) => !c.ok).length + report.pageErrors.length;
console.log(`${report.checks.length - report.checks.filter((c) => !c.ok).length}/${report.checks.length} checks, ${report.pageErrors.length} page errors`);
process.exit(failed ? 1 : 0);
