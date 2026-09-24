// Two block variants side by side (A: two rules, B: paper slip), on a verbatim-prompt entry and the private fixture.
//   node qa/evidence/2026-09-23-vet-277/variants.mjs http://localhost:4340
// Variant B ([data-v="b"]: the whole block on a --surface-2 fill, the prompt a white
// card inside it) was prototype CSS, deleted after the pick; a rerun now draws A twice.
import sharp from "sharp";
import { chromium } from "playwright";
const base = process.argv[2];
const dir = new URL(".", import.meta.url).pathname;
const b = await chromium.launch();
const tiles = [];
for (const [route, w] of [["/library/jason-liu-codex-operating-system/", 1280], ["/me/fixture/entry", 390]])
  for (const v of ["a", "b"]) {
    const p = await b.newPage({ viewport: { width: w, height: 1700 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    await p.goto(base + route, { waitUntil: "networkidle" });
    const blk = p.locator("section[aria-label='The short version']").first();
    await blk.evaluate((el, v) => (el.dataset.v = v), v);
    // include the TLDR under it, so the block is judged against its neighbour
    await p.addStyleTag({ content: "astro-dev-toolbar{display:none!important}" });
    const box = await blk.evaluate((el) => {
      window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 150);
      const r = el.getBoundingClientRect(); const lead = el.nextElementSibling?.getBoundingClientRect();
      return { x: r.x - 24, y: r.y - 110, w: r.width + 48, h: Math.max(r.bottom, lead && lead.height ? lead.bottom : 0) - r.y + 134 };
    });
    const buf = await p.screenshot({ clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: box.w, height: box.h } });
    tiles.push({ buf, route, v, w: Math.round(box.w), h: Math.round(box.h) });
    await p.close();
  }
await b.close();
const W = tiles.reduce((m, t) => Math.max(m, t.w), 0), gap = 24;
const rows = [[tiles[0], tiles[1]], [tiles[2], tiles[3]]];
const H = rows.reduce((s, r) => s + Math.max(...r.map((t) => t.h)) + gap, gap);
const composite = []; let y = gap;
for (const r of rows) { let x = gap; for (const t of r) { composite.push({ input: t.buf, left: x, top: y }); x += W + gap; } y += Math.max(...r.map((t) => t.h)) + gap; }
await sharp({ create: { width: 2 * W + 3 * gap, height: H, channels: 3, background: "#888" } }).composite(composite).png().toFile(dir + "variants.png");
console.log("variants.png: left A (two rules), right B (paper slip)");
