/**
 * Copy lint: the patterns `voice.md` bans, checked on every build.
 *
 * Two rules. The banned sentences (Aayush's own examples of fluff that
 * shipped) must not appear anywhere in `src/`. Em dashes must not appear in
 * site-authored copy: the text of `.astro` templates, string literals in `.ts`,
 * and `.md` content. Comments, `<style>` blocks and `src/data/` are exempt:
 * comments are not copy, and the data notes are dated verdicts fixed on touch
 * (VET-234).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SRC = path.join(ROOT, "src");

const BANNED = [
  "built this site overnight",
  "buttondown runs the list",
  "nobody else sees it",
  "that is also the limit of it",
  "limit of it: my use case",
  "an old date is a warning",
  "warning, not a badge",
  "the site publishes itself",
  "nothing reads it but this site",
  "self-aware wink",
];

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "data" ? [] : walk(full);
    return /\.(astro|ts|mjs|md)$/.test(entry.name) && !entry.name.endsWith(".test.mjs")
      ? [full]
      : [];
  });
}

const FILES = walk(SRC);

/** Code that names the em dash in order to reject or trim it. Not copy. */
const ALLOW = [
  "/[|:—·]/.test(value)",
  "none of | : — ·.",
  "[\\s,.;:!?—–-]+$",
  'value.includes("—")',
];

/**
 * Drop what a reader never sees: comments and style blocks.
 * @param {string} file
 * @param {string} text
 */
function copyOf(file, text) {
  if (file.endsWith(".md")) return text;
  return text
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

test("no banned pattern appears in src/ or PURPOSE.md", () => {
  const targets = [...FILES, path.join(ROOT, "PURPOSE.md")];
  /** @type {string[]} */
  const hits = [];
  for (const file of targets) {
    const text = readFileSync(file, "utf8").toLowerCase().replace(/\s+/g, " ");
    for (const phrase of BANNED) {
      if (text.includes(phrase)) hits.push(`${path.relative(ROOT, file)}: "${phrase}"`);
    }
  }
  assert.deepEqual(hits, [], "banned copy is back; see voice.md › Patterns that don't ship");
});

test("no em dash in site-authored copy", () => {
  /** @type {string[]} */
  const hits = [];
  for (const file of FILES) {
    const copy = copyOf(file, readFileSync(file, "utf8"));
    copy.split("\n").forEach((/** @type {string} */ line) => {
      if (ALLOW.some((code) => line.includes(code))) return;
      if (/—|&mdash;|\\u2014/.test(line)) {
        hits.push(`${path.relative(ROOT, file)}: ${line.trim().slice(0, 90)}`);
      }
    });
  }
  assert.deepEqual(hits, [], "use a period, a colon or a comma (voice.md › Banned)");
});

test("the lint strips comments and keeps copy", () => {
  const sample = "/* a — b */\n// c — d\n<p>e — f</p>\nconst u = 'https://x.com';";
  const copy = copyOf("x.astro", sample);
  assert.ok(!copy.includes("a — b") && !copy.includes("c — d"));
  assert.ok(copy.includes("e — f") && copy.includes("https://x.com"));
});
