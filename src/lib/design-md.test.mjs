/**
 * The /sites design tokens, under test.
 *
 * **One bad token costs that token.** `parseDesign` drops what does not match
 * and keeps the rest, and it never throws, because a measurement of somebody
 * else's page is not a reason to fail the build.
 *
 * **What survives is safe in a `style` attribute.** A font family carrying a
 * `;` would be a second declaration, so it is dropped rather than escaped.
 *
 * **The DESIGN.md is ui-skills' format**: frontmatter keys as in its
 * `firecrawl.md`, `normal` metrics left out, sections only for what exists.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { parseDesign, toDesignMd } from "./design-md.ts";

const GOOD = {
  read_date: "2026-09-22",
  colors: [
    { name: "background", hex: "#fbfbfb" },
    { name: "accent", hex: "#0D99FF" },
    { name: "text", hex: "#000000" },
  ],
  type: [
    {
      name: "display",
      fontFamily: "Public Sans",
      fontSize: "15px",
      fontWeight: "500",
      lineHeight: "22.5px",
      letterSpacing: "normal",
    },
    {
      name: "body",
      fontFamily: "x; background: url(//evil)",
      fontSize: "15px",
      fontWeight: "500",
      lineHeight: "normal",
      letterSpacing: "normal",
    },
    {
      name: "label",
      fontFamily: "-apple-system",
      fontSize: "13px",
      fontWeight: "600",
      lineHeight: "18.2px",
      letterSpacing: "-0.5px",
    },
  ],
  spacing: [
    { name: "1", value: "4px" },
    { name: "10px", value: "10px" },
    { name: "2.5", value: "10px" },
  ],
  radius: [{ name: "full", value: "9999px" }, "4px"],
};

test("parseDesign keeps good tokens and drops malformed ones without throwing", () => {
  const design = parseDesign(GOOD);
  assert.deepEqual(
    design?.colors.map((c) => c.name),
    ["background", "text"],
    "uppercase hex is not the pipeline's shape",
  );
  assert.deepEqual(
    design?.type.map((t) => t.name),
    ["display", "label"],
    "a family that could close the declaration is dropped",
  );
  assert.deepEqual(
    design?.spacing.map((s) => s.name),
    ["1", "10px"],
    "2.5 is not a valid token name",
  );
  assert.deepEqual(design?.radius, [{ name: "full", value: "9999px" }]);
});

test("parseDesign returns undefined for nothing, junk, or an undated reading", () => {
  assert.equal(parseDesign(undefined), undefined);
  assert.equal(parseDesign("tokens"), undefined);
  assert.equal(parseDesign({ ...GOOD, read_date: "yesterday" }), undefined);
  assert.equal(
    parseDesign({ read_date: "2026-09-22", colors: [{ name: "x y", hex: "#000000" }] }),
    undefined,
  );
});

test("toDesignMd writes ui-skills frontmatter and one section per category", () => {
  const design = parseDesign(GOOD);
  assert.ok(design);
  const md = toDesignMd(design, { title: "Shawn: portfolio", domain: "www.shwn.design" });

  assert.equal(
    md,
    [
      "---",
      "version: alpha",
      'name: "Shawn: portfolio"',
      "description: Tokens read from the computed styles of www.shwn.design.",
      "colors:",
      '  background: "#fbfbfb"',
      '  text: "#000000"',
      "typography:",
      "  display:",
      "    fontFamily: Public Sans",
      "    fontSize: 15px",
      "    fontWeight: 500",
      "    lineHeight: 22.5px",
      "  label:",
      '    fontFamily: "-apple-system"',
      "    fontSize: 13px",
      "    fontWeight: 600",
      "    lineHeight: 18.2px",
      "    letterSpacing: -0.5px",
      "spacing:",
      "  1: 4px",
      "  10px: 10px",
      "rounded:",
      "  full: 9999px",
      "---",
      "",
      "# Shawn: portfolio",
      "",
      "## Overview",
      "",
      "Tokens read from www.shwn.design on 2026-09-22.",
      "",
      "## Colors",
      "",
      "- `background`: `#fbfbfb`",
      "- `text`: `#000000`",
      "",
      "## Typography",
      "",
      "- `display`: Public Sans, 15px, 500, 22.5px",
      "- `label`: -apple-system, 13px, 600, 18.2px, -0.5px",
      "",
      "## Layout",
      "",
      "- `spacing.1`: 4px",
      "- `spacing.10px`: 10px",
      "",
      "## Shapes",
      "",
      "- `rounded.full`: 9999px",
      "",
    ].join("\n"),
  );
});

test("a category with no tokens writes neither a key nor a section", () => {
  const md = toDesignMd(
    { read_date: "2026-09-22", colors: [{ name: "text", hex: "#111111" }], type: [], spacing: [], radius: [] },
    { title: "Tiny", domain: "tiny.example" },
  );
  assert.doesNotMatch(md, /typography:|spacing:|rounded:|## Typography|## Layout|## Shapes/);
});
