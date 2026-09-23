/**
 * `summarize()` and its helpers, pinned rule by rule.
 *
 * The sampler half of design.mjs needs a browser; this half does not, so each
 * evidence rule is held here against hand-built samples. What is asserted is
 * the rule (a grey caption does not become `text`, a faint hairline is not a
 * `border`), not whatever one live page happens to produce.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { contrast, dedupeType, firstFamily, rank, readDesign, summarize, toHex } from "./design.mjs";

/**
 * A sample with quiet defaults: transparent, unbordered, no text.
 *
 * @param {Partial<import("./design.mjs").Sample>} over
 * @returns {import("./design.mjs").Sample}
 */
function el(over) {
  return {
    tag: "div",
    nav: false,
    card: false,
    area: 100,
    text: 0,
    bg: "0,0,0,0",
    color: "0,0,0,255",
    border: null,
    font: ["Inter, sans-serif", "16px", "400", "24px", "normal"],
    space: [],
    radius: "0px",
    ...over,
  };
}

const WHITE = "255,255,255,255";

/** @param {import("./design.mjs").Sample[]} samples @param {string} [body] @param {string[]} [edges] */
const run = (samples, body = WHITE, edges = []) =>
  summarize({ body, html: "0,0,0,0", edges, samples }, "2026-09-22");

/** @param {{ name: string }[] | undefined} list */
const names = (list) => (list ?? []).map((token) => token.name);

test("toHex writes lowercase #rrggbb and drops anything under half alpha", () => {
  assert.equal(toHex("43,75,255,255"), "#2b4bff");
  assert.equal(toHex("0,0,0,128"), "#000000");
  assert.equal(toHex("0,0,0,127"), null);
  assert.equal(toHex("0,0,0,0"), null);
});

test("rank sums weights and breaks ties by first appearance", () => {
  assert.deepEqual(rank([["a", 1], ["b", 2], ["a", 2], ["c", 3]]), ["a", "c", "b"]);
});

test("contrast is the WCAG ratio", () => {
  assert.equal(Math.round(contrast("#000000", "#ffffff")), 21);
  assert.equal(contrast("#777777", "#777777"), 1);
});

test("background comes from body, surface is the next biggest fill", () => {
  const design = run([
    el({ bg: "240,240,240,255", area: 5000 }),
    el({ bg: WHITE, area: 9000 }),
    el({ bg: "250,250,250,255", area: 100 }),
  ]);
  assert.deepEqual(design?.colors.slice(0, 2), [
    { name: "background", hex: "#ffffff" },
    { name: "surface", hex: "#f0f0f0" },
  ]);
});

test("what shows at the page margins beats the body's own fill", () => {
  const design = run([], WHITE, ["9,9,11,255", "9,9,11,255", WHITE]);
  assert.equal(design?.colors[0]?.hex, "#09090b");
});

test("a transparent body falls back to the largest filled area", () => {
  const design = run([el({ bg: "10,10,10,255", area: 9000 })], "0,0,0,0");
  assert.equal(design?.colors[0]?.hex, "#0a0a0a");
});

test("text is the higher-contrast of the two main text colours, however long the captions run", () => {
  const design = run([
    el({ tag: "p", text: 900, color: "161,161,161,255" }),
    el({ tag: "span", text: 100, color: "23,23,23,255" }),
  ]);
  const colors = Object.fromEntries((design?.colors ?? []).map((c) => [c.name, c.hex]));
  assert.equal(colors["text"], "#171717");
  assert.equal(colors["text-muted"], "#a1a1a1");
});

test("text that vanishes into the background is not a text role", () => {
  const design = run([
    el({ tag: "p", text: 900, color: "17,17,17,255" }),
    el({ tag: "span", text: 500, color: WHITE }),
  ]);
  assert.deepEqual(names(design?.colors).filter((n) => n.startsWith("text")), ["text"]);
});

test("firstFamily unquotes the first family and drops a next/font hash", () => {
  assert.equal(firstFamily('"Inter Variable", Inter, sans-serif'), "Inter Variable");
  assert.equal(firstFamily("__Fraunces_64357a, __Fraunces_Fallback_64357a"), "Fraunces");
});

test("a near-identical second ink is not muted text", () => {
  const design = run([
    el({ tag: "p", text: 900, color: "23,23,23,255" }),
    el({ tag: "p", text: 100, color: "17,17,17,255" }),
  ]);
  assert.deepEqual(names(design?.colors).filter((n) => n.startsWith("text")), ["text"]);
});

test("accent needs chroma; a grey link is not an accent", () => {
  const grey = run([el({ tag: "a", color: "120,120,120,255" })]);
  assert.equal(names(grey?.colors).includes("accent"), false);
  const blue = run([el({ tag: "a", color: "120,120,120,255" }), el({ tag: "button", bg: "43,75,255,255" })]);
  assert.ok(blue?.colors.some((c) => c.name === "accent" && c.hex === "#2b4bff"));
});

test("a faint alpha hairline is not a border token", () => {
  const faint = run([el({ border: "0,0,0,25" })]);
  assert.equal(names(faint?.colors).includes("border"), false);
  const solid = run([el({ border: "229,229,229,255" })]);
  assert.ok(solid?.colors.some((c) => c.name === "border" && c.hex === "#e5e5e5"));
});

test("type roles come from their elements, mono only when code exists", () => {
  const design = run([
    el({ tag: "h1", text: 10, font: ['"Söhne", sans-serif', "48.0001px", "600", "52px", "-0.96px"] }),
    el({ tag: "h3", text: 10, font: ["Inter", "20px", "600", "28px", "normal"] }),
    el({ tag: "p", text: 200 }),
    el({ tag: "a", nav: true, text: 5, font: ["Inter", "14px", "500", "20px", "normal"] }),
  ]);
  assert.deepEqual(names(design?.type), ["display", "heading", "body", "label"]);
  assert.deepEqual(design?.type[0], {
    name: "display",
    fontFamily: "Söhne",
    fontSize: "48px",
    fontWeight: "600",
    lineHeight: "52px",
    letterSpacing: "-0.96px",
  });
});

test("two roles set identically are one style, kept under the content role", () => {
  /** @type {[string, string, string, string, string]} */
  const same = ['"Public Sans", sans-serif', "15px", "500", "22.5px", "normal"];
  const design = run([
    el({ tag: "h1", text: 10, font: same }),
    el({ tag: "p", text: 200, font: same }),
    el({ tag: "button", text: 5, font: ["Figtree", "13px", "600", "18.2px", "-0.5px"] }),
  ]);
  assert.deepEqual(names(design?.type), ["body", "label"]);
});

test("dedupeType keeps order and only drops exact matches", () => {
  /** @param {string} name @param {string} size */
  const t = (name, size) => ({ name, fontFamily: "Inter", fontSize: size, fontWeight: "400", lineHeight: "24px", letterSpacing: "normal" });
  assert.deepEqual(
    dedupeType([t("display", "32px"), t("heading", "16px"), t("body", "16px"), t("label", "14px")]).map((x) => x.name),
    ["display", "body", "label"],
  );
});

test("spacing keeps the top five px values, ascending, named on the 4px step", () => {
  const design = run([
    el({ space: ["8px", "8px", "16px", "16px", "0px", "auto", "120px", "10px"] }),
    el({ space: ["8px", "4px", "24px", "12px", "12px", "32px"] }),
  ]);
  assert.deepEqual(design?.spacing, [
    { name: "1", value: "4px" },
    { name: "2", value: "8px" },
    { name: "10px", value: "10px" },
    { name: "3", value: "12px" },
    { name: "4", value: "16px" },
  ]);
});

test("radius is named by the element it was seen on, and a pill is full", () => {
  const design = run([
    el({ tag: "button", radius: "6px" }),
    el({ tag: "button", radius: "6px" }),
    el({ tag: "img", radius: "12px" }),
    el({ tag: "button", radius: "9999px" }),
    el({ tag: "div", radius: "8px" }),
  ]);
  assert.deepEqual(design?.radius, [
    { name: "button", value: "6px" },
    { name: "image", value: "12px" },
    { name: "full", value: "9999px" },
  ]);
});

test("nothing observed is null, not an empty design", () => {
  assert.equal(summarize({ body: "0,0,0,0", html: "0,0,0,0", edges: [], samples: [] }, "2026-09-22"), null);
});

test("readDesign gives up on a sampler that never answers instead of stalling the shot", async () => {
  const stuck = { evaluate: () => new Promise(() => {}) };
  assert.equal(await readDesign(/** @type {any} */ (stuck), "2026-09-22", 20), null);
});

test("readDesign stamps the date it is handed, not the machine's", async () => {
  const raw = { body: WHITE, html: "0,0,0,0", edges: [], samples: [el({ tag: "p", text: 40 })] };
  const page = { evaluate: async () => raw };
  const design = await readDesign(/** @type {any} */ (page), "2020-01-02", 20);
  assert.equal(design?.read_date, "2020-01-02");
});
