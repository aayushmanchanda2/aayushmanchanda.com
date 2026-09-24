/**
 * /now (VET-57): what Aayush is building, testing and learning, and where.
 *
 * The copy is Aayush's, approved on 2026-09-24 (Draft A with his cuts). It
 * lives here once, as parts, so the page (`pages/now.astro`) and its markdown
 * twin (`pages/now.md.ts`) print the same words and cannot drift.
 *
 * To update the page: edit the lines, then bump `NOW_UPDATED`. That date is
 * the page's "Updated" line, its JSON-LD `dateModified`, its sitemap lastmod
 * and its postmark, so nothing else needs touching.
 *
 * Plain module, no imports, so `lib/now.test.mjs` can load it under node.
 */

/** The one date to bump when the page changes, `YYYY-MM-DD`. */
export const NOW_UPDATED = "2026-09-24";

/** A run of text, or a link inside a line. */
export type Part = string | { text: string; href: string };

export interface NowGroup {
  head: string;
  /** A list when there are several lines, a paragraph when there is one. */
  lines: Part[][];
  list: boolean;
}

export interface ToolCounts {
  total: number;
  using: number;
  watching: number;
}

/** "2026-09-24" -> "September 24, 2026", the words the page prints. */
export function nowDate(iso: string = NOW_UPDATED): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

/** Counted from the tools data at build, so the line never goes stale. */
export function toolCounts(tools: readonly { verdict: string }[]): ToolCounts {
  const count = (verdict: string) => tools.filter((tool) => tool.verdict === verdict).length;
  return { total: tools.length, using: count("using"), watching: count("watching") };
}

export function nowGroups({ total, using, watching }: ToolCounts): NowGroup[] {
  return [
    {
      head: "Building",
      list: true,
      lines: [
        ["The Vetted team. I’m hiring, so ", { text: "get in touch", href: "/contact" }, " if that’s you."],
        [
          "A rebuild of ",
          { text: "vetted.tools", href: "https://vetted.tools" },
          ", led by a library of AI use cases with the tool directory underneath.",
        ],
      ],
    },
    {
      head: "Testing",
      list: true,
      lines: [
        [
          "Agent tools, on my own companies first. ",
          { text: "/tools", href: "/tools" },
          ` has ${total} so far: ${using} in daily use, ${watching} saved to try.`,
        ],
        ["Design and review questions go to Claude Fable, Claude Opus and GPT-5.6 Sol at the same time, through pstack."],
        [
          { text: "AayushOS", href: "/experiments" },
          ", the markdown operating system my agents read and write, has run since March 1.",
        ],
      ],
    },
    {
      head: "Learning",
      list: true,
      lines: [
        ["Art direction with image models. I’m directing the art for vetted.tools and this site in ChatGPT’s image model."],
        ["Sales. Pete Kazanjy’s Founder-Led Sales 101 is queued."],
        [
          "Saved this week: poteto on ",
          { text: "shipping 2,500 PRs in a month", href: "/library/here-s-how-i-shipped-2-500-prs-last-month-to-production" },
          ".",
        ],
      ],
    },
    { head: "Where", list: false, lines: [["Winnipeg."]] },
  ];
}

/** The page's last line. */
export const NOW_ASK: Part[] = ["What should I test next? ", { text: "Tell me", href: "/contact" }, "."];

/** Every link on the page, for the test that holds each one to a real route. */
export function nowHrefs(groups: readonly NowGroup[]): string[] {
  return [...groups.flatMap((group) => group.lines.flat()), ...NOW_ASK].flatMap((part) =>
    typeof part === "string" ? [] : [part.href],
  );
}
