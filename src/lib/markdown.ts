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

// Extension spelled out, like `links.ts` and `schema.ts` do for this same
// import: the bundler resolves either form, but a test running under plain node
// resolves only this one. A module nothing can import outside a build is a
// module with no unit tests, which is how the label list below drifted.
import { absolute } from "./site.ts";

// Type only, erased at build, so this file stays importable under bare node.
// The shape itself is owned by the library boundary; a second copy here would
// be the drift `VOICE_FIELDS` exists to prevent.
import type { Digest } from "./library.ts";

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
 * Kept as one list because each document has to link to all the others, and
 * because four other surfaces need to know which pages have a variant: the
 * section manifest, the `rel=alternate` link in the layout, the sitemap's
 * custom pages, and `/llms.txt`. All four read it from here through
 * `markdownVariantFor`. A seventh variant is added here and nowhere else.
 */
export const PAGES: Record<
  "home" | "tools" | "sites" | "library" | "experiments" | "notes",
  MarkdownPage
> = {
  home: { html: "/", md: "/index.md", name: "Home" },
  tools: { html: "/tools", md: "/tools.md", name: "Tools" },
  sites: { html: "/sites", md: "/sites.md", name: "Sites" },
  library: { html: "/library", md: "/library.md", name: "Library" },
  experiments: {
    html: "/experiments",
    md: "/experiments.md",
    name: "Experiments",
  },
  notes: { html: "/notes", md: "/notes.md", name: "Notes" },
};

/**
 * The markdown variant for an HTML path, or null when that page has none.
 *
 * Three of the surfaces above used to answer this by appending `.md` to the
 * path and hoping. That guess reads as a fact, and it would point an agent at a
 * 404 the first time a page shipped without a variant — which is precisely the
 * case the guess cannot see.
 */
export function markdownVariantFor(html: string): string | null {
  const page = Object.values(PAGES).find((variant) => variant.html === html);
  return page === undefined ? null : page.md;
}

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
   The voice fields
   --------------------------------------------------------------------------- */

/**
 * The optional sentences a /tools or /sites entry can carry.
 *
 * Every field optional, because the two sections carry different subsets — a
 * gallery entry has no `why` and nothing to `try` — and a section that does not
 * have a field should not have to pass null to say so.
 */
export interface Voice {
  like?: string | null;
  dislike?: string | null;
  why?: string | null;
  try?: string | null;
}

/** One voice field: what it is called, and whether its value is machine text. */
export interface VoiceField {
  key: keyof Voice;
  /** Title case. `.mono` does the shouting in CSS; markdown prints it as-is. */
  label: string;
  /**
   * The value is a command to paste or a bare URL, not prose. The HTML sets it
   * in mono (`VoiceBlocks.astro › .voice__body--code`) and the markdown fences
   * it in backticks, so an agent can tell it from the prose around it. Two
   * renderings of one fact about the field, which is why the fact lives here
   * rather than as a `key === "try"` test in each of them.
   */
  code?: boolean;
}

/**
 * Labels and order, for both renderings of an entry's voice.
 *
 * A markdown variant and its page are two renderings of one thing, so the first
 * one to disagree about what a field is called is the one nobody reads with
 * their own eyes. This comment used to say "matching
 * `components/VoiceBlocks.astro` exactly" while the component held a second
 * copy of the list — which is a comment asking two files to stay in step, not a
 * mechanism. They did not stay in step: the label here read `What I don't` with
 * a typewriter apostrophe and the component rendered `What I don’t` with a real
 * one, so every /tools entry with a dislike shipped a page and a markdown twin
 * that disagreed.
 *
 * So the component imports this. The order is fixed here rather than at either
 * call site: why (when to reach for it) orients, like and dislike are the
 * judgement, and try is the way out into actually using the thing, so it is
 * last. `lib/voice.test.mjs` holds the component to it.
 */
export const VOICE_FIELDS: readonly VoiceField[] = [
  { key: "why", label: "Why" },
  { key: "like", label: "What I like" },
  { key: "dislike", label: "What I don’t" },
  { key: "try", label: "Try", code: true },
];

/** One entry's voice fields as a `###` block, or null when it has none. */
function voiceEntry(name: string, voice: Voice): string | null {
  const lines = VOICE_FIELDS.flatMap(({ key, label, code }) => {
    const value = voice[key];
    if (value === undefined || value === null) return [];
    return [`${label}: ${code ? `\`${value}\`` : value}`];
  });

  return lines.length === 0 ? null : [`### ${name}`, list(lines)].join("\n\n");
}

/**
 * Every entry that has something in it, as one section — or null when none do.
 *
 * Null rather than an empty section, for the same reason the HTML component
 * renders nothing rather than an empty labelled box: a heading over nothing
 * reads as a document that broke, not as a section he has not filled in.
 */
export function voiceSection(
  entries: readonly { name: string; voice: Voice }[],
): string | null {
  const blocks = entries.flatMap((entry) => {
    const block = voiceEntry(entry.name, entry.voice);
    return block === null ? [] : [block];
  });

  if (blocks.length === 0) return null;

  return [
    section(
      "In my words",
      "Some entries carry more than the one-line note. Most do not, and an entry missing from this list simply means I have not written it up, not that I had nothing good to say.",
    ),
    ...blocks,
  ].join("\n\n");
}

/* ---------------------------------------------------------------------------
   The digest fields
   --------------------------------------------------------------------------- */

/**
 * The three labels a digest renders under, for both renderings of one.
 *
 * `components/DigestBlocks.astro` draws them as mono labels on a
 * `/library/<slug>` page and `digestSection` below prints them into
 * `/library.md`, and the two must not drift for the same reason `VOICE_FIELDS`
 * exists: the first spelling to disagree is the one nobody reads with their own
 * eyes. `lib/digest.test.mjs` holds the component to this list.
 *
 * "Read it?" is the reader's own question, which is what the field answers —
 * the same register as "What I don’t" on a tool page, a person talking rather
 * than a schema naming columns.
 */
export const DIGEST_LABELS = {
  bullets: "Cliff notes",
  verdict: "Read it?",
  why: "Why",
} as const;

/**
 * The digested entries as one markdown section, or null when there are none.
 *
 * Null rather than an empty heading, same rule as `voiceSection`: a section
 * over nothing reads as a document that broke. Each block still ends with the
 * entry's own page even though every entry has one now: this section is where
 * an agent that only wants the read ones is looking, and making it walk back
 * up to the table for the URL would be a worse document for the sake of a
 * removed line.
 */
export function digestSection(
  entries: readonly { title: string; slug: string; digest: Digest }[],
): string | null {
  if (entries.length === 0) return null;

  const blocks = entries.map((entry) =>
    [
      `### ${entry.title}`,
      `${DIGEST_LABELS.bullets}:`,
      list(entry.digest.bullets),
      list([
        `${DIGEST_LABELS.verdict}: ${entry.digest.verdict}`,
        `${DIGEST_LABELS.why}: ${entry.digest.why}`,
        `Digested: ${entry.digest.digested}`,
        `Page: ${absolute(`/library/${entry.slug}`)}`,
      ]),
    ].join("\n\n"),
  );

  return [
    section(
      "Digests",
      "These entries have been read properly, not just saved. Each carries cliff notes and a call on whether it is worth your time.",
    ),
    ...blocks,
  ].join("\n\n");
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
  /**
   * Newest content date on the page, `YYYY-MM-DD`.
   *
   * The real date from the data, not the build date: a rebuild triggered by a
   * CSS change should not tell an agent the content is fresh. Omitted where a
   * page genuinely has no dated content.
   */
  updated?: string;
  /**
   * HTTP status. Defaults to 200.
   *
   * Only the markdown 404 sets it. That document is the same document as every
   * other one — frontmatter, a canonical URL, the index of the other pages —
   * and the only thing dead about it is the status line, so that is the only
   * thing it gets to override.
   */
  status?: number;
  /** Rendered in order, one blank line between each. */
  blocks: readonly string[];
}

/**
 * YAML frontmatter, so an agent gets the document's metadata without scraping
 * the body for it. A markdown file has no `<head>`, so `canonical` is the only
 * way it can say which URL it speaks for.
 *
 * Values are quoted because a title or description containing a colon would
 * otherwise parse as a nested key.
 */
function frontmatter(spec: DocumentSpec): string {
  const quote = (value: string) => `"${value.replace(/"/g, '\\"')}"`;

  const fields: [string, string][] = [
    ["title", quote(spec.title)],
    ["description", quote(spec.description)],
    ["canonical", quote(absolute(spec.page.html))],
    ["source", quote(absolute(spec.page.md))],
  ];
  if (spec.updated) fields.push(["last-updated", spec.updated]);

  return ["---", ...fields.map(([k, v]) => `${k}: ${v}`), "---"].join("\n");
}

/** Newest `YYYY-MM-DD` in a list, or undefined when the list is empty. */
export function newest(dates: readonly string[]): string | undefined {
  return dates.length === 0 ? undefined : [...dates].sort().at(-1);
}

/** Every other variant, then the two files that describe the whole site. */
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
      frontmatter(spec),
      `# ${spec.title}`,
      spec.description,
      // An agent that wants the rendered page, or wants to cite it, needs the
      // human URL, and a markdown file has no <link rel="canonical"> to put it in.
      `Source: ${absolute(spec.page.html)}`,
      ...spec.blocks,
      otherPages(spec.page),
    ].join("\n\n") + "\n";

  return new Response(body, {
    status: spec.status ?? 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      // The static build writes these to disk, so the headers a client actually
      // sees come from vercel.json. Kept here so `astro dev` negotiates the
      // same way the deploy does.
      Vary: "Accept",
    },
  });
}
