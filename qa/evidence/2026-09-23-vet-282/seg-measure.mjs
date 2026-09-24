import { chromium } from "playwright";
const b = await chromium.launch();
for (const w of [320, 360, 375, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 800 } });
  await p.goto("http://localhost:4364/library");
  const r = await p.evaluate(() => {
    const bar = document.querySelector(".views__bar .ltools");
    const seg = bar.querySelector(".seg");
    document.querySelectorAll(".views__bar .seg__count").forEach((c) => (c.style.display = "inline"));
    const items = [...seg.children].map((a) => { a.style.paddingInline = "0.375rem"; a.style.gap = "0.25rem"; return a.scrollWidth; });
    return { container: bar.clientWidth, need: items.reduce((x, y) => x + y, 0) + 2 * (items.length - 1) + 6 };
  });
  console.log(w, r);
}
await b.close();
