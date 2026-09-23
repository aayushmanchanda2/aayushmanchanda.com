// VET-262 evidence: five routes x (1280 light, 1280 dark, 390 light) for each
// stamp variant (data-stamp on <html>) into sheet-<variant>.png.
// usage: node shoot.mjs [base url] [variants...]
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";

const [base = "http://localhost:4329", ...picked] = process.argv.slice(2);
const variants = picked.length ? picked : ["base", "post", "full"];
const routes = ["/tools", "/sites", "/library", "/notes/building-this-site", "/"];
const views = [
  { w: 1280, h: 800, scheme: "light" },
  { w: 1280, h: 800, scheme: "dark" },
  { w: 390, h: 800, scheme: "light" },
];
const dir = new URL("./", import.meta.url).pathname;
const b = await chromium.launch();

const shoot = async (variant, { w, h, scheme }, route) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
  const p = await ctx.newPage();
  await p.goto(base + route, { waitUntil: "networkidle" });
  await p.evaluate((v) => (document.documentElement.dataset.stamp = v), variant);
  await p.waitForTimeout(150);
  const name = `${variant}/${route.split("/").filter(Boolean).pop() ?? "home"}-${w}-${scheme}.png`;
  await p.screenshot({ path: dir + name });
  await ctx.close();
  return { name, label: `${route} ${w} ${scheme}`, w };
};

const sheet = async (cells, cols, file, title) => {
  const img = (n) => `data:image/png;base64,${readFileSync(dir + n).toString("base64")}`;
  const html = `<body style="margin:0;padding:24px;background:#e5e5e5;font:600 20px system-ui">
    <h1 style="margin:0 0 16px;font-size:28px">${title}</h1>
    <div style="display:grid;grid-template-columns:repeat(${cols},640px);gap:20px;align-items:start">
    ${cells.map((c) => `<figure style="margin:0"><figcaption style="margin-bottom:6px">${c.label}</figcaption>
      <img src="${img(c.name)}" style="display:block;width:${c.w === 390 ? 312 : 640}px;border:1px solid #999"></figure>`).join("")}
    </div></body>`;
  const ctx = await b.newContext({ viewport: { width: cols * 660 + 28, height: 800 } });
  const p = await ctx.newPage();
  await p.setContent(html, { waitUntil: "load" });
  await p.screenshot({ path: dir + file, fullPage: true });
  await ctx.close();
  console.log(dir + file);
};

for (const variant of variants) {
  mkdirSync(dir + variant, { recursive: true });
  const cells = [];
  for (const v of views) for (const r of routes) cells.push(await shoot(variant, v, r));
  await sheet(cells, routes.length, `sheet-${variant}.png`, `VET-262 stamp: ${variant}`);
}
await b.close();
