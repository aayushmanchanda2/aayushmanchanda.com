/**
 * The /tools copy caps (voice.md, design.md "Caps"): a description is a fragment
 * of at most 7 words that says what the tool is; a note is his verdict in at
 * most 20. Each check returns the problem, or null, so `tools.ts` can fail the
 * build with it and a test can call it without reading the data file.
 */

const words = (value: string): number => value.trim().split(/\s+/).length;

export const DESCRIPTION_WORDS = 7;
export const NOTE_WORDS = 20;

export function descriptionProblem(value: string): string | null {
  if (words(value) > DESCRIPTION_WORDS) return `has a "description" over ${DESCRIPTION_WORDS} words`;
  if (value.trimEnd().endsWith(".")) return `has a "description" ending in a period; it is a fragment`;
  if (/^an? /i.test(value)) return `has a "description" opening with "A" or "An"; start with the noun`;
  if (value.includes("—")) return `has an em dash in "description"`;
  return null;
}

export function noteProblem(value: string): string | null {
  if (words(value) > NOTE_WORDS) return `has a "note" over ${NOTE_WORDS} words`;
  if (value.includes("—")) return `has an em dash in "note"`;
  return null;
}
