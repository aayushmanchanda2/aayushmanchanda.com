// VET-261 evidence: five routes x (1280 light, 1280 dark, 390 light) into
// <tag>-sheet.png, plus the open menu at 390 and 1280 (both themes) into
// <tag>-menu-sheet.png.
// usage: node shoot.mjs <tag> [base url]
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";

const [tag = "after", base = "http://localhost:4321"] = process.argv.slice(2);
const routes = ["/", "/tools", "/sites", "/library", "/notes"];
const views = [
  { w: 1280, h: 800, scheme: "light" },
  { w: 1280, h: 800, scheme: "dark" },
  { w: 390, h: 800, scheme: "light" },
];
const dir = new URL("./", import.meta.url).pathname;
mkdirSync(`${dir}${tag}`, { recursive: true });

const b = await chromium.launch();
const shoot = async ({ w, h, scheme }, route, menu) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
  const p = await ctx.newPage();
  await p.goto(base + route, { waitUntil: "networkidle" });
  await p.evaluate(() => document.querySelector("astro-dev-toolbar")?.remove());
  if (menu) {
    await p.click('[aria-controls="mobile-nav-panel"]');
    await p.waitForTimeout(900);
  }
  await p.waitForTimeout(150);
  const name = `${tag}/${menu ? "menu-" : ""}${route.slice(1) || "home"}-${w}-${scheme}.png`;
  await p.screenshot({ path: dir + name });
  await ctx.close();
  return { name, label: `${menu ? "menu " : ""}${route} ${w} ${scheme}`, w };
};

const sheet = async (cells, cols, file, title) => {
  const img = (n) => `data:image/png;base64,${readFileSync(dir + n).toString("base64")}`;
  const html = `<body style="margin:0;padding:24px;background:#e5e5e5;font:600 20px system-ui">
    <h1 style="margin:0 0 16px;font-size:28px">${title}</h1>
    <div style="display:grid;grid-template-columns:repeat(${cols},640px);gap:20px;align-items:start">
    ${cells.map((c) => `<figure style="margin:0"><figcaption style="margin-bottom:6px">${c.label}</figcaption>
      <img src="${img(c.name)}" style="display:block;width:${c.w === 390 ? 260 : 640}px;border:1px solid #999"></figure>`).join("")}
    </div></body>`;
  const ctx = await b.newContext({ viewport: { width: cols * 660 + 28, height: 800 } });
  const p = await ctx.newPage();
  await p.setContent(html, { waitUntil: "load" });
  await p.screenshot({ path: dir + file, fullPage: true });
  await ctx.close();
  console.log(file);
};

// rows = views, cols = routes
const cells = [];
for (const v of views) for (const r of routes) cells.push(await shoot(v, r, false));
await sheet(cells, routes.length, `${tag}-sheet.png`, `VET-261 ${tag}`);

const menus = [];
for (const v of [views[2], { w: 390, h: 800, scheme: "dark" }, views[0], views[1]]) menus.push(await shoot(v, "/tools", true));
await sheet(menus, 4, `${tag}-menu-sheet.png`, `VET-261 ${tag}: open menu`);
await b.close();
