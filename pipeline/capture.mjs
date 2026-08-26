/**
 * capture.mjs — the screenshot engine.
 *
 * One job: given a URL and a slug, leave two WebP files on disk (light and
 * dark) that the /sites gallery can render. `publish.mjs` will call
 * `captureSite()` per new bookmark; the CLI entry at the bottom is for seeding
 * and for re-shooting a single entry by hand.
 *
 * Two deliberate choices, both learned the hard way by everyone who has built
 * one of these:
 *
 *   1. NEVER `networkidle`. Analytics beacons, poll loops, and video ads keep
 *      the network busy forever, so `networkidle` either hangs or resolves at
 *      a random moment. We wait for `load`, then for webfonts, then sit still
 *      for a fixed beat and shoot. Predictable beats clever.
 *   2. Dark is optional. A site that ignores `prefers-color-scheme` still
 *      deserves a gallery card, so a dark failure downgrades to light-only
 *      rather than losing the entry. A light failure is fatal: an entry with
 *      no picture is not an entry. A dark shot that comes back pixel-identical
 *      to the light one is the same situation by another route — the site has
 *      one rendering — so it is dropped rather than committed twice.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";
import sharp from "sharp";

/** Desktop shot, 1x. Retina would quadruple the bytes for no gallery gain. */
const VIEWPORT = { width: 1440, height: 900 };
const DEVICE_SCALE_FACTOR = 1;

/** After fonts are ready: entrance animations and lazy images land in here. */
const SETTLE_MS = 2500;

/** Wall-clock ceiling for one shot, navigation and settle included. */
const SHOT_TIMEOUT_MS = 45_000;

/** ~100-300KB at this viewport, which keeps the repo a repo. */
const WEBP_QUALITY = 82;

const SCHEMES = /** @type {const} */ (["light", "dark"]);

/** Repo-root `public/shots` — where the site expects to find its imagery. */
export const DEFAULT_OUT_DIR = fileURLToPath(
  new URL("../public/shots", import.meta.url),
);

class ShotTimeout extends Error {}

/**
 * Rejects if `work` outruns the deadline. The underlying page work is not
 * cancellable, so the caller still has to close the context afterwards —
 * which is why every context below is closed by its owner, not by `shoot`.
 *
 * @template T
 * @param {Promise<T>} work
 * @param {string} label
 * @returns {Promise<T>}
 */
function withDeadline(work, label) {
  /** @type {ReturnType<typeof setTimeout>} */
  let timer;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new ShotTimeout(`${label} exceeded ${SHOT_TIMEOUT_MS}ms`)),
      SHOT_TIMEOUT_MS,
    );
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

/**
 * One page, one colour scheme, one PNG buffer.
 *
 * @param {import("playwright").Browser} browser
 * @param {string} url
 * @param {"light" | "dark"} colorScheme
 * @returns {Promise<Buffer>}
 */
async function shoot(browser, url, colorScheme) {
  const context = await browser.newContext({
    colorScheme,
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    // Sites that gate on motion preference should render their resting state:
    // a shot taken mid-animation is a shot of nothing.
    reducedMotion: "reduce",
  });

  try {
    return await withDeadline(
      (async () => {
        const page = await context.newPage();
        page.setDefaultTimeout(SHOT_TIMEOUT_MS);

        await page.goto(url, {
          waitUntil: "load",
          timeout: SHOT_TIMEOUT_MS,
        });

        // Webfonts swap in after `load`. Shooting before they land gives you a
        // screenshot of the fallback stack, which is a screenshot of the wrong
        // site. A page with no webfonts resolves this immediately.
        await page.evaluate(() => document.fonts.ready);

        await page.waitForTimeout(SETTLE_MS);

        return await page.screenshot({ type: "png" });
      })(),
      `${colorScheme} shot of ${url}`,
    );
  } finally {
    await context.close().catch(() => {
      // The browser is torn down by the caller regardless; a close failure
      // here would otherwise mask the real capture error.
    });
  }
}

/**
 * PNG buffer in, WebP file on disk out.
 *
 * @param {Buffer} png
 * @param {string} file
 * @returns {Promise<string>}
 */
async function writeWebp(png, file) {
  const webp = await sharp(png).webp({ quality: WEBP_QUALITY }).toBuffer();
  await writeFile(file, webp);
  return file;
}

/**
 * Capture one site in both themes.
 *
 * @param {object} options
 * @param {string} options.url        Page to shoot.
 * @param {string} options.slug       Filename stem; also the gallery slug.
 * @param {string} [options.outDir]   Defaults to repo `public/shots`.
 * @returns {Promise<{ light: string, dark: string | null }>}
 *   Absolute paths of the files written. `dark` is null when the dark shot
 *   failed and the entry is publishing light-only.
 */
export async function captureSite({ url, slug, outDir = DEFAULT_OUT_DIR }) {
  if (typeof url !== "string" || url.trim() === "") {
    throw new Error("captureSite needs a url");
  }
  if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`captureSite needs a URL-safe slug (got ${JSON.stringify(slug)})`);
  }

  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    /** @type {Partial<Record<"light" | "dark", Buffer>>} */
    const shots = {};

    for (const scheme of SCHEMES) {
      try {
        shots[scheme] = await shoot(browser, url, scheme);
      } catch (error) {
        // Light is load-bearing, dark is a bonus. Rethrow one, log the other.
        if (scheme === "light") throw error;
        console.warn(
          `capture: ${slug} dark shot failed, publishing light-only — ${describe(error)}`,
        );
      }
    }

    // Non-null by construction: a missing light buffer threw above.
    const lightPng = /** @type {Buffer} */ (shots.light);

    // Chromium renders deterministically, so a site with no dark styling
    // returns the very same bytes twice. Storing that second copy would add
    // weight to the repo and a pointless `<source>` to every card.
    const hasDarkRendering =
      shots.dark !== undefined && !shots.dark.equals(lightPng);

    if (shots.dark !== undefined && !hasDarkRendering) {
      console.warn(`capture: ${slug} renders the same in both themes, publishing light-only`);
    }

    const light = await writeWebp(lightPng, path.join(outDir, `${slug}-light.webp`));

    const darkFile = path.join(outDir, `${slug}-dark.webp`);
    let dark = null;

    if (hasDarkRendering) {
      dark = await writeWebp(/** @type {Buffer} */ (shots.dark), darkFile);
    } else {
      // A re-capture can turn a two-shot entry into a one-shot entry. Clear the
      // stale file so `public/shots` never holds imagery nothing points at.
      await rm(darkFile, { force: true });
    }

    return { light, dark };
  } finally {
    await browser.close();
  }
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function describe(error) {
  if (error instanceof Error) return error.message.split("\n")[0];
  return String(error);
}

/* ---------------------------------------------------------------------------
   CLI — `node pipeline/capture.mjs <url> <slug>`
   Writes into public/shots/ and prints what it wrote.
   --------------------------------------------------------------------------- */

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const [url, slug] = process.argv.slice(2);

  if (!url || !slug) {
    console.error("usage: node pipeline/capture.mjs <url> <slug>");
    process.exit(2);
  }

  try {
    const shots = await captureSite({ url, slug });
    console.log(JSON.stringify(shots, null, 2));
  } catch (error) {
    console.error(`capture failed for ${slug}: ${describe(error)}`);
    process.exit(1);
  }
}
