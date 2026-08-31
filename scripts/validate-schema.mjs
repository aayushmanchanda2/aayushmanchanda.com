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
 * Four checks at the foot are not about JSON-LD at all, and live here because
 * this is the only gate that reads the built HTML: the email address on
 * /contact may not appear in plain text anywhere in `dist/`, no link anywhere
 * may be glued to the word beside it, no page may carry markup that would load
 * a video from YouTube before the reader asks for one, and exactly one page may
 * load anything at all from X.
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
 * @property {(types: string[]) => boolean} [when]
 *   A second gate, on the graph rather than on the path. One route can build
 *   two page types when the data decides the shape: `/library/<slug>` is a
 *   `Review` for an entry somebody has read and a `WebPage` for one nobody has,
 *   and no pattern over the URL can tell those apart. Groups are tried in
 *   order, so the gated one goes first and the ungated one is the fallback.
 * @property {string[]} types
 * @property {Record<string, string[]>} [requires]
 *   Extra properties a node of a given `@type` must carry *on this page type*.
 *   `REQUIRED` below is what is true of a type everywhere; this is what is true
 *   of it here. The two `WebPage`s on the site are the reason the distinction
 *   exists: a /sites entry is a page about an external site and owns a
 *   screenshot, and /design is a page about this site's own stylesheet and owns
 *   neither.
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
  /*
   * A `WebPage` is held to a name and a URL and no more, because the site has
   * two of them and they are different documents. A /sites entry is a page about
   * an external site, and everything else it must carry — the subject, the
   * screenshot, the date — is asserted on that page type in `EXPECTED`. /design
   * is a page about this site's own stylesheet: no subject that is not the site
   * itself, no image, no date it was last true.
   */
  WebPage: ["name", "url"],
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
    name: "design",
    match: (page) => page === "design/index.html",
    types: ["WebPage"],
  },
  {
    name: "site details",
    match: (page) => /^sites\/[^/]+\/index\.html$/.test(page),
    types: ["WebPage", "ImageObject", "BreadcrumbList"],
    // What a page *about another website* has to say, over and above being a
    // page. /design is a `WebPage` too and owns none of it.
    requires: {
      WebPage: ["about", "primaryImageOfPage", "dateCreated"],
    },
  },
  {
    name: "note",
    match: (page) => /^notes\/[^/]+\/index\.html$/.test(page),
    types: ["Article", "Person", "BreadcrumbList"],
  },
  {
    /*
     * Every library entry builds a page here since VET-63, and the two groups
     * are the digest and the absence of one. A `Review` is an opinion, so a
     * page with no digest on it emits a `WebPage` instead — see the parity
     * argument at `lib/schema.ts › libraryJsonLd`. The thing saved is external
     * either way and rides inside as a nested node, so neither top level names
     * anything but this site.
     *
     * Coverage of the digested group is also the check that at least one digest
     * survived the build, which is what it was before the split.
     *
     * The one-segment pattern cannot collide with the filter group below:
     * /library/kind/<kind>, /library/domain/<host> and /library/tag/<tag> are
     * all two segments deep.
     */
    name: "library details (digested)",
    match: (page) => /^library\/[^/]+\/index\.html$/.test(page),
    when: (types) => types.includes("Review"),
    types: ["Review", "Person", "BreadcrumbList"],
  },
  {
    name: "library details",
    match: (page) => /^library\/[^/]+\/index\.html$/.test(page),
    types: ["WebPage", "BreadcrumbList"],
    // What a page *about something saved from elsewhere* owes over and above
    // being a page: the thing, and the day it arrived. Both are on the page —
    // the Source line and the strip — and /design, the site's other bare
    // `WebPage`, owns neither.
    requires: {
      WebPage: ["about", "dateCreated"],
    },
  },
  {
    name: "filter",
    match: (page) =>
      /^(tools\/(category|verdict)|sites\/(collection|domain)|library\/(kind|domain|tag))\/[^/]+\/index\.html$/.test(
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
  const group = EXPECTED.find(
    (candidate) => candidate.match(page) && (candidate.when?.(types) ?? true),
  );
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

    // The properties a type owes on *this* page type. See `PageType.requires`.
    for (const [type, properties] of Object.entries(group.requires ?? {})) {
      for (const node of graph.filter((one) => one["@type"] === type)) {
        for (const property of properties) {
          if (!(property in node)) {
            fail(
              page,
              `is a ${group.name} page, so its ${type} is missing ${property}`,
            );
          }
        }
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

/*
 * A page that would fetch a video before anyone asked for one.
 *
 * `components/VideoFacade.astro` renders a saved video as the poster frame this
 * repository committed plus a link, and builds the player only when that link
 * is pressed. The whole value of that arrangement is a claim /privacy makes by
 * name — "nothing loads from YouTube until you press play" — and the way it
 * would be lost is not a decision anyone announces. It is one commit swapping
 * the facade for the `<iframe>` snippet YouTube hands out, which looks like a
 * simplification and reads as one in a diff.
 *
 * So the check is on the shipped markup rather than on the source: whatever a
 * template, a component or a future integration does, what reached `dist/` may
 * not name a host a browser would fetch a video, or a picture of one, from.
 *
 * Two things are deliberately outside the patterns. **`youtube.com/watch` is
 * not on the host list**: a library row has linked there since the section
 * existed, and a link a reader may choose to follow is not a request the page
 * makes. And they match a **URL** rather than a word, because /privacy names
 * youtube-nocookie.com in a sentence on purpose — saying which host a press
 * reaches is that page's whole job, and a host in prose fetches nothing.
 *
 * Script bodies are cut out first, and that is not a loophole. The facade's
 * embed origin lives in its script because a string in JavaScript is inert
 * until something runs it, and the press is what runs it; a URL in an attribute
 * is a request the browser makes on load. This check is about the second kind.
 */
/** @type {[RegExp, string][]} */
const EMBEDS = [
  [
    /<iframe/gi,
    "ships an iframe. The video facade builds one on a press and only on a press; an iframe in the built HTML is a request every reader makes on load",
  ],
  [
    /(?:https?:)?\/\/[\w.-]*(?:youtube-nocookie\.com|youtube\.com\/embed|ytimg\.com|googlevideo\.com)/g,
    "carries a video URL in its markup, so the page would load from YouTube before anyone pressed play. /privacy says it does not",
  ],
];

/*
 * The pages allowed to talk to X, and it is a list of exactly one.
 *
 * `/library/kind/post` renders every saved post as X's own embed
 * (`components/XEmbeds.astro`), so opening it fetches `widgets.js` and turns
 * each card into an iframe of theirs. That is the only page on the site that
 * does, and /privacy says so by name — which is a claim that has to be checked
 * from both ends, so this is checked from both ends. A page not on this list
 * that carries a Twitter host has quietly added a third party; the page on it
 * that carries none has quietly lost the feature while /privacy still confesses
 * to it, which is the more embarrassing of the two.
 *
 * **The scan is of the whole document, scripts included, and that is the
 * difference from the YouTube check above.** That one deliberately cuts script
 * bodies out, because the facade's embed origin lives in a string that nothing
 * runs until a reader presses play, and a URL in an attribute is a request the
 * browser makes on load. This one is not press-gated: the script runs on load
 * and fetches the host, so a string here *is* a request. It is the reason
 * `XEmbeds.astro` ships its script `is:inline` rather than letting Astro lift
 * it into a hashed module — bundled, the host would not appear in any page's
 * HTML and there would be nothing here to check.
 *
 * The pattern matches a URL rather than a bare word, the same call the YouTube
 * one makes: /privacy names these hosts in prose on purpose, and a host in a
 * sentence fetches nothing. The post's own permalink is deliberately not on the
 * list either — `x.com/<handle>/status/<id>` is a link a reader may choose to
 * follow, not a request the page makes, exactly as `youtube.com/watch` is.
 */
const X_EMBED_PAGES = ["library/kind/post/index.html"];

const X_HOSTS =
  /(?:https?:)?\/\/[\w.-]*(?:platform\.twitter\.com|syndication\.twitter\.com|platform\.x\.com|syndication\.twimg\.com)/g;

for (const page of pages) {
  const html = readFileSync(path.join(DIST, page), "utf8");
  const markup = html.replace(/<script[\s\S]*?<\/script>/gi, "");

  const declares = X_EMBED_PAGES.includes(page);
  const widgets = [...html.matchAll(X_HOSTS)];

  if (declares) {
    if (widgets.length === 0) {
      fail(
        page,
        "declares X embeds but ships no widget host. /privacy names this page as the one that loads from X; either the embeds came out or that page is now confessing to something the site does not do",
      );
    }
    if (!/class="[^"]*twitter-tweet/.test(html)) {
      fail(
        page,
        "loads X's widget factory but ships no `blockquote.twitter-tweet` for it to find, so the request buys the reader nothing",
      );
    }
  } else if (widgets.length > 0) {
    const near = html.slice(
      Math.max(0, (widgets[0]?.index ?? 0) - 40),
      (widgets[0]?.index ?? 0) + 40,
    );
    fail(
      page,
      `loads from X and is not a page that declares embeds. /privacy says the posts wall is the only one: ...${near.replace(/\s+/g, " ")}...`,
    );
  }

  if (html.includes(ADDRESS)) {
    fail(page, "prints the email address in plain text; it must stay encoded");
  }

  for (const [pattern, message] of GLUED) {
    for (const match of html.matchAll(pattern)) {
      const near = html.slice(Math.max(0, match.index - 40), match.index + 40);
      fail(page, `${message}: ...${near.replace(/\s+/g, " ")}...`);
    }
  }

  for (const [pattern, message] of EMBEDS) {
    for (const match of markup.matchAll(pattern)) {
      const near = markup.slice(Math.max(0, match.index - 40), match.index + 40);
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
