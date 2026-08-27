import { chromium } from "playwright";
const SP =
  "/private/tmp/claude-501/-Users-aayushmanchanda-Downloads-Aayush-AayushOS/c68babf0-2bb5-4b0c-b01b-a79c6633636c/scratchpad";
const URL = process.env.TARGET ?? "http://localhost:4321/";
const tag = process.env.TAG ?? "dev";

const browser = await chromium.launch();

/** @param {{w:number,h:number,scheme:'light'|'dark',pin?:string,rm?:boolean}} o */
async function shot(name, o) {
  const ctx = await browser.newContext({
    viewport: { width: o.w, height: o.h },
    deviceScaleFactor: 2,
    colorScheme: o.scheme,
    reducedMotion: o.rm ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  if (o.pin) {
    await page.addInitScript((t) => {
      try {
        localStorage.setItem("theme", t);
      } catch {}
    }, o.pin);
  }
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const foot = page.locator("footer.foot");
  await foot.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await foot.screenshot({ path: `${SP}/${tag}-${name}.png` });

  const data = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    };
    const glyphLink = q(".foot__link--glyph");
    let hit = null;
    if (glyphLink) {
      const cs = getComputedStyle(glyphLink, "::before");
      hit = { w: cs.width, h: cs.height };
    }
    const centred = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const p = el.parentElement.getBoundingClientRect();
      return +(r.left - p.left - (p.right - r.right)).toFixed(1); // 0 == centred
    };
    return {
      theme: document.documentElement.dataset.theme,
      legalText: q(".foot__legal")?.textContent.trim(),
      glyphAria: glyphLink?.getAttribute("aria-label"),
      glyphSvg: box(q(".foot__link--glyph svg")),
      hitBefore: hit,
      colophonItems: [...document.querySelectorAll(".foot__meta li")].map((l) =>
        l.textContent.trim().replace(/\s+/g, " "),
      ),
      sepColor: getComputedStyle(
        document.querySelector(".foot__meta li + li"),
        "::before",
      ).content,
      metaOffset: centred(q(".foot__meta")),
      legalOffset: centred(q(".foot__legal")),
      rowOffset: centred(q(".foot__row")),
      gapRowToMeta: (() => {
        const a = q(".foot__row").getBoundingClientRect();
        const b = q(".foot__meta").getBoundingClientRect();
        return +(b.top - a.bottom).toFixed(1);
      })(),
      gapMetaToLegal: (() => {
        const a = q(".foot__meta").getBoundingClientRect();
        const b = q(".foot__legal").getBoundingClientRect();
        return +(b.top - a.bottom).toFixed(1);
      })(),
      overflowX:
        document.documentElement.scrollWidth > window.innerWidth
          ? document.documentElement.scrollWidth - window.innerWidth
          : 0,
    };
  });
  console.log(`\n== ${name} (${o.w}px, ${o.scheme}${o.pin ? `, pinned ${o.pin}` : ""}${o.rm ? ", reduced-motion" : ""})`);
  console.log(JSON.stringify(data, null, 1));
  await ctx.close();
}

await shot("desktop-light", { w: 1280, h: 900, scheme: "light" });
await shot("desktop-dark", { w: 1280, h: 900, scheme: "dark" });
// the four looks: a pinned theme fighting the opposite OS
await shot("pin-dark-on-light", { w: 1280, h: 900, scheme: "light", pin: "dark" });
await shot("pin-light-on-dark", { w: 1280, h: 900, scheme: "dark", pin: "light" });
await shot("mobile-light", { w: 375, h: 720, scheme: "light" });
await shot("mobile-dark", { w: 375, h: 720, scheme: "dark" });
await shot("reduced-motion", { w: 1280, h: 900, scheme: "light", rm: true });

await browser.close();
