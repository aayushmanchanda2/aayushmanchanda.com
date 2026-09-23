// R5-4 tag fix 1: tick a tag on /library, then read which boxes are disabled and where they sit.
import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto((process.argv[2] ?? "http://localhost:4337") + "/library");
await p.locator(".library-pane .ltags__sum, [data-tag-box] summary").first().click();
await p.locator('[data-tag-box] label.ltags__tag', { hasText: /^agents/ }).first().click();
const r = await p.evaluate(() => {
  const list = document.querySelector("[data-tag-box] .ltags__list");
  const labels = [...list.children].map((l) => ({ t: l.querySelector("input").value, n: l.querySelector("[data-tag-count]").textContent, off: l.querySelector("input").disabled }));
  return { url: location.search, top: labels, firstDisabledAt: labels.findIndex((l) => l.off), enabledAfterDisabled: labels.some((l, i) => !l.off && labels.slice(0, i).some((x) => x.off)) };
});
console.log(JSON.stringify(r));
await p.screenshot({ path: new URL("./tags-after-1280.png", import.meta.url).pathname });
await b.close();
