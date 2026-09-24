/**
 * Smaller copies of the committed pictures under `/shots` (VET-309).
 *
 * A /sites card showed the top of a full-page capture: a 1440px-wide webp up to
 * 12,000px tall, 250 KB on average, to fill a box a phone draws 358px wide. So
 * every card, hover card and screen strip now points at a crop of the top at
 * the card's 8:5, in three widths and two formats, and the whole page stays on
 * the entry alone. A phone gets the full page at 780px wide (2x its column).
 *
 * The copies are cut at build by `pages/thumbs/[...file].ts` from the shot, so
 * a new save gets them with nothing added to the pipeline. Paths here, bytes
 * there.
 *
 * Images policy: design.md §8 "Images".
 */

/** The card's box (`ShotFrame.astro › .crop`). */
export const CROP_RATIO = 8 / 5;

/** Widest card is ~480 CSS px (two columns at 1023px), so 960 is its 2x. */
export const CROP_WIDTHS = [480, 720, 960] as const;

/** The whole page for a phone: 2x a 390px column. */
export const PHONE_WIDTH = 780;

/** A video poster (`<slug>-thumb.webp`, 1280x720) for a tile. */
export const POSTER_WIDTH = 640;

export type Variant = { name: string; kind: "crop" | "resize"; width: number; format: "webp" | "avif" };

/** `/shots/foo.webp` → `foo`. */
const stem = (shot: string) => shot.replace(/^\/shots\//, "").replace(/\.webp$/, "");

/** Every copy one committed picture gets. A video poster is resized, a site shot is cropped. */
export function variantsOf(file: string): Variant[] {
  const name = stem(file);
  if (name.endsWith("-thumb")) return [{ name: `${name}-${POSTER_WIDTH}.webp`, kind: "resize", width: POSTER_WIDTH, format: "webp" }];
  return [
    ...CROP_WIDTHS.flatMap((width) =>
      (["avif", "webp"] as const).map((format) => ({ name: `${name}-${width}.${format}`, kind: "crop" as const, width, format })),
    ),
    { name: `${name}-full-${PHONE_WIDTH}.webp`, kind: "resize", width: PHONE_WIDTH, format: "webp" },
  ];
}

const crop = (shot: string, width: number, format: string) => `/thumbs/${stem(shot)}-${width}.${format}`;
const srcset = (shot: string, format: string) => CROP_WIDTHS.map((w) => `${crop(shot, w, format)} ${w}w`).join(", ");

/** The top of a shot at 8:5: `<picture>` sources plus the `<img>` fallback, sized to the largest crop. */
export function cropOf(shot: string) {
  const width = CROP_WIDTHS[CROP_WIDTHS.length - 1];
  return {
    avif: srcset(shot, "avif"),
    webp: srcset(shot, "webp"),
    src: crop(shot, width, "webp"),
    width,
    height: Math.round(width / CROP_RATIO),
  };
}

/** One 960px crop, for the hover card (400 CSS px wide). */
export const previewOf = (shot: string) => crop(shot, 960, "webp");

/** The whole page at a phone's width. */
export const phoneOf = (shot: string) => `/thumbs/${stem(shot)}-full-${PHONE_WIDTH}.webp`;

/** A video poster's `srcset` at its own `width`: the tile copy and the original, or none for a poster no wider than the copy. */
export const posterSrcset = (thumb: string, width: number) =>
  width > POSTER_WIDTH ? `/thumbs/${stem(thumb)}-${POSTER_WIDTH}.webp ${POSTER_WIDTH}w, ${thumb} ${width}w` : undefined;
