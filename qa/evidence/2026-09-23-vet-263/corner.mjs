// VET-263: 3x crops of the stamp's bottom-left corner (perforation, keyline,
// year mark, mat, and whatever is scrolling past) at 1280, light and dark:
// /library at the top and scrolled half way (the document and the pane), and
// /library/<slug> scrolled to the bottom. usage: node corner.mjs <age>
import { chromium } from "playwright";
const [age = "subtle"] = process.argv.slice(2);
const dir = new URL("./", import.meta.url).pathname;
const shots = [
  ["/library", 0, "top"],
  ["/library", 0.5, "scrolled"],
  ["/library/herdr-crash-course-a-beginner-s-guide", 1, "bottom"],
];
const b = await chromium.launch();
const cells = [];
for (const [route, f, label] of shots) {
  for (const scheme of ["light", "dark"]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: scheme, deviceScaleFactor: 3 });
    const p = await ctx.newPage();
    await p.goto("http://localhost:4330" + route, { waitUntil: "networkidle" });
    await p.evaluate(([a, f]) => {
      document.documentElement.dataset.age = a;
      const doc = document.scrollingElement;
      doc.scrollTo({ top: (doc.scrollHeight - innerHeight) * f, behavior: "instant" });
      const pane = document.querySelector(".pane");
      pane?.scrollTo({ top: (pane.scrollHeight - pane.clientHeight) * f, behavior: "instant" });
    }, [age, f]);
    await p.waitForTimeout(250);
    const png = await p.screenshot({ clip: { x: 0, y: 690, width: 420, height: 110 } });
    cells.push({ src: png.toString("base64"), label: `${route} ${label}, ${scheme}` });
    await ctx.close();
  }
}
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await p.setContent(`<body style="margin:0;padding:8px;background:#ddd;font:600 14px system-ui">
  <p style="margin:0 0 8px">VET-263 corner, ${age}, 1280 at 3x</p>
  <div style="display:grid;grid-template-columns:repeat(2,630px);gap:8px">
  ${cells.map((c) => `<figure style="margin:0"><figcaption>${c.label}</figcaption><img src="data:image/png;base64,${c.src}" style="display:block;width:630px"></figure>`).join("")}
  </div></body>`);
await p.screenshot({ path: `${dir}corner-${age}.png`, fullPage: true });
await b.close();
console.log(`${dir}corner-${age}.png`);
