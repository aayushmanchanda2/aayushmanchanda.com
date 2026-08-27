/**
 * Validate every JSON-LD block the build emitted.
 *
 *     npm run build && npm run validate:schema
 *
 * `src/lib/schema.test.mjs` checks the builders in `lib/schema.ts` with plain
 * objects. This checks the other half — that what actually reached `dist/` is a
 * parseable graph with nothing missing and nothing invented — by reading the
 * built HTML rather than the source that produced it. The two catch different
 * failures: a builder can be perfect and still never be wired to its page.
 *
 * It is deliberately stricter than schema.org itself. schema.org will accept
 * almost anything, including a `null`, an empty string, and a reference to a
 * node that is not there; none of those are things this site should ever ship,
 * so all three are errors here. The rules that matter most are the two that
 * enforce the parity rule from `lib/schema.ts`:
 *
 *   - `FORBIDDEN` fails the build on any rating or keyword property, anywhere,
 *     at any depth. That rule exists because it is the one a future edit is
 *     most likely to break for the most tempting reason: a `ratingValue` would
 *     buy stars in a search result, and the number would be made up.
 *   - `EXPECTED` pins the types each page type emits, so a page that quietly
 *     stops emitting its graph fails here instead of going unnoticed until
 *     something tries to cite it.
 *
 * Two checks at the foot are not about JSON-LD at all, and live here because
 * this is the only gate that reads the built HTML: the email address on
 * /contact may not appear in plain text anywhere in `dist/`, and no link
 * anywhere may be glued to the word beside it.
 *
 * Exits 0 with a per-page-type summary, or 1 with every problem listed.
 *
 * Annotated with JSDoc rather than left loose because `tsconfig.json` turns on
 * `checkJs` for exactly this reason: a script in the build gate is code, and
 * `npx astro check` is what keeps it honest.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * One parsed JSON-LD node.
 *
 * `any` on purpose, and the only `any` here. This file's whole job is to look
 * at untrusted parsed JSON and decide whether it is well formed; giving it a
 * shape up front would be asserting the thing under test.
 *
 * @typedef {Record<string, any>} Node
 */

/**
 * @typedef {object} PageType
 * @property {string} name
 * @property {(page: string) => boolean} match
 * @property {string[]} types
 */

const DIST = path.join(process.cwd(), "dist");
const ORIGIN = "https://aayushmanchanda.com";

const BLOCK = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
const CANONICAL = /<link rel="canonical" href="([^"]+)"/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Properties that must never appear, at any depth.
 *
 * The first eight are a number or a keyword list this site does not have. See
 * the parity rule in `src/lib/schema.ts`.
 *
 * `email` is there for a different reason and it is the one worth stating. The
 * address on /contact is entity-encoded in the `mailto:` href specifically so
 * the literal string is not in the served HTML; an `email` property would put
 * it back, in plain text, somewhere far easier to find than the markup. The
 * parity rule agrees from the other side: the page does not print the address
 * as text, so nothing on it may claim the address as text.
 */
const FORBIDDEN = [
  "aggregateRating",
  "ratingValue",
  "reviewRating",
  "ratingCount",
  "reviewCount",
  "bestRating",
  "worstRating",
  "keywords",
  "email",
];

/**
 * What each `@type` has to carry to be worth emitting at all.
 *
 * @type {Record<string, string[]>}
 */
const REQUIRED = {
  WebSite: ["name", "url", "author", "publisher"],
  Person: ["name", "url", "sameAs"],
  AboutPage: ["name", "url", "mainEntity"],
  ContactPage: ["name", "url", "mainEntity"],
  ItemList: ["name", "url", "numberOfItems", "itemListElement"],
  ListItem: ["position", "name"],
  SoftwareApplication: ["name", "applicationCategory"],
  Review: ["url", "itemReviewed", "author", "reviewBody", "datePublished"],
  WebPage: ["name", "url", "about", "primaryImageOfPage", "dateCreated"],
  ImageObject: ["contentUrl", "caption"],
  Article: ["headline", "name", "url", "datePublished", "author", "publisher"],
  BreadcrumbList: ["itemListElement"],
};

/** Properties whose value must be one absolute http(s) URL. */
const URL_PROPS = ["url", "item", "contentUrl", "@id"];

/**
 * One representative page per page type, and the top-level types it must emit.
 *
 * Written as a predicate rather than a fixed filename, so adding a twentieth
 * tool does not mean editing this file — but deleting the last one, or
 * unwiring the route, still fails the `coverage` check at the bottom.
 *
 * @type {PageType[]}
 */
const EXPECTED = [
  {
    name: "home",
    match: (page) => page === "index.html",
    types: ["WebSite", "Person"],
  },
  {
    name: "about",
    match: (page) => page === "about/index.html",
    types: ["AboutPage", "Person"],
  },
  {
    name: "contact",
    match: (page) => page === "contact/index.html",
    types: ["ContactPage", "Person"],
  },
  {
    name: "section index",
    match: (page) =>
      ["tools", "sites", "library", "experiments", "notes"].some(
        (section) => page === `${section}/index.html`,
      ),
    types: ["ItemList"],
  },
  {
    name: "tool details",
    match: (page) => /^tools\/[^/]+\/index\.html$/.test(page),
    types: ["SoftwareApplication", "Review", "Person", "BreadcrumbList"],
  },
  {
    name: "site details",
    match: (page) => /^sites\/[^/]+\/index\.html$/.test(page),
    types: ["WebPage", "ImageObject", "BreadcrumbList"],
  },
  {
    name: "note",
    match: (page) => /^notes\/[^/]+\/index\.html$/.test(page),
    types: ["Article", "Person", "BreadcrumbList"],
  },
  {
    name: "filter",
    match: (page) =>
      /^(tools\/(category|verdict)|sites\/(collection|domain)|library\/(kind|domain))\/[^/]+\/index\.html$/.test(
        page,
      ),
    types: ["ItemList", "BreadcrumbList"],
  },
];

/** Pages that carry no structured data on purpose. */
const NO_SCHEMA = ["404.html", "privacy/index.html"];

/** @type {string[]} */
const errors = [];

/**
 * @param {string} page
 * @param {string} message
 */
const fail = (page, message) => {
  errors.push(`${page}: ${message}`);
};

/**
 * Every `.html` file under a directory, as paths relative to it.
 *
 * @param {string} dir
 * @param {string} base
 * @returns {string[]}
 */
function htmlFiles(dir, base = "") {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...htmlFiles(path.join(dir, entry.name), rel));
    } else if (entry.name.endsWith(".html")) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * Walk every value in a node.
 *
 * Recursive because the rules that matter apply at any depth: a `ratingValue`
 * buried inside `about` is exactly as false as one at the top, and the shallow
 * check is the one a future edit would slip past.
 *
 * @param {string} page
 * @param {unknown} value
 * @param {string} trail
 */
function walk(page, value, trail) {
  if (value === null) return fail(page, `${trail} is null`);
  if (value === undefined) return fail(page, `${trail} is undefined`);

  if (Array.isArray(value)) {
    if (value.length === 0) fail(page, `${trail} is an empty array`);
    value.forEach((item, index) => walk(page, item, `${trail}[${index}]`));
    return;
  }

  if (typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      if (FORBIDDEN.includes(key)) {
        fail(page, `${trail}.${key} is forbidden — no ratings, no keywords`);
      }
      walk(page, inner, `${trail}.${key}`);
    }
    return;
  }

  if (typeof value === "string" && value.trim() === "") {
    fail(page, `${trail} is an empty string`);
  }
}

/**
 * Collect every `@id` a graph defines, so references can be resolved.
 *
 * @param {Node[]} graph
 * @returns {Set<string>}
 */
function definedIds(graph) {
  /** @type {Set<string>} */
  const ids = new Set();
  for (const node of graph) {
    if (typeof node["@id"] === "string") ids.add(node["@id"]);
  }
  return ids;
}

/**
 * A bare `{"@id": ...}` is a reference; anything with other keys is a
 * definition. Only references have to resolve.
 *
 * @param {string} page
 * @param {unknown} value
 * @param {Set<string>} ids
 * @param {string} trail
 */
function checkRefs(page, value, ids, trail) {
  if (value === null || typeof value !== "object") return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => checkRefs(page, item, ids, `${trail}[${index}]`));
    return;
  }

  /** @type {Node} */
  const node = value;
  const keys = Object.keys(node);
  if (keys.length === 1 && keys[0] === "@id" && !ids.has(node["@id"])) {
    fail(page, `${trail} references ${node["@id"]}, which no node in this graph defines`);
  }

  for (const [key, inner] of Object.entries(node)) {
    if (key === "@id") continue;
    checkRefs(page, inner, ids, `${trail}.${key}`);
  }
}

/**
 * @param {string} page
 * @param {Node} node
 * @param {string} trail
 */
function checkNode(page, node, trail) {
  const type = node["@type"];
  if (typeof type !== "string") {
    fail(page, `${trail} has no @type`);
    return;
  }

  for (const property of REQUIRED[type] ?? []) {
    if (!(property in node)) fail(page, `${trail} (${type}) is missing ${property}`);
  }

  for (const property of URL_PROPS) {
    const value = node[property];
    if (typeof value !== "string") continue;
    // `@id` fragments and external URLs are both absolute; that is the whole rule.
    if (!/^https?:\/\//.test(value)) {
      fail(page, `${trail}.${property} is not an absolute URL: ${value}`);
    }
  }

  for (const property of ["datePublished", "dateCreated"]) {
    const value = node[property];
    if (value !== undefined && !ISO_DATE.test(String(value))) {
      fail(page, `${trail}.${property} is not an ISO date: ${String(value)}`);
    }
  }

  if (type === "ItemList") {
    /** @type {Node[]} */
    const items = node["itemListElement"] ?? [];
    if (node["numberOfItems"] !== items.length) {
      fail(
        page,
        `${trail} says numberOfItems ${node["numberOfItems"]} but carries ${items.length}`,
      );
    }
  }

  if (type === "ItemList" || type === "BreadcrumbList") {
    /** @type {Node[]} */
    const items = node["itemListElement"] ?? [];
    items.forEach((item, index) => {
      if (item["position"] !== index + 1) {
        fail(
          page,
          `${trail}.itemListElement[${index}] has position ${item["position"]}, expected ${index + 1}`,
        );
      }
      checkNode(page, item, `${trail}.itemListElement[${index}]`);
    });
  }

  if (type === "ListItem" && !("url" in node) && !("item" in node)) {
    fail(page, `${trail} (ListItem) has neither url nor item`);
  }
}

// --- run -------------------------------------------------------------------

if (!existsSync(DIST)) {
  console.error("dist/ is not there. Run `npm run build` first.");
  process.exit(1);
}

const pages = htmlFiles(DIST);

/** @type {Map<string, number>} */
const seen = new Map(EXPECTED.map((group) => [group.name, 0]));
let blocks = 0;

for (const page of pages) {
  const html = readFileSync(path.join(DIST, page), "utf8");
  const found = [...html.matchAll(BLOCK)];

  if (found.length === 0) {
    if (!NO_SCHEMA.includes(page)) fail(page, "emits no JSON-LD");
    continue;
  }
  if (found.length > 1) {
    fail(page, `emits ${found.length} ld+json blocks; the layout owns exactly one`);
  }

  const raw = found[0]?.[1] ?? "";

  /** @type {Node} */
  let document;
  try {
    document = JSON.parse(raw);
  } catch (error) {
    fail(page, `ld+json does not parse: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }
  blocks += 1;

  /*
   * The escaping in `serialize()` is what makes this true; if it ever regressed
   * the block would have been cut short at that character and the parse above
   * would already have failed. Checked anyway, because a `<` inside a JSON
   * string can also parse fine here and still be a tokeniser hazard in whatever
   * is reading the page.
   */
  if (/[<>]/.test(raw)) {
    fail(page, "ld+json contains a raw < or >, which can end the block early");
  }

  if (document["@context"] !== "https://schema.org") {
    fail(
      page,
      `@context is ${JSON.stringify(document["@context"])}, expected https://schema.org`,
    );
  }

  /** @type {Node[]} */
  const graph = document["@graph"];
  if (!Array.isArray(graph) || graph.length === 0) {
    fail(page, "@graph is missing or empty");
    continue;
  }

  walk(page, graph, "@graph");

  const ids = definedIds(graph);
  graph.forEach((node, index) => {
    checkNode(page, node, `@graph[${index}]`);
    checkRefs(page, node, ids, `@graph[${index}]`);
  });

  const types = graph.map((node) => node["@type"]);
  const group = EXPECTED.find((candidate) => candidate.match(page));
  if (group) {
    seen.set(group.name, (seen.get(group.name) ?? 0) + 1);
    for (const type of group.types) {
      if (!types.includes(type)) {
        fail(
          page,
          `is a ${group.name} page but emits no ${type} (got ${types.join(", ")})`,
        );
      }
    }
  }

  for (const node of graph) {
    if (typeof node["@id"] === "string" && !node["@id"].startsWith(ORIGIN)) {
      fail(page, `@id ${node["@id"]} is not on ${ORIGIN}`);
    }
  }

  /*
   * The graph and the canonical link have to name this page the same way.
   *
   * `lib/schema.ts › pageUrl` rebuilds the directory-format URL by hand, and
   * the failure if it ever drifts is silent and expensive: the head would point
   * a crawler at `/tools/paperclip/` while the graph described
   * `/tools/paperclip`, and it would be left to decide whether those are one
   * document or two. Comparing against the canonical the layout actually
   * emitted is the only check that cannot drift along with it.
   */
  const canonical = html.match(CANONICAL)?.[1];
  if (canonical && !graph.some((node) => node["url"] === canonical)) {
    const urls = graph.map((node) => node["url"]).filter(Boolean);
    fail(
      page,
      `no node's url matches the canonical ${canonical} (got ${urls.join(", ") || "none"})`,
    );
  }
}

for (const [name, count] of seen) {
  if (count === 0) fail("coverage", `no page matched the "${name}" page type`);
}

/*
 * The address may not appear in plain text anywhere in the build.
 *
 * /contact entity-encodes every character of it in the `mailto:` href, and the
 * whole value of doing that evaporates the moment one page prints it straight.
 * The ways it could: someone "tidies" the href back into readable text, someone
 * builds it from a template expression (Astro would escape the ampersands and
 * ship literal `&amp;#97;`, which is a different bug that this check will not
 * see — the live gate is for that one), or someone adds an `email` to the graph
 * and FORBIDDEN above misses a spelling of it.
 *
 * Assembled from parts rather than written out, so this file is not itself the
 * plain-text copy the check exists to prevent. This repository is public.
 */
const ADDRESS = ["aayushmanchanda2", "gmail.com"].join("@");

/*
 * A link glued to the word beside it.
 *
 * **A line break between a word and a tag is not whitespace in an `.astro`
 * template. It is nothing.** Astro drops the whitespace at a text/tag boundary
 * when it contains a newline, so this, which looks completely ordinary:
 *
 *     you do not need to email me about it.
 *     <a href="/privacy">/privacy</a> has the route
 *
 * ships as "about it./privacy has the route". Inside the tag it is harmless,
 * and a newline between two plain words collapses to a space as normal — it is
 * only the boundary that bites. So the space next to an anchor has to be a real
 * space on the same line as the tag.
 *
 * This is here because two of these were live on /privacy for months and nobody
 * saw them, including on the read-through that shipped the page. It is not a
 * subtle rendering difference, it is a missing space in a sentence, and it is
 * invisible in the source precisely because the source looks right.
 *
 * Both patterns are clean across the whole site, so a hit is a real defect
 * rather than a case to add an exception for: `</a>` followed by a letter, and
 * a word or sentence punctuation followed by `<a`. Markup boundaries do not
 * match (`</a></li>`, `><a`), and neither does correct punctuation (`</a>,`).
 */
/** @type {[RegExp, string][]} */
const GLUED = [
  [/<\/a>[A-Za-z0-9]/g, "a link is glued to the word after it (missing space)"],
  [/[A-Za-z0-9.,;:!?]<a[ >]/g, "a link is glued to the word before it (missing space)"],
];

for (const page of pages) {
  const html = readFileSync(path.join(DIST, page), "utf8");

  if (html.includes(ADDRESS)) {
    fail(page, "prints the email address in plain text; it must stay encoded");
  }

  for (const [pattern, message] of GLUED) {
    for (const match of html.matchAll(pattern)) {
      const near = html.slice(Math.max(0, match.index - 40), match.index + 40);
      fail(page, `${message}: ...${near.replace(/\s+/g, " ")}...`);
    }
  }
}

if (errors.length > 0) {
  console.error(`\n${errors.length} structured-data problem(s):\n`);
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}

console.log(`Structured data OK — ${blocks} graphs across ${pages.length} pages.`);
for (const [name, count] of seen) console.log(`  ${name}: ${count}`);
