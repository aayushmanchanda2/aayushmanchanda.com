// Paper-edge probe: which in-flow boxes pass the paper (the viewport less the frame)?
// The page cannot scroll sideways (probe-scroll.mjs), so a bleed is a box running
// under the band and the mat, where the frame hides it.
// node qa/evidence/2026-09-24-vet-57/probe-paper.mjs [base] [routes]
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:4384";
const routes = (process.argv[3] ?? "/,/tools/,/sites/,/library/,/notes/,/experiments/,/about/,/privacy/").split(",");
const browser = await chromium.launch();
for (const width of [320, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  for (const route of routes) {
    await page.goto(base + route, { waitUntil: "networkidle" });
    const m = await page.evaluate(() => {
      const s = getComputedStyle(document.body);
      const vw = document.documentElement.clientWidth;
      const paper = vw - parseFloat(s.paddingRight);
      const inFlow = (el) => {
        for (let a = el; a && a !== document.body; a = a.parentElement) {
          const cs = getComputedStyle(a);
          if (cs.position === "fixed" || cs.display === "none" || cs.visibility === "hidden") return false;
          if (a !== el && cs.overflowX !== "visible") return false;
        }
        return true;
      };
      const hits = [...document.body.querySelectorAll("*")]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.height && r.right > paper + 1 && inFlow(el); })
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")} right=${Math.round(el.getBoundingClientRect().right)} w=${Math.round(el.getBoundingClientRect().width)}`);
      return { vw, frame: s.paddingRight, paper, hits: hits.slice(0, 6), n: hits.length };
    });
    console.log(`${width} ${route} frame=${m.frame} paper=${m.paper} over=${m.n} ${m.hits.join(" | ")}`);
  }
  await ctx.close();
}
await browser.close();
