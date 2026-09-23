// VET-262: 3x crops of the stamp's corners. usage: node zoom.mjs <route> <scheme> <w> [variant]
import { chromium } from "playwright";
const [route = "/tools", scheme = "light", w = "1280", variant = "full", base = "http://localhost:4329"] = process.argv.slice(2);
const dir = new URL("./", import.meta.url).pathname;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: +w, height: 800 }, colorScheme: scheme, deviceScaleFactor: 3 });
const p = await ctx.newPage();
await p.goto(base + route, { waitUntil: "networkidle" });
await p.evaluate((v) => (document.documentElement.dataset.stamp = v), variant);
const tag = `${route.split("/").filter(Boolean).pop() ?? "home"}-${w}-${scheme}-${variant}`;
await p.screenshot({ path: `${dir}zoom-${tag}-bl.png`, clip: { x: 0, y: 700, width: 260, height: 100 } });
await p.screenshot({ path: `${dir}zoom-${tag}-br.png`, clip: { x: +w - 260, y: 700, width: 260, height: 100 } });
await p.screenshot({ path: `${dir}zoom-${tag}-tr.png`, clip: { x: +w - 260, y: 0, width: 260, height: 110 } });
await b.close();
console.log(tag);
