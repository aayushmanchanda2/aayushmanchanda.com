// Clerk's pk_live only renders on aayushmanchanda.com, so this proves the branch's
// sign-in CSS on the production page: it lifts the compiled `.signin` rules out of
// this checkout's dev server (the exact scoped CSS the branch ships), wraps prod's
// Clerk root in the same scoped class, and screenshots 390/1280/1600 light + 1280 dark.
//   node qa/evidence/2026-09-23-vet-277/signin-prod.mjs http://localhost:4340 <outdir>
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const [dev, out = "after-signin"] = process.argv.slice(2);
const dir = new URL(`./${out}/`, import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const b = await chromium.launch();
const probe = await b.newPage();
await probe.goto(dev + "/me/fixture/sign-in", { waitUntil: "networkidle" });
const { css, cid } = await probe.evaluate(() => {
  const wrap = document.querySelector(".signin");
  const cid = [...wrap.attributes].find((a) => a.name.startsWith("data-astro-cid"))?.name;
  const css = [...document.querySelectorAll("style")].map((s) => s.textContent).filter((t) => t.includes(".cl-") || t.includes(".gate__widget")).join("\n");
  return { css, cid };
});
await probe.close();
const report = [];
for (const [w, h, theme] of [[390, 844, "light"], [1280, 800, "light"], [1600, 900, "light"], [1280, 800, "dark"], [390, 844, "dark"]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: theme, deviceScaleFactor: 2 });
  await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch {} }, theme);
  const p = await ctx.newPage();
  await p.goto("https://aayushmanchanda.com/me/library", { waitUntil: "networkidle" });
  await p.waitForSelector("input[name=identifier]", { timeout: 15000 });
  const m = await p.evaluate(({ css, cid }) => {
    const root = document.querySelector(".cl-rootBox");
    const wrap = document.createElement("div");
    wrap.className = "signin"; wrap.setAttribute(cid, "");
    root.parentElement.insertBefore(wrap, root); wrap.append(root);
    const widget = document.querySelector(".gate__widget");
    const gcid = [...widget.attributes].find((a) => a.name.startsWith("data-astro-cid"))?.name;
    const style = document.createElement("style");
    // MeGate's scoped cid differs between builds; retarget it to prod's.
    style.textContent = css.replace(/\[data-astro-cid-[a-z0-9]+\](?=[^{]*\.gate)/g, gcid ? `[${gcid}]` : "");
    document.head.append(style);
    return true;
  }, { css, cid });
  await p.waitForTimeout(400);
  const metrics = await p.evaluate(() => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect();
    const input = r("input[name=identifier]"), btn = r(".cl-formButtonPrimary"), line = r(".gate__line");
    let clip = null;
    for (let el = document.querySelector("input[name=identifier]").parentElement; el && !el.classList.contains("gate"); el = el.parentElement)
      if (getComputedStyle(el).overflow !== "visible") clip = el.className;
    const bs = getComputedStyle(document.querySelector(".cl-formButtonPrimary"), "::after").display;
    return { inputLeft: input.left, lineLeft: line.left, inputW: input.width, btnW: btn.width, btnLeft: btn.left, clippingAncestor: clip, gradient: bs, arrow: getComputedStyle(document.querySelector(".cl-buttonArrowIcon")).display };
  });
  report.push({ w, theme, ...metrics });
  await p.screenshot({ path: `${dir}signin-${w}-${theme}.png` });
  await p.focus("input[name=identifier]");
  await p.keyboard.press("Tab"); await p.keyboard.press("Shift+Tab");
  if (w === 390 && theme === "light") await p.screenshot({ path: `${dir}signin-${w}-${theme}-focus.png` });
  await ctx.close();
}
await b.close();
console.table(report);
