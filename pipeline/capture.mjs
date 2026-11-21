/**
 * capture.mjs — the browser: navigate, walk, shoot, encode, write.
 *
 * One job: given a URL and a slug, leave one WebP file on disk that the /sites
 * gallery can render, plus the handful of colours that file is mostly made of.
 * `publish.mjs` calls `captureSite()` per new bookmark; the CLI entry at the
 * bottom is for seeding and for re-shooting a single entry by hand.
 *
 * The two judgements a shot needs are next door, because neither of them needs
 * Chromium and both are the parts worth testing: `challenge.mjs` decides whether
 * what came back is a page or a bot wall, and `palette.mjs` decides what colours
 * it is made of. What is left here is everything that only a browser can do.
 *
 * Five deliberate choices, each learned the hard way by everyone who has built
 * one of these:
 *
 *   1. NEVER `networkidle`. Analytics beacons, poll loops, and video ads keep
 *      the network busy forever, so `networkidle` either hangs or resolves at
 *      a random moment. We wait for `load`, then for webfonts, then sit still
 *      for a fixed beat and shoot. Predictable beats clever.
 *   2. ONE shot, in whatever scheme the site itself chose. The old engine forced
 *      `colorScheme` twice and shipped a light/dark pair, which cost double the
 *      bytes to say the same thing: a site that ignores `prefers-color-scheme`
 *      returned two identical files, and a site that honours it got a second
 *      picture nobody had asked to see. The context below sets no colour scheme
 *      at all, so what lands on disk is the site's own default — its dominant
 *      look, which is the thing worth saving.
 *   3. The whole page, up to a ceiling. A hero crop tells you a site has a big
 *      headline; the full scroll tells you how it is built. Past `MAX_SHOT_PX`
 *      the picture stops being reference and starts being a megabyte, so the
 *      capture is clipped there and says so in the log.
 *   4. SHOOT it a screen at a time. `fullPage` renders the document at its full
 *      height in one pass, which is not the same thing as scrolling through
 *      it: lazy media below the fold never fetches, and a section that reveals
 *      only while it is on screen (and hides again once scrolled past) is
 *      photographed hidden. So the shot is a stack of viewport tiles, each
 *      taken while its screen is in view. See `shootTiles`.
 *   5. REFUSE a picture of a bot wall. A challenge page is served at HTTP 200
 *      and renders without error, so every check above it passes and a blank
 *      interstitial publishes as the site. See `challenge.mjs`.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";
import sharp from "sharp";

import {
  CaptureBlockedError,
  matchChallenge,
  measureShot,
  readChallengeProbe,
  shotLooksBlank,
} from "./challenge.mjs";
import { readDesign } from "./design.mjs";
import { SHOT_WIDTH, WEBP } from "./image-policy.mjs";
import { extractPalette } from "./palette.mjs";
import { trimTrailingBlank } from "./trim.mjs";
import { describe } from "./util.mjs";

/** @typedef {import("./design.mjs").Design} Design */

/** Desktop width, 1x. Retina would quadruple the bytes for no gallery gain. */
const VIEWPORT = { width: 1440, height: 900 };
const DEVICE_SCALE_FACTOR = 1;

/** After fonts are ready: entrance animations and lazy images land in here. */
const SETTLE_MS = 2500;

/** Ceiling for navigation, and for any one page operation. */
const SHOT_TIMEOUT_MS = 45_000;

/**
 * Wall-clock ceiling for one whole shot: navigation, settle, the walk, and up
 * to fourteen tiles. A WebGL page is the slow case: juliaalvarenga.com takes
 * 30s to load and 3 to 4s per tile screenshot, about 90s in all.
 */
const SHOT_DEADLINE_MS = 120_000;

/* ---------------------------------------------------------------------------
   The walk-down
   --------------------------------------------------------------------------- */

/**
 * Pause after each step of the walk-down, in ms.
 *
 * This is the number that does the work: it is the window in which a lazy image
 * below the fold starts fetching and a scroll-revealed section stops being
 * `opacity: 0`. Measured on save.design, which is the page that exposed the bug:
 * 26 of 43 images undecoded before the walk, 1 of 45 after. Raising this to
 * 300ms, or halving the step, moved neither number — 150ms is already past the
 * knee, and everything beyond it is wall-clock spent for nothing.
 */
const SCROLL_STEP_MS = 150;

/** After the last step, and again after returning to the top. */
const SCROLL_SETTLE_MS = 1000;

/**
 * Hard stop on the walk. The ceiling below already bounds a well-behaved page;
 * this bounds a page that reports a new, larger height every time it is asked —
 * an infinite feed can otherwise walk until the shot deadline kills it.
 */
const MAX_SCROLL_STEPS = 200;

/**
 * Tallest page we will keep, in CSS pixels. Roughly thirteen screens: long
 * enough for every marketing page and portfolio in the gallery, short enough
 * that an infinite-scroll feed cannot hand us a 60,000px PNG to encode.
 */
export const MAX_SHOT_PX = 12_000;

/**
 * Stored width and quality: `image-policy.mjs`. The page is laid out at 1440
 * and stored at `SHOT_WIDTH` (1280), 2x the entry column it is shown in.
 */
/** Repo-root `public/shots` — where the site expects to find its imagery. */
export const DEFAULT_OUT_DIR = fileURLToPath(
  new URL("../public/shots", import.meta.url),
);

class ShotTimeout extends Error {}

/**
 * What the walk-down needs from a page, and nothing else.
 *
 * `scrollThroughPage` below is the part of this module most worth testing and
 * the part hardest to reach, because everything it does happens inside a live
 * browser. Naming the four operations it actually performs is what separates
 * the two: the routine gets a plain object, the browser adapter is the four
 * lines under it, and the tests hand it a fake that records where it was asked
 * to go.
 *
 * @typedef {object} Scroller
 * @property {() => Promise<number>} viewportHeight
 * @property {() => Promise<number>} documentHeight
 * @property {(y: number) => Promise<unknown>} scrollTo
 * @property {(ms: number) => Promise<unknown>} pause
 */

/**
 * A {@link Scroller} backed by a real Playwright page.
 *
 * `behavior: "instant"` rather than the default: a page with
 * `html { scroll-behavior: smooth }` would otherwise animate every hop, and the
 * step pause would be spent watching the scroll rather than waiting for what
 * the scroll was supposed to trigger.
 *
 * @param {import("playwright").Page} page
 * @returns {Scroller}
 */
export function pageScroller(page) {
  return {
    viewportHeight: () => page.evaluate(() => window.innerHeight),
    documentHeight: () => page.evaluate(() => document.documentElement.scrollHeight),
    scrollTo: (y) => page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y),
    pause: (ms) => page.waitForTimeout(ms),
  };
}

/**
 * Walk the page from top to bottom and back, a screen at a time.
 *
 * A full-page screenshot is not a scroll. Chromium renders the document at its
 * full height and captures it in one pass, which means anything the page was
 * waiting for a scroll to do never happens: `loading="lazy"` images below the
 * first screen are never fetched, and sections held at `opacity: 0` until an
 * IntersectionObserver fires stay held. On a dark site the two together produce
 * exactly the reported symptom — a correct hero, then thousands of pixels of
 * flat background where the rest of the page should be.
 *
 * So the shot is preceded by a walk: stop on every screen long enough for the
 * observers to fire and the image requests to go out, settle at the bottom, then
 * return to the top so a sticky header is photographed in its resting state
 * rather than the compact one it collapses to mid-page.
 *
 * The walk stops at `maxPx` plus one screen rather than at the true bottom.
 * Nothing past `MAX_SHOT_PX` survives the clip, so mounting it is time spent on
 * pixels that get thrown away — on a 23,000px page that is the difference
 * between a 2s walk and a 6s one, inside a 45s deadline shared with navigation.
 *
 * @param {Scroller} scroller
 * @param {object} [options]
 * @param {number} [options.maxPx]      Deepest pixel worth mounting.
 * @param {number} [options.stepMs]     Pause on each screen.
 * @param {number} [options.settleMs]   Pause at the bottom, and again at the top.
 * @param {number} [options.maxSteps]   Guard against a page that never ends.
 * @returns {Promise<{ steps: number, depth: number }>}
 *   How many screens were visited, and the deepest pixel reached.
 */
export async function scrollThroughPage(
  scroller,
  {
    maxPx = MAX_SHOT_PX,
    stepMs = SCROLL_STEP_MS,
    settleMs = SCROLL_SETTLE_MS,
    maxSteps = MAX_SCROLL_STEPS,
  } = {},
) {
  // Fall back to the configured viewport rather than to 1: a page reporting no
  // height at all would otherwise be walked a pixel at a time, which is not a
  // spin — `maxSteps` catches it — but is 200 steps to cover 200px, and every
  // one of them costs `stepMs`. The height we asked the context for is the
  // better guess about the height it has.
  const measured = await scroller.viewportHeight();
  const viewport = measured > 0 ? measured : VIEWPORT.height;
  const ceiling = maxPx + viewport;

  let y = 0;
  let steps = 0;
  let depth = 0;

  while (steps < maxSteps) {
    // Re-read every step rather than once up front: mounting the content is the
    // whole point, and content that mounts makes the document taller.
    const furthest = Math.min(await scroller.documentHeight(), ceiling);
    if (y >= furthest) break;

    await scroller.scrollTo(y);
    await scroller.pause(stepMs);

    depth = y;
    y += viewport;
    steps += 1;
  }

  // The last screen, whose top the loop may have stepped straight past.
  const bottom = Math.min(await scroller.documentHeight(), ceiling);
  await scroller.scrollTo(bottom);
  await scroller.pause(settleMs);
  depth = Math.max(depth, bottom);

  await scroller.scrollTo(0);
  await scroller.pause(settleMs);

  return { steps, depth };
}

/* ---------------------------------------------------------------------------
   The tiles
   --------------------------------------------------------------------------- */

/**
 * Least time a tile waits after its scroll: long enough for observers to fire
 * and a reveal transition to start, so `settle` has something to finish.
 */
const TILE_MIN_MS = 350;

/** Most time a tile waits for the images and videos on its screen to paint. */
const TILE_MEDIA_MS = 1500;

/**
 * What the tile walk needs from a page. Same idea as {@link Scroller}: the
 * routine gets a plain object, `pageTiler` is the browser half, and the tests
 * hand it a fake page that hides whatever is off screen.
 *
 * @typedef {object} Tiler
 * @property {() => Promise<number>} viewportHeight
 * @property {() => Promise<number>} documentHeight
 * @property {(y: number) => Promise<number>} scrollTo
 *   Resolves to where the page actually landed, which is less than asked at
 *   the bottom of the page.
 * @property {() => Promise<unknown>} settle
 *   Wait for this screen's media, then finish its running transitions.
 * @property {() => Promise<unknown>} hideRepeats
 *   Hide fixed and stuck chrome, which the first tile already holds.
 * @property {() => Promise<Buffer>} screenshot  The viewport, as PNG.
 */

/**
 * Photograph the page a screen at a time, top to bottom, stopping at `maxPx`.
 *
 * Each tile is shot while its screen is in view, so a section that is visible
 * only on screen is visible in its tile, and lazy media on that screen has had
 * its fetch. From the second tile on, fixed headers, cookie bars and chat
 * bubbles are hidden first: the first tile has them, and a stitched page with
 * a header every 900px is a picture of no page anyone has seen.
 *
 * @param {Tiler} tiler
 * @param {object} [options]
 * @param {number} [options.maxPx]
 * @param {number} [options.maxSteps]
 * @param {number} [options.until]
 *   Epoch ms after which no new tile is started. A slow page (WebGL, 3 to 4s a
 *   screenshot) then ships the screens it got instead of missing the deadline.
 * @returns {Promise<{ tiles: { y: number, png: Buffer }[], viewport: number, height: number, documentHeight: number, outOfTime: boolean }>}
 *   The tiles with the scroll offset each was shot at, and the height the
 *   stitched picture should be.
 */
export async function shootTiles(
  tiler,
  { maxPx = MAX_SHOT_PX, maxSteps = MAX_SCROLL_STEPS, until = Infinity } = {},
) {
  const measured = await tiler.viewportHeight();
  const viewport = measured > 0 ? measured : VIEWPORT.height;

  /** @type {{ y: number, png: Buffer }[]} */
  const tiles = [];
  let documentHeight = 0;
  let want = 0;
  let outOfTime = false;

  while (tiles.length < maxSteps) {
    if (tiles.length > 0 && Date.now() > until) {
      outOfTime = true;
      break;
    }
    const y = await tiler.scrollTo(want);
    const previous = tiles.at(-1);
    // The page did not move: the last tile already reached the bottom.
    if (previous !== undefined && y <= previous.y) break;
    if (previous !== undefined) await tiler.hideRepeats();

    await tiler.settle();
    tiles.push({ y, png: await tiler.screenshot() });

    // Re-read every tile: content that mounts makes the document taller.
    documentHeight = await tiler.documentHeight();
    if (y + viewport >= Math.min(documentHeight, maxPx)) break;
    want = y + viewport;
  }

  await tiler.scrollTo(0);

  const last = /** @type {{ y: number }} */ (tiles.at(-1));
  return {
    tiles,
    viewport,
    height: Math.min(last.y + viewport, Math.max(documentHeight, viewport), maxPx),
    documentHeight,
    outOfTime,
  };
}

/**
 * Mean absolute difference, out of 255, below which two consecutive tiles are
 * the same screen. A pinned section that holds still while the page scrolls
 * past it (save.design's canvas, theacademysf.com) photographs the same tile
 * several times over, at 0.0 to 0.8 apart. The next-lowest pair measured on
 * the flagged sites was 4.0, two sparse dark screens that are kept.
 */
const REPEAT_DIFF = 2;

/** @param {Buffer} png */
const tileThumb = (png) =>
  sharp(png).greyscale().resize(96, 60, { fit: "fill" }).raw().toBuffer();

/**
 * Drop each tile that repeats the one before it, and close the gap it leaves:
 * a pinned section's scroll distance is time on the page, not picture.
 *
 * @param {{ y: number, png: Buffer }[]} tiles
 * @returns {Promise<{ tiles: { y: number, png: Buffer }[], removed: number }>}
 *   The tiles kept, moved up by what was dropped above them, and how many
 *   pixels were dropped in all.
 */
export async function dropRepeatedTiles(tiles) {
  /** @type {{ y: number, png: Buffer }[]} */
  const kept = [];
  let removed = 0;
  /** @type {Buffer | null} */
  let previousThumb = null;
  let previousY = 0;

  for (const tile of tiles) {
    const thumb = await tileThumb(tile.png);
    if (previousThumb !== null) {
      let total = 0;
      for (let i = 0; i < thumb.length; i += 1) total += Math.abs(thumb[i] - previousThumb[i]);
      if (total / thumb.length < REPEAT_DIFF) {
        removed += tile.y - previousY;
        previousY = tile.y;
        continue;
      }
    }
    kept.push({ y: tile.y - removed, png: tile.png });
    previousThumb = thumb;
    previousY = tile.y;
  }

  return { tiles: kept, removed };
}

/**
 * Tiles to one PNG. Each tile goes in at its scroll offset; where two overlap
 * (the last tile, clamped to the bottom), the later one wins, which is the
 * one shot with that screen in view.
 *
 * @param {{ y: number, png: Buffer }[]} tiles
 * @param {{ width: number, height: number }} size
 * @returns {Promise<Buffer>}
 */
export async function stitchTiles(tiles, { width, height }) {
  const layers = [];
  for (const { y, png } of tiles) {
    if (y >= height) continue;
    const meta = await sharp(png).metadata();
    const rows = Math.min(meta.height ?? 0, height - y);
    const cols = Math.min(meta.width ?? 0, width);
    if (rows <= 0 || cols <= 0) continue;
    const input =
      rows === meta.height && cols === meta.width
        ? png
        : await sharp(png).extract({ left: 0, top: 0, width: cols, height: rows }).png().toBuffer();
    layers.push({ input, left: 0, top: y });
  }

  return await sharp({
    create: { width, height, channels: 3, background: "#ffffff" },
  })
    .composite(layers)
    .png()
    .toBuffer();
}

/**
 * A page that scrolls inside a full-height box instead of the window: an app
 * shell with `body { overflow: hidden }` and a `main` that scrolls. The window
 * never moves, so every shot of it was one screen tall.
 *
 * Let the box grow to its content, and its ancestors with it, so the window
 * scrolls instead. Only when the window cannot scroll on its own, and only for
 * a box at least three quarters of the screen tall: a scrolling sidebar or a
 * code panel is part of the page, not the page.
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<boolean>} Whether a box was let out.
 */
export async function releaseInnerScroller(page) {
  return await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    if (root.scrollHeight > window.innerHeight + 1) return false;

    /** @type {Element | null} */
    let box = null;
    for (const el of document.querySelectorAll("body *")) {
      if (el.clientHeight < window.innerHeight * 0.75) continue;
      if (el.scrollHeight <= el.clientHeight + 1) continue;
      if (!/^(auto|scroll|overlay)$/.test(getComputedStyle(el).overflowY)) continue;
      if (box === null || el.scrollHeight > box.scrollHeight) box = el;
    }
    if (box === null) return false;

    // A stylesheet rather than inline styles: a framework re-render rewrites
    // `style` (builtbydesigners.com did, mid-walk), not a data attribute.
    const pinned = /^(absolute|fixed)$/.test(getComputedStyle(box).position);
    for (let el = /** @type {Element | null} */ (box); el !== null; el = el.parentElement) {
      el.setAttribute("data-shot-released", "");
    }
    if (pinned) box.setAttribute("data-shot-released-box", "");
    const sheet = document.createElement("style");
    sheet.textContent =
      "[data-shot-released]{height:auto!important;max-height:none!important;overflow-y:visible!important}" +
      // An absolutely placed box is out of flow: however tall it grows, its
      // parent and the document stay one screen. Put it back in the flow.
      "[data-shot-released-box]{position:relative!important;inset:auto!important}";
    document.head.append(sheet);
    return true;
  });
}

/**
 * A {@link Tiler} backed by a real Playwright page.
 *
 * @param {import("playwright").Page} page
 * @returns {Tiler}
 */
export function pageTiler(page) {
  return {
    viewportHeight: () => page.evaluate(() => window.innerHeight),
    documentHeight: () => page.evaluate(() => document.documentElement.scrollHeight),
    scrollTo: (y) =>
      page.evaluate(async (top) => {
        window.scrollTo({ top, behavior: "instant" });
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        return Math.round(window.scrollY);
      }, y),
    settle: async () => {
      await page.waitForTimeout(TILE_MIN_MS);
      await page.evaluate(async (budget) => {
        const onScreen = (/** @type {Element} */ el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
        };
        const painted = () =>
          [...document.images].every((img) => !onScreen(img) || (img.complete && img.naturalWidth > 0)) &&
          [...document.querySelectorAll("video")].every(
            (video) => !onScreen(video) || video.readyState >= 2 || video.poster !== "" || video.error !== null,
          );
        const until = Date.now() + budget;
        while (!painted() && Date.now() < until) {
          await new Promise((done) => setTimeout(done, 100));
        }
        // A reveal mid-transition is a reveal at half opacity. Jump every
        // finite animation to its end; an infinite one (a marquee) has none.
        for (const animation of document.getAnimations()) {
          try {
            animation.finish();
          } catch {
            // Infinite, or driven by scroll: leave it where it is.
          }
        }
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      }, TILE_MEDIA_MS);
    },
    hideRepeats: () =>
      page.evaluate(() => {
        const viewport = window.innerHeight;
        for (const el of document.querySelectorAll("body *")) {
          const html = /** @type {HTMLElement} */ (el);
          if (html.dataset.shotHidden !== undefined) continue;
          const { position } = getComputedStyle(el);
          if (position !== "fixed" && position !== "sticky") continue;
          const r = el.getBoundingClientRect();
          if (r.height === 0) continue;
          // Taller than a third of the screen is a backdrop or pinned content,
          // unless it is a fixed layer stacked above the page: a modal and
          // its dimmed backdrop, which would otherwise tint every tile.
          // ponytail: z-index is the tell; a backdrop stacked above content
          // with see-through content on top of it would be hidden too.
          const overlay = position === "fixed" && Number(getComputedStyle(el).zIndex) > 0;
          if (!overlay && r.height > viewport / 3) continue;
          // Sticky only once it is stuck to the top; until then it is content.
          if (position === "sticky" && r.top > 1) continue;
          html.style.setProperty("visibility", "hidden", "important");
          html.dataset.shotHidden = "";
        }
      }),
    screenshot: () => page.screenshot({ type: "png" }),
  };
}

/**
 * Rejects if `work` outruns the deadline. The underlying page work is not
 * cancellable, so the caller still has to close the context afterwards —
 * which is why the context below is closed by its owner, not by `shoot`.
 *
 * @template T
 * @param {Promise<T>} work
 * @param {string} label
 * @param {number} [ms]
 * @returns {Promise<T>}
 */
export function withDeadline(work, label, ms = SHOT_TIMEOUT_MS) {
  /** @type {ReturnType<typeof setTimeout>} */
  let timer;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new ShotTimeout(`${label} exceeded ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

/** The browser context every shot is taken in. `backfill-design.mjs` reuses it. */
export const CONTEXT_OPTIONS = {
  // No `colorScheme`. Forcing one is what produced the old light/dark pair;
  // leaving it alone is what makes the shot the site's own default rendering.
  viewport: VIEWPORT,
  deviceScaleFactor: DEVICE_SCALE_FACTOR,
  // Sites that gate on motion preference should render their resting state:
  // a shot taken mid-animation is a shot of nothing.
  reducedMotion: /** @type {const} */ ("reduce"),
};

/**
 * Open `url` and bring it to rest: loaded, webfonts in, settled, checked for a
 * bot wall, walked top to bottom and back. What a shot and a token read both
 * need before they look at the page.
 *
 * @param {import("playwright").Page} page
 * @param {string} url
 * @param {string} slug   Only so a refusal names the entry it is about.
 */
export async function loadPage(page, url, slug) {
  await page.goto(url, {
    waitUntil: "load",
    timeout: SHOT_TIMEOUT_MS,
  });

  // Webfonts swap in after `load`. Shooting before they land gives you a
  // screenshot of the fallback stack, which is a screenshot of the wrong
  // site. A page with no webfonts resolves this immediately.
  await page.evaluate(() => document.fonts.ready);

  await page.waitForTimeout(SETTLE_MS);

  // Before the walk, not after. A wall has nothing to mount and no fold to
  // scroll past, so walking one is seconds of the deadline spent on a page
  // that is about to be thrown away — and after the settle, not before, so
  // an interstitial that swaps itself for the real page has had its chance.
  const challenge = matchChallenge(await readChallengeProbe(page));
  if (challenge !== null) {
    throw new CaptureBlockedError(
      `${slug} answered with a bot wall, not the page: ${challenge.name} (${challenge.evidence})`,
      { signature: challenge.name, evidence: challenge.evidence },
    );
  }

  // Before the height is measured, not after: the walk is what mounts the
  // lazy half of the page, and a page that mounts gets taller.
  await scrollThroughPage(pageScroller(page));
}

/**
 * One page: a PNG buffer of the whole scroll, and the tokens it is built from.
 *
 * @param {import("playwright").Browser} browser
 * @param {string} url
 * @param {(line: string) => void} log
 * @param {string} slug   Only so the clip notice names the entry it is about.
 * @param {string} date   The run's ISO date, stored as the tokens' `read_date`.
 * @returns {Promise<{ png: Buffer, design: Design | null }>}
 */
async function shoot(browser, url, log, slug, date) {
  const context = await browser.newContext(CONTEXT_OPTIONS);
  // Leave the stitch, the encode and a last slow tile room inside the deadline.
  const tilesUntil = Date.now() + SHOT_DEADLINE_MS - 20_000;

  try {
    return await withDeadline(
      (async () => {
        const page = await context.newPage();
        page.setDefaultTimeout(SHOT_TIMEOUT_MS);

        await loadPage(page, url, slug);

        // After the walk, so lazy sections are mounted and counted; back at
        // the top, so a sticky header is read in its resting state. Null on
        // any failure: a shot never fails for want of tokens.
        const design = await readDesign(page, date);

        // After the tokens, so they are read off the page as it was served.
        if (await releaseInnerScroller(page)) {
          log(`capture: ${slug} scrolls inside a box, let it out to the window`);
        }

        const { tiles, height, documentHeight, outOfTime } = await shootTiles(pageTiler(page), {
          until: tilesUntil,
        });
        if (outOfTime) {
          log(`capture: ${slug} ran out of time, kept the first ${height}px`);
        } else if (documentHeight > MAX_SHOT_PX) {
          log(
            `capture: ${slug} is ${documentHeight}px tall, clipped to the first ${MAX_SHOT_PX}px`,
          );
        }

        const unique = await dropRepeatedTiles(tiles);
        const png = await stitchTiles(unique.tiles, {
          width: VIEWPORT.width,
          height: height - unique.removed,
        });
        return { png, design };
      })(),
      `shot of ${url}`,
      SHOT_DEADLINE_MS,
    );
  } finally {
    await context.close().catch(() => {
      // The browser is torn down by the caller regardless; a close failure
      // here would otherwise mask the real capture error.
    });
  }
}

/**
 * PNG buffer in, WebP buffer out. The encode both capturers share.
 *
 * @param {Buffer} png
 * @returns {Promise<Buffer>}
 */
async function encodeWebp(png) {
  return await sharp(png)
    .resize({ width: SHOT_WIDTH, fit: "inside", withoutEnlargement: true })
    .webp(WEBP)
    .toBuffer();
}

/**
 * The arguments both capturers refuse. A bad slug is a filename and a URL path
 * at once, so it is worth rejecting before anything opens a socket.
 *
 * @param {string} who @param {unknown} url @param {unknown} slug
 */
function checkArgs(who, url, slug) {
  if (typeof url !== "string" || url.trim() === "") {
    throw new Error(`${who} needs a url`);
  }
  if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`${who} needs a URL-safe slug (got ${JSON.stringify(slug)})`);
  }
}

/**
 * PNG buffer to the pair the gallery wants. Shared by both capturers so a shot
 * is encoded and read the same way whoever took it — and, since VET-44, so it
 * is REFUSED the same way. `captureWithFirecrawl` runs through here too, which
 * is the entire mechanism behind "a Firecrawl-captured challenge page is still
 * a challenge page": the second chance has no DOM to sniff, so this is the only
 * check standing between it and publishing the wall the browser just refused.
 *
 * The order is deliberate. Trim, encode, judge, and only then extract a
 * palette and touch the disk: the VET-27 symptom was a palette faithfully read
 * off a white checkpoint, and there is no point computing one for a file that
 * is not going to exist. Nothing is written before the shot has earned it.
 *
 * The trim comes first so everything after it describes the file that ships.
 * A scroll-driven page (GSAP pins, Lenis) reports a document height that
 * includes its animations' scroll DISTANCE, and the tail of that height
 * arrives as thousands of rows of flat background — see `trim.mjs` for the
 * measurements. Cutting it before the encode means the WebP is encoded once,
 * the blank-shot backstop measures the committed artifact, and the palette is
 * read off pixels the gallery will actually show instead of letting a band of
 * background outvote the page.
 *
 * @param {Buffer} png @param {string} slug @param {string} outDir
 * @param {(line: string) => void} log
 * @returns {Promise<{ shot: string, palette: string[] }>}
 */
async function finish(png, slug, outDir, log) {
  const trimmed = await trimTrailingBlank(png);
  if (trimmed !== null) {
    log(`capture: ${slug} trails off into blank, trimmed ${trimmed.from}px to ${trimmed.to}px`);
    png = trimmed.png;
  }

  const webp = await encodeWebp(png);

  const measurement = await measureShot(webp);
  if (shotLooksBlank(measurement)) {
    const { width, height, variance, density } = measurement;
    throw new CaptureBlockedError(
      `${slug} captured as a blank page: ${width}x${height}, variance ${variance.toFixed(1)}, ${density.toFixed(4)} bytes/px`,
      { signature: "blank capture", evidence: `variance ${variance.toFixed(1)}` },
    );
  }

  // Palette off the PNG, not the WebP: lossy encoding smears flat colour into
  // a spray of near-neighbours, which is exactly what the binning counts.
  const palette = await extractPalette(png);

  const shot = path.join(outDir, `${slug}.webp`);
  await writeFile(shot, webp);

  return { shot, palette };
}

/**
 * Capture one site: one full-page shot, and the colours it is made of.
 *
 * @param {object} options
 * @param {string} options.url        Page to shoot.
 * @param {string} options.slug       Filename stem; also the gallery slug.
 * @param {string} [options.outDir]   Defaults to repo `public/shots`.
 * @param {(line: string) => void} [options.log]
 *   Where a clipped capture is reported. `console.warn` by default, which is
 *   right for the CLI at the bottom of this file and wrong inside a pipeline
 *   run: those lines go to stderr, outside the run log, so the one sentence
 *   explaining why an entry stops mid-page would land where nobody is reading.
 *   `apply.mjs` passes the run's own logger.
 * @param {string} [options.date]
 *   The run's ISO date, for the tokens' `read_date`. `apply.mjs` passes
 *   `ctx.date`; the CLI defaults to today in UTC, as `publish.mjs` computes it.
 * @returns {Promise<{ shot: string, palette: string[], design?: Design }>}
 *   Absolute path of the file written, its dominant colours, and the tokens
 *   read off the live page when `readDesign` found any.
 */
export async function captureSite({
  url,
  slug,
  outDir = DEFAULT_OUT_DIR,
  log = console.warn,
  date = new Date().toISOString().slice(0, 10),
}) {
  checkArgs("captureSite", url, slug);

  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    const { png, design } = await shoot(browser, url, log, slug, date);
    const done = await finish(png, slug, outDir, log);
    return design === null ? done : { ...done, design };
  } finally {
    await browser.close();
  }
}

/**
 * The same capture, asked of Firecrawl instead of the runner's own browser.
 *
 * This is a second chance, not an alternative engine. Playwright is better at
 * this in every way that matters — it is local, it is free, and it is the code
 * the clip rule and the settle beat were tuned against. The one thing it cannot
 * do is come from somewhere else, and "somewhere else" is the entire reason a
 * site that bot-blocks a GitHub Actions runner sometimes answers Firecrawl.
 * `apply.mjs` decides when that is worth spending; this function only knows how.
 *
 * The height ceiling is enforced here rather than at the request, because the
 * clip has to be the same 12,000px `MAX_SHOT_PX` either way: a /sites entry
 * should not be a different shape depending on which service happened to be
 * able to reach the page.
 *
 * The blank-shot backstop applies for the same reason and with more at stake.
 * Firecrawl hands back a PNG and nothing else, so there is no DOM to sniff and
 * no status to read; if it is served the same wall, the picture is all there is
 * to go on. `finish` below judges it exactly as it judges a local shot, and a
 * second chance that came back with a checkpoint fails rather than publishes.
 *
 * No DOM also means no `design`. An entry this path publishes keeps only its
 * pixel palette, and /sites/<slug> renders the palette row for it.
 *
 * @param {object} options
 * @param {string} options.url
 * @param {string} options.slug
 * @param {import("./firecrawl.mjs").FirecrawlClient} options.client
 * @param {string} [options.outDir]
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<{ shot: string, palette: string[] }>}
 */
export async function captureWithFirecrawl({
  url,
  slug,
  client,
  outDir = DEFAULT_OUT_DIR,
  log = console.warn,
}) {
  checkArgs("captureWithFirecrawl", url, slug);

  await mkdir(outDir, { recursive: true });

  const png = await client.screenshotFullPage(url);
  return await finish(await clipTall(png, slug, log), slug, outDir, log);
}

/**
 * The top `MAX_SHOT_PX` of a PNG, when there is more of it than that.
 *
 * Playwright is told the clip up front and hands back an already-short image.
 * Firecrawl has no such parameter, so the whole scroll arrives and the trim
 * happens here — same ceiling, same sentence in the run log, so the two paths
 * are indistinguishable from the gallery's side.
 *
 * @param {Buffer} png @param {string} slug @param {(line: string) => void} log
 * @returns {Promise<Buffer>}
 */
async function clipTall(png, slug, log) {
  const { width, height } = await sharp(png).metadata();
  if (width === undefined || height === undefined || height <= MAX_SHOT_PX) return png;

  log(`capture: ${slug} is ${height}px tall, clipped to the first ${MAX_SHOT_PX}px`);
  return await sharp(png)
    .extract({ left: 0, top: 0, width, height: MAX_SHOT_PX })
    .png()
    .toBuffer();
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
    const result = await captureSite({ url, slug });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`capture failed for ${slug}: ${describe(error)}`);
    process.exit(1);
  }
}
