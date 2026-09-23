/**
 * Send removed /library entries to /library with a 308.
 *
 *     node scripts/library-redirects.mjs <file with one slug per line>
 *
 * Merges the slugs into the rules already in `vercel.json` (so a later trim adds
 * to the list rather than replacing it), then writes them back as a few regex
 * alternations, each under Vercel's 4096-character `src` cap. Each rule covers
 * `/library/<slug>`, its trailing slash and its `.md`. Refuses a slug that is
 * still live: `src/lib/library-redirects.test.mjs` holds the same line.
 */

import { readFileSync, writeFileSync } from "node:fs";

const VERCEL = new URL("../vercel.json", import.meta.url);
const LIBRARY = new URL("../src/data/library.json", import.meta.url);
const PREFIX = "^/library/(?:";
const SUFFIX = ")(?:\\.md)?/?$";
const MAX_SRC = 4000;

/** @param {{ src?: string, status?: number, headers?: Record<string, string> }} route */
export const isLibraryRedirect = (route) =>
  route.status === 308 && route.headers?.Location === "/library" && (route.src ?? "").startsWith(PREFIX);

/** @param {string} src */
const slugsOf = (src) => src.slice(PREFIX.length, -SUFFIX.length).split("|");

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) throw new Error("usage: node scripts/library-redirects.mjs <slugs.txt>");

  const config = JSON.parse(readFileSync(VERCEL, "utf8"));
  const live = new Set(JSON.parse(readFileSync(LIBRARY, "utf8")).map((/** @type {{ slug: string }} */ e) => e.slug));
  const old = config.routes.filter(isLibraryRedirect).flatMap((/** @type {{ src: string }} */ r) => slugsOf(r.src));
  const added = readFileSync(file, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  const slugs = [...new Set([...old, ...added])].sort();

  for (const slug of slugs) {
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`not a slug: ${slug}`);
    if (live.has(slug)) throw new Error(`still live, will not redirect: ${slug}`);
  }

  /** @type {string[][]} */
  const chunks = [[]];
  for (const slug of slugs) {
    const last = chunks[chunks.length - 1];
    if ((PREFIX + [...last, slug].join("|") + SUFFIX).length > MAX_SRC) chunks.push([slug]);
    else last.push(slug);
  }
  // Text edit, not a re-serialise: vercel.json's hand layout stays as it is.
  const rule = (/** @type {string[]} */ c) =>
    `    {\n      "src": ${JSON.stringify(PREFIX + c.join("|") + SUFFIX)},\n      "status": 308,\n      "headers": { "Location": "/library" }\n    },\n`;
  const RULE = /    \{\n      "src": "\^\/library\/\(\?:[^"]*",\n      "status": 308,\n      "headers": \{ "Location": "\/library" \}\n    \},\n/g;
  const ANCHOR = '    {\n      "src": "^/computer/?$",';
  const text = readFileSync(VERCEL, "utf8").replace(RULE, "");
  if (!text.includes(ANCHOR)) throw new Error("vercel.json: /computer redirect not found to anchor on");
  writeFileSync(VERCEL, text.replace(ANCHOR, chunks.map(rule).join("") + ANCHOR));
  if (JSON.parse(readFileSync(VERCEL, "utf8")).routes.filter(isLibraryRedirect).length !== chunks.length) {
    throw new Error("vercel.json: rule count mismatch after write");
  }
  console.log(`${slugs.length} slugs in ${chunks.length} rule(s)`);
}
