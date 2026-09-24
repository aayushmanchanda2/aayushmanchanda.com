// Repro probe: iPad emulation, which element a tap at each row centre hits.
import { chromium, webkit, devices } from "playwright";
const WK = process.env.WK;
const base = process.argv[2] ?? "http://localhost:4391";
const browser = WK ? await webkit.launch({ executablePath: WK }) : await chromium.launch();
for (const [name, dev] of [["iPad (gen 7)", devices["iPad (gen 7)"]], ["iPad Pro 11", devices["iPad Pro 11"]]]) {
  for (const orient of ["portrait", "landscape"]) {
    const vp = orient === "portrait" ? dev.viewport : { width: dev.viewport.height, height: dev.viewport.width };
    const ctx = await browser.newContext({ ...dev, viewport: vp });
    const page = await ctx.newPage();
    for (const [route, view, sel] of [["/tools/", "list", "tr[data-tool]"], ["/tools/", "grid", "li.tile"], ["/sites/", "grid", "li.card"], ["/sites/", "list", "tr[data-preview]"]]) {
      await page.goto(base + route, { waitUntil: "networkidle" });
      await page.evaluate(([v, k]) => { localStorage.setItem(k, v); }, [view, route.includes("tools") ? "tools-view" : "sites-view"]);
      await page.reload({ waitUntil: "networkidle" });
      const hits = await page.evaluate(async (sel) => {
        const items = [...document.querySelectorAll(sel)].filter((el) => el.getClientRects().length);
        const pick = [0, Math.floor(items.length / 2), items.length - 1];
        const out = [];
        for (const i of pick) {
          const el = items[i]; el.scrollIntoView({ block: "center", behavior: "instant" });
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          const a = hit?.closest("a");
          out.push({ i, y: Math.round(r.top), sy: scrollY, want: el.querySelector("a")?.getAttribute("href"), hit: hit?.tagName + "." + hit?.className, href: a?.getAttribute("href") });
        }
        return out;
      }, sel);
      console.log(name, orient, vp.width, route, view, JSON.stringify(hits));
    }
    await ctx.close();
  }
}
await browser.close();
