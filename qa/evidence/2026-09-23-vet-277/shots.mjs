// VET-277 shots: the block (element) and the sign-in page, per size and theme.
//   node qa/evidence/2026-09-23-vet-277/shots.mjs <base> <outdir> [block|page|signin] [sizes] [themes]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const [base, out, what = "block", sizesArg = "390x844,1280x800,1600x900", themesArg = "light"] = process.argv.slice(2);
const dir = new URL(`./${out}/`, import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const ROUTES = {
  verbatim: "/library/jason-liu-codex-operating-system/",
  ours: "/library/how-gumclaw-works/",
  next: "/me/fixture/entry",
  time: "/library/you-cannot-mandate-an-ai-transformation/",
};
const routes = what === "signin" ? { signin: base.includes("localhost") ? "/me/fixture/sign-in" : "/me/library" } : ROUTES;
const sizes = sizesArg.split(",").map((s) => s.split("x").map(Number));
const b = await chromium.launch();
const errors = [];
for (const theme of themesArg.split(","))
  for (const [w, h] of sizes)
    for (const [name, route] of Object.entries(routes)) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: theme, reducedMotion: "reduce", deviceScaleFactor: 2 });
      await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch {} }, theme);
      const p = await ctx.newPage();
      p.on("pageerror", (e) => errors.push(`${route}: ${e.message}`));
      await p.goto(base + route, { waitUntil: "networkidle" });
      const file = `${dir}${name}-${w}-${theme}.png`;
      if (what === "block") {
        const blk = p.locator("section[aria-label='The short version']").first();
        await blk.scrollIntoViewIfNeeded();
        await blk.screenshot({ path: file });
      } else if (what === "signin") {
        await p.waitForTimeout(2500);
        await p.screenshot({ path: file, fullPage: false });
      } else {
        const blk = p.locator("section[aria-label='The short version']").first();
        await blk.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 80));
        await p.screenshot({ path: file });
      }
      await ctx.close();
    }
await b.close();
console.log("done", dir, errors.length ? errors : "no page errors");
