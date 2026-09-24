// Sideways-scroll probe: can the page actually be moved sideways, and by how much?
// node qa/evidence/2026-09-24-vet-57/probe-scroll.mjs [base] [routes]
import { chromium, webkit } from "playwright";

const base = process.argv[2] ?? "http://localhost:4384";
const routes = (process.argv[3] ?? "/,/tools/,/sites/,/library/,/notes/,/experiments/,/about/,/privacy/").split(",");
const browser = await (process.env.ENGINE === "webkit" ? webkit : chromium).launch();
for (const [label, opts] of [
  ["mobile", { isMobile: true, hasTouch: true }],
  ["desktop-ua", {}],
]) {
  for (const width of [320, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, ...opts });
    const page = await ctx.newPage();
    for (const route of routes) {
      await page.goto(base + route, { waitUntil: "networkidle" });
      const m = await page.evaluate(() => {
        window.scrollTo(500, 0);
        const moved = window.scrollX;
        window.scrollTo(0, 0);
        const de = document.documentElement;
        // widest culprits: any element whose right edge passes the layout viewport
        const vw = de.clientWidth;
        const wide = [...document.querySelectorAll("*")]
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.width && r.right > vw + 1)
          .sort((a, b) => b.r.right - a.r.right)
          .slice(0, 4)
          .map(({ el, r }) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} ${Math.round(r.right)} (${getComputedStyle(el).position})`);
        return { vw, innerWidth: window.innerWidth, scrollWidth: de.scrollWidth, moved, wide };
      });
      console.log(`${label} ${width} ${route} vw=${m.vw} inner=${m.innerWidth} scrollW=${m.scrollWidth} scrollX-after-push=${m.moved} ${m.wide.join(" | ")}`);
    }
    await ctx.close();
  }
}
await browser.close();
