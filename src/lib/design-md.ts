/**
 * A saved site's design tokens: the shape, the check, and the DESIGN.md.
 *
 * `pipeline/design.mjs` writes `design` onto a /sites entry by reading the live
 * page's computed styles. This file is the other end of that: `parseDesign`
 * holds the JSON to the shape the panel renders, and `toDesignMd` turns it back
 * into ui-skills' DESIGN.md format (frontmatter keys as in its
 * `content/design-md/firecrawl.md`) for the "Copy as DESIGN.md" button.
 *
 * Unlike the rest of `lib/sites.ts`, a bad value here never fails the build.
 * The tokens are a measurement of somebody else's page, so one odd reading
 * costs that token and nothing more; a design with nothing left is no design.
 *
 * Every value that survives is safe to put in a `style` attribute: hex is
 * `#rrggbb`, lengths are px or `normal`, weights are three digits, and a font
 * family is letters, digits, spaces, dots and hyphens.
 */

export interface ColorToken {
  name: string;
  hex: string;
}

export interface TypeToken {
  name: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
}

export interface ValueToken {
  name: string;
  value: string;
}

export interface SiteDesign {
  /** ISO date the page was read, which is not always the date it was saved. */
  read_date: string;
  colors: ColorToken[];
  type: TypeToken[];
  spacing: ValueToken[];
  radius: ValueToken[];
}

/** ui-skills' token-name rule (`create-design-md/SKILL.md`). */
const TOKEN = /^[a-zA-Z0-9][a-zA-Z0-9-]*$/;
const HEX = /^#[0-9a-f]{6}$/;
const PX = /^\d+(?:\.\d+)?px$/;
const METRIC = /^(?:normal|-?\d+(?:\.\d+)?px)$/;
const WEIGHT = /^\d{3}$/;
const FAMILY = /^[\p{L}\p{N} ._-]+$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Shape = Record<string, RegExp>;

const SHAPES = {
  colors: { name: TOKEN, hex: HEX },
  type: {
    name: TOKEN,
    fontFamily: FAMILY,
    fontSize: PX,
    fontWeight: WEIGHT,
    lineHeight: METRIC,
    letterSpacing: METRIC,
  },
  spacing: { name: TOKEN, value: PX },
  radius: { name: TOKEN, value: PX },
} satisfies Record<string, Shape>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The items of `value` that match `shape` field for field, copied to exactly those fields. */
function keep<T>(value: unknown, shape: Shape): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): T[] => {
    if (!isRecord(item)) return [];
    const out: Record<string, string> = {};
    for (const [key, test] of Object.entries(shape)) {
      const field = item[key];
      if (typeof field !== "string" || !test.test(field)) return [];
      out[key] = field;
    }
    return [out as T];
  });
}

/** The tokens `value` holds that pass, or undefined when none do. */
export function parseDesign(value: unknown): SiteDesign | undefined {
  if (!isRecord(value)) return undefined;
  const date = value["read_date"];
  if (typeof date !== "string" || !DATE.test(date)) return undefined;

  const design: SiteDesign = {
    read_date: date,
    colors: keep<ColorToken>(value["colors"], SHAPES.colors),
    type: keep<TypeToken>(value["type"], SHAPES.type),
    spacing: keep<ValueToken>(value["spacing"], SHAPES.spacing),
    radius: keep<ValueToken>(value["radius"], SHAPES.radius),
  };
  const count = design.colors.length + design.type.length + design.spacing.length + design.radius.length;
  return count === 0 ? undefined : design;
}

/**
 * A YAML scalar: bare when it is plainly a word or a length (`-0.5px` too, as
 * firecrawl.md writes it). Anything else, `-apple-system` included, is quoted
 * rather than trusted to a parser's plain-scalar rules.
 */
function yaml(value: string): string {
  return /^(?:[A-Za-z0-9]|-\d)[\w .-]*$/.test(value) ? value : JSON.stringify(value);
}

/**
 * The tokens as a ui-skills DESIGN.md, ready to paste into an agent: canonical
 * frontmatter (`colors`, `typography`, `spacing`, `rounded`), then one factual
 * Overview line and a section per category that has tokens, in the SKILL.md
 * order. `normal` metrics are left out, as ui-skills' own files do.
 */
export function toDesignMd(
  design: SiteDesign,
  site: { title: string; domain: string },
): string {
  const { colors, type, spacing, radius } = design;
  const metrics = (t: TypeToken) =>
    (["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing"] as const).filter(
      (key) => t[key] !== "normal",
    );

  const front = [
    "---",
    "version: alpha",
    `name: ${yaml(site.title)}`,
    `description: ${yaml(`Tokens read from the computed styles of ${site.domain}.`)}`,
  ];
  if (colors.length > 0) {
    front.push("colors:", ...colors.map((c) => `  ${c.name}: "${c.hex}"`));
  }
  if (type.length > 0) {
    front.push("typography:");
    for (const t of type) {
      front.push(`  ${t.name}:`, ...metrics(t).map((key) => `    ${key}: ${yaml(t[key])}`));
    }
  }
  if (spacing.length > 0) front.push("spacing:", ...spacing.map((s) => `  ${yaml(s.name)}: ${s.value}`));
  if (radius.length > 0) front.push("rounded:", ...radius.map((r) => `  ${r.name}: ${r.value}`));
  front.push("---");

  const body = [
    `# ${site.title}`,
    "",
    "## Overview",
    "",
    `Tokens read from ${site.domain} on ${design.read_date}.`,
  ];
  const section = (title: string, lines: string[]) => {
    if (lines.length > 0) body.push("", `## ${title}`, "", ...lines);
  };
  section("Colors", colors.map((c) => `- \`${c.name}\`: \`${c.hex}\``));
  section(
    "Typography",
    type.map((t) => `- \`${t.name}\`: ${metrics(t).map((key) => t[key]).join(", ")}`),
  );
  section("Layout", spacing.map((s) => `- \`spacing.${s.name}\`: ${s.value}`));
  section("Shapes", radius.map((r) => `- \`rounded.${r.name}\`: ${r.value}`));

  return `${[...front, "", ...body].join("\n")}\n`;
}
