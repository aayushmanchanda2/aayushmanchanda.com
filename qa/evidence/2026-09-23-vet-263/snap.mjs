// VET-263: one screenshot. usage: node snap.mjs <route> <w> <scheme> <out> [age] [scrollY]
import { chromium } from "playwright";
const [route, w = "1280", scheme = "light", out, age, y = "0"] = process.argv.slice(2);
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: +w, height: 800 }, colorScheme: scheme })).newPage();
await p.goto("http://localhost:4330" + route, { waitUntil: "networkidle" });
if (age) await p.evaluate((a) => (document.documentElement.dataset.age = a), age);
if (+y) await p.evaluate((top) => { scrollTo({ top, behavior: "instant" }); document.querySelector(".pane")?.scrollTo({ top, behavior: "instant" }); }, +y);
await p.waitForTimeout(200);
await p.screenshot({ path: out });
await b.close();
