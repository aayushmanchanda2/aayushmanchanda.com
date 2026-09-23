// the cut's content box (page) must sit exactly on .stamp's box at each width
import { chromium } from "playwright";
const b = await chromium.launch();
for (const w of [390, 1280, 1600, 1917]) {
  const p = await b.newPage({ viewport: { width: w, height: 800 } });
  await p.goto("http://localhost:4337/sites");
  console.log(w, await p.evaluate(() => {
    const cs = getComputedStyle(document.querySelector(".mat"));
    const page = parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
    return { page: page.toFixed(2), stamp: document.querySelector(".stamp").getBoundingClientRect().left.toFixed(2) };
  }));
  await p.close();
}
await b.close();
