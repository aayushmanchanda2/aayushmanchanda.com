// Scripted touch pull at 375x812 (Android Chrome emulation) over CDP.
// node pull.mjs <base> <outdir>. Writes frames, contact.png and pull.json.
import { chromium } from "playwright";
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const [base, out] = process.argv.slice(2);
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const b = await chromium.launch();
const result = {};

async function open(ua, route = "/tools/", reduced = "no-preference") {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, userAgent: ua, deviceScaleFactor: 2, reducedMotion: reduced });
  const page = await ctx.newPage();
  await page.goto(base + route, { waitUntil: "networkidle" });
  await page.evaluate(() => { window.__marker = 1; });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: 187, y }] });
  return { ctx, page, touch };
}
const state = (page) => page.evaluate(() => {
  const el = document.querySelector("[data-pull]");
  const r = el.getBoundingClientRect();
  return { active: el.hasAttribute("data-active"), armed: el.hasAttribute("data-armed"), opacity: getComputedStyle(el).opacity, top: Math.round(r.top), height: Math.round(r.height), pullTop: document.documentElement.hasAttribute("data-pull-top"), overscroll: getComputedStyle(document.documentElement).overscrollBehaviorY, marker: window.__marker ?? null };
});

// 1. full pull on Android: frames, then release -> reload
{
  const { ctx, page, touch } = await open(ANDROID);
  result.androidAtRest = await state(page);
  await touch("touchStart", 150);
  const frames = [];
  for (const dy of [30, 60, 100, 140, 200, 260]) {
    for (let s = 1; s <= 4; s++) await touch("touchMove", 150 + dy - ((4 - s) * 5));
    await page.waitForTimeout(250);
    const png = `${out}/frame-${String(dy).padStart(3, "0")}.png`;
    await page.screenshot({ path: png, clip: { x: 0, y: 0, width: 375, height: 260 } });
    frames.push({ dy, png, ...(await state(page)) });
  }
  result.androidFrames = frames;
  const nav = page.waitForEvent("load", { timeout: 5000 }).then(() => true, () => false);
  await touch("touchEnd");
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${out}/frame-release.png`, clip: { x: 0, y: 0, width: 375, height: 260 } });
  result.androidReloaded = await nav;
  result.androidAfter = await state(page);
  const files = [...frames.map((f) => f.png), `${out}/frame-release.png`];
  const tiles = await Promise.all(files.map((f) => sharp(f).resize(375).toBuffer()));
  const meta = await sharp(tiles[0]).metadata();
  await sharp({ create: { width: 375 * tiles.length + 10 * (tiles.length - 1), height: meta.height, channels: 3, background: "#888" } })
    .composite(tiles.map((input, i) => ({ input, left: i * 385, top: 0 })))
    .png().toFile(`${out}/contact.png`);
  await ctx.close();
}
// 2. short pull: no reload, springs back
{
  const { ctx, page, touch } = await open(ANDROID);
  await touch("touchStart", 150);
  for (let s = 1; s <= 6; s++) await touch("touchMove", 150 + s * 12);
  result.shortMid = await state(page);
  await touch("touchEnd");
  await page.waitForTimeout(600);
  result.shortAfter = await state(page);
  await ctx.close();
}
// 3. scrolled away from the top: a downward drag is a scroll, not a pull
{
  const { ctx, page, touch } = await open(ANDROID);
  await page.evaluate(() => scrollTo(0, 600));
  await page.waitForTimeout(200);
  await touch("touchStart", 300);
  for (let s = 1; s <= 8; s++) await touch("touchMove", 300 + s * 25);
  result.scrolledMid = await state(page);
  await touch("touchEnd");
  await ctx.close();
}
// 4. iOS Safari tab: never ours
{
  const { ctx, page, touch } = await open(IPHONE);
  await touch("touchStart", 150);
  for (let s = 1; s <= 8; s++) await touch("touchMove", 150 + s * 30);
  result.iosMid = await state(page);
  await touch("touchEnd");
  await page.waitForTimeout(600);
  result.iosAfter = await state(page);
  await ctx.close();
}
// 5. reduced motion: fades in place, still reloads
{
  const { ctx, page, touch } = await open(ANDROID, "/experiments/", "reduce");
  await touch("touchStart", 150);
  for (let s = 1; s <= 8; s++) await touch("touchMove", 150 + s * 20);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/reduced-mid.png`, clip: { x: 0, y: 0, width: 375, height: 260 } });
  result.reducedMid = await state(page);
  const nav = page.waitForEvent("load", { timeout: 5000 }).then(() => true, () => false);
  await touch("touchEnd");
  result.reducedReloaded = await nav;
  await ctx.close();
}
await b.close();
writeFileSync(`${out}/pull.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 1));
