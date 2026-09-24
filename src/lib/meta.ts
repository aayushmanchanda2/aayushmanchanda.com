/**
 * `<title>` and meta description lengths (VET-281). Search results cut a title
 * near 60 characters and a description near 160, so what is cut should be
 * chosen here rather than by the result page.
 */

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 160;

/**
 * "Name · Section · Aayush Manchanda", shortened by dropping the section, then
 * the site name, until it fits. A name longer than the cap on its own stays
 * whole: cutting the words someone would search for is worse than a result
 * page's ellipsis.
 */
export function fitTitle(title: string): string {
  const parts = title.split(" · ");
  while (parts.length > 1 && parts.join(" · ").length > TITLE_MAX) parts.splice(parts.length > 2 ? -2 : -1, 1);
  return parts.join(" · ");
}

/** Cut at the last word that fits, with an ellipsis. */
export function fitDescription(text: string): string {
  if (text.length <= DESCRIPTION_MAX) return text;
  const cut = text.slice(0, DESCRIPTION_MAX - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,;:.–-]+$/, "")}…`;
}

/**
 * A filter page's one sentence ("3 links I saved from vercel.com.") plus the
 * names it lists, as many as fit, so each result says what is on the page.
 */
export function withNames(sentence: string, names: string[]): string {
  const stem = sentence.replace(/\.$/, "");
  let best = `${stem}.`;
  for (let n = 1; n <= names.length; n += 1) {
    const shown = names.slice(0, n);
    const more = names.length - n;
    const list = more > 0 ? `${shown.join(", ")} and ${more} more` : shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}` : shown[0];
    const next = `${stem}: ${list}.`;
    if (next.length > DESCRIPTION_MAX) break;
    best = next;
  }
  return best;
}
