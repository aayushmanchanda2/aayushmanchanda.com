#!/usr/bin/env node
// verify-site harness: screenshots, computed styles, third-party hosts and a
// hover check for a list of routes, at 390x844 and 1280x800, light and dark.
// Run from the repo root (node needs a cwd inside the repo on this machine):
//   node .claude/skills/verify-site/shoot.mjs --base http://localhost:4329 \
//     --routes /,/tools --label t15 [--styles 'h1,.prose p'] \
//     [--click '[data-tools-view-set="grid"]'] [--hover '.row a' --expect '.preview' --wait 400] [--full]
//     [--sizes 390x844,1280x800] [--themes light,dark]
// Writes qa/evidence/<YYYY-MM-DD>-<label>/{*.png,report.json}; exits 1 on any failure.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

const { values: a } = parseArgs({
  options: {
    base: { type: "string" },
    routes: { type: "string", default: "/" },
    label: { type: "string" },
    styles: { type: "string" },
    click: { type: "string", multiple: true },
    hover: { type: "string" },
    expect: { type: "string" },
    wait: { type: "string", default: "400" },
    sizes: { type: "string", default: "390x844,1280x800" },
    themes: { type: "string", default: "light,dark" },
    full: { type: "boolean", default: false },
  },
});
if (!a.base || !a.label || (a.hover && !a.expect)) {
  console.error("usage: shoot.mjs --base <url> --label <label> [--routes /,/tools] [--styles sel,sel] [--click sel] [--hover sel --expect sel [--wait ms]] [--full]");
  process.exit(2);
}

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const day = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
const OUT = join(REPO, "qa/evidence", `${day}-${a.label}`);
mkdirSync(OUT, { recursive: true });

const base = new URL(a.base);
const routes = a.routes.split(",").map((r) => r.trim()).filter(Boolean);
const sizes = a.sizes.split(",").map((s) => s.split("x").map(Number));
const themes = a.themes.split(",");
// Split on commas outside parentheses so ':is(a, b)' survives.
const selectors = a.styles ? a.styles.split(/,(?![^(]*\))/).map((s) => s.trim()) : [];
const PROPS = ["color", "font-size", "font-weight", "letter-spacing", "line-height"];
// Playwright's isVisible() ignores opacity; preview cards and rail labels fade
// with opacity, so check it too (checkOpacity walks ancestors).
const seen = async (loc) =>
  (await loc.count()) > 0 &&
  loc.evaluate((el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
    el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
const slug = (r) => r.replace(/^\/|\/$/g, "").replace(/[^a-z0-9]+/gi, "_") || "home";

const report = { base: base.href, label: a.label, dir: OUT, at: new Date().toISOString(), shots: [], failures: [] };
const fail = (msg) => { report.failures.push(msg); console.error("FAIL " + msg); };

const browser = await chromium.launch({ headless: true });
try {
  for (const theme of themes) {
    for (const [width, height] of sizes) {
      const context = await browser.newContext({
        viewport: { width, height },
        colorScheme: theme,
        deviceScaleFactor: 1,
        isMobile: width < 768,
        hasTouch: width < 768,
      });
      // Pin the site's own toggle state (src/lib/theme.ts: localStorage "theme"
      // -> html[data-theme]) before PREPAINT runs, so dark is the site's dark,
      // not only the OS query.
      await context.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch {} }, theme);
      const page = await context.newPage();

      for (const route of routes) {
        const hosts = new Set();
        const errors = [];
        const onReq = (req) => {
          try { const h = new URL(req.url()).host; if (h && h !== base.host) hosts.add(h); } catch {}
        };
        const onErr = (e) => errors.push(String(e.message ?? e));
        page.on("request", onReq);
        page.on("pageerror", onErr);

        const url = new URL(route, base).href;
        const name = `${slug(route)}-${width}-${theme}`;
        const shot = { route, url, width, height, theme, png: `${name}.png` };
        try {
          const res = await page.goto(url, { waitUntil: "load", timeout: 30000 });
          shot.status = res?.status() ?? null;
          if (shot.status !== 200) fail(`${name}: HTTP ${shot.status}`);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(300);

          // Real user clicks, in order (e.g. the Grid button, then a tile), before anything is measured.
          for (const sel of a.click ?? []) {
            await page.locator(sel).first().click();
            await page.waitForTimeout(400);
          }
          if (a.click) shot.clicked = a.click;

          shot.dataTheme = await page.evaluate(() => document.documentElement.dataset.theme);
          shot.bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
          if (shot.dataTheme !== theme) fail(`${name}: html[data-theme]=${shot.dataTheme}, wanted ${theme}`);

          if (selectors.length) {
            shot.styles = await page.evaluate(({ selectors, PROPS }) => {
              const out = {};
              for (const sel of selectors) {
                let els = [];
                try { els = [...document.querySelectorAll(sel)].slice(0, 3); } catch { out[sel] = "invalid selector"; continue; }
                out[sel] = els.map((el) => {
                  const cs = getComputedStyle(el);
                  return { text: (el.textContent || "").trim().slice(0, 40), ...Object.fromEntries(PROPS.map((p) => [p, cs.getPropertyValue(p)])) };
                });
              }
              return out;
            }, { selectors, PROPS });
          }

          await page.screenshot({ path: join(OUT, shot.png), fullPage: a.full, animations: "disabled" });

          // Hover is a pointer behaviour: desktop widths only.
          if (a.hover && width >= 768) {
            const target = page.locator(a.hover).first();
            const expect = page.locator(a.expect).first();
            const h = { hover: a.hover, expect: a.expect, waitMs: Number(a.wait) };
            if (!(await target.count())) {
              h.error = "hover target not found";
            } else {
              h.visibleBefore = await seen(expect);
              await target.hover();
              await page.waitForTimeout(h.waitMs);
              h.visibleAfter = await seen(expect);
              h.png = `${name}-hover.png`;
              await page.screenshot({ path: join(OUT, h.png), animations: "disabled" });
            }
            h.pass = !h.error && h.visibleAfter === true;
            if (!h.pass) fail(`${name}: hover ${a.hover} -> ${a.expect} ${h.error ?? "not visible"}`);
            shot.hoverCheck = h;
          }
        } catch (e) {
          fail(`${name}: ${e.message}`);
        }
        page.off("request", onReq);
        page.off("pageerror", onErr);
        shot.thirdPartyHosts = [...hosts].sort();
        shot.pageErrors = errors;
        report.shots.push(shot);
        console.log(`${shot.status ?? "ERR"} ${name} theme=${shot.dataTheme} bg=${shot.bodyBg} 3p=[${shot.thirdPartyHosts.join(" ")}]` +
          (shot.hoverCheck ? ` hover=${shot.hoverCheck.pass}` : ""));
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`evidence: ${OUT}`);
}
process.exit(report.failures.length ? 1 : 0);
