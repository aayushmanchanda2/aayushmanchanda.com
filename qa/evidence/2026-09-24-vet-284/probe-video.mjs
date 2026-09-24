import { chromium } from "playwright";
const b = await chromium.launch();
for (const [w,h] of [[820,1180],[1024,1366]]) {
const c = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
const p = await c.newPage();
await p.goto("http://localhost:4384/library/kind/video/", { waitUntil: "networkidle" });
console.log(w, await p.evaluate(() => { const pane = document.querySelector("[data-pane]"); const r = pane.getBoundingClientRect(); const cs = getComputedStyle(pane);
  const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height * 0.7);
  return { r: [r.x, r.y, r.width, r.height], sh: pane.scrollHeight, ch: pane.clientHeight, ov: cs.overflowY, pos: cs.position, docH: document.documentElement.scrollHeight, vh: innerHeight, at: el && (el.className || el.tagName) , atPath: el && el.closest("[data-pane]") ? "in pane" : "outside" }; }));
await c.close(); }
await b.close();
