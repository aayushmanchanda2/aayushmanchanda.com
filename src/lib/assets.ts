/**
 * What the pipeline left in `public/`, read once per build.
 *
 * `public/icons` and `public/previews` are listed into a Set each when this
 * module loads, so a page asking "does this tool have an icon" is a lookup, not
 * a filesystem call per row. The check is still a file on disk at build time,
 * which is what keeps every mark and preview on this domain (/privacy).
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

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

const FILES = {
  icons: new Set(readdirSync(path.join(PUBLIC_DIR, "icons"))),
  previews: new Set(readdirSync(path.join(PUBLIC_DIR, "previews"))),
};

/** `/icons/<slug>.webp` or `/previews/<slug>.webp` when the pipeline wrote one, else null. */
export function assetFor(dir: keyof typeof FILES, slug: string): string | null {
  return FILES[dir].has(`${slug}.webp`) ? `/${dir}/${slug}.webp` : null;
}
