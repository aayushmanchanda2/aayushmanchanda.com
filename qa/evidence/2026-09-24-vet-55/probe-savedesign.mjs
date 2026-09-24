// Reference only: reads save.design/explore's facet row DOM + computed styles.
import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto("https://save.design/explore", { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
const style = (sel) => p.evaluate((sel) => [...document.querySelectorAll("button, a, div, span")].filter((e) => e.childElementCount < 4 && sel.includes(e.textContent.trim())).slice(0, 8).map((e) => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return { tag: e.tagName, text: e.textContent.trim(), html: e.outerHTML.slice(0, 400), box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], font: cs.fontSize + "/" + cs.fontWeight + " " + cs.fontFamily.slice(0, 30), radius: cs.borderRadius, bg: cs.backgroundColor, color: cs.color, border: cs.borderTop, pad: cs.padding, gap: cs.gap }; }), sel);
console.log(JSON.stringify(await style(["Category", "Websites", "Shuffle"]), null, 1));
const btn = p.getByText("Category", { exact: true }).first();
await btn.click().catch((e) => console.log("click", e.message));
await p.waitForTimeout(800);
console.log(JSON.stringify(await p.evaluate(() => { const pop = [...document.querySelectorAll("[role=menu],[role=listbox],[role=dialog],[data-radix-popper-content-wrapper],[data-state=open]")]; return pop.slice(0, 3).map((e) => ({ html: e.outerHTML.slice(0, 1500), text: e.innerText.slice(0, 600) })); }), null, 1));
await p.screenshot({ path: "qa/evidence/2026-09-24-vet-55/ref-savedesign.png", clip: { x: 0, y: 0, width: 1280, height: 700 } });
await b.close();
