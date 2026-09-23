// VET-261: arc.net computed backgrounds of every element painting the noise tile
import { chromium } from "playwright";
const dir = new URL("./", import.meta.url).pathname;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto("https://arc.net", { waitUntil: "networkidle" });
await p.screenshot({ path: dir + "arc-hero-1280.png" });
const out = await p.evaluate(() => [...document.querySelectorAll("*")].flatMap((el) =>
  [null, "::before", "::after"].map((ps) => [el, ps, getComputedStyle(el, ps)]).filter(([, , cs]) => /noise|gradient/.test(cs.backgroundImage))
    .map(([el, ps, cs]) => ({ tag: el.tagName + (ps ?? ""), cls: el.className?.baseVal ?? el.className, bgc: cs.backgroundColor, bgi: cs.backgroundImage.slice(0, 160), size: cs.backgroundSize, blend: cs.mixBlendMode, opacity: cs.opacity, top: Math.round(el.getBoundingClientRect().top + scrollY) }))));
console.log(JSON.stringify(out, null, 1));
await b.close();
