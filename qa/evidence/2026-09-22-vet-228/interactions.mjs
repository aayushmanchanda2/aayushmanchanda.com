// @ts-nocheck: a one-off evidence script, not site code.
// VET-228 interaction proofs beyond shoot.mjs: flip, keyboard focus + Escape, touch never, no layout shift.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const BASE = "http://localhost:4329", OUT = "qa/evidence/2026-09-22-vet-228";
const b = await chromium.launch();
const results = {};
const open = (p) => p.evaluate(() => { const c = document.querySelector(".preview-card"); return !!c && c.hasAttribute("data-open") && c.checkVisibility({ checkOpacity: true }); });

// 1. Flip: a row near the viewport floor opens above itself.
{
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto(`${BASE}/tools`);
  const row = p.locator("tbody tr[data-preview]").nth(6);
  const before = await p.evaluate(() => [document.documentElement.scrollHeight, document.querySelector("tbody tr").getBoundingClientRect().top]);
  await row.hover(); await p.waitForTimeout(450);
  const r = await row.boundingBox(), c = await p.locator(".preview-card").boundingBox();
  const after = await p.evaluate(() => [document.documentElement.scrollHeight, document.querySelector("tbody tr").getBoundingClientRect().top]);
  results.flip = { rowTop: r.y, cardBottom: c.y + c.height, side: await p.locator(".preview-card").getAttribute("data-side"), open: await open(p), pass: c.y + c.height <= r.y };
  results.noLayoutShift = { before, after, pass: JSON.stringify(before) === JSON.stringify(after) };
  await p.screenshot({ path: `${OUT}/flip-1280.png` });
  // Cursor x tracking: move along the same row, the card follows.
  await p.mouse.move(r.x + 150, r.y + r.height / 2); await p.waitForTimeout(50);
  const leftA = (await p.locator(".preview-card").boundingBox()).x;
  await p.mouse.move(r.x + 700, r.y + r.height / 2); await p.waitForTimeout(50);
  const leftB = (await p.locator(".preview-card").boundingBox()).x;
  results.trackX = { leftA, leftB, pass: leftB - leftA > 400 };
  // Close delay: leave, 50ms still open, 250ms closed.
  await p.mouse.move(5, 790); await p.waitForTimeout(50);
  const at50 = await open(p); await p.waitForTimeout(200);
  results.closeDelay = { openAt50ms: at50, openAt250ms: await open(p), pass: at50 && !(await open(p)) };
  await p.close();
}
// 2. Keyboard: Tab to the first row link opens it, Escape closes it.
{
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto(`${BASE}/tools`);
  await p.locator(".row__link").first().focus(); // programmatic focus is not :focus-visible for a link, so press Tab from the button before it
  await p.locator("th[data-sort-key=date] button").focus();
  await p.keyboard.press("Tab"); await p.waitForTimeout(450);
  const focused = await p.evaluate(() => document.activeElement?.className);
  const opened = await open(p);
  await p.screenshot({ path: `${OUT}/focus-1280.png` });
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  results.keyboard = { focused, openedOnFocus: opened, closedOnEscape: !(await open(p)), pass: opened && !(await open(p)) };
  await p.close();
}
// 3. Touch (390, isMobile + hasTouch): the media gate is closed and nothing ever opens.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/tools`);
  const gate = await p.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches);
  await p.locator("tbody tr[data-preview]").first().hover(); await p.waitForTimeout(500);
  await p.locator(".row__link").first().dispatchEvent("pointerover", { pointerType: "touch", bubbles: true }); await p.waitForTimeout(500);
  const node = await p.evaluate(() => !!document.querySelector(".preview-card"));
  await p.screenshot({ path: `${OUT}/touch-390.png` });
  results.touch = { gateMatches: gate, cardNodeExists: node, pass: !gate && !node };
  await ctx.close();
}
await b.close();
writeFileSync(`${OUT}/interactions.json`, JSON.stringify(results, null, 2) + "\n");
console.log(JSON.stringify(results, null, 2));
