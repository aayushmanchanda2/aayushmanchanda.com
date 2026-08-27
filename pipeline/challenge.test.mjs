/**
 * The bot wall, checked at the two seams it was built for.
 *
 * VET-27 published a picture of a Vercel Security Checkpoint as Inspora. The
 * page answered 200, rendered clean HTML, and settled, so nothing in the capture
 * path had anything to complain about — and because nothing threw, the Firecrawl
 * second chance in `apply.mjs`, which is precisely the tool for a wall that only
 * appears in front of a CI runner, never got asked.
 *
 * `challenge.mjs` exists so both halves of the fix can be checked without a
 * browser: `matchChallenge` is pure, so the DOM signatures are checked against
 * fixture probes, and `shotLooksBlank` reads an encoded image, so it can be
 * pointed at the shots this repo has actually committed. Neither needs Chromium,
 * which is the whole reason they do not live in `capture.mjs`.
 */

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import { DEFAULT_OUT_DIR } from "./capture.mjs";
import {
  CHALLENGE_SELECTORS,
  CHALLENGE_SIGNATURES,
  matchChallenge,
  measureShot,
  shotLooksBlank,
} from "./challenge.mjs";

/** An ordinary page's probe, which each test below overrides one field of. */
const ORDINARY = {
  title: "Otherkind — design studio",
  heading: "We make things for people who make things",
  text: "Otherkind is a two-person studio in Lisbon. We work on brand systems, editorial sites, and the occasional product. Selected work below; the rest is on request.",
  selectors: /** @type {string[]} */ ([]),
};

test("the checkpoint that shipped as Inspora is recognised by its title", () => {
  const hit = matchChallenge({ ...ORDINARY, title: "Vercel Security Checkpoint" });

  assert.equal(hit?.name, "Vercel security checkpoint");
});

test("the same wall is recognised by what it says, not only by its title", () => {
  // The sentence a reader would see. Some deployments title the page after the
  // site rather than after the checkpoint, so the body has to be enough.
  const hit = matchChallenge({
    title: "inspora",
    heading: "",
    text: "Failed to verify your browser. Please try again. Code 21",
    selectors: [],
  });

  assert.equal(hit?.name, "Vercel browser verification");
  assert.match(hit?.evidence ?? "", /failed to verify your browser/i);
});

test("Cloudflare's interstitial is caught by its title", () => {
  const hit = matchChallenge({ ...ORDINARY, title: "Just a moment..." });

  assert.equal(hit?.name, "Cloudflare interstitial");
});

test("Cloudflare's older wording is caught by its body", () => {
  const hit = matchChallenge({
    ...ORDINARY,
    title: "fortress.example",
    text: "Checking your browser before accessing fortress.example. This process is automatic.",
  });

  assert.equal(hit?.name, "Cloudflare browser check");
});

test("a Cloudflare challenge container is enough on its own", () => {
  // No title, no copy — the challenge has not painted yet. The container is
  // there from the first byte, and it exists on no page that is not one.
  const hit = matchChallenge({ title: "", heading: "", text: "", selectors: ["#challenge-stage"] });

  assert.equal(hit?.name, "Cloudflare challenge container");
  assert.equal(hit?.evidence, "#challenge-stage");
});

test("the vendor-neutral phrasing is caught whoever served it", () => {
  const hit = matchChallenge({
    ...ORDINARY,
    title: "fortress.example",
    text: "Verify you are human by completing the action below.",
  });

  assert.equal(hit?.name, "Human verification");
});

test("Akamai needs both halves of its denial, not just the title", () => {
  const title = "Access Denied";

  assert.equal(
    matchChallenge({ ...ORDINARY, title, text: "You do not have access to this project." }),
    null,
    "plenty of ordinary pages are titled Access Denied",
  );

  assert.equal(
    matchChallenge({
      ...ORDINARY,
      title,
      text: "You don't have permission to access this resource. Reference #18.7c2d1a3b",
    })?.name,
    "Akamai access denied",
  );
});

test("PerimeterX and DataDome are recognised by their own containers", () => {
  assert.equal(
    matchChallenge({ ...ORDINARY, selectors: ["#px-captcha"] })?.name,
    "PerimeterX challenge",
  );
  assert.equal(
    matchChallenge({ ...ORDINARY, selectors: ['iframe[src*="captcha-delivery.com"]'] })?.name,
    "DataDome challenge",
  );
});

test("a site documenting a long-press gesture is not a PerimeterX wall", () => {
  // This gallery is made of sites that document interactions. "Press and hold"
  // on its own is one of them; PerimeterX's whole sentence is not.
  assert.equal(
    matchChallenge({
      ...ORDINARY,
      text: "Press and hold anywhere on the canvas to drop a point. Drag to move it.",
    }),
    null,
  );

  assert.equal(
    matchChallenge({
      title: "fortress.example",
      heading: "",
      text: "Press & Hold to confirm you are a human (and not a bot).",
      selectors: [],
    })?.name,
    "PerimeterX press and hold",
  );
});

test("a captcha widget is a wall only when it is the entire page", () => {
  // The wall: a headline, a line of instruction, and the widget.
  assert.equal(
    matchChallenge({
      title: "fortress.example",
      heading: "",
      text: "Please complete the security check to continue.",
      selectors: [".h-captcha"],
    })?.name,
    "Captcha wall",
    "a page with nothing on it but a captcha is a captcha, not a page",
  );
});

test("a real page that talks about bot walls is still a real page", () => {
  // The false positive this whole list is written to avoid: a design engineer
  // writing up their edge setup, with a contact form at the bottom of it. It
  // names Cloudflare, names Vercel, names reCAPTCHA, and ships the widget.
  const hit = matchChallenge({
    title: "designengineer.tools",
    heading: "Notes on shipping at the edge",
    text: [
      "I moved this site off Vercel and onto Cloudflare Pages last spring, mostly for",
      "the cache rules. The one thing I miss is the preview deployment.",
      "Bot protection is the part nobody writes about: I ran a captcha on the contact",
      "form for a year before deciding that a honeypot field caught the same traffic",
      "for none of the cost. If you want to argue about it, the form is below, and yes",
      "it still has a reCAPTCHA on it while I finish migrating.",
      "Say hello. I read everything and answer most of it.",
    ].join(" "),
    selectors: [".g-recaptcha"],
  });

  assert.equal(hit, null, "mentioning a wall is not being one");
});

test("an ordinary page matches nothing at all", () => {
  assert.equal(matchChallenge(ORDINARY), null);
  assert.equal(matchChallenge({}), null, "an empty probe is not evidence of a wall");
});

test("every signature declares something to match on", () => {
  // A signature with no positive matcher would match every page in the gallery,
  // and it would do it silently — the run would just start failing everything.
  for (const signature of CHALLENGE_SIGNATURES) {
    const matchers = [signature.title, signature.heading, signature.text, signature.selectors];
    assert.ok(
      matchers.some((matcher) => matcher !== undefined),
      `${signature.name} matches on nothing, which means it matches on everything`,
    );
  }
});

test("the page is asked for exactly the selectors the signatures match on", () => {
  // These are two lists that have to stay one list: a selector named in a
  // signature but never queried is a signature that can never fire.
  const named = new Set(CHALLENGE_SIGNATURES.flatMap((signature) => signature.selectors ?? []));

  assert.deepEqual(
    [...named].sort(),
    [...CHALLENGE_SELECTORS].sort(),
    "a selector no probe asks for is a rule that does not exist",
  );
});

/* ---------------------------------------------------------------------------
   The image backstop
   --------------------------------------------------------------------------- */

/**
 * A near-white viewport with a small block of dark pixels in the middle of it,
 * which is what a challenge page is: one sentence on an empty screen.
 *
 * The default is measured against the real thing. The VET-27 Inspora capture
 * was 1440x900, mean channel value 254.6, variance 6.8 — about 0.1% of its
 * pixels were the sentence and the rest was background. These numbers reproduce
 * that shape rather than approximating "blank" by eye.
 *
 * @param {object} [options]
 * @param {number} [options.rows]  Height of the text block.
 * @param {number} [options.cols]  Width of the text block.
 * @returns {Promise<Buffer>}
 */
async function challengePng({ rows = 12, cols = 100 } = {}) {
  const width = 1440;
  const height = 900;
  const pixels = Buffer.alloc(width * height * 3, 250);

  for (let y = 440; y < 440 + rows; y += 1) {
    for (let x = 620; x < 620 + cols; x += 1) {
      const at = (y * width + x) * 3;
      pixels[at] = 40;
      pixels[at + 1] = 40;
      pixels[at + 2] = 40;
    }
  }

  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

/** The encode `finish()` performs, so a measurement here is a measurement there. */
async function asShot(/** @type {Buffer} */ png) {
  return await sharp(png)
    .resize({ width: 1440, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 6 })
    .toBuffer();
}

test("a challenge page reads as blank on the numbers alone", async () => {
  const measurement = await measureShot(await asShot(await challengePng()));

  assert.equal(shotLooksBlank(measurement), true);
  assert.ok(measurement.variance < 12, `variance ${measurement.variance} should be under the line`);
  assert.ok(measurement.density < 0.01, `density ${measurement.density} should be under the line`);
});

test("an empty screen is blank even with nothing written on it at all", async () => {
  const white = await sharp({
    create: { width: 1440, height: 900, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .png()
    .toBuffer();

  assert.equal(shotLooksBlank(await measureShot(await asShot(white))), true);
});

test("flat but heavy, or light but varied, is a page and not a wall", async () => {
  // The `and` in `shotLooksBlank`, from both sides. A poster is one colour and
  // encodes big; a spare page is small and still has something in it.
  const varied = await measureShot(await asShot(await challengePng({ rows: 300, cols: 900 })));
  assert.equal(shotLooksBlank(varied), false, "a page with content on it is not blank");

  assert.equal(
    shotLooksBlank({ variance: 0, density: 0.4 }),
    false,
    "a flat image that costs 0.4 bytes a pixel is a photograph, not an empty screen",
  );
  assert.equal(
    shotLooksBlank({ variance: 90, density: 0.001 }),
    false,
    "a tiny image full of contrast is a spare page that compressed well",
  );
});

test("every shot this repo has committed survives the backstop", async () => {
  // The regression set, and the only honest one: these nine files are what the
  // gallery is made of, and they include the page most likely to be mistaken
  // for a wall — Bychudy is a real site that is one viewport tall. A threshold
  // edit that flags any of them is a threshold edit that breaks the pipeline.
  const files = (await readdir(DEFAULT_OUT_DIR)).filter((file) => file.endsWith(".webp"));

  assert.ok(files.length >= 6, "the regression set is the committed shots; there should be some");

  for (const file of files.sort()) {
    const measurement = await measureShot(await readFile(path.join(DEFAULT_OUT_DIR, file)));

    assert.equal(
      shotLooksBlank(measurement),
      false,
      `${file} is a published shot and reads as blank: variance ${measurement.variance.toFixed(1)}, density ${measurement.density.toFixed(4)}`,
    );
  }
});
