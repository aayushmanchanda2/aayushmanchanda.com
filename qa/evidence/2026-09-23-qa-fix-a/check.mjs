// QA phase 2, Fix A: the checks the unit tests cannot make. Run from the repo root
// against a local preview: node qa/evidence/2026-09-23-qa-fix-a/check.mjs http://localhost:4329
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:4329";
const out = new URL(".", import.meta.url).pathname;
const report = {};
const browser = await chromium.launch();
const mod = process.platform === "darwin" ? "Meta" : "Control";

async function page(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts });
  await ctx.addInitScript(() => { try { localStorage.setItem("theme", "light"); } catch {} });
  return [ctx, await ctx.newPage()];
}

// A5 + A6: palette over the sites panel, and the panel's history.
{
  const [ctx, p] = await page();
  await p.goto(`${base}/sites`);
  await p.locator("a[data-site-open]:visible").first().click();
  await p.waitForSelector("[data-site-panel][data-open] [data-site-detail]");
  await p.keyboard.press(`${mod}+k`);
  await p.waitForSelector("[data-palette][data-open]");
  await p.keyboard.press("Escape");
  const afterOne = await p.evaluate(() => ({
    palette: document.querySelector("[data-palette]").hasAttribute("data-open"),
    panel: document.querySelector("[data-site-panel]").hasAttribute("data-open"),
    path: location.pathname,
  }));
  await p.screenshot({ path: `${out}a5-escape-once-1280.png` });
  await p.keyboard.press("Escape");
  await p.waitForFunction(() => location.pathname === "/sites");
  const afterTwo = await p.evaluate(() => ({
    panel: document.querySelector("[data-site-panel]").hasAttribute("data-open"),
    path: location.pathname,
    state: history.state,
  }));
  // Open one site, switch to another, close with the button: one step back to the gallery.
  const before = await p.evaluate(() => history.length);
  const tiles = p.locator("a[data-site-open]:visible");
  await tiles.nth(0).click();
  await p.waitForSelector("[data-site-panel][data-open] [data-site-detail]");
  await tiles.nth(3).click({ force: true });
  await p.waitForTimeout(400);
  await p.click("[data-panel-close]");
  await p.waitForFunction(() => location.pathname === "/sites");
  await p.waitForTimeout(200);
  const switched = await p.evaluate((b) => ({
    panel: document.querySelector("[data-site-panel]").hasAttribute("data-open"),
    path: location.pathname,
    addedEntries: history.length - b,
  }), before);
  report.a5a6 = { afterOne, afterTwo, switched };
  await ctx.close();
}

// A7: the jiggle hint and the e key.
{
  const [ctx, p] = await page();
  await p.goto(`${base}/tools`);
  await p.click('[data-view-set="grid"]');
  const hint = await p.evaluate(() => {
    const h = document.querySelector("[data-jiggle-hint]");
    return { text: h.textContent, visible: h.checkVisibility() };
  });
  await p.screenshot({ path: `${out}a7-hint-1280.png` });
  await p.locator("body").press("e");
  const eOutside = await p.evaluate(() => document.querySelector("[data-home]").hasAttribute("data-jiggle"));
  await p.locator(".tile__link").first().focus();
  await p.keyboard.press("e");
  const eInside = await p.evaluate(() => document.querySelector("[data-home]").hasAttribute("data-jiggle"));
  const hintAfter = await p.evaluate(() => document.querySelector("[data-jiggle-hint]").checkVisibility());
  await p.keyboard.press("Escape");
  report.a7 = { hint, eOutside, eInside, hintAfterFirstUse: hintAfter };
  await ctx.close();

  const [ctx2, m] = await page({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await m.goto(`${base}/tools`);
  await m.tap('[data-view-set="grid"]');
  report.a7.touchHint = await m.evaluate(() => document.querySelector("[data-jiggle-hint]").textContent);
  await m.screenshot({ path: `${out}a7-hint-390-touch.png` });
  await m.waitForTimeout(6300);
  report.a7.touchHintAfter6s = await m.evaluate(() => document.querySelector("[data-jiggle-hint]").checkVisibility());
  await ctx2.close();
}

// A9 + A11: narrow widths.
for (const width of [320, 360, 390]) {
  const [ctx, p] = await page({ viewport: { width, height: 800 } });
  await p.goto(`${base}/library`);
  const seg = await p.evaluate(() => {
    const nav = [...document.querySelectorAll(".seg")].find((el) => el.checkVisibility());
    const r = nav.getBoundingClientRect();
    return {
      navRight: Math.round(r.right),
      viewport: innerWidth,
      clippedItems: [...nav.querySelectorAll(".seg__item")].filter((a) => a.scrollWidth > a.clientWidth + 1 || a.getBoundingClientRect().right > r.right + 0.5).length,
      counts: [...nav.querySelectorAll(".seg__count")].some((c) => c.checkVisibility()),
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  await p.screenshot({ path: `${out}a9-library-${width}.png` });
  await p.goto(`${base}/tools`);
  const tools = await p.evaluate(() => {
    const selects = [...document.querySelectorAll(".controls .select")].map((s) => {
      const r = s.getBoundingClientRect();
      // Text width of the widest option vs the select's own inner box.
      const probe = document.createElement("span");
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${getComputedStyle(s).font}`;
      probe.textContent = s.selectedOptions[0].text;
      document.body.append(probe);
      const need = probe.getBoundingClientRect().width;
      probe.remove();
      return { width: Math.round(r.width), text: Math.round(need), fits: need + 28 <= r.width };
    });
    const row = document.querySelector("tr.row");
    const desc = row.querySelector(".row__desc--phone");
    return {
      selects,
      descWidth: Math.round(desc.getBoundingClientRect().width),
      rowWidth: Math.round(row.getBoundingClientRect().width),
      verdictOnNameLine: row.querySelector(".row__verdict--phone")?.checkVisibility() ?? false,
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  await p.screenshot({ path: `${out}a11-tools-${width}.png` });
  report[`w${width}`] = { seg, tools };
  await ctx.close();
}

// A10: forced colours, palette status, the bar's focus ring, the Design heading.
{
  const [ctx, p] = await page();
  await p.emulateMedia({ forcedColors: "active" });
  await p.goto(`${base}/library/a-great-cold-email-can-change-your-life`);
  await p.locator("mark.hl").first().scrollIntoViewIfNeeded();
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${out}a10-forced-library-article.png` });
  report.a10 = {
    forcedMark: await p.evaluate(() => {
      const m = document.querySelector("mark.hl");
      const s = getComputedStyle(m);
      return { bg: s.backgroundColor, color: s.color, mat: getComputedStyle(document.querySelector(".mat")).backgroundColor };
    }),
  };
  await p.goto(`${base}/tools`);
  await p.screenshot({ path: `${out}a10-forced-tools.png` });
  await p.emulateMedia({ forcedColors: "none" });

  await p.goto(`${base}/tools`);
  await p.keyboard.press(`${mod}+k`);
  await p.waitForSelector("[data-palette][data-open]");
  await p.waitForFunction(() => /result|No matches/.test(document.querySelector("[data-palette-status]").textContent));
  await p.keyboard.type("claude");
  await p.waitForTimeout(200);
  report.a10.palette = await p.evaluate(() => ({
    status: document.querySelector("[data-palette-status]").textContent,
    role: document.querySelector("[data-palette-status]").getAttribute("role"),
    expanded: document.querySelector("[data-palette-input]").getAttribute("aria-expanded"),
    optionRole: document.querySelector("[data-palette-row]")?.getAttribute("role"),
  }));
  await p.screenshot({ path: `${out}a10-palette-active-mark.png` });
  await p.keyboard.type("zzqqxxnomatch");
  await p.waitForTimeout(200);
  report.a10.paletteEmpty = await p.evaluate(() => ({
    status: document.querySelector("[data-palette-status]").textContent,
    expanded: document.querySelector("[data-palette-input]").getAttribute("aria-expanded"),
  }));
  await p.keyboard.press("Escape");

  await p.keyboard.press("Tab");
  await p.keyboard.press("Tab");
  let guard = 0;
  while (guard++ < 12 && !(await p.evaluate(() => document.activeElement?.matches(".bar__search")))) await p.keyboard.press("Tab");
  report.a10.barRing = await p.evaluate(() => {
    const el = document.activeElement;
    return { focused: el?.className, outlineOffset: getComputedStyle(el).outlineOffset };
  });
  await p.screenshot({ path: `${out}a10-bar-focus.png`, clip: { x: 900, y: 0, width: 380, height: 110 } });

  await p.goto(`${base}/sites/about-brian-lovin`);
  report.a10.designHeading = await p.evaluate(() => ({
    h2InSummary: !!document.querySelector("summary h2"),
    h2Before: document.querySelector("details.found")?.previousElementSibling?.outerHTML ?? null,
  }));
  await ctx.close();
}

await browser.close();
writeFileSync(`${out}report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
