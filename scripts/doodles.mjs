/**
 * doodles.mjs — the pen-mark set (VET-251): twelve shapes drawn by hand here,
 * each written out three times into `src/assets/doodles/doodles.json`, which
 * `components/Doodle.astro` reads. Run by hand (`npm run doodles`) and
 * committed; `src/lib/doodles.test.mjs` fails if the file and this script
 * disagree.
 *
 * Variant 1 is the drawing as written. Variants 2 and 3 move every point by a
 * seeded amount, up to `JITTER` of the shape's box on each axis, so the same
 * mark used twice on a page is two strokes of a pen, not a copy. Paths use
 * absolute M/L/C/S commands only, so every number is an x or a y in turn.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** @typedef {{ box: [number, number], paths: string[] }} Shape */

/** @type {Record<string, Shape>} */
const SHAPES = {
  arrow: {
    box: [48, 24],
    paths: ["M3 13C14 11.5 28 12.6 43 11.6", "M35 4.5C38.5 7.5 41.5 9.8 44 11.6C40.8 14 37.8 16.4 34.6 19.2"],
  },
  "arrow-curve": {
    box: [48, 48],
    paths: ["M5 8C22 4 38 12 38.2 39", "M31 32C34 35 36.5 38 38.2 41C40 37.6 42 34.8 45 32"],
  },
  "arrow-loop": {
    box: [64, 40],
    paths: [
      "M4 31C14 31 22 27 26 19C29 12 24 6 19 9C14 12 17 23 28 27C38 30.5 50 28.5 58 22.5",
      "M50 20.5C53 21.5 56 22.2 58.6 22.3C58 19.5 57.4 17 56.6 14",
    ],
  },
  underline: { box: [100, 12], paths: ["M2 8.5C20 6 45 5.2 70 6C82 6.5 91 7.2 98 5"] },
  "underline-double": {
    box: [100, 14],
    paths: ["M2 5.5C30 4 65 4 97 5", "M6 10.5C35 9 68 9.2 94 9.8"],
  },
  circle: {
    box: [100, 40],
    paths: ["M58 3.5C30 1.5 4 8 3.5 20C3 32 30 38.5 55 37.5C82 36.5 97.5 29 96.5 18.5C95.5 8 72 2.5 44 4.5C36 5 30 6.5 26 8"],
  },
  star: { box: [32, 32], paths: ["M16 2.5L24.5 28.5L3 11.5L29 11L7 28.5L16.5 3.5"] },
  sparkle: {
    box: [32, 32],
    paths: ["M15 4C16 12.5 19.5 16 28 17C19.5 18 16 21.5 15 30C14 21.5 10.5 18 2 17C10.5 16 14 12.5 15 4", "M27 2L27 8M24 5L30 5"],
  },
  squiggle: {
    box: [100, 12],
    paths: ["M2 7C7 2 11 2 14 7S21 12 26 7S33 2 38 7S45 12 50 7S57 2 62 7S69 12 74 7S81 2 86 7S93 12 98 7"],
  },
  bracket: { box: [12, 100], paths: ["M10 2C5 2.5 3.5 3.5 3.5 8C3.8 35 3 65 3.5 92C3.5 96.5 5 97.5 10 98"] },
  asterisk: {
    box: [32, 32],
    paths: ["M16 3C16.3 12 15.8 20 16 29", "M5 9.5C12 13.5 20 18 27 22.5", "M27 9C20 13.5 12 18 5 22.5"],
  },
  check: { box: [32, 32], paths: ["M4 17C7 19 10 22.5 12.5 27C17 17 22.5 9.5 29 4"] },
};

/** Share of the box a point may move on each axis. */
const JITTER = 0.025;

/** mulberry32: a small seeded PRNG, so a rebuild writes the same file. */
function random(/** @type {number} */ seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** djb2 of the shape name plus the variant, the seed for that variant. */
function seedOf(/** @type {string} */ name, /** @type {number} */ variant) {
  let hash = 5381;
  for (const char of `${name}:${variant}`) hash = (hash * 33 + char.charCodeAt(0)) | 0;
  return hash;
}

/** Every number in `d` moved by up to JITTER of its axis. */
function jitter(/** @type {string} */ d, /** @type {[number, number]} */ box, /** @type {() => number} */ next) {
  let i = 0;
  return d.replace(/-?\d*\.?\d+/g, (n) => {
    const amp = box[i++ % 2] * JITTER;
    return String(Math.round((Number(n) + (next() * 2 - 1) * amp) * 10) / 10);
  });
}

/** @returns {Record<string, { box: [number, number], variants: string[][] }>} */
export function build() {
  return Object.fromEntries(
    Object.entries(SHAPES).map(([name, { box, paths }]) => {
      const variants = [1, 2, 3].map((variant) => {
        if (variant === 1) return paths;
        const next = random(seedOf(name, variant));
        return paths.map((d) => jitter(d, box, next));
      });
      return [name, { box, variants }];
    }),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = new URL("../src/assets/doodles/doodles.json", import.meta.url);
  writeFileSync(out, `${JSON.stringify(build(), null, 2)}\n`);
  console.log(`wrote ${fileURLToPath(out)}`);
}
