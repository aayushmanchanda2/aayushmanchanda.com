/**
 * hues.ts — which colour families a site is, read off its stored palette
 * (VET-55). /sites filters by them (`HueFilter.astro`, `?hue=blue`).
 *
 * Build time only, and never from pixels: `pipeline/palette.mjs` already wrote
 * six swatches per capture, dominant first, and this folds those into named
 * families. No imports and no DOM, so `hues.test.mjs` runs it under node.
 *
 * **OKLCH, not HSL.** HSL calls `#e9e2cf` (a cream) 38% saturated and a pure
 * grey page 0%, with nothing useful in between; OKLCH chroma is roughly how
 * coloured a swatch looks, which is the question a reader is asking.
 *
 * **Neutrals are left out of hue matching, and `mono` is the site with no hue
 * left.** Every capture carries a white or a black and a few greys (it is the
 * page background), so a family keyed on "has a neutral" would hold all of
 * them and filter nothing. Keyed on "has no colour", it answers "show me the
 * black-and-white sites", and it means every site lands in at least one family
 * by construction (`hues.test.mjs` holds that against the gallery).
 *
 * **Prominence weights the vote.** The palette stores order, not shares, so a
 * swatch at rank i counts `1 - i/6`: a vivid accent at the tail still makes it
 * (0.2 chroma × 1/6 clears the bar), a faint tint at the tail does not.
 */

export const HUE_FAMILIES = [
  "red",
  "orange",
  "brown",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
  "mono",
] as const;

export type HueFamily = (typeof HUE_FAMILIES)[number];

/** Below this OKLCH chroma a swatch is a neutral: white, black, a grey, a cream. */
export const NEUTRAL_CHROMA = 0.03;

/** A family's weighted chroma has to reach this for the site to join it. */
export const FAMILY_SCORE = 0.02;

/** The palette's cap (`lib/sites.ts › MAX_PALETTE`): rank 0 weighs 1, rank 5 weighs 1/6. */
const RANKS = 6;

/** Darker than this, an orange or a yellow reads as brown. */
const BROWN_LIGHTNESS = 0.6;

/** sRGB `#rrggbb` to OKLCH (Ottosson's matrices): lightness 0..1, chroma, hue in degrees. */
export function oklch(hex: string): { l: number; c: number; h: number } {
  const lin = (at: number) => {
    const v = parseInt(hex.slice(at, at + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin(1), lin(3), lin(5)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

/**
 * The family one swatch names, or null for a neutral. Hue bands are OKLCH
 * degrees, cut where a reader's word changes; brown is the dark end of the
 * orange-to-yellow band rather than a hue of its own.
 */
export function swatchFamily(hex: string): HueFamily | null {
  const { l, c, h } = oklch(hex);
  if (c < NEUTRAL_CHROMA) return null;
  if (h >= 30 && h < 115 && l < BROWN_LIGHTNESS) return "brown";
  if (h < 15 || h >= 340) return "pink";
  if (h < 30) return "red";
  if (h < 70) return "orange";
  if (h < 115) return "yellow";
  if (h < 170) return "green";
  if (h < 215) return "teal";
  if (h < 275) return "blue";
  return "purple";
}

/**
 * Every family a palette (dominant first) belongs to, in `HUE_FAMILIES` order;
 * `["mono"]` when no hue clears the bar. Never empty.
 */
export function paletteFamilies(palette: readonly string[]): HueFamily[] {
  const score = new Map<HueFamily, number>();
  palette.forEach((hex, rank) => {
    const family = swatchFamily(hex);
    if (!family) return;
    const weight = Math.max(0, 1 - rank / RANKS);
    score.set(family, (score.get(family) ?? 0) + oklch(hex).c * weight);
  });
  const found = HUE_FAMILIES.filter((family) => (score.get(family) ?? 0) >= FAMILY_SCORE);
  return found.length ? found : ["mono"];
}

/** Each family present in `palettes`, in wheel order, with how many hold it. Absent families are left out. */
export function familyCounts(palettes: readonly (readonly string[])[]): { family: HueFamily; count: number }[] {
  const each = palettes.map(paletteFamilies);
  return HUE_FAMILIES.map((family) => ({ family, count: each.filter((f) => f.includes(family)).length })).filter(
    ({ count }) => count > 0,
  );
}

/** The `?hue=` a query string asks for; a family not on the page (a stale link, a typo) reads as All (""). */
export function readHue(search: string, present: readonly string[]): string {
  const hue = new URLSearchParams(search).get("hue") ?? "";
  return present.includes(hue) ? hue : "";
}

/** `search` with `hue` set, or removed for "". Every other parameter is kept. */
export function withHue(search: string, hue: string): string {
  const params = new URLSearchParams(search);
  if (hue) params.set("hue", hue);
  else params.delete("hue");
  const query = params.toString();
  return query ? `?${query}` : "";
}
