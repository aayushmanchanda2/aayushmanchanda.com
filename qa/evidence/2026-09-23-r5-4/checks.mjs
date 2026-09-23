// R5-4 scripted checks: the cut is on .mat, the paper layer holds the shadow,
// no VET-262 rim layer remains, forced colours drop the holes, and a resize
// keeps the hole size fixed.
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:4337";
const b = await chromium.launch();
const out = {};
for (const [w, h] of [[390, 844], [1280, 800], [1600, 900]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(`${base}/library`, { waitUntil: "load" });
  out[`${w}`] = await p.evaluate(() => {
    const m = document.querySelector(".mat"), cs = getComputedStyle(m);
    const paper = getComputedStyle(document.querySelector(".mat__paper"));
    const shade = getComputedStyle(document.querySelector(".mat__shade"));
    return {
      maskLayers: cs.maskImage.split("radial-gradient").length - 1,
      maskComposite: cs.maskComposite,
      maskSize: cs.maskSize.split(",")[0],
      border: cs.borderTopWidth, padding: cs.paddingTop,
      paperComposite: paper.maskComposite,
      shadeFilter: shade.filter.slice(0, 60),
      oldLift: document.querySelectorAll(".mat__lift").length,
      docHeight: document.documentElement.scrollHeight,
    };
  });
  await p.close();
}
const fc = await b.newPage({ viewport: { width: 1280, height: 800 }, forcedColors: "active" });
await fc.goto(`${base}/sites`, { waitUntil: "load" });
out.forced = await fc.evaluate(() => ({
  maskHoles: getComputedStyle(document.querySelector(".mat")).maskImage.includes("radial"),
  shade: getComputedStyle(document.querySelector(".mat__shade")).display,
  outline: getComputedStyle(document.querySelector(".stamp")).outlineStyle,
}));
await fc.screenshot({ path: new URL("./forced-sites-1280.png", import.meta.url).pathname });
console.log(JSON.stringify(out, null, 1));
await b.close();
