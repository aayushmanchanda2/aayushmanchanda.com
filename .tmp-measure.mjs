import { chromium } from "playwright";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 375, height: 720 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto("http://localhost:4321/", { waitUntil: "networkidle" });
await page.waitForTimeout(400);

const out = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const r = (el) => {
    const b = el.getBoundingClientRect();
    return { l: +b.left.toFixed(1), r: +b.right.toFixed(1), w: +b.width.toFixed(1) };
  };
  const meta = q(".foot__meta");
  const foot = q(".foot");
  const shell = q(".shell");
  return {
    viewport: window.innerWidth,
    shell: r(shell),
    shellPadL: getComputedStyle(shell).paddingLeft,
    shellPadR: getComputedStyle(shell).paddingRight,
    foot: r(foot),
    meta: r(meta),
    metaScrollW: meta.scrollWidth,
    items: [...meta.querySelectorAll("li")].map((li) => ({
      t: li.textContent.trim().replace(/\s+/g, " "),
      ...r(li),
    })),
    row: r(q(".foot__row")),
    rowScrollW: q(".foot__row").scrollWidth,
    clocks: r(q(".foot__clocks")),
    toggle: r(q(".tt")),
    links: r(q(".foot__links")),
    docScrollW: document.documentElement.scrollWidth,
    searchCase: (() => {
      const cs = getComputedStyle(q(".foot__search"));
      return { tt: cs.textTransform, ls: cs.letterSpacing, fs: cs.fontSize };
    })(),
    aboutCase: (() => {
      const cs = getComputedStyle(q('.foot__meta a[href="/about"]'));
      return { tt: cs.textTransform, ls: cs.letterSpacing, fs: cs.fontSize };
    })(),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
