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
 * So a failure is a log line and null, never a thrown error. **Never a GitHub
 * page:** the site comes from `icon.mjs › siteOf`, so a repository-only tool is
 * shot at its repo's `homepage` or not at all.
 *
 * A /library article or a prose link (`og: true`) tries the page's own
 * og:image first, fetched once and kept here like the shot, and falls back to
 * the viewport shot of the link itself. A GitHub link is never shot.
 *
 * Run directly to backfill every tool: `node pipeline/preview.mjs [--force]`,
 * or every /library article: `node pipeline/preview.mjs library [--force]`.
 */

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright";
import sharp from "sharp";

import { CONTEXT_OPTIONS, loadPage, withDeadline } from "./capture.mjs";
import { measureShot, shotLooksBlank } from "./challenge.mjs";
import { siteOf } from "./icon.mjs";
import { NOT_A_SITE } from "./readme-site.mjs";
import { resolvePaths } from "./state.mjs";
import { backfill, describe, writeAtomic } from "./util.mjs";

/** The page is laid out at this size: the Open Graph card shape. */
export const PREVIEW_VIEWPORT = { width: 1200, height: 630 };

/** Stored at the card's 2x pixels; 400px CSS wide in the card. */
export const PREVIEW_WIDTH = 800;

/** Per-file ceiling. Tried at each quality in turn until one fits. */
export const PREVIEW_MAX_BYTES = 60_000;
const QUALITIES = [80, 70, 60, 50, 40];

const TIMEOUT_MS = 30_000;
const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; aayushmanchanda.com preview fetch)" };
/** An og:image bigger than this is not a card picture. */
const MAX_IMAGE_BYTES = 8_000_000;

/** @type {Record<string, string>} */
const ENTITIES = { amp: "&", quot: '"', lt: "<", gt: ">", "#39": "'", "#x27": "'" };
/** @param {string} text */
const unescape = (text) => text.replace(/&(amp|quot|#39|#x27|lt|gt);/g, (_, /** @type {string} */ name) => ENTITIES[name] ?? "");

/**
 * The og:image (else twitter:image) and the title a page declares in its head.
 *
 * @param {string} html
 * @param {string} base  The page's URL, for a relative image path.
 * @returns {{ image: string | null, title: string | null }}
 */
export function metaFrom(html, base) {
  /** @type {Record<string, string>} */
  const meta = {};
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /\bcontent\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
    if (key && content && !(key in meta)) meta[key] = unescape((content[2] ?? content[3] ?? "").trim());
  }
  const raw = meta["og:image"] || meta["og:image:url"] || meta["twitter:image"] || null;
  let image = null;
  try {
    image = raw === null ? null : new URL(raw, base).href;
  } catch {}
  if (image !== null && !/^https?:/.test(image)) image = null;
  const title = meta["og:title"] || unescape(/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? "") || null;
  return { image, title };
}

/**
 * `metaFrom` for a live page, or nulls when it will not load.
 *
 * @param {string} url @param {typeof globalThis.fetch} [fetch]
 */
export async function readMeta(url, fetch = globalThis.fetch) {
  try {
    const response = await fetch(url, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return { image: null, title: null };
    return metaFrom(await response.text(), response.url || url);
  } catch {
    return { image: null, title: null };
  }
}

/**
 * An og:image as the stored preview: cropped to the card's 40:21 (1200×630 is
 * the og size, so most need no crop), then `encodePreview`. Null when it will
 * not download or decode.
 *
 * @param {string} src @param {typeof globalThis.fetch} fetch
 */
async function ogPreview(src, fetch) {
  const response = await fetch(src, { headers: HEADERS, signal: AbortSignal.timeout(15_000) });
  if (!response.ok || !(response.headers.get("content-type") ?? "").startsWith("image/")) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) return null;
  const png = await sharp(bytes).resize(PREVIEW_VIEWPORT.width, PREVIEW_VIEWPORT.height, { fit: "cover" }).png().toBuffer();
  const webp = await encodePreview(png);
  // A flat card (one colour, a lone word) says less than the page does.
  return shotLooksBlank(await measureShot(webp)) ? null : webp;
}

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
 * @param {typeof globalThis.fetch} [input.fetch]
 * @param {boolean} [input.force]
 * @param {boolean} [input.og]  The page's og:image first, and the link itself rather than its site.
 * @param {(line: string) => void} [input.log]
 * @returns {Promise<string | null>} The file, or null for the icon-only card.
 */
export async function capturePreview({ slug, url: given, dir, browser, fetch = globalThis.fetch, force = false, og = false, log = () => {} }) {
  const file = path.join(dir, `${slug}.webp`);
  if (!force && (await exists(file))) return file;
  if (og) {
    const shootable = given !== null && URL.canParse(given) && !NOT_A_SITE.test(new URL(given).hostname.replace(/^www\./, ""));
    const { image } = given === null ? { image: null } : await readMeta(given, fetch);
    const webp = image === null ? null : await ogPreview(image, fetch).catch(() => null);
    if (webp !== null && (await writeAtomic(file, webp).then(() => true, () => false))) {
      log(`preview: ${slug} <- og:image ${image} (${Math.round(webp.length / 1000)}KB)`);
      return file;
    }
    if (!shootable) {
      log(`preview: ${slug} has no og:image and is not shot — none`);
      return null;
    }
  }
  const url = og ? given : await siteOf(given, fetch);
  if (url === null) {
    log(`preview: ${slug} has no site of its own — icon only`);
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

    await writeAtomic(file, webp);
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
  const library = process.argv.includes("library");
  const paths = resolvePaths(path.resolve(import.meta.dirname, ".."));
  /** @type {{ slug: string, kind?: string, url?: string | null, repo?: string | null }[]} */
  const entries = JSON.parse(await readFile(library ? paths.libraryJson : paths.toolsJson, "utf8"));
  const tools = library ? entries.filter((entry) => entry.kind === "article") : entries;
  const dir = library ? path.join(paths.previewsDir, "library") : paths.previewsDir;
  const browser = await chromium.launch({ headless: true });

  /** @type {string[]} */
  const missing = [];
  try {
    // Three pages at once, the `backfill-design.mjs` number.
    await backfill(
      tools,
      async (tool) => {
        const url = tool.url ?? tool.repo ?? null;
        const got = await capturePreview({ slug: tool.slug, url, dir, browser, force, og: library, log: console.log });
        if (got === null) missing.push(tool.slug);
      },
      3,
    );
  } finally {
    await browser.close();
  }
  console.log(`previews: ${tools.length - missing.length} of ${tools.length}`);
  if (missing.length > 0) console.log(`icon only: ${missing.join(", ")}`);
}
