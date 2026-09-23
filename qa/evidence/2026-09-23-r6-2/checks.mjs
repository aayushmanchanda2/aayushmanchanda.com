// VET-273 scripted checks against a local build (python http.server on 4337).
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:4337";
const lib = JSON.parse(readFileSync("src/data/library.json", "utf8"));
const out = {};
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
const page = await ctx.newPage();

let blocks = 0, ours = 0;
const bad = [];
for (const e of lib) {
  await page.goto(`${BASE}/library/${e.slug}/`);
  const has = (await page.locator(".blk").count()) > 0;
  if (has) blocks++;
  if (has !== Boolean(e.block)) bad.push(e.slug);
  if ((await page.locator(".blk .chip", { hasText: "our prompt" }).count()) > 0) ours++;
  if (has) {
    const order = await page.evaluate(() => {
      const b = document.querySelector(".blk"), l = document.querySelector(".lead");
      return !l || Boolean(b.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    if (!order) bad.push(`${e.slug}: block not above TLDR`);
  }
}
out.detailPagesWithBlock = blocks;
out.ourPromptPages = ours;
out.mismatches = bad;

// Copy: exact prompt on the clipboard, visible "Copied", status announced.
const copyOne = async (slug) => {
  await page.goto(`${BASE}/library/${slug}/`);
  const btn = page.locator(".blk__copy");
  await btn.click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  const label = await btn.innerText();
  const status = await page.locator(".blk [data-copy-status]").textContent();
  const want = lib.find((e) => e.slug === slug).block.prompt.text;
  return { slug, exact: clip === want, label, status };
};
out.copy = [await copyOne("jason-liu-codex-operating-system"), await copyOne("matt-van-horn-agent-first-workflow")];

await page.goto(`${BASE}/library/`);
out.paneAlsoHeader = (await page.locator(".pane .pane__also").innerText()).replace(/\s+/g, " ");
out.paneAlsoRows = await page.locator(".pane li[data-also]").count();
out.paneMainRows = await page.locator(".pane [data-rows] > li[data-kind]:not([data-also])").count();
out.toolbarCount = await page.locator(".pane [data-filter-count]").innerText();
out.allViewAlsoRows = await page.locator("#mix-also ~ .feed li").count();
out.allViewAlsoHeader = (await page.locator("#mix-also").innerText()).replace(/\s+/g, " ");
out.monthCountsSum = await page.$$eval(".pane [data-month]:not(.pane__also) [data-month-count]", (els) => els.reduce((n, el) => n + Number(el.textContent), 0));
out.paneTipOneLine = await page.$$eval(".pane li > a > .tip", (els) => els.length && els.every((el) => getComputedStyle(el).webkitLineClamp === "1"));

// Search still finds an also-saved entry.
const search = await (await fetch(`${BASE}/search.json`)).text();
out.searchHasAlsoSaved = search.includes("recreate-1906-market-street-in-blender-with-claude");
const md = await (await fetch(`${BASE}/library.md`)).text();
out.mdBlocks = (md.match(/^Start here:/gm) ?? []).length;
out.mdOurPrompt = (md.match(/\(our prompt, not the source's words\)/g) ?? []).length;
const llms = await (await fetch(`${BASE}/llms.txt`)).text();
out.llmsLine = llms.split("\n").filter((l) => /short version|Also saved/.test(l));

// 390px: one column.
const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
await phone.goto(`${BASE}/library/how-gumclaw-works/`);
out.phoneColumns = await phone.$eval(".blk__rows", (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
out.phoneOverflow = await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth);

await browser.close();
console.log(JSON.stringify(out, null, 2));
