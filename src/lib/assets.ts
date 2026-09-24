/**
 * What the pipeline left in `public/`, read once per build.
 *
 * `public/icons` and `public/previews` are listed into a Set each when this
 * module loads, so a page asking "does this tool have an icon" is a lookup, not
 * a filesystem call per row. The check is still a file on disk at build time,
 * which is what keeps every mark and preview on this domain (/privacy).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import type { LibraryEntry } from "./library";
import { previewAttributes } from "./preview-card.ts";

/**
 * `public/` — the web root, so a `/shots/…` path resolves by joining here.
 *
 * Anchored to the working directory, not to `import.meta.url`: by the time
 * this module runs during `astro build` it has been bundled into
 * `dist/.prerender/chunks/`, and a relative walk from there lands nowhere.
 * Astro runs from the project root in both dev and build.
 */
export const PUBLIC_DIR = path.join(process.cwd(), "public");

if (!existsSync(PUBLIC_DIR)) {
  throw new Error(
    `src/lib/assets.ts: no public/ directory at ${PUBLIC_DIR}. ` +
      `Astro must run from the project root for the asset checks to work.`,
  );
}

const list = (dir: string) => {
  const full = path.join(PUBLIC_DIR, dir);
  return new Set(existsSync(full) ? readdirSync(full) : []);
};

const FILES = {
  icons: list("icons"),
  previews: list("previews"),
  "previews/library": list("previews/library"),
  "previews/links": list("previews/links"),
};

/** `/<dir>/<slug>.webp` when the pipeline wrote one, else null. */
export function assetFor(dir: keyof typeof FILES, slug: string): string | null {
  return FILES[dir].has(`${slug}.webp`) ? `/${dir}/${slug}.webp` : null;
}

/**
 * A committed WebP's pixel size, read off its header (no decoder): the
 * `width`/`height` a full-page shot needs so its box is reserved before the
 * bytes land (`ShotFrame.astro`). Handles the three WebP chunk layouts.
 */
export function webpSize(publicPath: string): { width: number; height: number } | null {
  const b = readFileSync(path.join(PUBLIC_DIR, publicPath)).subarray(0, 30);
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (chunk === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  return null;
}

/**
 * The hover card on a link to a /library entry or out to its source: an
 * article's captured og:image or shot (`pipeline/preview.mjs library`), a
 * video's poster. Nothing for a post, which renders in full on its page, or an
 * article with no picture: a card of words would repeat the row.
 */
export function libraryPreview(entry: LibraryEntry): Record<string, string> {
  const image = entry.kind === "video" ? (entry.video?.thumb ?? null) : entry.kind === "article" ? assetFor("previews/library", entry.slug) : null;
  return image === null ? {} : previewAttributes({ image, name: entry.title, domain: entry.domain });
}

type LinkRow = { url: string; title: string | null; domain: string };
const LINKS: Record<string, LinkRow> = JSON.parse(readFileSync(path.join(process.cwd(), "src", "data", "link-previews.json"), "utf8"));

/** Same rule as `pipeline/link-previews.mjs › linkHash`: the link as written. */
const linkHash = (url: string) => createHash("sha1").update(url).digest("hex").slice(0, 12);

/**
 * The hover card for a link written by hand in a note or on /about, from
 * `pipeline/link-previews.mjs`'s manifest and file. Nothing when it has none.
 */
export function linkPreview(url: string): Record<string, string> {
  const hash = linkHash(url);
  const row = LINKS[hash];
  const image = assetFor("previews/links", hash);
  return row === undefined || image === null ? {} : previewAttributes({ image, name: row.title ?? row.domain, domain: row.domain });
}
