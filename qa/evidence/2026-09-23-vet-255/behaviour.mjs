// VET-255: the sticky/fixed layers under the frame, scrolled and opened.
import { chromium } from "playwright";
const dir = new URL("./vet-255-behaviour/", import.meta.url).pathname;
const { mkdirSync } = await import("node:fs");
mkdirSync(dir, { recursive: true });
const b = await chromium.launch();
const out = {};
const page = async (w, scheme = "light") => {
  const p = await (await b.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme })).newPage();
  return p;
};
const clean = (p) => p.evaluate(() => document.querySelector("astro-dev-toolbar")?.remove());

let p = await page(1280);
await p.goto("http://localhost:4321/tools", { waitUntil: "networkidle" });
await clean(p);
await p.mouse.wheel(0, 1200);
await p.waitForTimeout(600);
out.toolsScrolled = await p.evaluate(() => ({
  bar: document.querySelector("[data-bar]").getBoundingClientRect().top,
  th: document.querySelector(".th").getBoundingClientRect().top,
}));
await p.screenshot({ path: dir + "tools-scrolled-1280.png" });

await p.goto("http://localhost:4321/sites", { waitUntil: "networkidle" });
await clean(p);
await p.locator("a[data-site-open]").first().click();
await p.waitForTimeout(700);
out.sitePanel = await p.evaluate(() => {
  const r = document.querySelector("[data-site-panel]").getBoundingClientRect();
  return { top: r.top, right: innerWidth - r.right, bottom: innerHeight - r.bottom, left: r.left };
});
await p.screenshot({ path: dir + "sites-panel-1280.png" });

await p.goto("http://localhost:4321/library/philosopher-ceo-kareem-amin", { waitUntil: "networkidle" });
await clean(p);
out.pane = await p.evaluate(() => {
  const r = document.querySelector(".pane").getBoundingClientRect();
  return { top: r.top, bottom: innerHeight - r.bottom, left: r.left };
});
await p.keyboard.press("Meta+k");
await p.waitForTimeout(400);
await p.screenshot({ path: dir + "palette-1280.png" });

p = await page(390, "dark");
await p.goto("http://localhost:4321/notes", { waitUntil: "networkidle" });
await clean(p);
await p.locator(".mnav__trigger").click();
await p.waitForTimeout(500);
await p.screenshot({ path: dir + "menu-390-dark.png" });
await b.close();
console.log(JSON.stringify(out, null, 1));
