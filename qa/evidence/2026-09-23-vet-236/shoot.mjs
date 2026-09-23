// VET-236 evidence: /computer and one tip at 1280 light, 1280 dark, 390 light,
// full page, plus a key-chip probe (a <kbd> injected into a tip's prose).
// usage: node shoot.mjs [base url]
import { chromium } from "playwright";

const [base = "http://localhost:4336"] = process.argv.slice(2);
const routes = ["/computer", "/computer/talk-dont-type", "/computer/build-anything"];
const views = [
  { w: 1280, h: 800, scheme: "light" },
  { w: 1280, h: 800, scheme: "dark" },
  { w: 390, h: 800, scheme: "light" },
];
const dir = new URL("./", import.meta.url).pathname;
const b = await chromium.launch();
for (const r of routes) {
  for (const { w, h, scheme } of views) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    const p = await ctx.newPage();
    await p.goto(base + r, { waitUntil: "networkidle" });
    const name = `vet-236-${r.split("/").filter(Boolean).join("-")}-${w}-${scheme}.png`;
    await p.screenshot({ path: dir + name, fullPage: true });
    console.log(name, await p.evaluate(() => document.documentElement.scrollWidth));
    await ctx.close();
  }
}
for (const scheme of ["light", "dark"]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: scheme });
  const p = await ctx.newPage();
  await p.goto(base + "/computer/talk-dont-type", { waitUntil: "networkidle" });
  await p.evaluate(() => {
    const li = document.querySelector(".prose ol li:nth-child(3)");
    li.insertAdjacentHTML("beforeend", " Probe: <kbd>⌘</kbd> <kbd>V</kbd> to paste.");
  });
  const el = await p.$(".prose ol");
  await el.screenshot({ path: `${dir}vet-236-kbd-probe-${scheme}.png` });
  await ctx.close();
}
await b.close();
