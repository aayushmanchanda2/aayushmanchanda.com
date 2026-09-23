/**
 * preview.mjs — the picture a /tools hover card shows: the first screen of the
 * tool's own site, fetched once and kept in this repository.
 *
 * The card (`src/lib/preview-card.ts`) is 400px wide at a 40:21 ratio, so the
 * shot is a 1200×630 viewport in the light scheme, stored at 800×420: exactly
 * the card's pixels at 2x. Viewport, not full page: a preview is the site's
 * first impression, and the whole scroll already lives on /sites.
 *
 * Everything before the shutter is `capture.mjs`'s (`loadPage`: load, fonts,
 * settle, bot-wall check, walk), and the blank backstop is `challenge.mjs`'s,
 * so a wall is refused here the same way a /sites capture refuses it.
 *
 * Optional like the icon: no file and the card shows the icon and the words.
 * So a failure is a log line and null, never a thrown error.
 *
 * Run directly to backfill every tool: `node pipeline/preview.mjs [--force]`.
 */

import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright";
import sharp from "sharp";

import { CONTEXT_OPTIONS, loadPage, withDeadline } from "./capture.mjs";
import { measureShot, shotLooksBlank } from "./challenge.mjs";
import { resolvePaths } from "./state.mjs";
import { describe } from "./util.mjs";

/** The page is laid out at this size: the Open Graph card shape. */
export const PREVIEW_VIEWPORT = { width: 1200, height: 630 };

/** Stored at the card's 2x pixels; 400px CSS wide in the card. */
export const PREVIEW_WIDTH = 800;

/** Per-file ceiling. Tried at each quality in turn until one fits. */
export const PREVIEW_MAX_BYTES = 60_000;
const QUALITIES = [80, 70, 60, 50, 40];

const TIMEOUT_MS = 30_000;

/**
 * A cookie banner is not the site. Hidden rather than answered: nothing is
 * clicked, so no consent is given or refused. Set on the elements from script,
 * not with a style tag, because a strict CSP refuses an injected stylesheet.
 * ponytail: name matching, not a CMP list; add a selector when a banner slips through.
 */
const CONSENT = `:is([id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i],
  [id*="onetrust" i], [id*="usercentrics" i], [id*="iubenda" i], [id^="ketch"], [class^="ketch-"]):not(html, body)`;

/**
 * A viewport PNG to the stored WebP: 800px wide, the highest quality that fits
 * the byte ceiling (the last one if none does, since a dense page at q40 is
 * still better than no picture).
 *
 * @param {Buffer} png
 * @returns {Promise<Buffer>}
 */
export async function encodePreview(png) {
  const resized = await sharp(png).resize({ width: PREVIEW_WIDTH }).png().toBuffer();
  /** @type {Buffer} */
  let webp = Buffer.alloc(0);
  for (const quality of QUALITIES) {
    webp = await sharp(resized).webp({ quality, effort: 6 }).toBuffer();
    if (webp.length <= PREVIEW_MAX_BYTES) break;
  }
  return webp;
}

/** @param {string} file */
const exists = (file) => access(file).then(() => true, () => false);

/**
 * Shoot one tool's preview into `dir/<slug>.webp`.
 *
 * Idempotent: a file already on disk is kept unless `force`. Pass `browser` to
 * share one Chromium across a backfill; without it, one is launched and closed.
 *
 * @param {object} input
 * @param {string} input.slug
 * @param {string | null} input.url   The product site, else its repository.
 * @param {string} input.dir
 * @param {import("playwright").Browser} [input.browser]
 * @param {boolean} [input.force]
 * @param {(line: string) => void} [input.log]
 * @returns {Promise<string | null>} The file, or null for the icon-only card.
 */
export async function capturePreview({ slug, url, dir, browser, force = false, log = () => {} }) {
  const file = path.join(dir, `${slug}.webp`);
  if (!force && (await exists(file))) return file;
  if (url === null) {
    log(`preview: ${slug} has no url or repo — icon only`);
    return null;
  }

  /** @type {import("playwright").Browser | null} */
  let owned = null;
  /** @type {import("playwright").BrowserContext | undefined} */
  let context;
  try {
    owned = browser === undefined ? await chromium.launch({ headless: true }) : null;
    const ctx = (context = await (owned ?? /** @type {import("playwright").Browser} */ (browser)).newContext({
      ...CONTEXT_OPTIONS,
      viewport: PREVIEW_VIEWPORT,
      colorScheme: "light",
    }));
    const png = await withDeadline(
      (async () => {
        const page = await ctx.newPage();
        page.setDefaultTimeout(TIMEOUT_MS);
        await loadPage(page, url, slug);
        await page.evaluate((selector) => {
          for (const node of document.querySelectorAll(selector)) {
            /** @type {HTMLElement} */ (node).style.setProperty("display", "none", "important");
          }
        }, CONSENT);
        return await page.screenshot({ type: "png" });
      })(),
      `preview of ${slug}`,
      TIMEOUT_MS,
    );
    const webp = await encodePreview(png);
    if (shotLooksBlank(await measureShot(webp))) throw new Error("captured as a blank page");

    await mkdir(dir, { recursive: true });
    await writeFile(`${file}.tmp`, webp);
    await rename(`${file}.tmp`, file);
    log(`preview: ${slug} <- ${url} (${Math.round(webp.length / 1000)}KB)`);
    return file;
  } catch (error) {
    log(`preview: ${slug} — ${describe(error)}, icon only`);
    return null;
  } finally {
    await context?.close().catch(() => {});
    await owned?.close();
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const force = process.argv.includes("--force");
  const paths = resolvePaths(path.resolve(import.meta.dirname, ".."));
  /** @type {{ slug: string, url?: string | null, repo?: string | null }[]} */
  const tools = JSON.parse(await readFile(paths.toolsJson, "utf8"));
  const browser = await chromium.launch({ headless: true });

  /** @type {string[]} */
  const missing = [];
  let next = 0;
  // Three pages at once, the `backfill-design.mjs` number.
  const worker = async () => {
    while (next < tools.length) {
      const tool = /** @type {(typeof tools)[number]} */ (tools[next++]);
      const url = tool.url ?? tool.repo ?? null;
      const got = await capturePreview({ slug: tool.slug, url, dir: paths.previewsDir, browser, force, log: console.log });
      if (got === null) missing.push(tool.slug);
    }
  };
  try {
    await Promise.all([worker(), worker(), worker()]);
  } finally {
    await browser.close();
  }
  console.log(`previews: ${tools.length - missing.length} of ${tools.length}`);
  if (missing.length > 0) console.log(`icon only: ${missing.join(", ")}`);
}
