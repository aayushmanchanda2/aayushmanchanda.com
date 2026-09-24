// VET-282 scripted proof, at 375 with touch (and one desktop pass at 1280).
// Usage (repo root): node qa/evidence/2026-09-23-vet-282/check.mjs [base]
// Serves nothing itself: point it at `python3 -m http.server <port> --directory dist`.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:4364";
const out = new URL("./", import.meta.url).pathname;
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();
const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await phone.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`${page.url()}: ${e}`));

/** What the phone shows now: live count, segment counts, shown rows by group and kind. */
const state = () =>
  page.evaluate(() => {
    const vis = (el) => !!el && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    const bar = document.querySelector(".views__bar");
    const segs = Object.fromEntries([...bar.querySelectorAll("[data-kind-count]")].map((c) => [c.dataset.kindCount || "all", Number(c.textContent)]));
    const count = Number(bar.querySelector("[data-filter-count]").textContent.split(" ")[0]);
    const notes = [...document.querySelectorAll(".notes [data-rows] > li[data-kind]")].filter(vis);
    const view = document.querySelector("[data-view]");
    const items = [...view.querySelectorAll("[data-tags]")].filter(vis);
    return {
      count,
      segs,
      notes: notes.length,
      notesAlso: notes.filter((li) => li.hasAttribute("data-also")).length,
      notesByKind: notes.reduce((m, li) => ((m[li.dataset.kind] = (m[li.dataset.kind] ?? 0) + 1), m), {}),
      notesTags: notes.map((li) => li.dataset.tags),
      alsoHead: vis(document.querySelector(".notes .pane__also")) ? Number(document.querySelector(".notes .pane__also [data-month-count]").textContent) : 0,
      viewItems: items.length,
      viewTags: items.map((e) => e.dataset.tags),
      alsoGroup: Number(view.querySelector("[data-group-count]")?.textContent ?? -1),
    };
  });

const tick = async (tag) => {
  const sum = page.locator(".views__bar .ltags__sum");
  if (!(await page.locator(".views__bar details.ltags__box").evaluate((d) => d.open))) await sum.tap();
  const more = page.locator(".views__bar details.ltags__more");
  if ((await more.count()) && !(await more.evaluate((d) => d.open))) await more.locator("summary").tap();
  await page.locator(`.views__bar input[data-tag-set][value="${tag}"]`).tap({ force: true });
};

// 1. All: a tag filter updates the list and the counts; Also saved follows it.
await page.goto(`${base}/library`, { waitUntil: "networkidle" });
const before = await state();
check("All, no filter: count = every entry, both groups", before.count === 41 && before.segs.all === 41 && before.notes === 41, JSON.stringify({ count: before.count, all: before.segs.all, notes: before.notes }));
const tags = await page.$$eval(".views__bar input[data-tag-set]", (els) => els.map((e) => e.value));
for (const tag of tags) {
  await page.goto(`${base}/library`, { waitUntil: "networkidle" });
  await tick(tag);
  const s = await state();
  const url = new URL(page.url());
  const allCarry = s.notesTags.every((t) => t.split(" ").includes(tag));
  const kindsAgree = ["article", "post", "video"].every((k) => (s.segs[k] ?? 0) === (s.notesByKind[k] ?? 0));
  check(
    `All, tag "${tag}": list shows exactly N across both groups, count, All and each kind agree`,
    url.searchParams.get("tags") === tag && allCarry && s.count === s.notes && s.segs.all === s.notes && kindsAgree && s.alsoHead === s.notesAlso,
    JSON.stringify({ N: s.notes, count: s.count, segs: s.segs, byKind: s.notesByKind, also: s.notesAlso }),
  );
}

// 2. Each kind route: the tag narrows the view and its Also saved group, and the counts match.
const withAlso = tags.find(Boolean);
for (const kind of ["article", "post", "video"]) {
  for (const tag of tags) {
    await page.goto(`${base}/library/kind/${kind}?tags=${tag}`, { waitUntil: "networkidle" });
    const s = await state();
    const carry = s.viewTags.every((t) => t.split(" ").includes(tag));
    const ok = carry && s.count === s.viewItems && s.segs[kind] === s.viewItems;
    if (!ok || tag === withAlso) check(`${kind}, tag "${tag}": view items = count = segment`, ok, JSON.stringify({ items: s.viewItems, count: s.count, seg: s.segs[kind], alsoGroup: s.alsoGroup }));
  }
}

// 2b. The same by a real tap on a kind route (no query to start from).
await page.goto(`${base}/library/kind/post`, { waitUntil: "networkidle" });
const posts0 = await state();
await tick(tags[0]);
const posts1 = await state();
check("Posts: a tag tap narrows the cards and Also saved, and the counts follow", posts1.count === posts1.viewItems && posts1.segs.post === posts1.viewItems && posts1.viewItems < posts0.viewItems && posts0.count === posts0.viewItems, JSON.stringify({ before: posts0.viewItems, after: posts1.viewItems, count: posts1.count }));

// 3. The search glyph in the top bar.
await page.goto(`${base}/library`, { waitUntil: "networkidle" });
const glyph = await page.locator(".bar__search").evaluate((b) => {
  const r = b.getBoundingClientRect();
  return { visible: b.checkVisibility(), w: r.width, h: r.height, right: innerWidth - r.right, top: r.top, name: b.textContent.replace(/\s+/g, " ").trim() };
});
check("Top bar: search glyph visible, top right, 44px", glyph.visible && glyph.w >= 44 && glyph.h >= 44 && glyph.right < 32, JSON.stringify(glyph));

// 4. Palette rows paint text on the first open, before /search.json lands.
let held = 0;
await page.route("**/search.json", async (route) => { held++; await new Promise((r) => setTimeout(r, 2000)); await route.continue().catch(() => {}); });
await page.locator(".bar__search").tap();
await page.waitForTimeout(250);
const first = await page.evaluate(() => {
  const rows = [...document.querySelectorAll("[data-palette-row]")];
  return { open: document.querySelector("[data-palette]").hasAttribute("data-open"), rows: rows.length, titled: rows.filter((r) => r.querySelector(".palette__row-title")?.getBoundingClientRect().width > 0).length, icons: rows.filter((r) => r.querySelector(".palette__icon")).length };
});
check("Palette: rows render title text with their icons on first paint (index still loading)", first.open && first.rows > 20 && first.titled === first.rows && first.icons === first.rows && held === 1, JSON.stringify({ ...first, indexRequests: held }));
await page.screenshot({ path: `${out}check-palette-375.png` });

// 5. The × closes it.
const close = await page.locator("[data-palette-close]").evaluate((b) => { const r = b.getBoundingClientRect(); return { visible: b.checkVisibility(), w: r.width, h: r.height }; });
await page.locator("[data-palette-close]").tap();
await page.waitForTimeout(250);
const afterX = await page.evaluate(() => ({ open: document.querySelector("[data-palette]").hasAttribute("data-open"), url: location.pathname.replace(/\/$/, "") }));
check("Palette: a visible 44px × closes it, and the page stays", close.visible && close.w >= 44 && close.h >= 44 && !afterX.open && afterX.url === "/library", JSON.stringify({ close, ...afterX }));

// 6. The back gesture (history) closes it.
await page.unroute("**/search.json");
await page.locator(".bar__search").tap();
await page.waitForTimeout(200);
const opened = await page.evaluate(() => document.querySelector("[data-palette]").hasAttribute("data-open"));
await page.goBack();
await page.waitForTimeout(300);
const afterBack = await page.evaluate(() => ({ open: document.querySelector("[data-palette]").hasAttribute("data-open"), url: location.pathname.replace(/\/$/, "") }));
check("Palette: Back (Android back, iOS swipe) closes it and stays on the page", opened && !afterBack.open && afterBack.url === "/library", JSON.stringify(afterBack));

// 7. A tap on the backdrop closes it.
await page.locator(".bar__search").tap();
await page.waitForTimeout(200);
await page.touchscreen.tap(187, 20);
await page.waitForTimeout(250);
const afterScrim = await page.evaluate(() => document.querySelector("[data-palette]").hasAttribute("data-open"));
check("Palette: a tap on the backdrop above the sheet closes it", !afterScrim);

// 8. Following a row replaces the palette's history entry: Back from there returns to the page.
await page.locator(".bar__search").tap();
await page.waitForTimeout(200);
await page.locator("[data-palette-row][href$=\"/sites\"]").first().tap();
await page.waitForURL((u) => !u.pathname.startsWith("/library"));
// Let the site's crossfade finish: Back mid-transition makes Chromium skip it
// and report "Transition was skipped" (true of any link, not this change).
await page.waitForTimeout(800);
const here = (u) => new URL(u).pathname.replace(/\/$/, "");
const went = here(page.url());
await page.goBack({ waitUntil: "commit" }).catch((e) => console.log("goBack:", e.message.split("\n")[0]));
await page.waitForTimeout(1500);
check("Palette: a row opens its page, and Back comes straight back", went !== "/library" && here(page.url()) === "/library", `went ${went}, back at ${here(page.url())}`);

// 9. /library/tag/<x> answers 308 to /library?tags=<x>: vercel.json's route table, read in order.
const routes = JSON.parse(readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8")).routes;
const resolve = (path) => {
  for (const r of routes) {
    if (r.handle || !r.status) continue;
    const m = new RegExp(r.src).exec(path);
    if (m) return { status: r.status, location: r.headers.Location.replace(/\$(\d)/g, (_, i) => m[+i] ?? "") };
  }
  return null;
};
for (const path of ["/library/tag/agents", "/library/tag/agents/", "/library/tag/go-to-market.md"]) {
  const r = resolve(path);
  const tag = path.split("/")[3].replace(/\.md$|\/$/, "");
  check(`${path} → 308 /library?tags=${tag} (vercel.json)`, r?.status === 308 && r.location === `/library?tags=${tag}`, JSON.stringify(r));
}
const sitemap = readFileSync(new URL("../../../dist/sitemap-0.xml", import.meta.url), "utf8");
check("sitemap lists no /library/tag/ page", !sitemap.includes("/library/tag/"));

// 10. A tag chip on an entry opens the filtered library.
await page.goto(`${base}/library/agents-with-taste`, { waitUntil: "networkidle" });
const chip = await page.locator("ul.tags a.tag").first().getAttribute("href");
check("an entry's tag chip links to /library?tags=<tag>", /^\/library\?tags=[a-z0-9-]+$/.test(chip ?? ""), chip ?? "no chip");

// 11. Desktop: the pane's tag filter narrows All's editorial mix, and every count agrees.
const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
desk.on("pageerror", (e) => errors.push(String(e)));
await desk.goto(`${base}/library`, { waitUntil: "networkidle" });
await desk.locator(".pane .ltags__sum").click();
const tag = tags[tags.length - 1];
const more = desk.locator(".pane details.ltags__more");
if (await more.count()) await more.locator("summary").click();
await desk.locator(`.pane input[data-tag-set][value="${tag}"]`).check({ force: true });
const d = await desk.evaluate((tag) => {
  const vis = (el) => el.checkVisibility();
  const rows = [...document.querySelectorAll(".pane [data-rows] > li[data-kind]")].filter(vis);
  const mix = [...document.querySelectorAll('[data-view=""] [data-tags]')].filter(vis);
  return {
    rows: rows.length,
    count: document.querySelector(".pane [data-filter-count]").textContent,
    all: document.querySelector('.pane [data-kind-count=""]').textContent,
    mix: mix.length,
    mixCarry: mix.every((e) => e.dataset.tags.split(" ").includes(tag)),
  };
}, tag);
check(`Desktop All, tag "${tag}": pane rows = count = All; the mix shows only matches`, d.count === `${d.rows} ${d.rows === 1 ? "entry" : "entries"}` && Number(d.all) === d.rows && d.mixCarry, JSON.stringify(d));

// "Transition was skipped" is Chromium skipping the site's cross-document
// crossfade on a Back taken after this script's held /search.json route; the
// same flows on a fresh page report nothing (vt-probe.mjs). Listed, not failed.
const real = errors.filter((e) => !e.includes("Transition was skipped"));
check("no page errors", real.length === 0, errors.join(" | "));
writeFileSync(`${out}check.json`, JSON.stringify({ base, results }, null, 2));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
