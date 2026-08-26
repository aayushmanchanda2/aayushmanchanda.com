/**
 * raindrop.mjs — the Raindrop REST v1 boundary.
 *
 * Every response is parsed into our own shapes before it leaves this file. Past
 * here there is no `_id`, no `link`, no `payload.items` — only `Bookmark` and
 * `Collection` — so a shape change at Raindrop breaks one module loudly instead
 * of leaking `undefined` into a JSON entry three steps later.
 *
 * Two rules the rest of the pipeline depends on: collections are addressed BY
 * NAME, never by a committed id (ids are account-specific, and a wrong one
 * would publish someone's private pile); and only the two resolved ids are ever
 * read — no code path lists raindrops from anywhere else.
 */

import { describe, isRecord } from "./util.mjs";

/** @typedef {import("./types.js").Bookmark} Bookmark */
/** @typedef {import("./types.js").Collection} Collection */
/** @typedef {import("./types.js").Section} Section */

const API_BASE = "https://api.raindrop.io/rest/v1";

/** Raindrop's own page ceiling; anything larger is clamped by them. */
const PER_PAGE = 50;

/** 2000 bookmarks in a publish queue means something is very wrong. */
const MAX_PAGES = 40;

/** An infrastructure failure — unreachable API, bad token, missing collection,
 *  or a response we cannot parse. Never a per-item problem. */
export class RaindropError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "RaindropError";
  }
}

/**
 * @param {object} options
 * @param {string} options.token
 * @param {typeof globalThis.fetch} [options.fetch] Injected in tests.
 * @param {string} [options.baseUrl]
 */
export function createClient({ token, fetch = globalThis.fetch, baseUrl = API_BASE }) {
  /**
   * @param {string} path
   * @param {{ method?: string, body?: unknown }} [init]
   * @returns {Promise<Record<string, unknown>>}
   */
  async function request(path, init = {}) {
    const url = `${baseUrl}${path}`;

    /** @type {Response} */
    let response;
    try {
      response = await fetch(url, {
        method: init.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch (error) {
      throw new RaindropError(`Raindrop is unreachable at ${url} — ${describe(error)}`);
    }

    if (response.status === 401 || response.status === 403) {
      throw new RaindropError(
        `Raindrop rejected RAINDROP_TOKEN (HTTP ${response.status}). ` +
          `Mint a fresh test token in the Raindrop App Console and update the secret.`,
      );
    }
    if (!response.ok) {
      throw new RaindropError(`Raindrop returned HTTP ${response.status} for ${path}`);
    }

    /** @type {unknown} */
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new RaindropError(`Raindrop returned a non-JSON body for ${path}`);
    }

    if (!isRecord(payload)) {
      throw new RaindropError(`Raindrop returned ${typeof payload}, expected an object, for ${path}`);
    }
    // Raindrop answers 200 with `result: false` for several soft failures.
    if (payload["result"] === false) {
      const reason = typeof payload["errorMessage"] === "string" ? payload["errorMessage"] : "no reason given";
      throw new RaindropError(`Raindrop refused ${path}: ${reason}`);
    }

    return payload;
  }

  return { request };
}

/** @typedef {ReturnType<typeof createClient>} RaindropClient */

/* ---------------------------------------------------------------------------
   Boundary parsing
   --------------------------------------------------------------------------- */

/** @param {unknown} value @param {string} where @returns {Collection} */
function parseCollection(value, where) {
  if (!isRecord(value)) throw new RaindropError(`${where}: a collection is not an object`);

  const id = value["_id"];
  if (typeof id !== "number" || !Number.isFinite(id)) {
    throw new RaindropError(`${where}: a collection has no numeric "_id"`);
  }

  const title = value["title"];
  if (typeof title !== "string") {
    throw new RaindropError(`${where}: collection ${id} has no string "title"`);
  }

  // Raindrop writes the parent as `{ "$id": 123 }`; older payloads use a bare
  // number. Both mean the same thing, and neither is worth a second code path.
  const parent = value["parent"];
  let parentId = null;
  if (isRecord(parent)) {
    const raw = parent["$id"] ?? parent["_id"];
    if (typeof raw === "number") parentId = raw;
  } else if (typeof parent === "number") {
    parentId = parent;
  }

  return { id, title, parentId };
}

/** @param {Record<string, unknown>} payload @param {string} where @returns {Collection[]} */
function parseCollections(payload, where) {
  const items = payload["items"];
  if (!Array.isArray(items)) throw new RaindropError(`${where}: "items" is not an array`);
  return items.map((item) => parseCollection(item, where));
}

/** @param {unknown} value @param {Section} collection @returns {Bookmark} */
function parseBookmark(value, collection) {
  if (!isRecord(value)) throw new RaindropError(`raindrops/${collection}: an item is not an object`);

  const id = value["_id"];
  if (typeof id !== "number" || !Number.isFinite(id)) {
    throw new RaindropError(`raindrops/${collection}: an item has no numeric "_id"`);
  }

  const link = value["link"];
  if (typeof link !== "string" || link.trim() === "") {
    throw new RaindropError(`raindrops/${collection}: bookmark ${id} has no "link"`);
  }

  const tags = Array.isArray(value["tags"])
    ? value["tags"].filter((tag) => typeof tag === "string")
    : [];

  return {
    id: String(id),
    url: link.trim(),
    title: typeof value["title"] === "string" ? value["title"].trim() : "",
    excerpt: typeof value["excerpt"] === "string" ? value["excerpt"].trim() : "",
    domain: typeof value["domain"] === "string" ? value["domain"] : "",
    collection,
    tags,
  };
}

/* ---------------------------------------------------------------------------
   Operations
   --------------------------------------------------------------------------- */

/**
 * `Publish / Tools` and `publish/tools` are the same collection to a human.
 * @param {string} name @returns {string}
 */
function normalizeName(name) {
  return name
    .toLowerCase()
    .split("/")
    .map((part) => part.trim().replace(/\s+/g, " "))
    .join("/");
}

/**
 * Turn the two collection NAMES into ids. Raindrop lists root and nested
 * collections from two endpoints, and someone asked for "Publish/Tools" may
 * well have built it as a `Tools` child of a `Publish` parent — so both the
 * full parent path and the literal title are matched.
 *
 * @param {RaindropClient} client
 * @param {Record<Section, string>} wanted
 * @returns {Promise<Record<Section, number>>}
 */
export async function resolveCollections(client, wanted) {
  const roots = parseCollections(await client.request("/collections"), "/collections");
  const nested = parseCollections(
    await client.request("/collections/childrens"),
    "/collections/childrens",
  );

  const all = [...roots, ...nested];
  const byId = new Map(all.map((collection) => [collection.id, collection]));

  /** @param {Collection} collection @returns {string} */
  function pathOf(collection) {
    const parts = [collection.title];
    const seen = new Set([collection.id]);
    let cursor = collection;

    while (cursor.parentId !== null) {
      const parent = byId.get(cursor.parentId);
      // A parent outside the two listings, or a cycle, ends the walk: a partial
      // path still matches a literal title, and neither case should hang.
      if (parent === undefined || seen.has(parent.id)) break;
      seen.add(parent.id);
      parts.unshift(parent.title);
      cursor = parent;
    }

    return parts.join("/");
  }

  /** @type {Record<string, number>} */
  const found = {};

  for (const [section, name] of Object.entries(wanted)) {
    const key = normalizeName(name);
    const hit = all.find(
      (collection) =>
        normalizeName(pathOf(collection)) === key || normalizeName(collection.title) === key,
    );

    if (hit === undefined) {
      const visible = all.map(pathOf).join(", ");
      throw new RaindropError(
        `Raindrop collection "${name}" not found — create it, or rename one of: ${visible || "(this token sees no collections)"}`,
      );
    }

    found[section] = hit.id;
  }

  return { tools: found["tools"], sites: found["sites"] };
}

/**
 * Every bookmark in one collection, paged.
 * @param {RaindropClient} client @param {number} collectionId
 * @param {Section} collection @returns {Promise<Bookmark[]>}
 */
export async function fetchBookmarks(client, collectionId, collection) {
  /** @type {Bookmark[]} */
  const out = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await client.request(
      `/raindrops/${collectionId}?perpage=${PER_PAGE}&page=${page}&sort=created`,
    );

    const items = payload["items"];
    if (!Array.isArray(items)) {
      throw new RaindropError(`raindrops/${collectionId}: "items" is not an array`);
    }

    for (const item of items) out.push(parseBookmark(item, collection));
    if (items.length < PER_PAGE) return out;
  }

  return out;
}

/**
 * Add one tag, keeping the ones already there. Raindrop's PUT replaces the
 * whole array, so the merge happens here from the tags the fetch already gave
 * us — no extra read, and no silent wipe of what the user tagged by hand.
 *
 * @param {RaindropClient} client @param {Bookmark} bookmark @param {string} tag
 * @returns {Promise<string[]>} The tag list the bookmark now carries.
 */
export async function tagBookmark(client, bookmark, tag) {
  if (bookmark.tags.includes(tag)) return bookmark.tags;

  const tags = [...bookmark.tags, tag];
  await client.request(`/raindrop/${bookmark.id}`, { method: "PUT", body: { tags } });
  return tags;
}
