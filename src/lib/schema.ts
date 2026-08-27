/**
 * The structured-data boundary: every JSON-LD node the site emits is built
 * here, and nowhere else.
 *
 * The point of the section is not rich results. It is that the opinions on this
 * site — a dated verdict on a tool, a note, a saved link — should be resolvable
 * as *statements by a named person about a named thing*, so a search index or
 * an answer engine can cite them as a source instead of paraphrasing an
 * anonymous page. That is the whole design brief, and it is what decides every
 * argument below.
 *
 * ---------------------------------------------------------------------------
 * THE PARITY RULE. Every property emitted here maps to something a reader can
 * see on that page. No exceptions, and the interesting cases are the ones we
 * left out rather than the ones we kept:
 *
 *   - **No rating, of any kind.** Not `reviewRating`, not `aggregateRating`.
 *     A verdict on this site is a sentence someone can disagree with, and
 *     there is no number on the page to carry into a `ratingValue`. Inventing
 *     one would buy a star rating in a search result with a fact that does not
 *     exist. The cost is knowingly paid: Google's Review rich result *requires*
 *     `reviewRating`, so these reviews will not draw stars. They are still
 *     valid schema.org, still parse, and still say who reviewed what and when,
 *     which is the part a citation needs.
 *   - **No `SearchAction` on the site node.** The command palette is a
 *     client-side filter, not a query endpoint. Advertising a search URL that
 *     404s is a lie a crawler would find out about.
 *   - **No `keywords`.** Nothing on this site is a keyword list.
 *   - **The tool's own opinion never leaks onto the software.** A
 *     `SoftwareApplication` here carries only what is true of the software:
 *     name, url, the category it is filed under. Every judgement lives in the
 *     `Review` node, attributed to a person, with the date it was last true.
 *     Putting his note in `SoftwareApplication.description` would quietly
 *     restate one man's take as the product's own description.
 *
 * ---------------------------------------------------------------------------
 * EVERY DOCUMENT IS AN `@graph`, even a one-node one. A page usually has more
 * than one entity on it and they have to point at each other — a review at its
 * author, a page at its screenshot — which is what `@id` is for. Keeping the
 * envelope identical whether there is one node or four means the validator, the
 * tests, and anything reading the built HTML walk one shape.
 *
 * DANGLING REFERENCES ARE NOT ALLOWED. A `{"@id": ...}` reference is only worth
 * emitting if the node it names is in the same graph, because a parser reading
 * one page cannot follow a reference to a node that only exists on another one.
 * So the `Person` is repeated on every page that attributes something to him,
 * and it is *not* emitted on pages that do not — see `person()` for the
 * full-vs-compact split, which is itself a parity decision.
 *
 * This module is deliberately free of Astro imports and of the data modules'
 * runtime values (types only, erased at build), so `schema.test.mjs` can call
 * every builder with plain objects under bare `node --test`.
 */

import type { DigestedEntry, Kind, LibraryEntry } from "./library";
import type { Site } from "./sites";
import type { Tool } from "./tools";
/*
 * The one relative *runtime* import in this file, and the one place on the site
 * written with its extension.
 *
 * Every other module here says `from "./site"`, which Vite resolves and Node
 * does not. That has never mattered because the three modules the test suite
 * loads directly — `parse`, `search`, `theme` — import nothing relative at all.
 * This one has to: the origin lives in `site.ts` and copying it here would be
 * the second copy the DNS-cutover note in that file exists to prevent. So the
 * extension goes in, `node --test` can resolve it, and the type-only imports
 * above stay bare because they are erased before either tool sees them.
 */
import { absolute } from "./site.ts";

/** One node in the graph. */
export type JsonLdNode = Record<string, unknown>;

/** A complete `ld+json` document, as handed to `Base.astro`'s `jsonLd` prop. */
export interface JsonLd {
  "@context": "https://schema.org";
  "@graph": JsonLdNode[];
}

/** A thing with a name and somewhere to go. The unit every list is built from. */
export interface ListEntry {
  name: string;
  /** Absolute. Internal entries go through `pageUrl`; external ones are as-saved. */
  url: string;
}

/** A step in a visible crumb trail. */
export interface Crumb {
  name: string;
  /** Site-relative path; run through `pageUrl` on the way in. */
  path: string;
}

/**
 * The stable identity of the person this site is about.
 *
 * A fragment on the home page rather than a bare URL, so the `Person` and the
 * home `WebSite` are two resolvable things rather than one URL claiming to be
 * both a document and a human.
 */
export const PERSON_ID = `${absolute("/")}#person`;

/** The site as a work, distinct from the home page as a document. */
export const WEBSITE_ID = `${absolute("/")}#website`;

const NAME = "Aayush Manchanda";

/**
 * The two profiles that are a claim of identity, and the same two rows the
 * footer renders at `rel="me"`.
 *
 * `Base.astro › social` holds the copy a reader clicks; this is the copy a
 * machine resolves. Both are on every page, which is what makes `sameAs` honest
 * on every page rather than only on the home page. A third profile goes in both.
 */
const SAME_AS = [
  "https://github.com/aayushmanchanda2",
  "https://x.com/amanchanda7",
];

/**
 * The long-form identity, which is the home page's hero restated in the third
 * person. It is emitted on the two pages whose visible copy makes these claims
 * and nowhere else: the home page, whose hero it restates, and /about, which is
 * the long version of that same hero.
 */
const PERSON_DESCRIPTION =
  "Aayush Manchanda is part entrepreneur, part marketer, part operator. He co-founded Orbis, runs Vetted, and uses AI to build things on the internet from Canada. There is a lot of noise in AI, so he reads it, tests it on his own companies and his clients, and what survives shows up on this site with a date on it.";

/**
 * A page's canonical URL, in the exact form `Base.astro` puts in the canonical
 * link.
 *
 * Astro builds directory-format routes, so every page's real URL ends in a
 * slash. Emitting `/tools/paperclip` in the graph while the canonical link says
 * `/tools/paperclip/` would hand a crawler two URLs for one page and let it
 * decide whether they are the same document. `scripts/validate-schema.mjs`
 * compares the two on every built page, so this cannot drift on its own.
 */
export function pageUrl(path: string): string {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  return absolute(`${trimmed}/`);
}

/** A URL for one row of a page that has no page of its own (`/experiments`). */
export function anchorUrl(path: string, id: string): string {
  return `${pageUrl(path)}#${id}`;
}

/**
 * Drop every key whose value is absent.
 *
 * `JSON.stringify` already drops `undefined`, but it renders `null` as `null`,
 * and a `"url": null` in a graph is worse than a missing one: it is a positive
 * claim that the thing has no URL. Most of the optional fields on this site are
 * `T | null` (`Tool.url`, every voice field), so this is the shape they arrive
 * in and the one that has to be caught.
 */
function present(node: JsonLdNode): JsonLdNode {
  return Object.fromEntries(
    Object.entries(node).filter(
      ([, value]) => value !== null && value !== undefined && value !== "",
    ),
  );
}

/** Wrap nodes in the one envelope the whole site uses. */
function graph(...nodes: (JsonLdNode | null)[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@graph": nodes.filter((node): node is JsonLdNode => node !== null).map(present),
  };
}

/** A reference to a node defined elsewhere in the same graph. */
function ref(id: string): JsonLdNode {
  return { "@id": id };
}

/**
 * The `Person`, at one of two weights.
 *
 * `full` is for the two pages that print the biography: the home page, whose
 * hero the description restates, and /about, which is that hero at length.
 * Everywhere else the node is compact — `name`, `url`, `sameAs` — because those
 * are the three things the site mark and the two footer identity rows make
 * visible on *every* page. Shipping the long description onto a tool page would
 * be a paragraph of biography no reader of that page can see.
 */
export function person(full = false): JsonLdNode {
  return present({
    "@type": "Person",
    "@id": PERSON_ID,
    name: NAME,
    url: absolute("/"),
    description: full ? PERSON_DESCRIPTION : null,
    sameAs: SAME_AS,
  });
}

/**
 * Home: the site, and the person who is both its author and its publisher.
 *
 * Both roles, because on a one-person site both are true and they answer
 * different questions — who wrote this, and who stands behind it.
 */
export function homeJsonLd(): JsonLd {
  return graph(
    {
      "@type": "WebSite",
      "@id": WEBSITE_ID,
      name: NAME,
      url: absolute("/"),
      description: PERSON_DESCRIPTION,
      inLanguage: "en-CA",
      author: ref(PERSON_ID),
      publisher: ref(PERSON_ID),
    },
    person(true),
  );
}

/**
 * /about: the page whose subject is the person, and the person.
 *
 * `AboutPage` rather than a plain `WebPage`, because schema.org has a type for
 * exactly this and using it says something a generic `WebPage` cannot: that the
 * biography on it is the point of the document rather than incidental to it.
 *
 * `person(true)` here and on the home page, and nowhere else. This is the one
 * other page whose visible copy actually makes the claims in the description,
 * at more length than the hero does, so it is the one other page allowed to
 * repeat them to a machine.
 *
 * No `BreadcrumbList`: /about draws no crumb, the same way /privacy does not.
 * It is reached from the footer on every page, and a persistent colophon row is
 * navigation rather than a trail.
 */
export function aboutJsonLd(): JsonLd {
  const url = pageUrl("/about");

  return graph(
    {
      "@type": "AboutPage",
      "@id": `${url}#webpage`,
      name: "About",
      url,
      mainEntity: ref(PERSON_ID),
    },
    person(true),
  );
}

/**
 * /contact: how to reach him, and who he is.
 *
 * **No `email` property, and that is the whole design of the page.** The
 * address is entity-encoded in the `mailto:` href precisely so the literal
 * string never appears in the served HTML, and putting it in the graph would
 * hand it straight back, in plain text, to anything reading the page — which is
 * a shorter and better-signposted route than the markup ever was. The parity
 * rule points the same way from the other direction: the page does not print
 * the address as text, so the graph may not claim it either.
 *
 * The `Person` is compact. /contact shows his name and the two profiles the
 * footer already carries; it shows no biography, so it emits none.
 */
export function contactJsonLd(): JsonLd {
  const url = pageUrl("/contact");

  return graph(
    {
      "@type": "ContactPage",
      "@id": `${url}#webpage`,
      name: "Contact",
      url,
      mainEntity: ref(PERSON_ID),
    },
    person(),
  );
}

/**
 * /design: the colophon for the design language, and nothing else.
 *
 * One node, and the shortest one on the site, because the parity rule leaves
 * almost nothing to claim. The page is a specimen sheet — chips that render
 * themselves, swatches that read the live stylesheet, the mark at three sizes —
 * so its content is CSS rather than text a graph can restate. It has no author
 * byline, no date, and no image, so it emits no `Person`, no `datePublished`
 * and no `primaryImageOfPage`.
 *
 * A plain `WebPage`, not `AboutPage` or `CreativeWork`. schema.org has no type
 * for "the design of this website", and reaching for the nearest
 * official-sounding one would be the same move `applicationCategory` refuses on
 * a tool page: a tidier claim than the true one.
 *
 * No `BreadcrumbList`, for the reason /about and /privacy have none: the page is
 * reached from the colophon row in the footer of every page, and a persistent
 * navigation row is not a trail.
 */
export function designJsonLd(): JsonLd {
  const url = pageUrl("/design");

  return graph({
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    name: "Design",
    url,
  });
}

/*
 * There is deliberately no builder for `/privacy` or the 404, and this comment
 * is the record of that call rather than an oversight waiting to be corrected.
 *
 * **The 404 cannot honestly have one.** It is served at whatever URL the reader
 * mistyped, so any `url` it claimed would be false, and `@id` needs a URL. It
 * also ships `noindex` and no canonical, for the same reason — see
 * `layouts/Base.astro › noindex`.
 *
 * **`/privacy` could have one, and does not.** The node would be a `WebPage`
 * carrying `name` and `url`: both true, and both already stated by `<title>`
 * and `rel=canonical` on that page. That is not machine-readable content, it is
 * the same two facts a third time. §7's posture is not to emit a node so a page
 * looks complete — the same instinct that refuses `keywords` and a
 * `SearchAction`. A privacy page's whole value is its prose, and a stub is not
 * a summary of it.
 *
 * `designJsonLd` above is the nearest call and went the other way, on one
 * argument that does not apply here: `design.md` and `/llms.txt` both name
 * /design *as the source for the design language*, so that claim is worth a
 * stable `@id` to hang on. Nothing points at /privacy as the source of
 * anything; readers arrive from the footer when they want it.
 *
 * If either page ever grows something a reader can see and a graph can carry —
 * a date it was last true, most likely, on /privacy — that is when it earns a
 * node, and design.md §7's table moves in the same commit.
 */

/** `ListItem`s, numbered from 1 the way `BreadcrumbList` and `ItemList` both want. */
function listItems(entries: readonly ListEntry[]): JsonLdNode[] {
  return entries.map((entry, index) =>
    present({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      url: entry.url,
    }),
  );
}

/**
 * A section index or a filter page: what is on this page, in the order it is
 * rendered, each row pointing where the row points.
 *
 * `url` on the `ListItem` rather than a nested `item` object, because that is
 * all these rows are — a name and a destination. Half of them (every `/library`
 * row) go straight off-site, which is exactly what the visible row does, and
 * inventing a local landing page for them in the graph would describe a site
 * that does not exist.
 */
export function listJsonLd(options: {
  name: string;
  path: string;
  entries: readonly ListEntry[];
  /** The section this page filters, when it is a filter page. Adds the crumb. */
  parent?: Crumb;
}): JsonLd {
  const url = pageUrl(options.path);

  return graph(
    {
      "@type": "ItemList",
      "@id": `${url}#list`,
      name: options.name,
      url,
      numberOfItems: options.entries.length,
      itemListElement: listItems(options.entries),
    },
    options.parent
      ? breadcrumb(options.parent, { name: options.name, path: options.path })
      : null,
  );
}

/**
 * The crumb trail, which is exactly the crumb the page draws.
 *
 * Two items, not three. Every details and filter page on this site renders one
 * visible crumb — `← Tools` — and then its own title. There is no `Home ›`
 * anywhere in the markup, so putting one in the graph would be describing a
 * trail the reader is not offered. The site mark is a home link, but a
 * persistent logo is navigation, not a breadcrumb.
 */
function breadcrumb(...steps: Crumb[]): JsonLdNode {
  const here = steps[steps.length - 1];
  return {
    "@type": "BreadcrumbList",
    "@id": `${pageUrl(here!.path)}#breadcrumb`,
    itemListElement: steps.map((step, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: step.name,
      item: pageUrl(step.path),
    })),
  };
}

/**
 * The five voice fields, in the order the page stacks them, as one body of
 * prose.
 *
 * `note` is the standfirst and the other four are `VoiceBlocks`; a null field
 * renders nothing there and contributes nothing here, so the `reviewBody` is
 * the page's own sentences and only those. Joined on a blank line because they
 * are separate paragraphs on the page.
 */
export function reviewBody(tool: Tool): string {
  return [tool.note, tool.why, tool.like, tool.dislike, tool.try]
    .filter((field): field is string => typeof field === "string" && field !== "")
    .join("\n\n");
}

/**
 * One tool: the software, and his review of it.
 *
 * `applicationCategory` is his own category string, verbatim — the same words
 * the page prints as a link. schema.org suggests a controlled vocabulary
 * (`DeveloperApplication` and friends) and the property accepts free text; a
 * bench of agent tooling does not fit that vocabulary, and picking the nearest
 * official-sounding term would be a tidier claim than the true one.
 *
 * `url` and `sameAs` are the parity rule reading the Source line at the foot of
 * the page. `url` is where that line sends a reader — the product's own site,
 * or the repository when there is no site — and `sameAs` is the *other* page
 * about the same software, which only exists when both do. A repository-only
 * tool therefore gets a `url` and no `sameAs`, rather than the same URL twice
 * under two properties, which would claim a second source that is not there.
 */
export function toolJsonLd(tool: Tool): JsonLd {
  const url = pageUrl(`/tools/${tool.slug}`);
  const softwareId = `${url}#software`;

  return graph(
    {
      "@type": "SoftwareApplication",
      "@id": softwareId,
      name: tool.name,
      url: tool.url ?? tool.repo,
      applicationCategory: tool.category,
      sameAs: tool.url !== null && tool.repo !== null ? [tool.repo] : null,
    },
    {
      "@type": "Review",
      "@id": `${url}#review`,
      url,
      itemReviewed: ref(softwareId),
      author: ref(PERSON_ID),
      reviewBody: reviewBody(tool),
      datePublished: tool.status_date,
    },
    person(),
    breadcrumb({ name: "Tools", path: "/tools" }, { name: tool.name, path: `/tools/${tool.slug}` }),
  );
}

/**
 * One saved site: this page, the site it is about, and the screenshot.
 *
 * The page is a `WebPage` and the thing it is *about* is the external site, so
 * the two never get confused — the screenshot and the palette belong to our
 * page, the name and the URL belong to theirs.
 *
 * `dateCreated` on both nodes is the visible `Saved` row. It is the same date
 * for both on purpose and the page says why in its own standfirst: every
 * screenshot is taken the day the site is saved.
 */
export function siteJsonLd(site: Site): JsonLd {
  const url = pageUrl(`/sites/${site.slug}`);
  const shotId = `${url}#screenshot`;

  return graph(
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      name: site.title,
      url,
      dateCreated: site.saved_date,
      about: {
        "@type": "WebSite",
        name: site.title,
        url: site.url,
      },
      primaryImageOfPage: ref(shotId),
    },
    {
      "@type": "ImageObject",
      "@id": shotId,
      contentUrl: absolute(site.shot),
      /* The frame's own alt text, which is the only caption this image has. */
      caption: `Full page of ${site.title}`,
      dateCreated: site.saved_date,
    },
    breadcrumb({ name: "Sites", path: "/sites" }, { name: site.title, path: `/sites/${site.slug}` }),
  );
}

/**
 * Where a /library row sends a reader, which is what its `ItemList` entry must
 * claim. The parity rule, one property wide: a digested row links its own
 * detail page and an undigested one links straight out, so the graph on every
 * list page says exactly that and nothing tidier. Three pages render the list
 * and all three call this, because three copies of a one-line branch is how
 * one of them ends up describing the row the other two stopped drawing.
 */
export function libraryRowUrl(
  entry: Pick<LibraryEntry, "slug" | "url" | "digest">,
): string {
  return entry.digest === null ? entry.url : pageUrl(`/library/${entry.slug}`);
}

/**
 * What kind of thing a digested entry reviews, in schema.org's vocabulary.
 *
 * The same three words the kind chip prints, translated once: a `post` is a
 * thing on a social timeline and a `video` is a recording, and schema.org has
 * a type for each. Exhaustive by `Kind`, so a fourth kind will not compile
 * until it has a type here too.
 */
const KIND_TYPES: Record<Kind, string> = {
  article: "Article",
  post: "SocialMediaPosting",
  video: "VideoObject",
};

/**
 * The digest as one body of prose: the page's own sentences, in the order the
 * page stacks them — the note as standfirst, then the cliff notes, then the
 * verdict and the why. Same contract as `reviewBody` for a tool: a null note
 * contributes nothing because it renders nothing.
 */
export function digestReviewBody(entry: DigestedEntry): string {
  return [entry.note, ...entry.digest.bullets, entry.digest.verdict, entry.digest.why]
    .filter((field): field is string => typeof field === "string" && field !== "")
    .join("\n\n");
}

/**
 * One digested library entry: his review of somebody else's piece.
 *
 * The shape follows `toolJsonLd` — a `Review` by the `Person`, dated the day
 * the digest was written, which is the `digested` date the page prints — with
 * one deliberate difference. The thing reviewed is external, so it is a nested
 * node carrying only what the page shows about it (title, URL, and the kind
 * translated to a type), the way `siteJsonLd` nests its `about`. Lifting it to
 * a top-level node would mean minting an `@id` on this origin for a document
 * that lives on someone else's, and claiming properties — an author, a date —
 * the page does not show.
 */
export function libraryJsonLd(entry: DigestedEntry): JsonLd {
  const url = pageUrl(`/library/${entry.slug}`);

  return graph(
    {
      "@type": "Review",
      "@id": `${url}#review`,
      url,
      itemReviewed: {
        "@type": KIND_TYPES[entry.kind],
        name: entry.title,
        url: entry.url,
      },
      author: ref(PERSON_ID),
      reviewBody: digestReviewBody(entry),
      datePublished: entry.digest.digested,
    },
    person(),
    breadcrumb(
      { name: "Library", path: "/library" },
      { name: entry.title, path: `/library/${entry.slug}` },
    ),
  );
}

/**
 * One note.
 *
 * `headline` and `name` both carry the title: `headline` is what Google reads
 * off an `Article`, `name` is what a plain schema.org consumer reads off any
 * `CreativeWork`, and they are the same visible `h1` either way.
 */
export function noteJsonLd(note: {
  slug: string;
  title: string;
  /** ISO calendar date, the same string the page prints in its `<time>`. */
  date: string;
  /** A `/notes/<name>.<ext>` path when the note has an image, else null. */
  image?: string | null;
}): JsonLd {
  const url = pageUrl(`/notes/${note.slug}`);

  return graph(
    {
      "@type": "Article",
      "@id": `${url}#article`,
      headline: note.title,
      name: note.title,
      url,
      datePublished: note.date,
      author: ref(PERSON_ID),
      publisher: ref(PERSON_ID),
      image: note.image ? absolute(note.image) : null,
    },
    person(),
    breadcrumb({ name: "Notes", path: "/notes" }, { name: note.title, path: `/notes/${note.slug}` }),
  );
}

/**
 * Serialise a document for the one `ld+json` block in the head.
 *
 * The escaping is the whole reason this is a function rather than a bare
 * `JSON.stringify` at the call site. The block is written with `set:html`, so
 * the browser parses its contents as raw text until it meets `</script`, and a
 * tool note containing that string would end the block early and put the rest
 * of the graph into the document as markup. `<`, `>` and `&` go out as JSON
 * string escapes, which every JSON parser reads back as the original character,
 * and which no HTML tokeniser can mistake for a tag. The two line separators
 * are the other half of the same job: both are valid in JSON strings and were
 * historically not valid in JavaScript ones.
 */
export function serialize(document: JsonLd): string {
  return JSON.stringify(document)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
