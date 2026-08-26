/**
 * The Raindrop boundary: what it refuses, and what it promises not to destroy.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { RaindropError, createClient, fetchBookmarks, tagBookmark } from "./raindrop.mjs";
import { bookmark } from "./fixtures.mjs";

/** @param {(url: URL, init: RequestInit) => Response} handler */
function client(handler) {
  const calls = [];
  const fetch = async (input, init = {}) => {
    calls.push({ url: new URL(String(input)), init });
    return handler(new URL(String(input)), init);
  };
  return { client: createClient({ token: "t", fetch }), calls };
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("a rejected token says which secret to fix, not just '401'", async () => {
  const { client: api } = client(() => new Response("Unauthorized", { status: 401 }));

  await assert.rejects(
    () => api.request("/collections"),
    (error) => {
      assert.ok(error instanceof RaindropError);
      assert.match(error.message, /RAINDROP_TOKEN/);
      assert.match(error.message, /App Console/);
      return true;
    },
  );
});

test("a 200 carrying `result: false` is still a failure", async () => {
  const { client: api } = client(() => json({ result: false, errorMessage: "collection removed" }));

  await assert.rejects(() => api.request("/collections"), /collection removed/);
});

test("an unreachable API names the URL it could not reach", async () => {
  const api = createClient({
    token: "t",
    fetch: async () => {
      throw new TypeError("fetch failed");
    },
  });

  await assert.rejects(() => api.request("/collections"), /unreachable.*fetch failed/);
});

test("a bookmark with no link is a boundary failure, not a half-built entry", async () => {
  const { client: api } = client(() => json({ result: true, items: [{ _id: 1, title: "no link" }] }));

  await assert.rejects(() => fetchBookmarks(api, 11, "sites"), /has no "link"/);
});

test("fetchBookmarks parses items into our shape and stops when a page is short", async () => {
  const { client: api, calls } = client(() =>
    json({
      result: true,
      items: [bookmark(5, "https://linear.app", { title: " Linear ", excerpt: " tracker ", tags: ["saved"] })],
    }),
  );

  const [parsed] = await fetchBookmarks(api, 11, "tools");

  assert.deepEqual(parsed, {
    id: "5",
    url: "https://linear.app",
    title: "Linear",
    excerpt: "tracker",
    domain: "linear.app",
    collection: "tools",
    tags: ["saved"],
  });
  assert.equal(calls.length, 1, "a short page ends the walk");
});

test("tagging merges rather than replacing the user's own tags", async () => {
  const { client: api, calls } = client(() => json({ result: true, item: {} }));

  const tags = await tagBookmark(
    api,
    { id: "9", url: "https://a.example", title: "", excerpt: "", domain: "", collection: "sites", tags: ["design", "read-later"] },
    "published",
  );

  assert.deepEqual(tags, ["design", "read-later", "published"]);
  assert.deepEqual(JSON.parse(String(calls[0].init.body)).tags, [
    "design",
    "read-later",
    "published",
  ]);
});

test("a bookmark already carrying the tag costs no request", async () => {
  const { client: api, calls } = client(() => json({ result: true }));

  await tagBookmark(
    api,
    { id: "9", url: "https://a.example", title: "", excerpt: "", domain: "", collection: "sites", tags: ["published"] },
    "published",
  );

  assert.equal(calls.length, 0);
});
