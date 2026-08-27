/**
 * challenge.mjs — the two checks that refuse a picture of a bot wall.
 *
 * Split from `capture.mjs` along the line where the browser stops mattering.
 * Nothing here launches anything: `matchChallenge` takes a plain object and
 * `shotLooksBlank` takes three numbers, so the wall list can be checked against
 * fixture probes and the thresholds against the shots this repo has actually
 * committed. Taking the picture is next door; deciding whether it is a page is
 * here.
 *
 * Why there is anything to decide. A challenge page breaks the assumption that
 * the page which answered is the page that was asked for, and breaks nothing
 * else: Vercel's checkpoint, Cloudflare's interstitial and the rest are served
 * at HTTP 200, render clean HTML, load their fonts and settle. The navigation
 * succeeds, the walk-down walks, the screenshot succeeds, and what lands on disk
 * is a picture of a sentence saying the browser could not be verified — with a
 * palette faithfully extracted from the white behind it.
 *
 * That is what happened to Inspora in the VET-27 publish. Nothing threw, so the
 * attempts counter never moved and the Firecrawl second chance in `apply.mjs`
 * never fired, which is the one thing that would actually have fixed it: a
 * challenge aimed at a GitHub Actions runner is exactly the case Firecrawl
 * exists for. So this module does not add a new failure path. It converts a
 * silent success into the ordinary capture failure the pipeline already knows
 * how to retry, hand to Firecrawl, and finally dead-letter.
 *
 * Two checks, because either one alone has a hole:
 *
 *   - The DOM sniff reads what the page SAYS, before the shot. Precise, cheap,
 *     and only as good as the list of walls it knows about.
 *   - The image backstop reads what the shot LOOKS like, after encoding. Knows
 *     nothing about vendors, so it also catches the wall nobody has met yet —
 *     and it is the only check that can run on a Firecrawl shot, which arrives
 *     as a PNG with no DOM attached.
 */

import sharp from "sharp";

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
 * `capture.mjs`'s `Scroller`, for the same reason: this is the part worth
 * testing and the part hardest to reach, so it takes a plain object and the
 * tests hand it one.
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
export async function readChallengeProbe(page) {
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

/* ---------------------------------------------------------------------------
   The image backstop
   --------------------------------------------------------------------------- */

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
