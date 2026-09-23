/**
 * icon.mjs — a tool's app icon, fetched once and kept in this repository.
 *
 * The site used to ask logo.dev for every tool logo on every page view, which
 * put a third party on /tools. Now the pipeline asks once, when a tool is
 * published, and the page serves `public/icons/<slug>.webp` from this domain.
 * `lib/links.ts › markFor` draws the file when it exists and the letter when
 * it does not, so "no icon" is always a valid answer here.
 *
 * Tried in order, first usable image wins:
 *
 *   1. the site's apple-touch-icon (the declared ones, then `/apple-touch-icon.png`)
 *   2. the largest icon in its web manifest
 *   3. logo.dev, with `fallback=404` so an unknown domain gets nothing rather
 *      than logo.dev's generated monogram
 *
 * **Never a GitHub owner's avatar.** A repository-only tool uses the repo's
 * own `homepage` field and nothing else; any candidate on a GitHub host is
 * skipped, and so is logo.dev for a github.com or github.io site, which would
 * answer with the octocat. Most owners are individuals, and their avatar is a
 * stranger's face.
 *
 * Run directly to backfill every tool: `node pipeline/icon.mjs [--force]`.
 */

import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import sharp from "sharp";

import { repoFrom } from "./entries.mjs";
import { resolvePaths } from "./state.mjs";
import { describe, isRecord } from "./util.mjs";

/** The stored square. The largest mark is 60px, 120 device pixels at 2x. */
export const ICON_SIZE = 256;

/** Smaller than this and the 60px mark would be an upscaled blur. */
const MIN_SOURCE = 120;

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;

/** The publishable half of the logo.dev key pair; it is meant to be public. */
const LOGO_DEV_TOKEN = "pk_YsFOVGNeRx6b1C0u0e0yTw";

const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; aayushmanchanda.com icon fetch)" };

/** Hosts whose images are GitHub's, never the tool's: avatars and the octocat. */
const GITHUB_IMAGE_HOST = /(^|\.)(github\.com|githubusercontent\.com|githubassets\.com)$/i;

/** Sites logo.dev knows only as GitHub. */
const GITHUB_SITE_HOST = /(^|\.)github\.(com|io)$/i;

/**
 * Icons that were fetched, looked at on a contact sheet, and turned down: the
 * letter reads better than a generic or wrong picture. Checked before the file,
 * so a `--force` backfill cannot bring one back.
 */
export const REJECTED = new Set([
  // logo.dev answered with a social card or a page screenshot, not a logo.
  "agent-browser",
  "atlas-brain-wearable",
  "cloudflare-os",
  "email-your-icp-website-visitors-ploy",
  "emilkowalski-skills-design-and-animation-skills-for-agents",
  "jakubkrehel-skills-interface-design-skills-for-agents",
  "ref-review-the-plan-before-the-code",
  "vgpu",
  // logo.dev answered with the site owner's photo: a face, the thing this file refuses.
  "txt-minimalist-text-editor-for-macos",
]);

/** @typedef {typeof globalThis.fetch} Fetch */

/** @param {string} url @param {Fetch} fetch */
async function get(url, fetch) {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response;
}

const LINK_TAG = /<link\b[^>]*>/gi;
const ATTR = /([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;

/** Every `<link>` in a page, as lowercase attribute maps. @param {string} html */
function linksIn(html) {
  return [...html.matchAll(LINK_TAG)].map(([tag]) =>
    Object.fromEntries(
      [...tag.matchAll(ATTR)].map((m) => [String(m[1]).toLowerCase(), m[2] ?? m[3] ?? m[4] ?? ""]),
    ),
  );
}

/** The widest edge a `sizes` value names; `any` is a vector. @param {unknown} sizes */
function widest(sizes) {
  if (typeof sizes !== "string") return 0;
  if (/\bany\b/i.test(sizes)) return 512;
  return Math.max(0, ...sizes.split(/\s+/).map((size) => Number(size.split(/x/i)[0]) || 0));
}

/** @param {string} rel @param {string} word */
const relHas = (rel, word) => rel.toLowerCase().split(/\s+/).includes(word);

/** @param {string} url @param {Fetch} fetch @returns {Promise<string[]>} */
async function manifestIcons(url, fetch) {
  const json = await (await get(url, fetch)).json();
  const icons = isRecord(json) && Array.isArray(json["icons"]) ? json["icons"].filter(isRecord) : [];
  return icons
    .filter((icon) => typeof icon["src"] === "string")
    .sort((a, b) => widest(b["sizes"]) - widest(a["sizes"]))
    .map((icon) => new URL(String(icon["src"]), url).href);
}

/**
 * The image URLs worth trying for a site, best first.
 *
 * @param {string} site @param {Fetch} fetch
 * @returns {Promise<string[]>}
 */
export async function candidatesFor(site, fetch) {
  /** @type {string[]} */
  let declared = [];
  /** @type {string[]} */
  let manifest = [];
  try {
    const page = await get(site, fetch);
    const base = page.url || site;
    const links = linksIn(await page.text());

    declared = links
      .filter((link) => (relHas(link.rel ?? "", "apple-touch-icon") || relHas(link.rel ?? "", "apple-touch-icon-precomposed")) && link.href)
      .sort((a, b) => widest(b.sizes) - widest(a.sizes))
      .map((link) => new URL(String(link.href), base).href);

    const declaredManifest = links.find((link) => relHas(link.rel ?? "", "manifest") && link.href);
    if (declaredManifest) manifest = await manifestIcons(new URL(String(declaredManifest.href), base).href, fetch);
  } catch {
    // A page behind a bot wall may still serve its icon file, and logo.dev may know the domain.
  }

  const host = new URL(site).hostname.replace(/^www\./, "");
  const logoDev = GITHUB_SITE_HOST.test(host)
    ? []
    : [`https://img.logo.dev/${encodeURIComponent(host)}?token=${LOGO_DEV_TOKEN}&size=${ICON_SIZE}&format=webp&fallback=404`];

  return [...new Set([...declared, new URL("/apple-touch-icon.png", site).href, ...manifest, ...logoDev])];
}

/**
 * The repository's own `homepage`, or null. Never the owner's profile.
 *
 * @param {string} repo  `https://github.com/{owner}/{name}`
 * @param {Fetch} fetch
 * @returns {Promise<string | null>}
 */
async function homepageOf(repo, fetch) {
  try {
    const [owner, name] = new URL(repo).pathname.split("/").filter(Boolean);
    const json = await (await get(`https://api.github.com/repos/${owner}/${name}`, fetch)).json();
    const homepage = isRecord(json) && typeof json["homepage"] === "string" ? json["homepage"].trim() : "";
    if (homepage === "") return null;
    const url = new URL(/^https?:\/\//i.test(homepage) ? homepage : `https://${homepage}`);
    return GITHUB_IMAGE_HOST.test(url.hostname) ? null : url.href;
  } catch {
    return null;
  }
}

/**
 * Any image in, a 256px square WebP out — or null when the source is too small
 * to be anything but a blur. Transparent pixels land on white, the way a home
 * screen flattens a touch icon, so a dark logo does not vanish in dark mode.
 *
 * @param {Buffer} bytes
 * @returns {Promise<Buffer | null>}
 */
export async function encodeIcon(bytes) {
  const { format, width = 0, height = 0 } = await sharp(bytes).metadata();
  const edge = Math.min(width, height);
  const vector = format === "svg";
  if (!vector && edge < MIN_SOURCE) return null;

  const image = vector
    ? sharp(bytes, { density: Math.min(2400, Math.ceil((72 * ICON_SIZE) / Math.max(edge, 1))) })
    : sharp(bytes);
  return await image
    .flatten({ background: "#ffffff" })
    .resize(ICON_SIZE, ICON_SIZE, { fit: "contain", background: "#ffffff" })
    .webp({ quality: 90 })
    .toBuffer();
}

/** @param {string} url @param {Fetch} fetch */
async function download(url, fetch) {
  const bytes = Buffer.from(await (await get(url, fetch)).arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error(`${url} is ${bytes.length} bytes`);
  return bytes;
}

/** @param {string} file */
const exists = (file) => access(file).then(() => true, () => false);

/**
 * Fetch one tool's icon into `dir/<slug>.webp`.
 *
 * Idempotent: an icon already on disk is kept unless `force`. Never throws for
 * a network or image problem; every one of those ends in null, which the site
 * draws as the letter. Only a failing disk write escapes.
 *
 * @param {object} input
 * @param {string} input.slug
 * @param {string | null} input.url   The product site, or a GitHub repository.
 * @param {string} input.dir
 * @param {Fetch} [input.fetch]
 * @param {boolean} [input.force]
 * @param {(line: string) => void} [input.log]
 * @returns {Promise<string | null>} The icon file, or null for the letter.
 */
export async function fetchIcon({ slug, url, dir, fetch = globalThis.fetch, force = false, log = () => {} }) {
  if (REJECTED.has(slug)) return null;

  const file = path.join(dir, `${slug}.webp`);
  if (!force && (await exists(file))) return file;

  const repo = url === null ? null : repoFrom(url);
  const site = repo === null ? url : await homepageOf(repo, fetch);
  if (site === null || GITHUB_IMAGE_HOST.test(new URL(site).hostname)) {
    log(`icon: ${slug} has no site of its own — letter`);
    return null;
  }

  for (const candidate of await candidatesFor(site, fetch)) {
    if (GITHUB_IMAGE_HOST.test(new URL(candidate).hostname)) continue;
    try {
      const webp = await encodeIcon(await download(candidate, fetch));
      if (webp === null) continue;

      await mkdir(dir, { recursive: true });
      await writeFile(`${file}.tmp`, webp);
      await rename(`${file}.tmp`, file);
      log(`icon: ${slug} <- ${candidate.split("?")[0]}`);
      return file;
    } catch (error) {
      log(`icon: ${slug} skipped ${candidate.split("?")[0]} — ${describe(error).split("?")[0]}`);
    }
  }

  log(`icon: ${slug} — nothing usable at ${site}, letter`);
  return null;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const force = process.argv.includes("--force");
  const paths = resolvePaths(path.resolve(import.meta.dirname, ".."));
  /** @type {{ slug: string, url?: string | null, repo?: string }[]} */
  const tools = JSON.parse(await readFile(paths.toolsJson, "utf8"));

  let real = 0;
  // ponytail: fixed batches of 8, not a pool; fine for ~100 tools once.
  for (let index = 0; index < tools.length; index += 8) {
    const batch = tools.slice(index, index + 8);
    const got = await Promise.all(
      batch.map((tool) =>
        fetchIcon({ slug: tool.slug, url: tool.url ?? tool.repo ?? null, dir: paths.iconsDir, force, log: console.log }),
      ),
    );
    real += got.filter((file) => file !== null).length;
  }
  console.log(`icons: ${real} real, ${tools.length - real} letter`);
}
