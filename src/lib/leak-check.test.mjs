/**
 * Leak check: nothing from the private setup behind this site reaches a page.
 *
 * Every word a reader sees comes from `src/content/` (notes, and the tips /notes lists)
 * or `src/data/` (the pipeline's JSON). A tip about how Aayush works is the
 * likeliest place for a local address, a path on his machine or a ticket id to
 * slip in, so all of it is scanned for the markers below on every `npm test`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Each marker with what it would give away.
 * @type {[RegExp, string][]}
 */
const MARKERS = [
  [/127\.0\.0\.1/, "loopback address"],
  [/localhost/i, "local host"],
  [/~\/\./, "home dotfile path"],
  [/\/Users\//, "macOS home path"],
  [/_KEY\b/, "secret variable name"],
  [/\.env\b/, "env file"],
  [/OAuth/, "auth setup"],
  [/claudex/i, "private harness name"],
  [/\bAAY-\d/, "personal ticket id"],
  [/\bVET-\d/, "ticket id"],
  [/Pitblado/i, "legal matter"],
  [/GBrain/i, "private memory store"],
  [/\bLCM\b/i, "agent internals"],
  [/[a-z0-9]:\d{4,5}\b/i, "host and port"],
];

/**
 * Published strings that match a marker and are not a leak, each pinned to
 * the exact text so a new occurrence anywhere else still fails.
 */
const ALLOWED = [
  // Quoted from a saved video's transcript, about someone else's setup.
  ["src/data/library.json", "instead of using .env files."],
];

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(md|json)$/.test(entry.name) ? [full] : [];
  });
}

/**
 * Every marker hit in one file's text, as `file:line: label`.
 * @param {string} file relative to the repo root
 * @param {string} text
 */
export function leaks(file, text) {
  /** @type {string[]} */
  const hits = [];
  text.split("\n").forEach((line, i) => {
    if (ALLOWED.some(([f, exact]) => f === file && line.includes(exact))) return;
    for (const [pattern, label] of MARKERS) {
      if (pattern.test(line)) hits.push(`${file}:${i + 1}: ${label}`);
    }
  });
  return hits;
}

test("no private setup detail in any published content", () => {
  const files = [...walk(path.join(ROOT, "src/content")), ...walk(path.join(ROOT, "src/data"))];
  assert.ok(files.some((file) => file.includes("/content/computer/")), "the tips are scanned");
  const hits = files.flatMap((file) => {
    const rel = path.relative(ROOT, file);
    return leaks(rel, readFileSync(file, "utf8"));
  });
  assert.deepEqual(hits, [], "private setup detail in published content; cut it");
});

test("the check catches each marker and lets ordinary prose through", () => {
  const planted = [
    "open http://127.0.0.1 now",
    "runs on localhost",
    "edit ~/.zshrc",
    "in /Users/me/site",
    "set OPENAI_API_KEY",
    "keep it in .env",
    "an OAuth token",
    "via claudex",
    "see AAY-12",
    "per VET-236",
    "Pitblado replied",
    "GBrain search",
    "the LCM plugin",
    "proxy on host:8317",
  ];
  for (const line of planted) {
    assert.equal(leaks("x.md", line).length, 1, line);
  }
  assert.deepEqual(leaks("x.md", "At 10:30 I walk. Every env var stays put. A 16:9 frame."), []);
  assert.deepEqual(leaks("src/data/library.json", "instead of using .env files."), []);
  assert.equal(leaks("src/content/notes/x.md", "instead of using .env files.").length, 1);
});
