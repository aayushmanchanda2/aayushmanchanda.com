// VET-307 accessibility pass. From the repo root, against a static server on dist/:
//   node qa/evidence/2026-09-24-vet-307/a11y.mjs <base> <before|after>
// Writes <tag>-*.png and <tag>-a11y.json next to this file. Checks:
//   forced   Chromium forced-colors (light and dark OS), 1280 and 390, plus the open palette and menu.
//   zoom     200% zoom = a 1280x800 window at 640x400 CSS px, DPR 2: no sideways scroll, no box past the window.
//   touch    WebKit (Safari's engine) with touch, 390x844 iPhone and 1024x1366 iPad: every control gets a
//            44x44 target (its box, or a pseudo-element hit area, probed with elementFromPoint 21px out from
//            its centre each way). Inline links inside a sentence are exempt (WCAG 2.5.8's inline exception).
//   labels   Chromium AX tree: every button, link, field, checkbox and image that is exposed has a name.
//   contrast Chromium DevTools' own background resolution (CSS.getBackgroundColors): text under 4.5:1
//            (3:1 when large) fails; text over an image or gradient is listed as unknown.
//   focus    Tab through the first 40 stops: the focused control must look different from the same
//            pixels blurred (a ring, a fill, anything). Identical pixels = no visible focus.
import { chromium, webkit } from "playwright";
import { writeFileSync } from "node:fs";

const base = (process.argv[2] ?? "http://localhost:4391").replace(/\/$/, "");
const tag = process.argv[3] ?? "after";
const dir = new URL(".", import.meta.url).pathname;
const ROUTES = [
  "/",
  "/tools/",
  "/tools/agent-browser/",
  "/sites/",
  "/sites/about-brian-lovin/",
  "/library/",
  "/library/kind/post/",
  "/library/anatomy-of-an-agent-harness/",
  "/library/make-money-make-no-mistakes/",
  "/notes/",
  "/design/",
  "/about/",
];
const slug = (route) => route.replace(/^\/|\/$/g, "").replace(/\//g, "_") || "home";
const report = { base, tag, at: new Date().toISOString(), forced: [], zoom: {}, touch: {}, labels: {}, contrast: {}, focus: {} };
const shot = (page, name, opts = {}) => page.screenshot({ path: `${dir}${tag}-${name}.png`, animations: "disabled", ...opts });
const pin = (t) => { try { localStorage.setItem("theme", t); } catch {} };

// ---------- forced colors ----------
async function forced(browser) {
  for (const scheme of ["light", "dark"]) {
    for (const width of [1280, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: width > 500 ? 800 : 844 }, forcedColors: "active", colorScheme: scheme, reducedMotion: "reduce" });
      await ctx.addInitScript(pin, "system");
      const page = await ctx.newPage();
      for (const route of ["/", "/tools/", "/sites/about-brian-lovin/", "/library/anatomy-of-an-agent-harness/", "/design/"]) {
        await page.goto(base + route, { waitUntil: "networkidle" });
        const name = `forced-${scheme}-${width}-${slug(route)}`;
        await shot(page, name);
        report.forced.push(name);
      }
      // The two modal panels, opened the way a reader opens them.
      await page.goto(base + "/", { waitUntil: "networkidle" });
      await page.locator("[data-mnav-trigger], .mnav__trigger").first().click();
      await page.waitForTimeout(400);
      await shot(page, `forced-${scheme}-${width}-menu`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      await page.keyboard.press("Meta+k");
      await page.keyboard.type("agent");
      await page.waitForTimeout(800);
      await page.keyboard.press("ArrowDown");
      await shot(page, `forced-${scheme}-${width}-palette`);
      report.forced.push(`forced-${scheme}-${width}-menu`, `forced-${scheme}-${width}-palette`);
      await ctx.close();
    }
  }
}

// ---------- 200% zoom ----------
function bleed() {
  const vw = document.documentElement.clientWidth;
  const out = [];
  if (document.documentElement.scrollWidth > vw + 1) out.push(`page scrolls sideways: ${document.documentElement.scrollWidth} > ${vw}`);
  const clipped = (el) => {
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (a !== el && s.overflowX !== "visible") return true;
      if (s.display === "none" || s.visibility === "hidden" || s.clipPath !== "none" || s.position === "fixed") return true;
    }
    return false;
  };
  for (const el of document.body.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.right <= vw + 1 || clipped(el)) continue;
    out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} right ${Math.round(r.right)} > ${vw}`);
  }
  return out.slice(0, 12);
}
async function zoom(browser) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  await ctx.addInitScript(pin, "light");
  const page = await ctx.newPage();
  for (const route of ROUTES) {
    await page.goto(base + route, { waitUntil: "networkidle" });
    report.zoom[route] = await page.evaluate(bleed);
    await shot(page, `zoom200-${slug(route)}`);
  }
  await ctx.close();
}

// ---------- touch targets, WebKit ----------
function targets() {
  const SEL = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [tabindex="0"]';
  const seen = new Map();
  const fails = [];
  let checked = 0;
  const sig = (el) => `${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).slice(0, 2).join(".")}`;
  // WCAG 2.5.8's inline exception: a link inside a paragraph or list item of running text.
  const inline = (el) => el.tagName === "A" && getComputedStyle(el).display.startsWith("inline") && !!el.parentElement.closest("p, li, dd, blockquote") && !el.closest("nav, footer, .strip, .out");
  const label = (n) => n ? `${n.tagName.toLowerCase()}.${String(n.className).trim().split(/\s+/)[0] ?? ""}` : "nothing";
  let covered = 0;
  for (const el of document.querySelectorAll(SEL)) {
    if (el.closest("[hidden], [inert], [aria-hidden='true']") || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const r0 = el.getBoundingClientRect();
    if (r0.width < 2 || r0.height < 2 || inline(el)) continue;
    const key = sig(el);
    const n = seen.get(key) ?? 0;
    if (n >= 2) continue;
    seen.set(key, n + 1);
    checked++;
    el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    // A row link's target is its whole row (lib/row-link.ts delegates the press).
    const owner = el.matches(".row__link") ? el.closest("tr") ?? el : el;
    const mine = (x, y) => { const hit = document.elementFromPoint(x, y); return hit && (owner === hit || owner.contains(hit)) ? null : hit ?? document.body; };
    // Off screen (the skip link) or under a modal: not a target a finger can reach right now.
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight || mine(cx, cy)) { covered++; continue; }
    const miss = [[-21, 0, "left"], [21, 0, "right"], [0, -21, "top"], [0, 21, "bottom"]].map(([dx, dy, side]) => [side, mine(cx + dx, cy + dy)]).filter(([, hit]) => hit);
    if (miss.length) fails.push({ el: key, text: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30), box: `${Math.round(r.width)}x${Math.round(r.height)}`, miss: miss.map(([side, hit]) => `${side}:${label(hit)}`) });
  }
  return { checked, covered, fails };
}
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
async function touch(browser) {
  for (const [name, viewport, ua] of [["390", { width: 390, height: 844 }, IPHONE], ["1024", { width: 1024, height: 1366 }, IPAD]]) {
    const ctx = await browser.newContext({ viewport, userAgent: ua, hasTouch: true, isMobile: true, deviceScaleFactor: 2, reducedMotion: "reduce" });
    await ctx.addInitScript(pin, "light");
    const page = await ctx.newPage();
    report.touch[name] = {};
    for (const route of ROUTES) {
      await page.goto(base + route, { waitUntil: "networkidle" });
      await shot(page, `webkit-${name}-${slug(route)}`);
      report.touch[name][route] = await page.evaluate(targets);
    }
    // The menu panel and the palette sheet, opened by tap.
    await page.goto(base + "/sites/about-brian-lovin/", { waitUntil: "networkidle" });
    await page.locator(".mnav__trigger").first().tap();
    await page.waitForTimeout(400);
    await shot(page, `webkit-${name}-menu`);
    report.touch[name].menu = await page.evaluate(targets);
    await page.goto(base + "/library/", { waitUntil: "networkidle" });
    await page.locator("[data-palette-open]:visible").first().tap();
    await page.waitForTimeout(600);
    await shot(page, `webkit-${name}-palette`);
    report.touch[name].palette = await page.evaluate(targets);
    await ctx.close();
  }
}

// ---------- labels, contrast, focus (Chromium, 1280) ----------
const NAMED = new Set(["button", "link", "textbox", "searchbox", "combobox", "checkbox", "radio", "switch", "menuitem", "tab", "image", "img", "listbox", "slider"]);
async function labels(page, cdp) {
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  return nodes
    .filter((n) => !n.ignored && NAMED.has(n.role?.value) && !String(n.name?.value ?? "").trim())
    .map((n) => `${n.role.value} (backend ${n.backendDOMNodeId})`);
}
async function describe(cdp, backendNodeId) {
  try {
    const { object } = await cdp.send("DOM.resolveNode", { backendNodeId });
    const { result } = await cdp.send("Runtime.callFunctionOn", { objectId: object.objectId, returnByValue: true, functionDeclaration: "function(){return this.outerHTML.slice(0,140)}" });
    return result.value;
  } catch { return "?"; }
}
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const parse = (s) => { const m = s.match(/[\d.]+/g).map(Number); return { rgb: m.slice(0, 3), a: m.length > 3 ? m[3] : 1 }; };
const over = (fg, bg) => fg.rgb.map((c, i) => c * fg.a + bg[i] * (1 - fg.a));
async function contrast(page, cdp, theme) {
  const page0 = theme === "dark" ? [0, 0, 0] : [255, 255, 255];
  const items = await page.evaluate(() => {
    const out = [];
    let i = 0;
    for (const el of document.body.querySelectorAll("*")) {
      if (el.closest("[aria-hidden='true'], [hidden], svg, script, style, noscript")) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue; // visually hidden text
      // Image replacement (KindIcon): the word is pushed out of a clipped box, so only the glyph shows.
      const range = document.createRange();
      range.selectNodeContents(el);
      const t = range.getBoundingClientRect();
      if (getComputedStyle(el).overflow !== "visible" && (t.left >= r.right || t.right <= r.left || t.top >= r.bottom || t.bottom <= r.top)) continue;
      let op = 1;
      for (let a = el; a; a = a.parentElement) op *= parseFloat(getComputedStyle(a).opacity);
      el.setAttribute("data-a11y-i", String(i));
      out.push({ i, glass: !!el.closest(".palette__panel"), color: getComputedStyle(el).color, op, text: el.textContent.trim().slice(0, 40), sig: `${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/)[0] ?? ""}` });
      i++;
      if (i >= 600) break;
    }
    return out;
  });
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
  const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "[data-a11y-i]" });
  const fails = [], unknown = new Set();
  const byIndex = new Map(items.map((it) => [it.i, it]));
  for (const nodeId of nodeIds) {
    const { attributes } = await cdp.send("DOM.getAttributes", { nodeId });
    const it = byIndex.get(Number(attributes[attributes.indexOf("data-a11y-i") + 1]));
    const bgs = await cdp.send("CSS.getBackgroundColors", { nodeId }).catch(() => ({}));
    // The palette's glass sits under backdrop-filter, which DevTools resolves to the scrim, not the panel.
    if (!bgs.backgroundColors?.length || it.glass) { unknown.add(it.sig); continue; }
    const fg = parse(it.color);
    fg.a *= it.op;
    const size = parseFloat(bgs.computedFontSize), weight = parseInt(bgs.computedFontWeight, 10);
    const floor = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
    for (const b of bgs.backgroundColors) {
      // A translucent ground (a chip's tint) sits on the page.
      const g = parse(b);
      const bg = over(g, page0);
      const f = over(fg, bg);
      const [L1, L2] = [lum(f), lum(bg)].sort((a, b) => b - a);
      const ratio = (L1 + 0.05) / (L2 + 0.05);
      if (ratio < floor) { fails.push({ el: it.sig, text: it.text, ratio: +ratio.toFixed(2), floor, color: it.color, bg: b }); break; }
    }
  }
  return { checked: items.length, fails, unknownBackground: [...unknown] };
}
async function focus(page) {
  await page.mouse.move(0, 0);
  const out = { stops: 0, invisible: [] };
  for (let n = 0; n < 40; n++) {
    await page.keyboard.press("Tab");
    const box = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      el.scrollIntoView({ block: "center", behavior: "instant" });
      // A /tools row draws its ring round the whole row (tr:has(.row__link:focus-visible)).
      const r = (el.closest("tr") ?? el).getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height, sig: `${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/)[0] ?? ""}`, text: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30) };
    });
    if (!box) break;
    out.stops++;
    const vp = page.viewportSize();
    const clip = { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: Math.min(vp.width, box.w + 16), height: Math.min(vp.height, box.h + 16) };
    if (clip.width < 2 || clip.height < 2) { out.invisible.push({ ...box, why: "no box" }); continue; }
    const on = await page.screenshot({ clip, animations: "disabled" });
    await page.evaluate(() => document.activeElement.blur());
    const off = await page.screenshot({ clip, animations: "disabled" });
    if (on.equals(off)) out.invisible.push(box);
  }
  return out;
}
async function audit(browser) {
  for (const theme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: theme, reducedMotion: "reduce" });
    await ctx.addInitScript(pin, theme);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    await cdp.send("Accessibility.enable");
    for (const route of ROUTES) {
      await page.goto(base + route, { waitUntil: "networkidle" });
      const key = `${theme} ${route}`;
      const unnamed = await labels(page, cdp);
      report.labels[key] = await Promise.all(unnamed.map(async (u) => `${u.split(" (")[0]}: ${await describe(cdp, Number(u.match(/\d+/)[0]))}`));
      report.contrast[key] = await contrast(page, cdp, theme);
      if (theme === "light") report.focus[route] = await focus(page);
    }
    // The palette, open with a query: its rows, cursor and subline.
    await page.goto(base + "/", { waitUntil: "networkidle" });
    await page.keyboard.press("Meta+k");
    await page.keyboard.type("agent");
    await page.waitForTimeout(800);
    report.labels[`${theme} palette`] = await Promise.all((await labels(page, cdp)).map(async (u) => `${u.split(" (")[0]}: ${await describe(cdp, Number(u.match(/\d+/)[0]))}`));
    report.contrast[`${theme} palette`] = await contrast(page, cdp, theme);
    await ctx.close();
  }
}

// Optional third argument: a comma list of checks to run (forced,zoom,audit,touch); default all.
const only = new Set((process.argv[4] ?? "forced,zoom,audit,touch").split(","));
const cr = await chromium.launch();
if (only.has("forced")) await forced(cr);
if (only.has("zoom")) await zoom(cr);
if (only.has("audit")) await audit(cr);
await cr.close();
const wk = await webkit.launch();
if (only.has("touch")) await touch(wk);
await wk.close();

writeFileSync(`${dir}${tag}-a11y.json`, JSON.stringify(report, null, 2));
const count = (o, f) => Object.values(o).reduce((s, v) => s + f(v), 0);
console.log(`zoom bleeds: ${count(report.zoom, (v) => v.length)}`);
console.log(`touch fails: ${Object.values(report.touch).reduce((s, byRoute) => s + count(byRoute, (v) => v.fails.length), 0)}`);
console.log(`unnamed controls: ${count(report.labels, (v) => v.length)}`);
console.log(`contrast fails: ${count(report.contrast, (v) => v.fails.length)}`);
console.log(`focus invisible: ${count(report.focus, (v) => v.invisible.length)}`);
console.log(`report: ${dir}${tag}-a11y.json`);
