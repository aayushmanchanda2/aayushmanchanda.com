// VET-261: the frame's width and horizontal overflow at four widths, and
// whether the ruler digits show
import { chromium } from "playwright";
const b = await chromium.launch();
for (const w of [390, 768, 1024, 1280, 1600]) {
  const p = await b.newPage({ viewport: { width: w, height: 800 } });
  await p.goto("http://localhost:4321/tools", { waitUntil: "networkidle" });
  console.log(await p.evaluate((w) => ({ w, frame: parseFloat(getComputedStyle(document.body).paddingLeft).toFixed(1),
    overflow: document.documentElement.scrollWidth > innerWidth,
    digits: getComputedStyle(document.querySelector(".mat"), "::before").content !== "none" }), w));
  await p.close();
}
await b.close();
