/**
 * `/thumbs/<name>`: every smaller copy `lib/thumbs.ts` names, one static file each.
 *
 * `og/[...card].jpg.ts`'s shape: cached by content hash, keyed on the shot's
 * bytes and the recipe below, so a warm build encodes only a shot that is new
 * or changed. Files no shot needs any more are swept.
 *
 * The cache is `node_modules/.cache/shot-cache`, not committed (VET-309b): the
 * copies are ~8 MB and a recipe change would rewrite all of them in history,
 * while `node_modules` is what Vercel's build cache restores between deploys,
 * and CI and the publish workflow restore the directory with `actions/cache`.
 * A cold build (a cleared cache) encodes everything in about two minutes.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { APIRoute, GetStaticPaths, InferGetStaticPropsType } from "astro";

import { PUBLIC_DIR } from "../../lib/assets";
import { CROP_RATIO, type Variant, variantsOf } from "../../lib/thumbs";

const CACHE = path.join(process.cwd(), "node_modules", ".cache", "shot-cache");
const SHOTS = path.join(PUBLIC_DIR, "shots");

/** Changing a number here re-encodes every copy. Quality per format: design.md §8 "Images". */
const RECIPE = { webp: { quality: 75, effort: 6 }, avif: { quality: 50, effort: 4 } };

const TYPES = { webp: "image/webp", avif: "image/avif" } as const;

async function encode(shot: string, variant: Variant): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  const image = sharp(shot, { limitInputPixels: false });
  if (variant.kind === "crop") {
    const { width = 0, height = 0 } = await sharp(shot, { limitInputPixels: false }).metadata();
    image.extract({ left: 0, top: 0, width, height: Math.min(height, Math.round(width / CROP_RATIO)) });
  }
  image.resize({ width: variant.width, withoutEnlargement: true });
  return variant.format === "avif" ? image.avif(RECIPE.avif).toBuffer() : image.webp(RECIPE.webp).toBuffer();
}

export const getStaticPaths = (async () => {
  mkdirSync(CACHE, { recursive: true });
  const recipe = JSON.stringify(RECIPE);
  const copies = readdirSync(SHOTS)
    .filter((name) => name.endsWith(".webp"))
    .flatMap((name) => {
      const shot = path.join(SHOTS, name);
      const bytes = createHash("sha256").update(readFileSync(shot)).digest("hex");
      return variantsOf(`/shots/${name}`).map((variant) => {
        const key = createHash("sha256").update(bytes + recipe + JSON.stringify(variant)).digest("hex");
        return { shot, variant, file: path.join(CACHE, `${key.slice(0, 20)}.${variant.format}`) };
      });
    });

  const missing = copies.filter((copy) => !existsSync(copy.file));
  if (missing.length > 0) {
    const started = Date.now();
    // Seven at a time, a site shot's worth: each decodes a picture up to 12,000px tall.
    for (let i = 0; i < missing.length; i += 7) {
      await Promise.all(missing.slice(i, i + 7).map(async (copy) => writeFileSync(copy.file, await encode(copy.shot, copy.variant))));
    }
    console.log(`[thumbs] encoded ${missing.length} cop${missing.length === 1 ? "y" : "ies"} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  }

  const live = new Set(copies.map((copy) => path.basename(copy.file)));
  for (const name of readdirSync(CACHE)) if (!live.has(name)) unlinkSync(path.join(CACHE, name));

  return copies.map(({ variant, file }) => ({ params: { file: variant.name }, props: { file, type: TYPES[variant.format] } }));
}) satisfies GetStaticPaths;

type Props = InferGetStaticPropsType<typeof getStaticPaths>;

export const GET: APIRoute<Props> = ({ props }) =>
  new Response(new Uint8Array(readFileSync(props.file)), { headers: { "Content-Type": props.type } });
