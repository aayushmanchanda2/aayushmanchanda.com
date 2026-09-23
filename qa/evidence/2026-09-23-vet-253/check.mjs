// VET-253 scripted check: Dock, jiggle (e, Escape, long-press, Done), aria-live,
// the app-open zoom, reduced motion, 320px overflow. Frames go next to this file.
// Usage: node qa/evidence/2026-09-23-vet-253/check.mjs [base]
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:4353";
const OUT = dirname(fileURLToPath(import.meta.url));
const results = [];
const check = (name, ok, got) => {
  results.push({ name, ok: !!ok, got });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} ${JSON.stringify(got)}`);
};
const GRID = () => localStorage.setItem("tools-view", "grid");
// Slow the cross-document transition 2x so five frames span most of it.
const SLOW = () =>
  addEventListener("pagereveal", (e) => {
    window.__vt = !!e.viewTransition;
    e.viewTransition?.ready.then(() => document.getAnimations().forEach((a) => (a.playbackRate = 0.5)));
  });

const iconState = (page) =>
  page.evaluate(() => {
    const icons = [...document.querySelectorAll("[data-home] .tile .app-icon")].slice(0, 4);
    return icons.map((i) => ({ name: getComputedStyle(i).animationName, rotate: getComputedStyle(i).rotate }));
  });
const state = (page) =>
  page.evaluate(() => ({
    on: document.querySelector("[data-home]").hasAttribute("data-jiggle"),
    live: document.querySelector("[data-jiggle-live]").textContent,
    done: !document.querySelector("[data-jiggle-done]").hidden,
  }));

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(GRID);
  await ctx.addInitScript(SLOW);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/tools`);
  await page.waitForLoadState("networkidle");

  // --- Dock
  const dock = await page.evaluate(() => {
    const nav = document.querySelector(".dock");
    const shelf = document.querySelector(".home__shelf");
    const r = nav.getBoundingClientRect();
    const frameIn = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--frame")) || 0;
    return {
      names: [...nav.querySelectorAll("a")].map((a) => a.getAttribute("aria-label")),
      using: document.querySelectorAll('.tile[data-verdict="using"]').length,
      position: getComputedStyle(shelf).position,
      bottomGap: innerHeight - r.bottom,
      frameIn,
      backdrop: getComputedStyle(nav).backdropFilter,
      iconEdge: nav.querySelector(".app-icon").getBoundingClientRect().width,
    };
  });
  check("dock holds every using tool (cap 8)", dock.names.length === Math.min(dock.using, 8), dock.names);
  check("dock shelf is sticky", dock.position === "sticky", dock.position);
  check("dock sits inside the keyline", dock.bottomGap > 30 && dock.bottomGap < 80, dock.bottomGap);
  check("dock is frosted", /blur\(30px\)/.test(dock.backdrop), dock.backdrop);
  check("dock icons 52-56px at 1280", dock.iconEdge >= 52 && dock.iconEdge <= 56, dock.iconEdge);
  check("dock tools stay in the grid", dock.using >= dock.names.length, dock.using);
  await page.screenshot({ path: join(OUT, "dock-1280-light.png") });

  // --- hint
  check("hint shows on first visit", await page.locator("[data-jiggle-hint]").isVisible(), null);

  // --- e toggles
  await page.keyboard.press("e");
  let s = await state(page);
  let icons = await iconState(page);
  check("e turns jiggle on", s.on && s.done, s);
  check("aria-live says on", s.live === "Jiggle mode on", s.live);
  check("icons animate with two keyframe sets", icons.some((i) => i.name === "jiggle-a") && icons.some((i) => i.name === "jiggle-b"), icons);
  check("hint hidden after first jiggle", !(await page.locator("[data-jiggle-hint]").isVisible()), null);
  check("hint key stored", (await page.evaluate(() => localStorage.getItem("tools-jiggle-hint"))) === "seen", null);
  const clip = await page.evaluate(() => {
    const r = document.querySelector("[data-home] .tiles").getBoundingClientRect();
    return { x: r.x, y: r.y, width: Math.min(r.width, 700), height: 300 };
  });
  for (let i = 0; i < 5; i++) {
    await page.screenshot({ path: join(OUT, `jiggle-${i + 1}.png`), clip });
    await page.waitForTimeout(120);
  }
  await page.screenshot({ path: join(OUT, "jiggle-full-1280.png") });

  await page.keyboard.press("Escape");
  s = await state(page);
  check("Escape exits", !s.on && !s.done, s);
  check("aria-live says off", s.live === "Jiggle mode off", s.live);
  check("no animation after exit", (await iconState(page))[0].name === "none", await iconState(page));

  // e inside a select does nothing
  await page.focus('[data-filter="verdict"]');
  await page.keyboard.press("e");
  check("e in a select is left alone", !(await state(page)).on, null);
  await page.evaluate(() => document.activeElement.blur());

  // --- long-press 500ms
  const tile = page.locator("[data-home] .tile__link").nth(2);
  const box = await tile.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 40);
  await page.mouse.down();
  await page.waitForTimeout(300);
  check("300ms is not a long-press", !(await state(page)).on, null);
  await page.waitForTimeout(300);
  check("500ms long-press turns jiggle on", (await state(page)).on, null);
  await page.mouse.up();
  await page.waitForTimeout(200);
  check("release after long-press stays on /tools", new URL(page.url()).pathname === "/tools", page.url());

  // Done pill
  await page.click("[data-jiggle-done]");
  s = await state(page);
  check("Done exits", !s.on && !s.done, s);

  // --- app-open zoom
  const target = page.locator("[data-home] .tile__link").first();
  const href = await target.getAttribute("href");
  const nav = page.waitForURL(`**${href}`);
  await target.click();
  const frames = [];
  for (let i = 0; i < 5; i++) {
    const f = join(OUT, `open-${i + 1}.png`);
    await page.screenshot({ path: f }).catch(() => {});
    frames.push(f);
    await page.waitForTimeout(120);
  }
  await nav;
  await page.waitForLoadState("load");
  check("icon click lands on the detail page", new URL(page.url()).pathname === href, page.url());
  check("view transition ran", await page.evaluate(() => window.__vt), null);
  check("detail main is named app-open", (await page.evaluate(() => getComputedStyle(document.querySelector("#main")).viewTransitionName)) === "app-open", null);

  // A non-icon navigation from /tools does not transition.
  await page.goto(`${BASE}/tools`);
  await page.evaluate((h) => (location.href = h), href);
  await page.waitForURL(`**${href}`);
  await page.waitForLoadState("load");
  check("other navigations skip the transition", !(await page.evaluate(() => window.__vt)), null);
  await ctx.close();

  // --- reduced motion
  const rctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  await rctx.addInitScript(GRID);
  await rctx.addInitScript(SLOW);
  const rpage = await rctx.newPage();
  await rpage.goto(`${BASE}/tools`);
  await rpage.keyboard.press("e");
  icons = await iconState(rpage);
  check("reduced motion: no wiggle, static tilt", icons.every((i) => i.name === "none") && icons.some((i) => i.rotate !== "none"), icons);
  await rpage.keyboard.press("Escape");
  const rhref = await rpage.locator("[data-home] .tile__link").first().getAttribute("href");
  await rpage.locator("[data-home] .tile__link").first().click();
  await rpage.waitForURL(`**${rhref}`);
  check("reduced motion: plain navigation", !(await rpage.evaluate(() => window.__vt)), null);
  await rctx.close();

  // --- 320 and 390, both themes
  for (const [width, scheme] of [[320, "light"], [390, "dark"], [1280, "dark"]]) {
    const c = await browser.newContext({ viewport: { width, height: 740 }, colorScheme: scheme });
    await c.addInitScript(GRID);
    const p = await c.newPage();
    await p.goto(`${BASE}/tools`);
    await p.waitForLoadState("networkidle");
    const m = await p.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      dock: document.querySelector(".dock").getBoundingClientRect().toJSON(),
      inner: innerWidth,
    }));
    check(`${width} ${scheme}: no horizontal overflow`, m.overflow <= 0, m.overflow);
    check(`${width} ${scheme}: dock fits`, m.dock.left >= 0 && m.dock.right <= m.inner, m.dock);
    await p.screenshot({ path: join(OUT, `dock-${width}-${scheme}.png`) });
    await c.close();
  }
} finally {
  await browser.close();
  writeFileSync(join(OUT, "check.json"), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}
