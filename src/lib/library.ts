/**
 * The /library data boundary.
 *
 * Same contract as `lib/tools.ts` and `lib/sites.ts`: `src/data/library.json` is
 * untrusted input until it has been parsed here, everything runs once at build
 * time, and the first bad entry throws instead of rendering. Nothing here uses
 * an `as` cast to skip that work.
 *
 * The generic half of the parse comes from `lib/parse.ts`, shared with the other
 * three boundaries. What stayed here is what only /library knows: the kind
 * vocabulary, the note that is allowed to be absent, the domain cross-check, the
 * four objects an entry may carry and the kind each one belongs to, and every
 * error message.
 *
 * Six of an entry's twelve fields are optional, and every one of them reads the
 * same way: absent and `null` both mean nothing, and anything present has to be
 * whole. That is not a style preference. A saved link starts as a URL and a date
 * and grows the rest over months — tags when it is filed, a post or a video when
 * the pipeline can read one, a draft when Hermes writes one, a why when Aayush
 * does — so most entries are missing most of this most of the time, and a parser
 * that could not say "nothing yet" would have nothing true to say about them.
 *
 * Every entry has a page, and that is a reversal. /library used to be the one
 * section where a row's destination was the thing itself: a page holding one
 * line I wrote and a button to leave would be a stop on the way to the thing,
 * so only a digested entry earned `/library/<slug>` and everything else linked
 * straight out.
 *
 * What changed is not the argument, it is the entry. A saved link now arrives
 * carrying tags, and a post or a video arrives carrying the thing itself — the
 * whole post the row can only quote 280 characters of, the poster frame a
 * reader can press. That is a page with something on it before anyone has read
 * a word, so the old refusal was refusing a stub that no longer exists.
 * `digested` below is still the gate on the *digest*, which is what a detail
 * page holds when there is one and what `Review` in the graph is still keyed
 * on; it is no longer the gate on the page.
 *
 * The slug is therefore a URL for every entry. It is also still the key the
 * publish pipeline writes into `pipeline/state.json` to remember that a
 * bookmark has already been published, which is why it is parsed and held
 * unique whatever the routes do with it.
 *
 * The pipeline still calls this section `reading`, and that is deliberate: its
 * section key is the name of the Raindrop collection Aayush saves into
 * (`Publish/Reading`), which is his to rename and not this repo's. The
 * translation happens once, at the line in `pipeline/state.mjs` that names the
 * file this module reads.
 */

/*
 * Both imports are spelled the long way — the `.ts` extension, and the JSON one
 * with its type attribute — so that Node can load this module and not only
 * Vite. That is what `lib/library.test.mjs` needs: the six readers below are
 * where every rule about this file's shape actually lives, and until these two
 * lines were written the only thing exercising them was `astro build` reading a
 * file that happened to be valid. That proves the happy path and nothing else.
 *
 * Both spellings are the standard ones and the bundler takes them unchanged.
 * `lib/tools.ts` and `lib/sites.ts` still use the short forms and are still
 * untested; this is the file that had a reason to move first.
 */
import type { Fail } from "./parse.ts";
import { SLUG, readers, routeSlug } from "./parse.ts";

import rawLibrary from "../data/library.json" with { type: "json" };

/**
 * What a saved link is. Ordered as the page and the filter bar order them:
 * longest sit-down first, so a reader scanning for something to actually read
 * meets `article` before `post`.
 */
export const KINDS = ["article", "post", "video"] as const;

export type Kind = (typeof KINDS)[number];

/**
 * The plural of each kind, for a heading or a tab.
 *
 * Here rather than in either of the two files that render it: the tab row and
 * the kind page's own `h1` are two surfaces naming the same three things, and
 * the first one to disagree would be the one nobody notices. `Record<Kind, …>`,
 * so a fourth kind will not compile until it has been named.
 */
export const KIND_LABELS: Record<Kind, string> = {
  article: "Articles",
  post: "Posts",
  video: "Videos",
};

/**
 * The digest a saved link may carry: what the piece says, and whether reading
 * it is worth your time. Written by the Hermes digest skill after actually
 * reading the source, never from the title alone, which is why the whole
 * object is optional: an entry either has a real digest or it has none.
 *
 * All four fields are required once the object is there. A digest with bullets
 * and no verdict is a summary, and a summary was never the point — the verdict
 * and the why are what earn the entry its page.
 */
export interface Digest {
  /** Three to five load-bearing claims from the piece, one line each. */
  bullets: string[];
  /** The read-it-or-skip-it call, one sentence, a real opinion. */
  verdict: string;
  /** Why it matters, or doesn't. About the reader's time, not the piece. */
  why: string;
  /** ISO calendar date (YYYY-MM-DD) the digest was written. The opinion's date. */
  digested: string;
}

/**
 * The video services a `video` entry can carry structured data for.
 *
 * One member, and a second one is a decision rather than a string. A provider
 * on this list means two commitments at once: a URL shape `pipeline/thumb.mjs`
 * can read an id out of, and a thumbnail host this repo is willing to fetch
 * from at publish time so the picture ends up committed here instead of hotlinked
 * from someone else's CDN. Vimeo is both of those plus a branch in that module,
 * so the vocabulary is written down where the parser can refuse anything else.
 */
export const PROVIDERS = ["youtube"] as const;

export type Provider = (typeof PROVIDERS)[number];

/**
 * An x.com post, as the pipeline read it back off the page.
 *
 * Present only on a `post` entry, and only when Firecrawl could actually read
 * the post: a login wall, a deleted tweet or a document shaped differently than
 * it was leaves this null, and the row falls back to what Raindrop saw. Null is
 * the ordinary answer for every post saved before this field existed.
 *
 * All five fields are required once the object is there, on the same reasoning
 * as `Digest`. This is what a post card renders, and a card with no author or
 * no date is a card with a hole in it — so a half-read post is no post.
 *
 * `text` is the whole thing. `title` and `note` hold clipped copies, because
 * those two are a row and this is a card.
 */
export interface Post {
  /** Display name, spelled as the poster spells it. The handle when they have none. */
  author: string;
  /** The @handle, without the @. */
  handle: string;
  /**
   * ISO calendar date (YYYY-MM-DD) the post was POSTED.
   *
   * Deliberately not `saved_date`, which is the day the link reached this site.
   * A post from 2024 saved last week is two different facts, and a card that
   * showed the second one where the first belongs would misdate the quote.
   */
  date: string;
  /** The post's own words, markdown decoration flattened out, whole. */
  text: string;
  /**
   * Pictures and video stills belonging to the post, as local paths under
   * `/shots/`. A remote URL is refused rather than stored, which is the privacy
   * rule made structural: a page that renders this array cannot reach x.com's
   * CDN, because there is no shape it could hold that would let it.
   *
   * Empty on every entry today, and that is a measurement rather than a plan.
   * Firecrawl's `x-twitter` post-processor was probed against three real posts
   * that carry media — an image thread, a demo video, a screen recording — and
   * its markdown holds no image references and no `pbs.twimg.com` links in any
   * of them. Attached media arrives as an opaque `t.co` shortlink inside the
   * text, indistinguishable from a link the poster typed. So the field is the
   * shape a fuller source would fill, and nothing fills it yet.
   */
  media: string[];
}

/** A video entry's provider, its id there, and the still we committed. */
export interface Video {
  provider: Provider;
  /** The id at the provider — `xoE_pE26yDQ`, not the whole watch URL. */
  id: string;
  /**
   * Web path under `/shots` to the poster frame, fetched from the provider at
   * publish time and re-encoded here. Committed rather than hotlinked so the
   * page loads a video's picture without asking Google who is looking at it.
   */
  thumb: string;
}

/**
 * A drafted opinion, written by Hermes from the saved piece and labelled as
 * such wherever it renders.
 *
 * A separate type from `Digest` and not a looser version of one. A digest is
 * something Aayush's own agent produced after reading the whole piece and
 * committing to a verdict; a draft is a placeholder holding the page open until
 * he has read it himself. Folding the two together would let the site render an
 * unearned opinion in his voice, so they cannot share a field.
 *
 * `bullets` and `why` are each optional and one of them must be there. A draft
 * with neither is not an empty draft — it is no draft, and it is written as
 * null. `why` here is always third person and always sourced from the piece
 * itself; the moment Aayush writes his own, it moves to the entry's top-level
 * `why` and stops being a draft at all.
 */
export interface Draft {
  bullets: string[] | null;
  why: string | null;
  /** ISO calendar date (YYYY-MM-DD) the draft was written. The label's date. */
  drafted: string;
}

export interface LibraryEntry {
  /** URL-safe id, and the detail page's URL. Every entry has one. */
  slug: string;
  title: string;
  url: string;
  /** Hostname without `www.`; also the filter page (`/library/domain/<slug>`). */
  domain: string;
  /** ISO calendar date (YYYY-MM-DD) the link was saved. */
  saved_date: string;
  kind: Kind;
  /**
   * One line in Aayush's voice, rendered as-is, or null.
   *
   * Null is a real answer rather than an empty string: the pipeline publishes a
   * bookmark whether or not Raindrop gave it an excerpt, and a row with nothing
   * to say should say nothing instead of reserving a blank line to say it in.
   */
  note: string | null;
  /**
   * The digest, or null. Null is the ordinary case: most saves have not been
   * read yet. Its page renders what the entry does have and says nothing where
   * this is null, which is the honest-absence rule one grain below a section.
   */
  digest: Digest | null;
  /**
   * What this link is about, in Aayush's words, as route segments.
   *
   * The same curation model /sites runs on and the same rule about spelling:
   * every member is already the slug, because the value IS the route segment
   * (`/library/tag/<x>`) and the join key at once. Folding "Go To Market" down
   * here instead of refusing it would make the file's contents and the site's
   * routes two different strings.
   *
   * Absent reads as none, which is the ordinary case for a link nobody has
   * filed yet. A present-but-empty array is refused: it means something wrote a
   * blank where it meant to write nothing, and `note` above already explains
   * why that is worth hearing about.
   */
  tags: string[];
  /** What the post said, on a `post` entry the pipeline could read. Else null. */
  post: Post | null;
  /** The provider, the id and the committed still, on a `video` entry. Else null. */
  video: Video | null;
  /** Hermes' placeholder opinion, labelled as one wherever it renders. Or null. */
  draft: Draft | null;
  /**
   * Why this is worth someone's time, in Aayush's own voice, or null.
   *
   * The register is fixed by the field name rather than by a flag on a shared
   * object. `draft.why` is Hermes writing about a piece in the third person and
   * this is Aayush writing in the first, and no rendering bug that drops a
   * source enum can turn one into the other, because there is no enum to drop.
   *
   * When he writes his own, it lands here and leaves `draft.why` null — a field
   * move, not a relabel. If that empties the draft, the draft becomes null.
   */
  why: string | null;
}

/** An entry somebody has actually read. What the `Review` node is built from. */
export type DigestedEntry = LibraryEntry & { digest: Digest };

/**
 * Both groups are `type` rather than `interface` for the reason spelled out in
 * `lib/tools.ts`: they are handed to `getStaticPaths` as a route's props, and
 * only a type alias gets the implicit index signature Astro expects there.
 */
export type KindGroup = {
  kind: Kind;
  entries: LibraryEntry[];
};

export type LibraryDomainGroup = {
  domain: string;
  slug: string;
  entries: LibraryEntry[];
};

/**
 * A tag, and everything filed under it.
 *
 * One field where `LibraryDomainGroup` has two, and the missing one is the
 * point. A domain has a spelling and a route segment and they are not the same
 * string, so that group carries both; a tag IS its route segment, enforced by
 * `readTags`, so a second field would be the first one copied.
 */
export type LibraryTagGroup = {
  slug: string;
  entries: LibraryEntry[];
};

/* ---------------------------------------------------------------------------
   Parsing
   --------------------------------------------------------------------------- */

const KIND_NAMES: readonly string[] = KINDS;

const PROVIDER_NAMES: readonly string[] = PROVIDERS;

const READ = readers("library.json");
/** Annotated, or TypeScript stops treating a call as the end of control flow. */
const fail: Fail = READ.fail;
const { readString, readDate, readOptional, isRecord } = READ;

function isKind(value: unknown): value is Kind {
  return typeof value === "string" && KIND_NAMES.includes(value);
}

function isProvider(value: unknown): value is Provider {
  return typeof value === "string" && PROVIDER_NAMES.includes(value);
}

/**
 * A path into `public/shots`, spelled exactly the way the pipeline writes one.
 *
 * The same regex `lib/sites.ts` holds for a screenshot, and it is here for a
 * second reason on top of "is this a real path". `pipeline/state.mjs` sweeps
 * `public/shots` every run and deletes any file matching this shape that no
 * entry points at — so a picture stored under a name this pattern does not
 * recognise would survive forever as litter, and a path this pattern accepts
 * that no file backs would render as a broken image. Writer and sweeper agree
 * on one spelling, and this is the parser holding them to it.
 */
const SHOT_PATH = /^\/shots\/[a-z0-9][a-z0-9-]*\.webp$/;

/** Returns the parsed URL so the caller can cross-check the domain against it. */
function readUrl(entry: Record<string, unknown>, where: string): URL {
  const value = readString(entry, "url", where);

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail(where, `has a "url" that does not parse: ${JSON.stringify(value)}`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    fail(where, `has a "url" that is not http(s): ${JSON.stringify(value)}`);
  }
  return parsed;
}

/**
 * The domain is a route, a label and a filter key at once, so it has to agree
 * with the URL it claims to describe. Same rule as /sites, for the same reason:
 * a typo here would mint a filter page for a host nothing links to.
 */
function readDomain(
  entry: Record<string, unknown>,
  url: URL,
  where: string,
): string {
  const value = readString(entry, "domain", where);
  const expected = url.hostname.replace(/^www\./, "");

  if (value !== expected) {
    fail(
      where,
      `has "domain" ${JSON.stringify(value)} but its url points at ${JSON.stringify(expected)}`,
    );
  }
  return value;
}

/**
 * Absent, explicitly null, or a sentence. A present-but-empty note is rejected
 * rather than quietly folded into null: it means something upstream wrote a
 * blank where it meant to write nothing, and that is worth hearing about.
 */
function readNote(entry: Record<string, unknown>, where: string): string | null {
  const value = entry["note"];
  if (value === undefined || value === null) return null;

  if (typeof value !== "string" || value.trim() === "") {
    fail(
      where,
      `needs "note" to be a non-empty string, null, or absent (got ${JSON.stringify(value)})`,
    );
  }
  return value;
}

/**
 * Absent, explicitly null, or the whole thing. A digest is one judgement, so a
 * partial one — bullets with no verdict, a verdict with no date — is a
 * half-finished edit and stops the build the way every other half-finished
 * edit here does.
 *
 * Bullets are held to one line each. The detail page renders them as list
 * items and the markdown variant renders them as `- ` lines, and a newline
 * inside one would quietly become a second, unmarked bullet in the second
 * rendering only.
 */
function readDigest(entry: Record<string, unknown>, where: string): Digest | null {
  const value = entry["digest"];
  if (value === undefined || value === null) return null;

  if (!isRecord(value)) {
    fail(where, `needs "digest" to be an object, null, or absent (got ${JSON.stringify(value)})`);
  }

  const raw = value["bullets"];
  if (!Array.isArray(raw) || raw.length === 0) {
    fail(where, `needs "digest.bullets" to be a non-empty array of one-line strings`);
  }
  const bullets = raw.map((bullet: unknown, index): string => {
    if (typeof bullet !== "string" || bullet.trim() === "" || bullet.includes("\n")) {
      fail(
        where,
        `needs "digest.bullets" entry ${index} to be one non-empty line (got ${JSON.stringify(bullet)})`,
      );
    }
    return bullet;
  });

  return {
    bullets,
    verdict: readString(value, "verdict", `${where} digest`),
    why: readString(value, "why", `${where} digest`),
    digested: readDate(value, "digested", `${where} digest`),
  };
}

/**
 * Absent, explicitly null, or a list of slugs nothing repeats.
 *
 * Held to `SLUG` rather than folded, for the reason the field's own comment
 * gives: the string is the route. Held to non-empty when present for the reason
 * `readNote` gives about a blank note. The pipeline leaves the key out when a
 * bookmark carries no tags, so a `[]` in this file came from a hand-edit that
 * meant to delete the key and stopped halfway.
 */
function readTags(entry: Record<string, unknown>, where: string): string[] {
  const value = entry["tags"];
  if (value === undefined || value === null) return [];

  if (!Array.isArray(value)) {
    fail(where, `needs "tags" to be an array of slugs, or to leave the key out entirely`);
  }
  if (value.length === 0) {
    fail(where, `has an empty "tags" array; leave the key out to say it has no tags`);
  }

  const seen = new Set<string>();

  return value.map((tag: unknown, index): string => {
    if (typeof tag !== "string" || !SLUG.test(tag)) {
      fail(
        where,
        `has a "tags" entry at ${index} that is not a URL-safe slug ` +
          `(lowercase, digits, single hyphens): ${JSON.stringify(tag)}`,
      );
    }
    if (seen.has(tag)) fail(where, `lists the tag "${tag}" twice`);
    seen.add(tag);
    return tag;
  });
}

/**
 * The one shape a picture on a /library entry may take.
 *
 * Refusing a remote URL is the whole function. A `https://pbs.twimg.com/…` in
 * this field would render as an `<img>` pointed at x.com's CDN, which hands
 * every reader of this page to a third party and breaks a promise `/privacy`
 * makes by name. There is no flag to turn that on: the parser will not carry
 * the value, so no page can render it.
 */
function readShotPath(
  value: unknown,
  field: string,
  where: string,
): string {
  if (typeof value !== "string" || !SHOT_PATH.test(value)) {
    fail(
      where,
      `needs "${field}" to be a committed picture under /shots ` +
        `(\`/shots/<name>.webp\`), never a remote URL (got ${JSON.stringify(value)})`,
    );
  }
  return value;
}

/**
 * Absent, explicitly null, or a whole post. Only on a `post` entry.
 *
 * The kind cross-check is the same rule `readDomain` applies to the URL: a
 * field that describes something the entry is not means two edits disagreed,
 * and the second one to be written is not necessarily the right one — so
 * neither wins and the build stops.
 */
function readPost(
  entry: Record<string, unknown>,
  kind: Kind,
  where: string,
): Post | null {
  const value = entry["post"];
  if (value === undefined || value === null) return null;

  if (kind !== "post") {
    fail(where, `is a ${kind} carrying a "post" object; only a post entry can have one`);
  }
  if (!isRecord(value)) {
    fail(where, `needs "post" to be an object, null, or absent (got ${JSON.stringify(value)})`);
  }

  const raw = value["media"];
  const media =
    raw === undefined || raw === null
      ? []
      : Array.isArray(raw) && raw.length > 0
        ? raw.map((item: unknown, index) => readShotPath(item, `post.media[${index}]`, where))
        : fail(
            where,
            `needs "post.media" to be a non-empty array of /shots paths, or to leave the key out`,
          );

  return {
    author: readString(value, "author", `${where} post`),
    handle: readString(value, "handle", `${where} post`),
    date: readDate(value, "date", `${where} post`),
    text: readString(value, "text", `${where} post`),
    media,
  };
}

/** Absent, explicitly null, or a whole video. Only on a `video` entry. */
function readVideo(
  entry: Record<string, unknown>,
  kind: Kind,
  where: string,
): Video | null {
  const value = entry["video"];
  if (value === undefined || value === null) return null;

  if (kind !== "video") {
    fail(where, `is a ${kind} carrying a "video" object; only a video entry can have one`);
  }
  if (!isRecord(value)) {
    fail(where, `needs "video" to be an object, null, or absent (got ${JSON.stringify(value)})`);
  }

  const provider = value["provider"];
  if (!isProvider(provider)) {
    fail(
      where,
      `needs "video.provider" to be one of ${PROVIDERS.join(", ")} (got ${JSON.stringify(provider)})`,
    );
  }

  return {
    provider,
    id: readString(value, "id", `${where} video`),
    thumb: readShotPath(value["thumb"], "video.thumb", where),
  };
}

/**
 * Absent, explicitly null, or a draft with something in it.
 *
 * Looser than `readDigest` in exactly one place and stricter in another. A
 * draft may carry bullets without a why or a why without bullets, because it is
 * a placeholder and half of one is still useful; a digest may not, because it
 * is a judgement and half of one is a summary. But a draft with neither is
 * refused outright rather than read as an empty object, which is what makes the
 * why-promotion a field move with no cleanup step: moving the last sentence out
 * of a draft leaves nothing behind, and nothing is spelled `null`.
 */
function readDraft(entry: Record<string, unknown>, where: string): Draft | null {
  const value = entry["draft"];
  if (value === undefined || value === null) return null;

  if (!isRecord(value)) {
    fail(where, `needs "draft" to be an object, null, or absent (got ${JSON.stringify(value)})`);
  }

  const raw = value["bullets"];
  let bullets: string[] | null = null;
  if (raw !== undefined && raw !== null) {
    if (!Array.isArray(raw) || raw.length === 0) {
      fail(where, `needs "draft.bullets" to be a non-empty array of one-line strings, or absent`);
    }
    bullets = raw.map((bullet: unknown, index): string => {
      if (typeof bullet !== "string" || bullet.trim() === "" || bullet.includes("\n")) {
        fail(
          where,
          `needs "draft.bullets" entry ${index} to be one non-empty line (got ${JSON.stringify(bullet)})`,
        );
      }
      return bullet;
    });
  }

  const why = readOptional(value, "why", `${where} draft`);
  if (bullets === null && why === null) {
    fail(where, `has a "draft" with neither bullets nor a why; an empty draft is written as null`);
  }

  return { bullets, why, drafted: readDate(value, "drafted", `${where} draft`) };
}

export function parseLibrary(value: unknown): LibraryEntry[] {
  if (!Array.isArray(value)) fail("root", "must be a JSON array of library entries");
  if (value.length === 0) fail("root", "must hold at least one library entry");

  const slugs = new Set<string>();

  const parsed = value.map((item: unknown, index): LibraryEntry => {
    const where = `entry ${index}`;
    if (!isRecord(item)) fail(where, "must be an object");

    const slug = readString(item, "slug", where);
    if (!SLUG.test(slug)) {
      fail(where, `has a slug that is not URL-safe: ${JSON.stringify(slug)}`);
    }
    if (slugs.has(slug)) {
      fail(where, `repeats the slug "${slug}"; slugs are the pipeline's key and must be unique`);
    }
    slugs.add(slug);

    const kind = item["kind"];
    if (!isKind(kind)) {
      fail(where, `needs "kind" to be one of ${KINDS.join(", ")} (got ${JSON.stringify(kind)})`);
    }

    const url = readUrl(item, where);

    return {
      slug,
      title: readString(item, "title", where),
      // Returned as authored, not as `url.href`, which would rewrite a bare
      // origin with a trailing slash and change what the row shows.
      url: readString(item, "url", where),
      domain: readDomain(item, url, where),
      saved_date: readDate(item, "saved_date", where),
      kind,
      note: readNote(item, where),
      digest: readDigest(item, where),
      tags: readTags(item, where),
      post: readPost(item, kind, where),
      video: readVideo(item, kind, where),
      draft: readDraft(item, where),
      why: readOptional(item, "why", where),
    };
  });

  // Domains become routes too, so two spellings must not land on one page.
  const claimed = new Map<string, string>();
  for (const entry of parsed) {
    const slug = routeSlug(entry.domain);
    const where = `entry for "${entry.slug}"`;
    if (slug === "") {
      fail(where, `has a domain with no URL-safe characters: ${JSON.stringify(entry.domain)}`);
    }
    const owner = claimed.get(slug);
    if (owner !== undefined && owner !== entry.domain) {
      fail(
        where,
        `has domain ${JSON.stringify(entry.domain)}, which collides with ${JSON.stringify(owner)} at /library/domain/${slug}`,
      );
    }
    claimed.set(slug, entry.domain);
  }

  return parsed;
}

/**
 * Where an entry sends a reader. Its own page, always.
 *
 * **This is the seam, and it no longer branches.** It used to: a digested
 * entry linked its page and an undigested one linked straight out, and the
 * branch lived here so the four surfaces that need the answer could not
 * disagree — the row on every list page (`components/LibraryList.astro`), the
 * card on the posts wall (`components/TweetCard.astro`), the title on a video
 * tile (`components/VideoFacade.astro`), and the `ItemList` node describing
 * all three (`lib/schema.ts › libraryRowUrl`). Every entry has a page now, so
 * there is one answer, and it is still spelled once here rather than four
 * times — a `/library/<slug>` template copied into a component is how one
 * surface ends up pointing somewhere the other three stopped.
 *
 * **It returned `{ href, external }` and now returns a string**, which is the
 * other half of the same reversal. `external` earned its place by deciding
 * `rel="noopener nofollow"`, `target="_blank"` and the `.ext` arrow together
 * (design.md §5) while half the answers were off-site; a flag that is false
 * for every entry on every page is a ternary in three components that can
 * only ever take one branch. The one outbound control a row still carries is
 * its Source link, and that one is off-site unconditionally, so it names its
 * own attributes the way `VideoFacade.astro`'s play control already does.
 */
export function entryHref(entry: Pick<LibraryEntry, "slug">): string {
  return `/library/${entry.slug}`;
}

/* ---------------------------------------------------------------------------
   Derived views — computed once, at build time
   --------------------------------------------------------------------------- */

/** Newest save first; ties keep the order they were written in the JSON. */
export const library: LibraryEntry[] = parseLibrary(rawLibrary)
  .map((entry, index) => ({ entry, index }))
  .sort((a, b) =>
    a.entry.saved_date === b.entry.saved_date
      ? a.index - b.index
      : b.entry.saved_date.localeCompare(a.entry.saved_date),
  )
  .map(({ entry }) => entry);

/**
 * The entries somebody has actually read, in the order the list renders them.
 *
 * This was the route table for `/library/[slug]` and is not any more: `library`
 * is, and the ring the keyboard nav walks is the same list. What survives here
 * is the narrowing — `digest` from `Digest | null` to `Digest` — which is what
 * lets `libraryJsonLd` and `/library.md` read `entry.digest.bullets` without a
 * runtime check, and it is still the gate on the `Review` node in the graph
 * (design.md §7): a page exists for every entry, an opinion does not.
 */
export const digested: DigestedEntry[] = library.filter(
  (entry): entry is DigestedEntry => entry.digest !== null,
);

/** Kinds in vocabulary order, empty ones dropped: no page without entries. */
export const kindGroups: KindGroup[] = KINDS.map((kind) => ({
  kind,
  entries: library.filter((entry) => entry.kind === kind),
})).filter((group) => group.entries.length > 0);

/**
 * Every tag at least one entry carries, alphabetically.
 *
 * Alphabetical rather than by size, the same call `lib/sites.ts` made about its
 * collection row and for the same reason: this is a row of links, and a row
 * that reorders itself whenever something is tagged makes the reader re-find
 * the one they wanted. A tag exists because something is filed under it, so
 * there is no registry to keep and no way to end up with an empty one. Entries
 * inside a group keep the list's own newest-first order.
 */
export const libraryTags: LibraryTagGroup[] = (() => {
  const groups = new Map<string, LibraryTagGroup>();

  for (const entry of library) {
    for (const slug of entry.tags) {
      const group = groups.get(slug);
      if (group) {
        group.entries.push(entry);
      } else {
        groups.set(slug, { slug, entries: [entry] });
      }
    }
  }

  return [...groups.values()].sort((a, b) => a.slug.localeCompare(b.slug));
})();

export const libraryDomains: LibraryDomainGroup[] = (() => {
  const groups = new Map<string, LibraryDomainGroup>();

  for (const entry of library) {
    const group = groups.get(entry.domain);
    if (group) {
      group.entries.push(entry);
    } else {
      groups.set(entry.domain, {
        domain: entry.domain,
        slug: routeSlug(entry.domain),
        entries: [entry],
      });
    }
  }

  return [...groups.values()];
})();
