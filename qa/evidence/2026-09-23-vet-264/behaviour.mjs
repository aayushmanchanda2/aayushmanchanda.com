// VET-264 behaviour proof against the local preview: keyline mark + sweep, grid static mark,
// moments seeking in place / opening YouTube, long-post lists. Writes behaviour.json beside it.
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
const BASE = "http://localhost:4329";
const out = {};
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const blocked = [];
await ctx.route(/youtube|ytimg|googlevideo/, (r) => { blocked.push(r.request().url()); r.abort(); });
await ctx.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
  const el = document.querySelector(".pt mark.hl:not([data-static])");
  if (el) window.__armed = { on: el.classList.contains("hl--on"), size: getComputedStyle(el).backgroundSize };
}));
const page = await ctx.newPage();
const hosts = new Set();
page.on("request", (r) => hosts.add(new URL(r.url()).host));

// 1. keyline on a short post's page: marked, armed, released once.
await page.goto(`${BASE}/library/arxiv-quickarxiv`);
const mark = page.locator(".pt mark.hl").first();
await page.waitForTimeout(900);
out.keyline = await mark.evaluate((el) => ({ text: el.textContent, on: el.classList.contains("hl--on"), size: getComputedStyle(el).backgroundSize, transition: getComputedStyle(el).transitionProperty }));
await page.mouse.wheel(0, 3000); await page.waitForTimeout(300); await page.mouse.wheel(0, -3000); await page.waitForTimeout(300);
out.keyline.atDomReady = await page.evaluate(() => window.__armed);
out.keyline.stillOnAfterScroll = await mark.evaluate((el) => el.classList.contains("hl--on"));

// 1b. reduced motion: whole mark, no transition.
const rm = await browser.newPage({ reducedMotion: "reduce" });
await rm.goto(`${BASE}/library/arxiv-quickarxiv`);
out.keylineReduced = await rm.locator(".pt mark.hl").first().evaluate((el) => ({ on: el.classList.contains("hl--on"), size: getComputedStyle(el).backgroundSize, transition: getComputedStyle(el).transitionDuration }));
await rm.close();

// 2. grid: static marks, drawn whole.
await page.goto(`${BASE}/library/kind/post`);
out.grid = await page.locator(".pt--grid mark.hl").evaluateAll((els) => els.map((el) => ({ text: el.textContent.slice(0, 40), static: el.hasAttribute("data-static"), size: getComputedStyle(el).backgroundSize })));
out.gridReadMore = await page.locator(".pc__more").count();

// 3. moments on a video with a facade: first press starts the facade at t, second re-points it.
hosts.clear();
await page.goto(`${BASE}/library/anthropic-agents-that-run-for-hours`);
out.momentsHostsBeforeClick = [...hosts].filter((h) => !h.startsWith("localhost"));
const chips = page.locator("a[data-seek]");
out.momentChips = await chips.allTextContents();
await chips.nth(0).click();
out.afterFirst = await page.locator("iframe[data-video]").getAttribute("src");
await chips.nth(1).click();
out.afterSecond = await page.locator("iframe[data-video]").getAttribute("src");
out.iframes = await page.locator("iframe").count();

// 3b. a playlist: no facade, the chip opens YouTube at the second in a new tab.
await page.goto(`${BASE}/library/hermes-agent-masterclass`);
const chip = page.locator("a[data-seek]").first();
out.playlistHref = await chip.getAttribute("href");
out.playlistFacades = await page.locator("a[data-video]").count();
const [popup] = await Promise.all([page.waitForEvent("popup"), chip.click()]);
await popup.waitForLoadState().catch(() => {});
out.playlistPopup = blocked.at(-1);
await popup.close();

// 4. long posts: real lists.
out.lists = {};
for (const slug of ["matt-van-horn-agent-first-workflow", "how-my-parents-raised-me-to-be-confident", "how-pocket-fm-grew-from-zero-to-500m-arr", "cua-computer-history-open-source-local-memory-for-agents"]) {
  await page.goto(`${BASE}/library/${slug}`);
  out.lists[slug] = await page.locator(".pt--page").evaluate((el) => ({
    p: el.querySelectorAll(":scope > p").length, ol: el.querySelectorAll("ol").length, ul: el.querySelectorAll("ul").length, li: el.querySelectorAll("li").length,
    fontSize: getComputedStyle(el).fontSize, lineHeight: getComputedStyle(el).lineHeight, width: el.getBoundingClientRect().width,
    highlights: document.querySelectorAll("#highlights ~ .quotes mark.hl").length,
  }));
}
// 5. the swept marks in view, for the eye: a long post's Highlights and a grid of keylines.
for (const [slug, theme] of [["matt-van-horn-agent-first-workflow", "light"], ["how-pocket-fm-grew-from-zero-to-500m-arr", "dark"]]) {
  const shot = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: theme });
  await shot.addInitScript((t) => localStorage.setItem("theme", t), theme);
  await shot.goto(`${BASE}/library/${slug}`);
  await shot.locator("#highlights").scrollIntoViewIfNeeded();
  await shot.waitForTimeout(1200);
  await shot.screenshot({ path: new URL(`./highlights-${slug}-1280-${theme}.png`, import.meta.url).pathname });
  await shot.close();
}
for (const theme of ["light", "dark"]) {
  const shot = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: theme });
  await shot.addInitScript((t) => localStorage.setItem("theme", t), theme);
  await shot.goto(`${BASE}/library/kind/post`);
  const cards = shot.locator(".wall li", { has: shot.locator("mark.hl") });
  await cards.nth(0).scrollIntoViewIfNeeded();
  await shot.waitForTimeout(400);
  await shot.screenshot({ path: new URL(`./grid-keyline-1280-${theme}.png`, import.meta.url).pathname });
  await shot.close();
}
await browser.close();
writeFileSync(new URL("./behaviour.json", import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
