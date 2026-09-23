// VET-260 evidence: each mat variant x /tools /sites /library at 1280 light,
// 1280 dark, 390 light, plus one contact sheet per variant.
// usage: node shoot.mjs [variants csv] [base url]
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";

const [variantsArg = "a,b,c", base = "http://localhost:4321"] = process.argv.slice(2);
const routes = ["/tools", "/sites", "/library"];
const views = [
  { w: 1280, h: 800, scheme: "light" },
  { w: 1280, h: 800, scheme: "dark" },
  { w: 390, h: 800, scheme: "light" },
];
const dir = new URL("./", import.meta.url).pathname;

const b = await chromium.launch();
for (const v of variantsArg.split(",")) {
  mkdirSync(`${dir}variant-${v}`, { recursive: true });
  const cells = [];
  for (const { w, h, scheme } of views) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    const p = await ctx.newPage();
    for (const route of routes) {
      await p.goto(base + route, { waitUntil: "networkidle" });
      await p.evaluate((m) => {
        document.documentElement.dataset.mat = m;
        document.querySelector("astro-dev-toolbar")?.remove();
      }, v);
      await p.waitForTimeout(150);
      const name = `variant-${v}/${route.slice(1)}-${w}-${scheme}.png`;
      await p.screenshot({ path: dir + name });
      cells.push({ name, label: `${route} ${w} ${scheme}`, w });
    }
    await ctx.close();
  }
  // contact sheet: the nine shots in a 3x3 grid, rows = views, cols = routes
  const img = (n) => `data:image/png;base64,${readFileSync(dir + n).toString("base64")}`;
  const html = `<body style="margin:0;padding:24px;background:#e5e5e5;font:600 20px system-ui">
    <h1 style="margin:0 0 16px;font-size:28px">VET-260 mat variant ${v}</h1>
    <div style="display:grid;grid-template-columns:repeat(3,640px);gap:20px;align-items:start">
    ${cells.map((c) => `<figure style="margin:0"><figcaption style="margin-bottom:6px">${c.label}</figcaption>
      <img src="${img(c.name)}" style="display:block;width:${c.w === 390 ? 260 : 640}px;border:1px solid #999"></figure>`).join("")}
    </div></body>`;
  const ctx = await b.newContext({ viewport: { width: 2008, height: 800 } });
  const p = await ctx.newPage();
  await p.setContent(html, { waitUntil: "load" });
  await p.screenshot({ path: `${dir}contact-sheet-${v}.png`, fullPage: true });
  await ctx.close();
  console.log(`contact-sheet-${v}.png`);
}
await b.close();
