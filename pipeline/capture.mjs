/**
 * capture.mjs — the screenshot engine.
 *
 * One job: given a URL and a slug, leave one WebP file on disk that the /sites
 * gallery can render, plus the handful of colours that file is mostly made of.
 * `publish.mjs` calls `captureSite()` per new bookmark; the CLI entry at the
 * bottom is for seeding and for re-shooting a single entry by hand.
 *
 * Four deliberate choices, each learned the hard way by everyone who has built
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
 *   4. WALK the page before shooting it. `fullPage` renders the document at its
 *      full height in one pass, which is not the same thing as scrolling
 *      through it: lazy images below the fold never fetch, and scroll-revealed
 *      sections never reveal. See `scrollThroughPage`.
 *   5. REFUSE a picture of a bot wall. A challenge page is served at HTTP 200
 *      and renders without error, so every check above it passes and a blank
 *      interstitial publishes as the site. See "The bot wall" below.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";
import sharp from "sharp";

import { describe } from "./util.mjs";

/** Desktop width, 1x. Retina would quadruple the bytes for no gallery gain. */
const VIEWPORT = { width: 1440, height: 900 };
const DEVICE_SCALE_FACTOR = 1;

/** After fonts are ready: entrance animations and lazy images land in here. */
const SETTLE_MS = 2500;

/** Wall-clock ceiling for one shot, navigation and settle included. */
const SHOT_TIMEOUT_MS = 45_000;

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

/** Output width. Shots arrive at exactly this width, so it is a floor, not a scale. */
const WEBP_WIDTH = 1440;

/**
 * Measured against the six seed sites at full height: every one lands between
 * ~55KB and ~230KB, against the ~600KB budget a repo-committed image gets. That
 * is enough headroom to have kept the quality the light/dark crops used rather
 * than trading legibility for bytes nothing was short of — these are design
 * reference shots, and a soft screenshot of a typeface is not a reference.
 *
 * The number that actually bounds the worst case is `MAX_SHOT_PX`, not this one:
 * a dense, image-heavy page held at 12,000px is the only shape that approaches
 * the budget, and no quality setting fixes that without spoiling the other five.
 */
const WEBP_QUALITY = 82;

/** Sharp's slowest, smallest setting. Six images a run — the seconds are free. */
const WEBP_EFFORT = 6;

/* ---------------------------------------------------------------------------
   Palette
   --------------------------------------------------------------------------- */

/** How many colours a palette holds at most. Six swatches is a row, not a chart. */
const PALETTE_SIZE = 6;

/** The shot, shrunk to this width before counting pixels. ~200k samples is plenty. */
const PALETTE_SAMPLE_WIDTH = 160;

/**
 * Channel bits kept when binning. 3 bits gives 8 levels per channel and 512
 * buckets, which is coarse enough that a gradient counts as one colour and fine
 * enough that a brand red and a brand orange stay apart.
 */
const PALETTE_BITS = 3;

/** Minimum RGB distance between two colours in the result. Below this they read as one. */
const PALETTE_MIN_DISTANCE = 44;

/** Above/below this relative luminance a colour is "the background", not "a colour". */
const NEAR_WHITE = 0.9;
const NEAR_BLACK = 0.08;

/**
 * Share of the image an extreme has to own before it earns a slot. A white page
 * IS white — that is worth saying — but a white margin around a coloured hero is
 * not the site's palette.
 */
const EXTREME_MIN_SHARE = 0.15;

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
   The bot wall

   Everything above this line assumes the page that answered is the page that
   was asked for. A challenge page breaks that assumption without breaking
   anything else: Vercel's checkpoint, Cloudflare's interstitial and the rest
   are served at HTTP 200, render clean HTML, load their fonts and settle. The
   navigation succeeds, the walk-down walks, the screenshot succeeds, and what
   lands on disk is a picture of a sentence saying the browser could not be
   verified — with a palette faithfully extracted from the white behind it.

   That is what happened to Inspora in the VET-27 publish. Nothing threw, so the
   attempts counter never moved and the Firecrawl second chance in `apply.mjs`
   never fired, which is the one thing that would actually have fixed it: a
   challenge aimed at a GitHub Actions runner is exactly the case Firecrawl
   exists for. So the gate below does not add a new failure path. It converts a
   silent success into the ordinary capture failure the pipeline already knows
   how to retry, hand to Firecrawl, and finally dead-letter.

   Two checks, because either one alone has a hole:

     - The DOM sniff reads what the page SAYS, before the shot. Precise, cheap,
       and only as good as the list of walls it knows about.
     - The image backstop reads what the shot LOOKS like, after encoding. Knows
       nothing about vendors, so it also catches the wall nobody has met yet —
       and it is the only check that can run on a Firecrawl shot, which arrives
       as a PNG with no DOM attached.
   --------------------------------------------------------------------------- */

/**
 * How much body text the sniff reads.
 *
 * Bounded on purpose, twice over. A challenge page says its piece in a sentence
 * or two, so anything past this is a page that is not a challenge page — and
 * matching against the whole DOM is how a false positive gets built: a site
 * with an essay about bot protection somewhere down the page would trip a
 * pattern meant for the sentence in the middle of an empty screen.
 *
 * It doubles as the length gate (`maxTextLength` below) for the signatures that
 * need one, which is why it is comfortably larger than any of them.
 */
const CHALLENGE_TEXT_CHARS = 1_200;

/**
 * A page that is a wall rather than a site.
 *
 * A signature matches when EVERY field it declares matches, so each field is an
 * additional narrowing rather than another way in. That is the whole
 * false-positive discipline: `title` and `heading` are anchored to elements a
 * page has one of, `selectors` name containers that exist on challenge pages
 * and nowhere else, and `maxTextLength` is there for the two markers that DO
 * appear on ordinary pages — a reCAPTCHA or hCaptcha widget is a contact form
 * on a real site and the entire document on a wall.
 *
 * @typedef {object} ChallengeSignature
 * @property {string} name              Reported in the error, so keep it readable.
 * @property {RegExp} [title]           Against `document.title`.
 * @property {RegExp} [heading]         Against the first few `h1`/`h2`.
 * @property {RegExp} [text]            Against the first {@link CHALLENGE_TEXT_CHARS} of body text.
 * @property {readonly string[]} [selectors]  Any one of these present in the document.
 * @property {number} [maxTextLength]   Only when the page has essentially nothing else on it.
 */

/**
 * Every wall this pipeline knows how to recognise.
 *
 * Read the patterns as a promise about what they will NOT match. There is no
 * bare `/cloudflare/i` and no bare `/captcha/i` here, because a site that
 * mentions either — a design engineer writing up their edge setup, say — is a
 * site, and shooting it is the job. Every entry is anchored to a title, a
 * heading, a vendor-specific container id, or a sentence no page writes about
 * itself in the second person.
 *
 * @type {readonly ChallengeSignature[]}
 */
export const CHALLENGE_SIGNATURES = [
  // The one that shipped a blank Inspora. Vercel titles the page exactly this,
  // and the body carries "Failed to verify your browser" plus a numbered code.
  { name: "Vercel security checkpoint", title: /vercel security checkpoint/i },
  { name: "Vercel browser verification", text: /failed to verify your browser/i },

  // Cloudflare's interstitial, in its three generations of wording. Anchored to
  // the title rather than the body: "Just a moment" is a phrase a real page can
  // use in its copy, and a real page does not put it in its <title>.
  { name: "Cloudflare interstitial", title: /^\s*just a moment/i },
  { name: "Cloudflare browser check", text: /checking your browser before accessing/i },
  { name: "Cloudflare block page", title: /attention required!.*cloudflare/i },
  { name: "Cloudflare JS gate", text: /enable javascript and cookies to continue/i },
  {
    name: "Cloudflare challenge container",
    selectors: [
      "#cf-challenge-running",
      "#challenge-running",
      "#cf-please-wait",
      "#challenge-stage",
      ".cf-browser-verification",
    ],
  },

  // Vendor-neutral, and the phrasing several of them converged on. No page
  // addresses its own reader this way about its own reader's species.
  { name: "Human verification", text: /verif(?:y|ying) (?:that )?you are (?:a )?human/i },

  // The two widgets that are also a legitimate part of real pages. Decisive
  // only when the widget IS the page: 400 characters is a headline and a line
  // of instructions, well under any page with content on it.
  {
    name: "Captcha wall",
    selectors: [
      ".h-captcha",
      ".g-recaptcha",
      'iframe[src*="hcaptcha.com"]',
      'iframe[src*="recaptcha/api2"]',
    ],
    maxTextLength: 400,
  },

  // PerimeterX: the container id is theirs alone, and so is the instruction —
  // but only the whole instruction. A bare "press and hold" is a sentence a
  // site documenting a long-press gesture writes, and this gallery is full of
  // sites that document gestures.
  { name: "PerimeterX challenge", selectors: ["#px-captcha"] },
  {
    name: "PerimeterX press and hold",
    text: /press (?:&|and) hold to confirm you are a human/i,
  },

  // DataDome serves its captcha from one host, in an iframe, on every property.
  {
    name: "DataDome challenge",
    selectors: ["#datadome-captcha", 'iframe[src*="captcha-delivery.com"]'],
  },

  // Akamai's denial is titled the same as plenty of ordinary 403 pages, so the
  // reference number has to be there too. Both, or neither.
  {
    name: "Akamai access denied",
    title: /access denied/i,
    text: /reference\s*#\s*[0-9a-f]{1,3}\.[0-9a-f]+/i,
  },

  // Imperva stamps its incident id into the body of every block page it serves.
  { name: "Imperva block page", text: /incapsula incident id/i },
];

/**
 * Every selector any signature names, asked once.
 *
 * Derived rather than written out a second time: the page probe has to query
 * exactly the set the signatures match against, and a list maintained in two
 * places is a signature that quietly stops being reachable.
 *
 * @type {readonly string[]}
 */
export const CHALLENGE_SELECTORS = [
  ...new Set(CHALLENGE_SIGNATURES.flatMap((signature) => signature.selectors ?? [])),
];

/**
 * What the sniff needs from a page, and nothing else — the same trick as
 * {@link Scroller}, for the same reason: this is the part worth testing and the
 * part hardest to reach, so it takes a plain object and the tests hand it one.
 *
 * @typedef {object} ChallengeProbe
 * @property {string} [title]     `document.title`.
 * @property {string} [heading]   The first few headings, joined.
 * @property {string} [text]      Body text, already cut to {@link CHALLENGE_TEXT_CHARS}.
 * @property {readonly string[]} [selectors]  Which of {@link CHALLENGE_SELECTORS} are present.
 */

/**
 * The first signature this page answers to, or null if it is just a page.
 *
 * @param {ChallengeProbe} probe
 * @returns {{ name: string, evidence: string } | null}
 */
export function matchChallenge({ title = "", heading = "", text = "", selectors = [] } = {}) {
  for (const signature of CHALLENGE_SIGNATURES) {
    if (signature.title !== undefined && !signature.title.test(title)) continue;
    if (signature.heading !== undefined && !signature.heading.test(heading)) continue;
    if (signature.text !== undefined && !signature.text.test(text)) continue;
    if (
      signature.selectors !== undefined &&
      !signature.selectors.some((selector) => selectors.includes(selector))
    ) {
      continue;
    }
    if (signature.maxTextLength !== undefined && text.trim().length > signature.maxTextLength) {
      continue;
    }

    // The shortest true thing about why this matched, for the state row that is
    // about to record it. A signature name alone would leave the next person
    // grepping the page by hand.
    const evidence =
      signature.title?.exec(title)?.[0] ??
      signature.heading?.exec(heading)?.[0] ??
      signature.text?.exec(text)?.[0] ??
      signature.selectors?.find((selector) => selectors.includes(selector)) ??
      signature.name;

    return { name: signature.name, evidence };
  }

  return null;
}

/**
 * A {@link ChallengeProbe} read out of a real Playwright page.
 *
 * One `evaluate`, one traversal. `innerText` rather than `textContent` because
 * a challenge page hides its fallback copy in `<noscript>` and in nodes it has
 * already switched off, and `textContent` would read those as the page.
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<ChallengeProbe>}
 */
async function readChallengeProbe(page) {
  return await page.evaluate(
    ([selectors, limit]) => ({
      title: document.title ?? "",
      heading: [...document.querySelectorAll("h1, h2")]
        .slice(0, 3)
        .map((node) => node.textContent ?? "")
        .join(" "),
      text: (document.body?.innerText ?? "").slice(0, limit),
      selectors: selectors.filter((selector) => document.querySelector(selector) !== null),
    }),
    /** @type {[string[], number]} */ ([[...CHALLENGE_SELECTORS], CHALLENGE_TEXT_CHARS]),
  );
}

/**
 * The page answered, but with a wall instead of itself.
 *
 * Typed so it reads as a category in a run log rather than as one more string,
 * and thrown rather than returned so it lands in `apply.mjs`'s existing catch:
 * one attempt spent, Firecrawl asked on the last one, dead letter after that.
 */
export class CaptureBlockedError extends Error {
  /**
   * @param {string} message
   * @param {object} detail
   * @param {string} detail.signature  Which wall, by name.
   * @param {string} [detail.evidence] The text or selector that gave it away.
   */
  constructor(message, { signature, evidence = "" }) {
    super(message);
    /** @type {string} */
    this.name = "CaptureBlockedError";
    /** @type {string} */
    this.signature = signature;
    /** @type {string} */
    this.evidence = evidence;
  }
}

/**
 * Highest per-channel standard deviation a shot can have and still be blank.
 *
 * Measured, not guessed. The Inspora checkpoint that shipped in VET-27 scores
 * 6.8; the flattest real shot in `public/shots` — Atishay Tuli's, a pale page of
 * small type — scores 20.1. This sits at the geometric middle of those two, so
 * it is roughly 1.8x above the known wall and 0.6x below the known page.
 *
 * Taken over the WHOLE shot rather than the first screen, which is the point: a
 * real page is allowed a flat hero, and judging it on one would flag half the
 * gallery. A wall is flat all the way down because there is nothing down there.
 * The maximum across colour channels, not the mean, because a page that is one
 * hue with a bright accent is still a page.
 */
const BLANK_MAX_VARIANCE = 12;

/**
 * Fewest encoded bytes per pixel a shot can carry and still be blank.
 *
 * The same two anchors: the Inspora checkpoint encodes at 0.0061 bytes/px, and
 * the thinnest real shot — Otherkind, a long page of flat colour fields — at
 * 0.0161. Again the geometric middle. Per pixel rather than per row so the
 * number means the same thing whatever width the shot arrived at, which matters
 * because Firecrawl chooses its own viewport.
 *
 * This is the half that does not need to have heard of the vendor: a wall
 * compresses to nothing because it is nothing, whoever built it.
 */
const BLANK_MAX_DENSITY = 0.01;

/**
 * The three numbers the backstop judges a shot on.
 *
 * Read off the ENCODED image rather than the raw one, so `variance` and
 * `density` describe the same artifact — the file that is about to be committed
 * — and so this function can be pointed straight at `public/shots` in a test.
 *
 * @param {Buffer} image   Any format sharp can read; in practice the WebP.
 * @returns {Promise<{ width: number, height: number, bytes: number, variance: number, density: number }>}
 */
export async function measureShot(image) {
  const { width = 0, height = 0 } = await sharp(image).metadata();
  const { channels } = await sharp(image).stats();

  // Colour channels only. An opaque screenshot has no alpha to begin with, but
  // one that does would otherwise be scored on how varied its transparency is.
  const variance = Math.max(...channels.slice(0, 3).map((channel) => channel.stdev));
  const pixels = width * height;

  return {
    width,
    height,
    bytes: image.length,
    variance,
    density: pixels > 0 ? image.length / pixels : 0,
  };
}

/**
 * Flat AND tiny, which is a wall; one or the other is a design.
 *
 * The `and` is load-bearing in both directions. A flat shot that encodes big is
 * a poster or a photograph. A small shot with real variance is a spare page
 * that compressed well — Bychudy is one screen tall and lands eight times over
 * this line. Only a page with nothing on it manages both.
 *
 * @param {{ variance: number, density: number }} measurement
 * @returns {boolean}
 */
export function shotLooksBlank({ variance, density }) {
  return variance <= BLANK_MAX_VARIANCE && density <= BLANK_MAX_DENSITY;
}

/**
 * Rejects if `work` outruns the deadline. The underlying page work is not
 * cancellable, so the caller still has to close the context afterwards —
 * which is why the context below is closed by its owner, not by `shoot`.
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
 * One page, one PNG buffer of the whole scroll.
 *
 * @param {import("playwright").Browser} browser
 * @param {string} url
 * @param {(line: string) => void} log
 * @param {string} slug   Only so the clip notice names the entry it is about.
 * @returns {Promise<Buffer>}
 */
async function shoot(browser, url, log, slug) {
  const context = await browser.newContext({
    // No `colorScheme`. Forcing one is what produced the old light/dark pair;
    // leaving it alone is what makes the shot the site's own default rendering.
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

        const height = await page.evaluate(() => {
          const { body, documentElement: root } = document;
          return Math.max(
            body?.scrollHeight ?? 0,
            body?.offsetHeight ?? 0,
            root.scrollHeight,
            root.offsetHeight,
            root.clientHeight,
          );
        });

        if (height > MAX_SHOT_PX) {
          log(
            `capture: ${slug} is ${height}px tall, clipped to the first ${MAX_SHOT_PX}px`,
          );
          // `fullPage` AND `clip`: the two together mean "the whole document,
          // then this window of it". `clip` on its own is measured against the
          // viewport, so it would silently hand back the top 900px and call it
          // a 12,000px capture — which looks like a working clip right up until
          // you open the file.
          return await page.screenshot({
            type: "png",
            fullPage: true,
            clip: { x: 0, y: 0, width: VIEWPORT.width, height: MAX_SHOT_PX },
          });
        }

        return await page.screenshot({ type: "png", fullPage: true });
      })(),
      `shot of ${url}`,
    );
  } finally {
    await context.close().catch(() => {
      // The browser is torn down by the caller regardless; a close failure
      // here would otherwise mask the real capture error.
    });
  }
}

/**
 * Relative luminance, near enough. Rec. 709 weights on raw sRGB rather than
 * linearised channels: this only ever decides "is this basically the page
 * background", and the gamma step would not move that answer.
 *
 * @param {number} r @param {number} g @param {number} b @returns {number} 0..1
 */
function luminance(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** @param {number} value @returns {string} */
function hex(value) {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0");
}

/**
 * The colours a screenshot is mostly made of, most common first.
 *
 * Frequency binning rather than k-means, and on purpose: k-means on a screenshot
 * spends its iterations separating shades of the same off-white, needs a seed to
 * be reproducible, and would be a dependency. Coarse bins plus a distance filter
 * get the same six swatches deterministically, in one pass, from a 160px thumbnail.
 *
 * Near-white and near-black are held to a higher bar than everything else. Almost
 * every page is mostly background, so without that rule every palette on the site
 * would open with white, black, and four greys.
 *
 * @param {Buffer} image   Any format sharp can read.
 * @param {object} [options]
 * @param {number} [options.size]   How many colours at most.
 * @returns {Promise<string[]>}     Lowercase `#rrggbb`, dominant first.
 */
export async function extractPalette(image, { size = PALETTE_SIZE } = {}) {
  const { data, info } = await sharp(image)
    .resize({
      width: PALETTE_SAMPLE_WIDTH,
      fit: "inside",
      withoutEnlargement: true,
      // The default kernel invents intermediate colours along every edge; on a
      // page of flat brand colours those averages would outvote the real ones.
      kernel: "nearest",
    })
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const shift = 8 - PALETTE_BITS;
  const levels = 1 << PALETTE_BITS;

  /** @type {Map<number, { r: number, g: number, b: number, count: number }>} */
  const bins = new Map();
  let total = 0;

  for (let i = 0; i + channels <= data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const key = ((r >> shift) * levels + (g >> shift)) * levels + (b >> shift);
    const bin = bins.get(key);
    if (bin === undefined) {
      bins.set(key, { r, g, b, count: 1 });
    } else {
      bin.r += r;
      bin.g += g;
      bin.b += b;
      bin.count += 1;
    }
    total += 1;
  }

  if (total === 0) return [];

  // Each bin's mean colour, so the swatch is a colour that was actually on the
  // page rather than the corner of the bucket it fell into.
  const candidates = [...bins.values()]
    .map(({ r, g, b, count }) => ({
      r: r / count,
      g: g / count,
      b: b / count,
      share: count / total,
    }))
    .sort((a, b) => b.share - a.share);

  /** @type {{ r: number, g: number, b: number }[]} */
  const picked = [];

  const farEnough = (/** @type {{ r: number, g: number, b: number }} */ colour) =>
    picked.every((seen) => {
      const dr = seen.r - colour.r;
      const dg = seen.g - colour.g;
      const db = seen.b - colour.b;
      return Math.sqrt(dr * dr + dg * dg + db * db) >= PALETTE_MIN_DISTANCE;
    });

  for (const colour of candidates) {
    if (picked.length >= size) break;

    const lum = luminance(colour.r, colour.g, colour.b);
    const extreme = lum >= NEAR_WHITE || lum <= NEAR_BLACK;
    if (extreme && colour.share < EXTREME_MIN_SHARE) continue;

    if (farEnough(colour)) picked.push(colour);
  }

  // A page of nothing but faint greys can filter itself down to nothing. An
  // empty palette is worse than an honest one, so fall back to raw dominance.
  if (picked.length === 0) {
    for (const colour of candidates) {
      if (picked.length >= size) break;
      if (farEnough(colour)) picked.push(colour);
    }
  }

  return picked.map(({ r, g, b }) => `#${hex(r)}${hex(g)}${hex(b)}`);
}

/**
 * PNG buffer in, WebP buffer out. The encode both capturers share.
 *
 * @param {Buffer} png
 * @returns {Promise<Buffer>}
 */
async function encodeWebp(png) {
  return await sharp(png)
    .resize({ width: WEBP_WIDTH, fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
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
 * The order is deliberate. Encode, judge, and only then extract a palette and
 * touch the disk: the VET-27 symptom was a palette faithfully read off a white
 * checkpoint, and there is no point computing one for a file that is not going
 * to exist. Nothing is written before the shot has earned it.
 *
 * @param {Buffer} png @param {string} slug @param {string} outDir
 * @returns {Promise<{ shot: string, palette: string[] }>}
 */
async function finish(png, slug, outDir) {
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
 * @returns {Promise<{ shot: string, palette: string[] }>}
 *   Absolute path of the file written, and its dominant colours.
 */
export async function captureSite({
  url,
  slug,
  outDir = DEFAULT_OUT_DIR,
  log = console.warn,
}) {
  checkArgs("captureSite", url, slug);

  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    const png = await shoot(browser, url, log, slug);
    return await finish(png, slug, outDir);
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
  return await finish(await clipTall(png, slug, log), slug, outDir);
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
