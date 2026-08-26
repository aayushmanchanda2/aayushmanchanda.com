/**
 * og.mjs — generates the one social card, `public/og.png`.
 *
 * This is a build *tool*, not a build *step*. It is run by hand (`npm run og`)
 * and its output is committed, for one reason: the card has to be set in Geist,
 * and Geist lives in `node_modules` as a woff2 rather than in any system font
 * directory. A rasteriser that resolves fonts through fontconfig (which is what
 * an SVG-to-PNG path gives you) would silently fall back to whatever sans the
 * build machine happens to have, and the card would render in the wrong
 * typeface on Vercel while looking correct locally. Silent visual drift on a
 * file nobody re-checks is the worst kind.
 *
 * So the text is laid out by the one thing on the machine that is guaranteed to
 * honour an `@font-face`: a browser. Playwright is already a devDependency
 * here (`pipeline/capture.mjs` uses it), and the fonts are inlined as data URIs
 * so the page has no filesystem or network dependency at all. Sharp then
 * normalises the buffer to a real 1200x630 PNG.
 *
 * Re-run this after changing the wordmark, the palette, or the section list.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import sharp from "sharp";

/** The Open Graph consensus size. Every consumer crops from this. */
const WIDTH = 1200;
const HEIGHT = 630;

/**
 * Light theme, because it is the `:root` default in `src/styles/global.css`
 * and therefore what the site "is" before a viewer's OS gets a vote. A card
 * cannot respond to `prefers-color-scheme`, so it has to pick one.
 */
const BG = "#ffffff";
const FG = "#171717";
/** `--faint`: the same 45% ink the site uses for metadata. */
const FAINT = "rgb(23 23 23 / 0.45)";
const HAIRLINE = "rgb(23 23 23 / 0.1)";

const OUT = fileURLToPath(new URL("../public/og.png", import.meta.url));

/** Only the latin subset is needed: the card renders two fixed ASCII strings. */
const FONTS = {
  sans: "../node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
  mono: "../node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2",
};

/** @param {string} relative */
async function dataUri(relative) {
  const bytes = await readFile(fileURLToPath(new URL(relative, import.meta.url)));
  return `data:font/woff2;base64,${bytes.toString("base64")}`;
}

async function html() {
  const [sans, mono] = await Promise.all([dataUri(FONTS.sans), dataUri(FONTS.mono)]);

  return `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: "Geist";
    src: url("${sans}") format("woff2-variations");
    font-weight: 100 900;
  }
  @font-face {
    font-family: "Geist Mono";
    src: url("${mono}") format("woff2-variations");
    font-weight: 100 900;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    background: ${BG};
    color: ${FG};
    font-family: "Geist", sans-serif;
    /* the site's own page padding, scaled to the card */
    padding: 96px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    -webkit-font-smoothing: antialiased;
  }

  h1 {
    font-size: 104px;
    font-weight: 600;
    /* matches the .hero__title optical treatment: tight tracking, and the
       stem pulled flush with the padding edge */
    letter-spacing: -0.045em;
    line-height: 1;
    margin-left: -0.04em;
  }

  .rule {
    height: 1px;
    background: ${HAIRLINE};
    margin: 40px 0 28px;
  }

  .sections {
    font-family: "Geist Mono", monospace;
    font-size: 30px;
    font-weight: 500;
    letter-spacing: 0.02em;
    color: ${FAINT};
  }
</style>
<body>
  <h1>Aayush Manchanda</h1>
  <div class="rule"></div>
  <p class="sections">tools &middot; sites &middot; notes &middot; experiments</p>
</body>`;
}

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
    });

    await page.setContent(await html(), { waitUntil: "load" });
    // The faces are inlined, so this resolves immediately, but shooting before
    // it does would capture a frame of fallback metrics.
    await page.evaluate(() => document.fonts.ready);

    const shot = await page.screenshot({ type: "png" });

    // Sharp is the guarantee that what lands on disk is exactly 1200x630 and a
    // real PNG, whatever the browser handed back.
    const png = await sharp(shot)
      .resize(WIDTH, HEIGHT, { fit: "cover" })
      .png({ compressionLevel: 9 })
      .toBuffer();

    await writeFile(OUT, png);
    console.log(`og.png  ${WIDTH}x${HEIGHT}  ${(png.length / 1024).toFixed(1)}KB`);
  } finally {
    await browser.close();
  }
}

await main();
