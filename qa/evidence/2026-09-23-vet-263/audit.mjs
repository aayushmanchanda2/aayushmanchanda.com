// VET-263 route audit: on 22 routes (one of every path shape, plus /404) and
// the /sites panel open, at 1280 and 390, with every scroller (the document
// and each scroll container) at its top, middle and bottom:
// (a) text: every text node's rendered rects (Range.getClientRects), clipped
//     by each ancestor scroll container's padding box and by the document's
//     own window, stay inside the keyline's inner edge. The document's window
//     is the viewport less the paper the stamp paints solid over it: the band,
//     the keyline and the clearance under it (0 before VET-263's fix);
// (b) scrollers: every pinned scroll container ends inside that window, so
//     its last row can scroll fully clear of the paper;
// (c) pixels: the band (perforation to keyline) and the solid clearance
//     inside the keyline are pure paper in a screenshot, bar the two marks and
//     the postmark.
// usage: node audit.mjs [base url]   env: ROUTE=/x (one route), CONTROL=1
// (plants a bleeding element, to prove the audit can fail)
import { chromium } from "playwright";
import sharp from "sharp";

const base = process.argv[2] ?? "http://localhost:4330";
const routes = ["/", "/design", "/contact", "/tools", "/privacy", "/experiments", "/library", "/about", "/sites", "/notes",
  "/tools/jakubkrehel-skills-interface-design-skills-for-agents", "/library/herdr-crash-course-a-beginner-s-guide",
  "/sites/inspora", "/tools/verdict/watching", "/notes/building-this-site", "/sites/collection/mdx",
  "/sites/domain/rareui-com", "/library/kind/video", "/tools/category/design", "/library/tag/local-agency",
  "/library/domain/learn-chatgpt-com", "/404", "/sites#panel"];
const b = await chromium.launch();
const bad = [];
let checked = 0;

/** Page-side helpers, installed on every page with `addInitScript`. */
const helpers = () => {
/** The keyline's inner rect and the document's window, from the live page. */
const geometry = () => {
  const st = document.querySelector(".stamp");
  const frame = parseFloat(getComputedStyle(document.body).paddingLeft);
  const kw = parseFloat(getComputedStyle(st, "::before").borderTopWidth) || 0;
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;height:calc(var(--keyline, 0px) + var(--clear, 0px))";
  document.body.append(probe);
  const cover = probe.getBoundingClientRect().height;
  probe.remove();
  return {
    frame, kw, cover,
    K: { l: frame + kw, t: frame + kw, r: innerWidth - frame - kw, b: innerHeight - frame - kw },
    D: { l: frame, t: frame + cover, r: innerWidth - frame, b: innerHeight - frame - cover },
  };
};

const scrollers = () => [...document.querySelectorAll("body *")].filter((el) => {
  const s = getComputedStyle(el);
  return /auto|scroll/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1 && el.checkVisibility() &&
    !el.closest("dialog, [data-palette], .palette");
});
window.__audit = { geometry, scrollers };
};

const setScroll = (p, f) => p.evaluate((f) => {
  const list = window.__audit.scrollers();
  const doc = document.scrollingElement;
  doc.scrollTo({ top: (doc.scrollHeight - innerHeight) * f, behavior: "instant" });
  for (const el of list) el.scrollTo({ top: (el.scrollHeight - el.clientHeight) * f, behavior: "instant" });
}, f);

const textCheck = (p) => p.evaluate(() => {
  const { K, D } = window.__audit.geometry();
  const out = [];
  const skip = ".stamp, .mat, .postmark, .skip, astro-dev-toolbar, dialog:not([open])";
  const clipOf = (a) => {
    const r = a.getBoundingClientRect();
    return { l: r.left + a.clientLeft, t: r.top + a.clientTop, r: r.left + a.clientLeft + a.clientWidth, b: r.top + a.clientTop + a.clientHeight };
  };
  // (b) every pinned scroll container (the library pane, the site panel)
  // ends inside the document's window; one in the flow scrolls with the page
  // and passes under the paper like any text, which (a) covers
  for (const el of window.__audit.scrollers().filter((e) => /fixed|sticky/.test(getComputedStyle(e).position))) {
    const c = clipOf(el);
    if (c.b > D.b + 0.5 || c.t < D.t - 0.5) out.push(`scroller ${el.tagName.toLowerCase()}.${el.className} y ${c.t.toFixed(1)}..${c.b.toFixed(1)} (window ${D.t.toFixed(1)}..${D.b.toFixed(1)})`);
  }
  // (a) every text node
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (!n.data.trim() || !el || el.closest(skip) || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const clips = [D, { l: 0, t: 0, r: innerWidth, b: innerHeight }];
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.clipPath !== "none" && a.getBoundingClientRect().width <= 1) { clips.push({ l: 0, t: 0, r: 0, b: 0 }); break; }
      const c = clipOf(a);
      if (s.overflowX !== "visible") clips.push({ l: c.l, r: c.r, t: -1e9, b: 1e9 });
      if (s.overflowY !== "visible") clips.push({ t: c.t, b: c.b, l: -1e9, r: 1e9 });
    }
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      let v = { l: r.left, t: r.top, r: r.right, b: r.bottom };
      for (const c of clips) v = { l: Math.max(v.l, c.l), t: Math.max(v.t, c.t), r: Math.min(v.r, c.r), b: Math.min(v.b, c.b) };
      if (v.r - v.l <= 0.5 || v.b - v.t <= 0.5) continue;
      if (v.l < K.l - 0.5 || v.t < K.t - 0.5 || v.r > K.r + 0.5 || v.b > K.b + 0.5)
        out.push(`"${n.data.trim().slice(0, 28)}" ${v.l.toFixed(1)},${v.t.toFixed(1)}..${v.r.toFixed(1)},${v.b.toFixed(1)} (keyline in ${K.l.toFixed(1)},${K.t.toFixed(1)}..${K.r.toFixed(1)},${K.b.toFixed(1)})`);
    }
  }
  return out;
});

const pixelCheck = async (p, w) => {
  const g = await p.evaluate(() => {
    const { frame, kw, cover } = window.__audit.geometry();
    const mat = parseFloat(getComputedStyle(document.querySelector(".stamp")).top);
    const d = Math.min(12, Math.max(9, mat * 0.75));
    const holes = [...document.querySelectorAll(".stamp__mark, .postmark")].map((e) => e.getBoundingClientRect().toJSON());
    return { frame, kw, cover, mat, d, holes, h: innerHeight };
  });
  const png = await p.screenshot();
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => (y * info.width + x) * info.channels;
  const bg = [...data.subarray(at(Math.round(g.frame) - 2, 400), at(Math.round(g.frame) - 2, 400) + 3)];
  const off = [];
  const test = (x, y) => {
    if (g.holes.some((r) => x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2)) return;
    const i = at(x, y);
    if (Math.max(...[0, 1, 2].map((c) => Math.abs(data[i + c] - bg[c]))) > 6) off.push(`${x},${y}=${data[i]}/${data[i + 1]}/${data[i + 2]}`);
  };
  // the band, all four sides
  const inner = Math.ceil(g.mat + g.d / 2 + 1), outer = Math.floor(g.frame - 1);
  for (let t = inner; t < outer; t++) {
    for (let x = inner; x < w - inner; x++) { test(x, t); test(x, g.h - 1 - t); }
    for (let y = inner; y < g.h - inner; y++) { test(t, y); test(w - 1 - t, y); }
  }
  // the solid clearance under the keyline, top and bottom
  for (let t = Math.ceil(g.frame + g.kw + 0.5); t < Math.floor(g.frame + g.cover); t++)
    for (let x = Math.ceil(g.frame + 2); x < w - g.frame - 2; x++) { test(x, t); test(x, g.h - 1 - t); }
  return off;
};

for (const w of [1280, 390]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 } });
  await ctx.addInitScript(helpers);
  const p = await ctx.newPage();
  for (const r of process.env.ROUTE ? [process.env.ROUTE] : routes) {
    await p.goto(base + r.replace("#panel", ""), { waitUntil: "networkidle" });
    await p.evaluate(() => document.querySelector("astro-dev-toolbar")?.remove());
    if (r.endsWith("#panel")) {
      await p.locator("a[data-site-open]:visible").first().click();
      await p.waitForSelector("[data-site-panel][data-open] [data-panel-body] *");
      await p.waitForTimeout(500);
    }
    if (process.env.CONTROL) await p.evaluate(() => document.querySelector("main").prepend(Object.assign(document.createElement("p"),
      { textContent: "bleed", style: "position:fixed;left:0;top:300px;z-index:45;background:red" })));
    const text = [], pixels = [];
    for (const [name, f] of [["top", 0], ["mid", 0.5], ["bottom", 1]]) {
      await setScroll(p, f);
      await p.waitForTimeout(250);
      text.push(...(await textCheck(p)).map((s) => `${name}: ${s}`));
      if (name !== "bottom" || r.endsWith("#panel")) pixels.push(...(await pixelCheck(p, w)).map((s) => `${name}: ${s}`));
    }
    checked++;
    if (text.length + pixels.length) bad.push({ w, r, text: text.length, pixels: pixels.length, sample: [...new Set(text)].slice(0, 4).concat(pixels.slice(0, 2)) });
  }
  await ctx.close();
}
console.log(JSON.stringify(bad, null, 1));
console.log(`${checked} route checks (${checked / 2} routes x 2 widths, 3 scroll states each), failing: ${bad.length}, text violations: ${bad.reduce((s, x) => s + x.text, 0)}, pixel violations: ${bad.reduce((s, x) => s + x.pixels, 0)}`);
await b.close();
