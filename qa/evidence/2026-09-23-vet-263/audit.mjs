// VET-263 route audit: on 22 routes (one of every path shape, plus /404) at
// 1280 and 390, (a) every visible content element stays between the keyline's
// left and right edges, and (b) the band, perforation to keyline, is pure
// paper in a screenshot at the top and scrolled, bar the two marks and the
// postmark: so nothing crosses the keyline, scrolling past included.
// usage: node audit.mjs [base url]
import { chromium } from "playwright";
import sharp from "sharp";

const base = process.argv[2] ?? "http://localhost:4330";
const routes = ["/", "/design", "/contact", "/tools", "/privacy", "/experiments", "/library", "/about", "/sites", "/notes",
  "/tools/jakubkrehel-skills-interface-design-skills-for-agents", "/library/herdr-crash-course-a-beginner-s-guide",
  "/sites/inspora", "/tools/verdict/watching", "/notes/building-this-site", "/sites/collection/mdx",
  "/sites/domain/rareui-com", "/library/kind/video", "/tools/category/design", "/library/tag/local-agency",
  "/library/domain/learn-chatgpt-com", "/404"];
const b = await chromium.launch();
const bad = [];

const domCheck = (p) => p.evaluate(() => {
  const frame = parseFloat(getComputedStyle(document.body).paddingLeft);
  const kl = frame - 0.5, kr = innerWidth - frame + 0.5;
  const skip = ".stamp, .mat, .postmark, .skip, .visually-hidden, astro-dev-toolbar, [hidden], dialog:not([open])";
  const out = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest(skip)) continue;
    const leaf = !el.children.length || /^(IMG|SVG|svg|INPUT|SELECT|BUTTON|VIDEO|IFRAME|TEXTAREA)$/.test(el.tagName);
    if (!leaf) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
    let r = el.getBoundingClientRect();
    let { left, right, top, bottom } = r;
    if (r.width <= 1 || r.height <= 1) continue;
    // clip by the viewport and every clipping ancestor
    top = Math.max(top, 0); bottom = Math.min(bottom, innerHeight);
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) { left = right; break; }
      if (s.overflowX !== "visible" || s.clipPath !== "none") {
        const ar = a.getBoundingClientRect();
        left = Math.max(left, ar.left); right = Math.min(right, ar.right);
        top = Math.max(top, ar.top); bottom = Math.min(bottom, ar.bottom);
      }
    }
    if (right - left <= 1 || bottom - top <= 1) continue;
    if (left < kl || right > kr) out.push(`${el.tagName.toLowerCase()}.${el.className || ""} x ${left.toFixed(1)}..${right.toFixed(1)} (keyline ${frame.toFixed(1)}..${(innerWidth - frame).toFixed(1)})`);
  }
  return out;
});

const bandCheck = async (p, w) => {
  const g = await p.evaluate(() => {
    const cs = getComputedStyle(document.body);
    const mat = parseFloat(getComputedStyle(document.querySelector(".stamp")).top);
    const d = parseFloat(getComputedStyle(document.querySelector(".mat")).getPropertyValue("--d")) ||
      Math.min(12, Math.max(9, mat * 0.75));
    const holes = [...document.querySelectorAll(".stamp__mark, .postmark")].map((e) => e.getBoundingClientRect().toJSON());
    return { frame: parseFloat(cs.paddingLeft), mat, d, holes, h: innerHeight };
  });
  const png = await p.screenshot(process.env.SHOT ? { path: process.env.SHOT } : {});
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const bg = [...data.subarray(((Math.round(g.frame) + 3) * info.width + Math.round(g.frame) + 3) * info.channels)].slice(0, 3);
  const inner = Math.ceil(g.mat + g.d / 2 + 1), outer = Math.floor(g.frame - 1);
  const off = [];
  const test = (x, y) => {
    if (g.holes.some((r) => x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2)) return;
    const i = (y * info.width + x) * info.channels;
    if (Math.max(...[0, 1, 2].map((c) => Math.abs(data[i + c] - bg[c]))) > 6) off.push(`${x},${y}=${data[i]}/${data[i + 1]}/${data[i + 2]} bg ${bg}`);
  };
  for (let t = inner; t < outer; t++) {
    for (let x = inner; x < w - inner; x++) { test(x, t); test(x, g.h - 1 - t); }
    for (let y = inner; y < g.h - inner; y++) { test(t, y); test(w - 1 - t, y); }
  }
  return off;
};

for (const w of [1280, 390]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 } });
  const p = await ctx.newPage();
  for (const r of process.env.ROUTE ? [process.env.ROUTE] : routes) {
    await p.goto(base + r, { waitUntil: "networkidle" });
    await p.evaluate(() => document.querySelector("astro-dev-toolbar")?.remove());
    // CONTROL=1 plants a crossing element, to prove the audit can fail
    if (process.env.CONTROL) await p.evaluate(() => document.querySelector("main").insertAdjacentHTML("afterbegin",
      '<p style="position:relative;z-index:45;margin-left:-80px;background:red">bleed</p>'));
    const dom = await domCheck(p);
    const band0 = await bandCheck(p, w);
    await p.evaluate(() => { scrollTo({ top: 900, behavior: "instant" }); document.querySelector(".pane")?.scrollTo({ top: 600, behavior: "instant" }); });
    await p.waitForTimeout(300);
    const band1 = await bandCheck(p, w);
    const dom1 = await domCheck(p);
    const n = dom.length + dom1.length + band0.length + band1.length;
    if (n) bad.push({ w, r, dom: [...new Set([...dom, ...dom1])].slice(0, 5), band: [...band0, ...band1].length, sample: [...band0, ...band1].slice(0, 4) });
  }
  await ctx.close();
}
console.log(JSON.stringify(bad, null, 1));
console.log(`${routes.length} routes x 2 widths, violations: ${bad.length}`);
await b.close();
