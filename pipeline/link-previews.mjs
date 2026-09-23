/**
 * link-previews.mjs — hover-card pictures for the outbound links written by
 * hand: the notes and /about (add /computer to SOURCES when it ships).
 *
 * Scans the sources for http(s) links (any URL in markdown, a literal
 * `href="…"` in a page), and for each one not already done
 * writes `public/previews/links/<hash>.webp` (the page's og:image, else a
 * viewport shot: `preview.mjs › capturePreview` with `og`) and a row in
 * `src/data/link-previews.json` (url, title, domain). The site reads both at
 * build (`lib/assets.ts › linkPreview`) and adds the card's attributes to the
 * link. The hash is the first 12 hex of sha1(url), so the key is the link as
 * written.
 *
 * Skipped: social profiles, GitHub, and this site. Idempotent: a link with a
 * row and a file is not fetched again; `--force` redoes them all.
 *
 * `node pipeline/link-previews.mjs [--force]`
 */

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright";

import { capturePreview, readMeta } from "./preview.mjs";
import { backfill, writeAtomic } from "./util.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCES = ["src/content", "src/pages/about.astro"];
const DIR = path.join(ROOT, "public", "previews", "links");
const MANIFEST = path.join(ROOT, "src", "data", "link-previews.json");

/** Profiles and repositories say nothing a card could add; this site is not outbound. */
const SKIP =
  /(^|\.)(x\.com|twitter\.com|github\.com|linkedin\.com|instagram\.com|threads\.net|bsky\.app|youtube\.com|aayushmanchanda\.com)$/;
const URLS = /https?:\/\/[^\s"'`)<>\]]+/g;

/** @param {string} url  Same rule as `src/lib/assets.ts › linkHash`. */
export const linkHash = (url) => createHash("sha1").update(url).digest("hex").slice(0, 12);

/**
 * Every outbound link in `text` worth a card, in order, once each.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function outboundLinks(text) {
  const found = new Set();
  for (const [raw] of text.matchAll(URLS)) {
    const url = raw.replace(/[.,;:!?]+$/, "");
    if (!URL.canParse(url) || SKIP.test(new URL(url).hostname.replace(/^www\./, ""))) continue;
    found.add(url);
  }
  return [...found];
}

/** @param {string} source @returns {Promise<string[]>} */
async function filesOf(source) {
  const full = path.join(ROOT, source);
  if (/\.\w+$/.test(source)) return [full];
  const names = await readdir(full, { recursive: true });
  return names.filter((name) => /\.mdx?$/.test(name)).map((name) => path.join(full, name));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const force = process.argv.includes("--force");
  const files = (await Promise.all(SOURCES.map(filesOf))).flat();
  // Markdown autolinks a bare URL, so every URL in a note is a link; in a
  // page only a literal `href="…"` is (a URL in its data may be no link at all).
  const hrefs = (/** @type {string} */ text) => [...text.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).join("\n");
  const texts = await Promise.all(files.map(async (file) => (file.endsWith(".astro") ? hrefs : String)(await readFile(file, "utf8"))));
  const text = texts.join("\n");
  const urls = outboundLinks(text);

  /** @type {Record<string, { url: string, title: string | null, domain: string }>} */
  const old = JSON.parse(await readFile(MANIFEST, "utf8").catch(() => "{}"));
  /** @type {typeof old} */
  const manifest = {};
  /** @type {string[]} */
  const missing = [];
  const browser = await chromium.launch({ headless: true });
  try {
    await backfill(
      urls,
      async (url) => {
        const hash = linkHash(url);
        const got = await capturePreview({ slug: hash, url, dir: DIR, browser, force, og: true, log: console.log });
        if (got === null) return void missing.push(url);
        const kept = old[hash];
        const title = !force && kept ? kept.title : (await readMeta(url)).title;
        manifest[hash] = { url, title, domain: new URL(url).hostname.replace(/^www\./, "") };
      },
      3,
    );
  } finally {
    await browser.close();
  }
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  await writeAtomic(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`link previews: ${Object.keys(sorted).length} of ${urls.length}`);
  if (missing.length > 0) console.log(`none: ${missing.join(", ")}`);
}
