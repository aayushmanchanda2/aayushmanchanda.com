/**
 * The shared shape of the markdown variants under `src/pages/*.md.ts`.
 *
 * An agent that asks for `Accept: text/markdown` gets one of those documents
 * instead of the HTML page. Each is generated from the same parsed boundary
 * module its `.astro` page reads, so the two renderings of a section cannot
 * disagree about the data. Nothing is transcribed by hand.
 *
 * Only the parts that have to look identical across all five live here: the
 * opening block, the closing index, the table escaping. Five endpoints each
 * inventing their own would be five things to keep in step by hand, and the
 * first one to fall behind would be the one nobody reads with their own eyes.
 */

import { absolute } from "./site";

export interface MarkdownPage {
  /** The human page this variant mirrors. */
  html: string;
  /** Where the variant itself is served. */
  md: string;
  /** How this page is named in another document's footer. */
  name: string;
}

/**
 * Every markdown variant the site serves.
 *
 * Kept as one list because each document has to link to the other four. A sixth
 * variant is added here and nowhere else.
 */
export const PAGES: Record<
  "home" | "tools" | "sites" | "experiments" | "notes",
  MarkdownPage
> = {
  home: { html: "/", md: "/index.md", name: "Home" },
  tools: { html: "/tools", md: "/tools.md", name: "Tools" },
  sites: { html: "/sites", md: "/sites.md", name: "Sites" },
  experiments: {
    html: "/experiments",
    md: "/experiments.md",
    name: "Experiments",
  },
  notes: { html: "/notes", md: "/notes.md", name: "Notes" },
};

/* ---------------------------------------------------------------------------
   Inline pieces
   --------------------------------------------------------------------------- */

/**
 * A markdown link.
 *
 * URLs come from JSON that is checked for being http(s) and nothing else, so a
 * space or a bracket in one is a data question rather than an impossible one.
 * A space or an unbalanced paren would end the destination early, and markdown
 * has its own escape hatch for that, so use it when the URL needs it.
 */
export function link(text: string, url: string): string {
  const destination = /[ ()]/.test(url) ? `<${url}>` : url;
  return `[${text.replace(/([\[\]])/g, "\\$1")}](${destination})`;
}

/** The same, minus the link, for the entries that have nothing to point at. */
export function linkOrText(text: string, url: string | null): string {
  return url === null ? text : link(text, url);
}

/**
 * One table cell.
 *
 * A pipe would open a column and a newline would end the row, so both are
 * neutralised. Nothing else is touched: notes and one-liners are Aayush's own
 * words and pass through verbatim, em dashes and all.
 */
export function cell(value: string): string {
  return value
    .replace(/\s*\r?\n\s*/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

/* ---------------------------------------------------------------------------
   Blocks
   --------------------------------------------------------------------------- */

/** Rows are escaped here rather than at every call site, where one would be
 *  forgotten and quietly split a note across two columns. */
export function table(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const row = (values: readonly string[]): string =>
    `| ${values.map(cell).join(" | ")} |`;

  return [
    row(headers),
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map(row),
  ].join("\n");
}

export function list(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

/** Heading plus body, so an endpoint reads as a list of sections. */
export function section(heading: string, ...body: readonly string[]): string {
  return [`## ${heading}`, ...body].join("\n\n");
}

/* ---------------------------------------------------------------------------
   The document
   --------------------------------------------------------------------------- */

export interface DocumentSpec {
  page: MarkdownPage;
  /** The H1. */
  title: string;
  /** One line under it, for an agent deciding whether to read on. */
  description: string;
  /** Rendered in order, one blank line between each. */
  blocks: readonly string[];
}

/** The other four variants, then the two files that describe the whole site. */
function otherPages(current: MarkdownPage): string {
  const others = Object.values(PAGES)
    .filter((page) => page.md !== current.md)
    .map((page) => `${page.name}: ${absolute(page.md)}`);

  return section(
    "Other pages",
    list([
      ...others,
      `Site summary for agents: ${absolute("/llms.txt")}`,
      `Every URL the site publishes: ${absolute("/sitemap-index.xml")}`,
    ]),
  );
}

export function markdownDocument(spec: DocumentSpec): Response {
  const body =
    [
      `# ${spec.title}`,
      spec.description,
      // An agent that wants the rendered page, or wants to cite it, needs the
      // human URL, and a markdown file has no <link rel="canonical"> to put it in.
      `Source: ${absolute(spec.page.html)}`,
      ...spec.blocks,
      otherPages(spec.page),
    ].join("\n\n") + "\n";

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      // The static build writes these to disk, so the headers a client actually
      // sees come from vercel.json. Kept here so `astro dev` negotiates the
      // same way the deploy does.
      Vary: "Accept",
    },
  });
}
