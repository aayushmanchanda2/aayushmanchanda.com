/**
 * The structured data, under test.
 *
 * Two things are being defended here, and only one of them is "does it emit the
 * right shape".
 *
 * The first is the **parity rule**: the graph may not claim anything the page
 * does not show. Most of that is a judgement made once, in `schema.ts`, and the
 * part a test can hold is the part with a number in it — no rating, no review
 * count, no invented field, on any builder, at any depth. That check runs
 * against every builder rather than against the one that looked tempting,
 * because the next `SoftwareApplication` property somebody reaches for will be
 * `aggregateRating` and it will look reasonable at the time.
 *
 * The second is **`serialize`**. It is the only place on this site where data
 * becomes markup without an escaping layer in between: the block goes out
 * through `set:html`, so the browser reads it as raw text until it meets
 * `</script`. A tool note containing that string would end the block early and
 * put the rest of the graph into the document as tags. The round-trip tests at
 * the foot are what keep that impossible.
 *
 * `scripts/validate-schema.mjs` covers the half this file cannot: what actually
 * reached `dist/`. A builder can be correct here and never be wired to a page.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  PERSON_ID,
  WEBSITE_ID,
  anchorUrl,
  homeJsonLd,
  listJsonLd,
  noteJsonLd,
  pageUrl,
  person,
  reviewBody,
  serialize,
  siteJsonLd,
  toolJsonLd,
} from "./schema.ts";

/** @typedef {import("./schema.ts").JsonLd} JsonLd */

const ORIGIN = "https://aayushmanchanda.com";

/**
 * One node from a graph, widened so a test can name a property on it.
 *
 * The builders return `Record<string, unknown>`, which is the right type for
 * everything downstream: nothing in production should read a property off a
 * node without checking it first. A test is the one caller that legitimately
 * wants to reach in and say `review.author`, so the widening happens once, here,
 * instead of as a cast at forty call sites.
 *
 * @param {JsonLd} document
 * @param {number} index
 * @returns {Record<string, any>}
 */
const at = (document, index) =>
  /** @type {Record<string, any>} */ (document["@graph"][index]);

/**
 * @param {JsonLd} document
 * @returns {Record<string, any>[]}
 */
const nodes = (document) =>
  /** @type {Record<string, any>[]} */ (document["@graph"]);

/**
 * @param {JsonLd} document
 * @returns {unknown[]}
 */
const typesIn = (document) => document["@graph"].map((node) => node["@type"]);

/**
 * A tool with every optional field filled, so nothing is missed by absence.
 *
 * @type {import("./tools.ts").Tool}
 */
const FULL_TOOL = {
  slug: "paperclip",
  name: "Paperclip",
  url: "https://github.com/paperclipai/paperclip",
  category: "agent infra",
  verdict: "using",
  note: "Agent org control plane.",
  status_date: "2026-08-17",
  why: "I wanted one place to see what the agents are doing.",
  like: "Boots clean and the telemetry is off by default.",
  dislike: "The docs assume you already run Postgres.",
  try: "Point it at one repo before you point it at ten.",
};

/**
 * The common case: a verdict, a date, and nothing else.
 *
 * @type {import("./tools.ts").Tool}
 */
const BARE_TOOL = {
  slug: "dinky",
  name: "Dinky",
  url: null,
  category: "cli",
  verdict: "watching",
  note: "Saved from Raindrop. Not tested yet.",
  status_date: "2026-08-19",
  why: null,
  like: null,
  dislike: null,
  try: null,
};

/** @type {import("./sites.ts").Site} */
const SITE = {
  slug: "save-design",
  title: "Save.design",
  url: "https://save.design",
  domain: "save.design",
  saved_date: "2026-08-26",
  shot: "/shots/save-design.webp",
  palette: ["#09090b"],
  collections: ["dark-by-default"],
  like: null,
  dislike: null,
};

/**
 * Every builder's output, so the whole-surface rules can loop over them.
 *
 * @returns {[string, JsonLd][]}
 */
const EVERY_GRAPH = () => [
  ["home", homeJsonLd()],
  [
    "list",
    listJsonLd({
      name: "Tools",
      path: "/tools",
      entries: [{ name: "Paperclip", url: pageUrl("/tools/paperclip") }],
    }),
  ],
  [
    "filter",
    listJsonLd({
      name: "agent infra",
      path: "/tools/category/agent-infra",
      parent: { name: "Tools", path: "/tools" },
      entries: [{ name: "Paperclip", url: pageUrl("/tools/paperclip") }],
    }),
  ],
  ["tool", toolJsonLd(FULL_TOOL)],
  ["bare tool", toolJsonLd(BARE_TOOL)],
  ["site", siteJsonLd(SITE)],
  [
    "note",
    noteJsonLd({
      slug: "building-this-site",
      title: "Building this site",
      date: "2026-08-26",
      image: null,
    }),
  ],
];

/**
 * Collect every key present anywhere in a value, at any depth.
 *
 * @param {unknown} value
 * @param {Set<string>} found
 * @returns {Set<string>}
 */
function everyKey(value, found = new Set()) {
  if (value === null || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    for (const item of value) everyKey(item, found);
    return found;
  }
  for (const [key, inner] of Object.entries(value)) {
    found.add(key);
    everyKey(inner, found);
  }
  return found;
}

/**
 * Every leaf value present anywhere, so an absent field can be checked for
 * leaking as a `null` rather than being dropped.
 *
 * @param {unknown} value
 * @param {unknown[]} found
 * @returns {unknown[]}
 */
function everyValue(value, found = []) {
  if (Array.isArray(value)) {
    for (const item of value) everyValue(item, found);
    return found;
  }
  if (value !== null && typeof value === "object") {
    for (const inner of Object.values(value)) everyValue(inner, found);
    return found;
  }
  found.push(value);
  return found;
}

// --- the envelope ----------------------------------------------------------

test("every builder returns the same envelope", () => {
  for (const [name, document] of EVERY_GRAPH()) {
    assert.equal(document["@context"], "https://schema.org", name);
    assert.ok(Array.isArray(document["@graph"]), `${name} has a @graph array`);
    assert.ok(document["@graph"].length > 0, `${name} @graph is not empty`);
  }
});

test("every node in every graph carries an @type and an @id on this origin", () => {
  for (const [name, document] of EVERY_GRAPH()) {
    for (const node of nodes(document)) {
      assert.equal(typeof node["@type"], "string", `${name}: node has an @type`);
      assert.ok(
        String(node["@id"]).startsWith(ORIGIN),
        `${name}: ${node["@id"]} is on this origin`,
      );
    }
  }
});

// --- the parity rule -------------------------------------------------------

test("no builder emits a rating, a review count or a keyword list", () => {
  const forbidden = [
    "aggregateRating",
    "ratingValue",
    "reviewRating",
    "ratingCount",
    "reviewCount",
    "bestRating",
    "worstRating",
    "keywords",
  ];

  for (const [name, document] of EVERY_GRAPH()) {
    const keys = everyKey(document);
    for (const property of forbidden) {
      assert.ok(!keys.has(property), `${name} must not emit ${property}`);
    }
  }
});

test("no builder leaks a null, an undefined or an empty string", () => {
  for (const [name, document] of EVERY_GRAPH()) {
    for (const value of everyValue(document)) {
      assert.notEqual(value, null, `${name} leaks a null`);
      assert.notEqual(value, undefined, `${name} leaks an undefined`);
      assert.notEqual(value, "", `${name} leaks an empty string`);
    }
  }
});

test("an absent field is absent, not null", () => {
  // The bare tool has no URL and none of the four voice fields.
  const software = at(toolJsonLd(BARE_TOOL), 0);
  assert.equal(software["@type"], "SoftwareApplication");
  assert.ok(!("url" in software), "a tool with no URL emits no url property");

  const article = at(
    noteJsonLd({ slug: "a-musing", title: "A musing", date: "2026-08-01", image: null }),
    0,
  );
  assert.ok(!("image" in article), "a note with no image emits no image property");
});

test("every {@id} reference resolves inside its own graph", () => {
  /**
   * A bare `{"@id": ...}` is a reference. Anything with other keys is a
   * definition, and definitions do not have to resolve to anything.
   *
   * @param {unknown} value
   * @returns {boolean}
   */
  const isRef = (value) =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    "@id" in value;

  /**
   * @param {unknown} value
   * @param {string[]} out
   * @returns {string[]}
   */
  const refsIn = (value, out = []) => {
    if (value === null || typeof value !== "object") return out;
    if (Array.isArray(value)) {
      for (const item of value) refsIn(item, out);
      return out;
    }
    if (isRef(value)) {
      out.push(String(/** @type {Record<string, any>} */ (value)["@id"]));
    } else {
      for (const inner of Object.values(value)) refsIn(inner, out);
    }
    return out;
  };

  for (const [name, document] of EVERY_GRAPH()) {
    const defined = new Set(nodes(document).map((node) => node["@id"]));
    for (const reference of refsIn(document["@graph"])) {
      assert.ok(
        defined.has(reference),
        `${name}: ${reference} is defined in the same graph`,
      );
    }
  }
});

// --- URLs ------------------------------------------------------------------

test("pageUrl builds the directory-format URL Astro actually serves", () => {
  assert.equal(pageUrl("/"), `${ORIGIN}/`);
  assert.equal(pageUrl("/tools"), `${ORIGIN}/tools/`);
  assert.equal(pageUrl("/tools/paperclip"), `${ORIGIN}/tools/paperclip/`);
  // Idempotent, so a caller that already has the slash cannot double it.
  assert.equal(pageUrl("/tools/"), `${ORIGIN}/tools/`);
});

test("anchorUrl points at a row on a page that has no page of its own", () => {
  assert.equal(anchorUrl("/experiments", "aayushos"), `${ORIGIN}/experiments/#aayushos`);
});

// --- home ------------------------------------------------------------------

test("home is a WebSite authored and published by the Person it names", () => {
  const document = homeJsonLd();
  assert.deepEqual(typesIn(document), ["WebSite", "Person"]);

  const site = at(document, 0);
  assert.equal(site["@id"], WEBSITE_ID);
  assert.equal(site["author"]["@id"], PERSON_ID);
  assert.equal(site["publisher"]["@id"], PERSON_ID);

  const aayush = at(document, 1);
  assert.equal(aayush["@id"], PERSON_ID);
  assert.deepEqual(aayush["sameAs"], [
    "https://github.com/aayushmanchanda2",
    "https://x.com/amanchanda7",
  ]);
});

test("the Person is long-form on home and compact everywhere else", () => {
  assert.ok(person(true)["description"], "home carries the description its hero states");
  assert.ok(
    !("description" in person()),
    "a tool page carries no biography, because it shows none",
  );
  // What stays is what the footer and the site mark make visible on every page.
  assert.deepEqual(Object.keys(person()), ["@type", "@id", "name", "url", "sameAs"]);
});

// --- lists -----------------------------------------------------------------

test("a list counts what it carries and numbers it from one", () => {
  const entries = [
    { name: "One", url: `${ORIGIN}/tools/one/` },
    { name: "Two", url: `${ORIGIN}/tools/two/` },
    { name: "Three", url: `${ORIGIN}/tools/three/` },
  ];
  const list = at(listJsonLd({ name: "Tools", path: "/tools", entries }), 0);

  assert.equal(list["@type"], "ItemList");
  assert.equal(list["name"], "Tools");
  assert.equal(list["url"], `${ORIGIN}/tools/`);
  assert.equal(list["numberOfItems"], 3);
  assert.deepEqual(
    list["itemListElement"].map((/** @type {Record<string, any>} */ item) => item["position"]),
    [1, 2, 3],
  );
  assert.deepEqual(
    list["itemListElement"].map((/** @type {Record<string, any>} */ item) => item["url"]),
    entries.map((entry) => entry.url),
  );
});

test("an empty section still reports an honest zero", () => {
  const list = at(listJsonLd({ name: "Notes", path: "/notes", entries: [] }), 0);
  assert.equal(list["numberOfItems"], 0);
});

test("a reading row keeps its off-site URL, because that is where the row goes", () => {
  const url = "https://x.com/benln/status/2006057848430604705";
  const list = at(
    listJsonLd({ name: "Reading", path: "/reading", entries: [{ name: "A post", url }] }),
    0,
  );

  assert.equal(list["itemListElement"][0]["url"], url);
});

test("only a filter page gets a crumb, because only a filter page draws one", () => {
  const section = listJsonLd({ name: "Tools", path: "/tools", entries: [] });
  assert.deepEqual(typesIn(section), ["ItemList"]);

  const filter = listJsonLd({
    name: "agent infra",
    path: "/tools/category/agent-infra",
    parent: { name: "Tools", path: "/tools" },
    entries: [],
  });
  assert.deepEqual(typesIn(filter), ["ItemList", "BreadcrumbList"]);

  const crumbs = at(filter, 1)["itemListElement"];
  assert.deepEqual(
    crumbs.map((/** @type {Record<string, any>} */ step) => [
      step["position"],
      step["name"],
      step["item"],
    ]),
    [
      [1, "Tools", `${ORIGIN}/tools/`],
      [2, "agent infra", `${ORIGIN}/tools/category/agent-infra/`],
    ],
    "two steps: the crumb the page prints, then the page itself",
  );
});

// --- tools -----------------------------------------------------------------

test("a tool is a SoftwareApplication reviewed by the Person", () => {
  const document = toolJsonLd(FULL_TOOL);
  assert.deepEqual(typesIn(document), [
    "SoftwareApplication",
    "Review",
    "Person",
    "BreadcrumbList",
  ]);

  const software = at(document, 0);
  assert.equal(software["name"], "Paperclip");
  assert.equal(software["url"], FULL_TOOL.url);
  assert.equal(software["applicationCategory"], "agent infra");

  const review = at(document, 1);
  assert.equal(review["itemReviewed"]["@id"], software["@id"]);
  assert.equal(review["author"]["@id"], PERSON_ID);
  assert.equal(review["datePublished"], "2026-08-17");
  assert.equal(review["url"], `${ORIGIN}/tools/paperclip/`);
});

test("the opinion lives on the review, never on the software", () => {
  const document = toolJsonLd(FULL_TOOL);
  assert.ok(
    !("description" in at(document, 0)),
    "his take is not the product's own description",
  );
  assert.ok(at(document, 1)["reviewBody"].includes(FULL_TOOL.note));
});

test("reviewBody is the page's own sentences, in the order the page stacks them", () => {
  assert.equal(
    reviewBody(FULL_TOOL),
    [FULL_TOOL.note, FULL_TOOL.why, FULL_TOOL.like, FULL_TOOL.dislike, FULL_TOOL.try].join(
      "\n\n",
    ),
  );
  // A null field renders no block on the page, so it contributes nothing here.
  assert.equal(reviewBody(BARE_TOOL), BARE_TOOL.note);
});

// --- sites -----------------------------------------------------------------

test("a site page is about the site, and owns the screenshot", () => {
  const document = siteJsonLd(SITE);
  assert.deepEqual(typesIn(document), ["WebPage", "ImageObject", "BreadcrumbList"]);

  const page = at(document, 0);
  const shot = at(document, 1);

  assert.equal(page["name"], "Save.design");
  assert.equal(page["url"], `${ORIGIN}/sites/save-design/`);
  assert.equal(page["dateCreated"], "2026-08-26");

  // Theirs.
  assert.deepEqual(page["about"], {
    "@type": "WebSite",
    name: "Save.design",
    url: "https://save.design",
  });

  // Ours.
  assert.equal(page["primaryImageOfPage"]["@id"], shot["@id"]);
  assert.equal(shot["contentUrl"], `${ORIGIN}/shots/save-design.webp`);
  assert.equal(shot["caption"], "Full page of Save.design", "the frame's own alt text");
});

// --- notes -----------------------------------------------------------------

test("a note is an Article by the Person, dated the day it shows", () => {
  const document = noteJsonLd({
    slug: "building-this-site",
    title: "Building this site",
    date: "2026-08-26",
    image: "/notes/whiteboard.webp",
  });
  assert.deepEqual(typesIn(document), ["Article", "Person", "BreadcrumbList"]);

  const article = at(document, 0);
  assert.equal(article["headline"], "Building this site");
  assert.equal(article["name"], article["headline"]);
  assert.equal(article["datePublished"], "2026-08-26");
  assert.equal(article["author"]["@id"], PERSON_ID);
  assert.equal(article["image"], `${ORIGIN}/notes/whiteboard.webp`);
});

// --- serialisation ---------------------------------------------------------

test("serialize round-trips to the same document", () => {
  for (const [name, document] of EVERY_GRAPH()) {
    assert.deepEqual(
      /** @type {JsonLd} */ (JSON.parse(serialize(document))),
      document,
      name,
    );
  }
});

test("serialize cannot end the script block early", () => {
  const hostile = toolJsonLd({
    ...BARE_TOOL,
    note: 'Ends the block: </script><img src=x onerror="alert(1)"> & then some.',
  });

  const output = serialize(hostile);
  assert.ok(!output.includes("<"), "no raw < survives");
  assert.ok(!output.includes(">"), "no raw > survives");
  assert.ok(!output.includes("&"), "no raw & survives");
  assert.ok(!/<\/script/i.test(output), "the closing tag cannot appear at all");

  // And the escaping is lossless: a parser gets the original sentence back.
  const review = nodes(/** @type {JsonLd} */ (JSON.parse(output))).find(
    (node) => node["@type"] === "Review",
  );
  assert.ok(review, "the review survived");
  assert.ok(review["reviewBody"].includes("</script>"));
});

test("serialize escapes the two line separators", () => {
  /*
   * Written as escapes, not as the characters themselves. Both are valid inside
   * a JavaScript string and completely invisible in an editor, so pasting the
   * real thing into this file would leave a test nobody can read and nobody can
   * grep for.
   */
  const U2028 = "\u2028";
  const U2029 = "\u2029";
  const note = `before${U2028}and${U2029}after`;

  const output = serialize(toolJsonLd({ ...BARE_TOOL, note }));

  assert.ok(!output.includes(U2028), "U+2028 goes out escaped");
  assert.ok(!output.includes(U2029), "U+2029 goes out escaped");

  const review = nodes(/** @type {JsonLd} */ (JSON.parse(output))).find(
    (node) => node["@type"] === "Review",
  );
  assert.ok(review, "the review survived");
  assert.equal(review["reviewBody"], note);
});
