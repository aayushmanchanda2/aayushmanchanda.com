// VET-261 contrast: white menu ink against the lightest and mean rendered
// panel pixel (grain included), and three stamp-paper text samples per theme.
import { chromium } from "playwright";
import sharp from "sharp";
const lum = ([r, g, b]) => [r, g, b].map((c) => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return ((x + 0.05) / (y + 0.05)).toFixed(2); };
const rgb = (s) => s.match(/[\d.]+/g).map(Number);
// composite a translucent foreground over its background before measuring
const over = (f, bg) => { const a = f[3] ?? 1; return f.slice(0, 3).map((c, i) => c * a + bg[i] * (1 - a)); };
const b = await chromium.launch();
for (const scheme of ["light", "dark"]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, colorScheme: scheme });
  const p = await ctx.newPage();
  await p.goto("http://localhost:4321/tools", { waitUntil: "networkidle" });
  await p.evaluate(() => document.querySelector("astro-dev-toolbar")?.remove());
  const samples = await p.evaluate(() => {
    const bg = getComputedStyle(document.body).backgroundColor;
    return [["h1", "h1"], ["lede", "main p"], ["row desc", "main td:nth-child(2), main [class*=desc]"]].map(([k, sel]) => {
      const el = document.querySelector(sel);
      return { k, fg: el && getComputedStyle(el).color, bg };
    });
  });
  for (const s of samples) if (s.fg) console.log(scheme, "stamp", s.k, s.fg, "on", s.bg, ratio(over(rgb(s.fg), rgb(s.bg)), rgb(s.bg)));
  await p.click('[aria-controls="mobile-nav-panel"]');
  await p.waitForTimeout(900);
  const box = await p.locator("[data-mnav-panel]").boundingBox();
  // an empty strip of panel above the items: every pixel there is blue + grain
  const png = await p.screenshot({ clip: { x: box.x + 10, y: box.y + 60, width: box.width - 70, height: 80 } });
  const { data } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  let best = null, sum = [0, 0, 0], n = 0;
  for (let i = 0; i < data.length; i += 3) {
    const px = [data[i], data[i + 1], data[i + 2]];
    sum = sum.map((s, j) => s + px[j]); n++;
    if (!best || lum(px) > lum(best)) best = px;
  }
  const mean = sum.map((s) => Math.round(s / n));
  console.log(scheme, "menu white on lightest speck", best, ratio([255, 255, 255], best), "| on mean", mean, ratio([255, 255, 255], mean), "| flat #2b4bff", ratio([255, 255, 255], [43, 75, 255]));
  await ctx.close();
}
await b.close();
