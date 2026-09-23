// VET-263 debug: pixel values at a few points. usage: node px.mjs <route> <w> [x,y ...]
import { chromium } from "playwright";
import sharp from "sharp";
const [route, w, ...pts] = process.argv.slice(2);
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: +w, height: 800 } })).newPage();
await p.goto("http://localhost:4330" + route, { waitUntil: "networkidle" });
const { data, info } = await sharp(await p.screenshot()).raw().toBuffer({ resolveWithObject: true });
const px = (x, y) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)].join("/");
for (const s of pts) { const [x, y] = s.split(",").map(Number); console.log(s, px(x, y)); }
await b.close();
