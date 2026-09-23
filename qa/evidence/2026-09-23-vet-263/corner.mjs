// VET-263: 3x crop of the stamp's bottom-left corner (perforation, keyline,
// year mark, mat) at 1280, light over dark. usage: node corner.mjs <age> [route]
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const [age = "subtle", route = "/library"] = process.argv.slice(2);
const dir = new URL("./", import.meta.url).pathname;
const b = await chromium.launch();
const shots = [];
for (const scheme of ["light", "dark"]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: scheme, deviceScaleFactor: 3 });
  const p = await ctx.newPage();
  await p.goto("http://localhost:4330" + route, { waitUntil: "networkidle" });
  await p.evaluate((a) => (document.documentElement.dataset.age = a), age);
  await p.waitForTimeout(200);
  shots.push((await p.screenshot({ clip: { x: 0, y: 690, width: 200, height: 110 } })).toString("base64"));
  await ctx.close();
}
const p = await (await b.newContext({ viewport: { width: 600, height: 660 } })).newPage();
await p.setContent(`<body style="margin:0;background:#ddd;font:600 14px system-ui">
  <p style="margin:6px">VET-263 corner, ${age}, ${route} 1280 at 3x (light, dark)</p>
  ${shots.map((s) => `<img src="data:image/png;base64,${s}" style="display:block;width:600px">`).join("")}</body>`);
await p.screenshot({ path: `${dir}corner-${age}.png`, fullPage: true });
await b.close();
console.log(`${dir}corner-${age}.png`);
