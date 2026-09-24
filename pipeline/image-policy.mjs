/**
 * image-policy.mjs — how wide and how compressed every picture this site
 * commits is (design.md §8 "Images", VET-309b). One table, read by everything
 * that writes into `public/`: the capture (`capture.mjs`), a post's pictures
 * and avatar (`post.mjs`), a video poster (`thumb.mjs`), an icon (`icon.mjs`),
 * and the sweep that brought the files already committed into line
 * (`scripts/image-sweep.mjs`).
 *
 * Each width is 2x the widest box the file fills, measured on the built site
 * at 390 to 1920px (`scripts/image-widths.mjs` → `src/data/image-widths.json`):
 * a full-page shot shows at most 654px wide (the entry column), a post's
 * picture 564px, a video poster 598px, an avatar 40px, an icon 60px (the
 * /tools grid).
 *
 * WebP at 75 for screenshots and photos: indistinguishable from the 82 it
 * replaced on text at 100% (`qa/evidence/2026-09-24-vet-309b/spot-*.png`) and
 * 46% smaller on the six largest shots. Icons stay at 90: a logo is flat
 * colour and hard edges, where WebP's artefacts show first.
 */

/** A full-page shot: the 654px entry column at 2x, rounded to a round number under it. */
export const SHOT_WIDTH = 1280;

/** A post's photo, poster or article cover: its 564px widest box at 2x. */
export const POST_PICTURE_WIDTH = 1120;

/** A video's poster frame: the 598px player on its entry at 2x, rounded down. */
export const POSTER_WIDTH = 1120;

/** A post's avatar: 40px at 2x. */
export const AVATAR_WIDTH = 80;

/** An app icon, stored square: the 60px /tools grid mark at 2x. */
export const ICON_SIZE = 120;

/** Screenshots and photos. */
export const WEBP = { quality: 75, effort: 6 };

/** Icons: flat colour and edges. */
export const ICON_WEBP = { quality: 90, effort: 6 };
