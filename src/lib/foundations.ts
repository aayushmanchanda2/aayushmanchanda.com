/**
 * The data half of `SiteFoundations.astro`: which token groups a saved site's
 * design shows, in ui-skills' order, and how a type specimen names its family.
 */
import type { SiteDesign } from "./design-md";

/**
 * ui-skills' type cap: three styles, then "Show all N". Its ten-colour cap is
 * not ported: `summarize` names six colour roles at most, so it never binds.
 */
export const TYPE_CAP = 3;

/** Past this a specimen stops being a letter and starts being the page. */
export const SPECIMEN_MAX = "48px";

export const PROPERTIES = [["fontFamily", "Family"], ["fontSize", "Size"], ["fontWeight", "Weight"],
  ["lineHeight", "Line height"], ["letterSpacing", "Letter spacing"]] as const;

/**
 * The four groups in ui-skills' order. Colours, spacing and radius share one
 * row (a picture of the token, its name, its value); typography is its own.
 */
export const foundationGroups = (design: SiteDesign) => [
  {
    head: "Colors",
    cap: Infinity,
    visual: "swatch",
    rows: design.colors.map((c) => ({ name: c.name, value: c.hex, paint: `background-color: ${c.hex}` })),
  },
  { head: "Typography", cap: TYPE_CAP, rows: [] },
  { head: "Spacing", cap: Infinity, visual: "bar", rows: design.spacing.map((t) => ({ ...t, paint: `width: ${t.value}` })) },
  { head: "Radius", cap: Infinity, visual: "shape", rows: design.radius.map((t) => ({ ...t, paint: `border-radius: ${t.value}` })) },
]
  .map((group) => ({ ...group, id: `found-${group.head.toLowerCase()}`, count: group.head === "Typography" ? design.type.length : group.rows.length }))
  .filter((group) => group.count > 0);

/**
 * CSS generic and system family keywords. Quoted, each becomes a family name
 * no machine has, so they stay bare.
 */
const KEYWORDS = new Set(["-apple-system", "BlinkMacSystemFont", "system-ui", "ui-sans-serif", "ui-serif",
  "ui-monospace", "ui-rounded", "serif", "sans-serif", "monospace", "cursive", "fantasy"]);

/** The specimen's stack: the site's family, then the generic its role falls back to. */
export const specimenFamily = (family: string, role: string): string =>
  `${KEYWORDS.has(family) ? family : `'${family}'`}, ${role === "mono" ? "monospace" : "sans-serif"}`;

/** "Inter, Geist or Söhne": the families a specimen may fall back from. */
export function familiesOf(design: SiteDesign): string | undefined {
  const families = [...new Set(design.type.map((style) => style.fontFamily))];
  return families.length > 1 ? `${families.slice(0, -1).join(", ")} or ${families.at(-1)}` : families[0];
}
