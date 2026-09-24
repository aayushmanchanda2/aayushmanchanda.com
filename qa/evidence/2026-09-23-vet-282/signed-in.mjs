// VET-282 E1 signed in (stubbed as in qa/evidence/2026-09-23-signed-in/check.mjs):
// the phone list takes the private rows with lock badges, in both groups, and filters them.
// node --experimental-strip-types qa/evidence/2026-09-23-vet-282/signed-in.mjs [base]
import { chromium } from "playwright";
import { FIXTURE_ROWS } from "../../../src/fixtures/private.ts";
import { paneRows, toEntries } from "../../../src/lib/private.ts";

const base = process.argv[2] ?? "http://localhost:4364";
const ROWS = paneRows(toEntries(FIXTURE_ROWS));
const out = new URL("./", import.meta.url).pathname;
let failed = 0;
const check = (name, ok, detail = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: "__client_uat", value: "1727000000", url: base }]);
await ctx.addInitScript(() => {
  window.Clerk = { loaded: true, session: { getToken: async () => "synthetic-token" }, load: async () => {}, addListener: () => () => {}, signOut: async () => {} };
});
await ctx.route("**/me/api/rows", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ROWS) }));
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${base}/library`);
await page.waitForSelector('.notes li[data-kind="private"]', { timeout: 8000 }).catch(() => null);
const s = await page.evaluate(() => {
  const vis = (el) => el.checkVisibility();
  const notes = document.querySelector(".notes");
  const priv = [...notes.querySelectorAll('li[data-kind="private"]')];
  return {
    notesVisible: vis(notes),
    priv: priv.length,
    locks: notes.querySelectorAll('li[data-kind="private"] svg[aria-label="Private"]').length,
    alsoPriv: priv.filter((li) => li.hasAttribute("data-also")).length,
    rows: [...notes.querySelectorAll("[data-rows] > li[data-kind]")].filter(vis).length,
    count: document.querySelector(".views__bar [data-filter-count]").textContent,
    all: document.querySelector('.views__bar [data-kind-count=""]').textContent,
    privateSeg: document.querySelector('.views__bar [data-kind-count="private"]')?.textContent,
  };
});
check("phone list: every private row, lock-marked, main feed and Also saved", s.notesVisible && s.priv === ROWS.length && s.locks === ROWS.length && s.alsoPriv === ROWS.filter((r) => r.also).length, JSON.stringify(s));
check("phone list: count, All and the list agree, private rows included", s.count === `${s.rows} entries` && Number(s.all) === s.rows && s.rows === 41 + ROWS.length && Number(s.privateSeg) === ROWS.length, JSON.stringify(s));
await page.screenshot({ path: `${out}signed-in-375.png` });
await page.goto(`${base}/library?tags=fixture`);
await page.waitForSelector('.notes li[data-kind="private"]', { timeout: 8000 }).catch(() => null);
const t = await page.evaluate(() => ({
  shown: [...document.querySelectorAll(".notes [data-rows] > li[data-kind]")].filter((li) => li.checkVisibility()).map((li) => li.dataset.kind),
  count: document.querySelector(".views__bar [data-filter-count]").textContent,
}));
const want = ROWS.filter((r) => r.tags.some((tag) => tag.slug === "fixture")).length;
check("phone list: a private tag filters to exactly its private rows", t.shown.length === want && t.shown.every((k) => k === "private") && t.count === `${want} ${want === 1 ? "entry" : "entries"}`, JSON.stringify(t));
check("no page errors", errors.length === 0, errors.join(" | "));
await b.close();
process.exit(failed ? 1 : 0);
