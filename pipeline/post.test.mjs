/**
 * `post.mjs` against real syndication responses (`fixtures/syndication-*.json`,
 * saved by the VET-244 spike) and a fake `fetch`. Nothing here reaches X.
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import { VIDEO_MAX_BYTES, pickText, postFrom, postId, readTweet, tokenFor } from "./post.mjs";

const fixture = async (/** @type {string} */ id) =>
  JSON.parse(await readFile(new URL(`./fixtures/syndication-${id}.json`, import.meta.url), "utf8"));

const jpeg = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#345" } })
  .jpeg()
  .toBuffer();

/**
 * A fetch that answers syndication with `tweet` (or 404 when null), pictures
 * with a JPEG, and videos with `videoBytes` bytes. Records every URL.
 *
 * @param {Record<string, unknown> | null} tweet @param {number} [videoBytes]
 */
function cdn(tweet, videoBytes = 1024) {
  /** @type {string[]} */
  const asked = [];
  /** @type {typeof globalThis.fetch} */
  const fetch = async (input) => {
    const url = String(input);
    asked.push(url);
    if (url.includes("tweet-result")) {
      return tweet === null ? new Response("", { status: 404 }) : Response.json(tweet);
    }
    if (url.includes("video.twimg.com")) {
      return new Response(Buffer.alloc(videoBytes), { headers: { "content-length": String(videoBytes) } });
    }
    return new Response(jpeg, { status: 200 });
  };
  return { asked, fetch };
}

/** @param {import("node:test").TestContext} t */
async function scratch(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "post-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("the id comes out of a status URL and not out of a profile", () => {
  assert.equal(postId("https://x.com/benln/status/2006057848430604705?s=12"), "2006057848430604705");
  assert.equal(postId("https://twitter.com/a/statuses/1755217559312269550"), "1755217559312269550");
  assert.equal(postId("https://x.com/sarahlevinger?s=11"), null);
});

test("the token is react-tweet's formula", () => {
  assert.equal(tokenFor("2006057848430604705"), ((Number("2006057848430604705") / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, ""));
});

test("a photo post: text without the media shortlink, avatar and photo copied locally", async (t) => {
  const publicDir = await scratch(t);
  const { fetch } = cdn(await fixture("1755217559312269550"));

  const post = await postFrom({ url: "https://x.com/ecomEddie/status/1755217559312269550", saved: null, publicDir, fetch });

  assert.equal(post?.author, "EDDIE CHENG");
  assert.equal(post?.date, "2024-02-07");
  assert.match(String(post?.text), /reach your true potential\):$/, "the t.co for the photo is gone");
  assert.equal(post?.avatar, "/posts/1755217559312269550/avatar.webp");
  assert.deepEqual(post?.media, [{ type: "photo", src: "/posts/1755217559312269550/1.webp", w: 900, h: 505 }]);
  const files = await readdir(path.join(publicDir, "posts", "1755217559312269550"));
  assert.deepEqual(files.sort(), ["1.webp", "avatar.webp"]);
});

test("nothing on disk is fetched twice", async (t) => {
  const publicDir = await scratch(t);
  const tweet = await fixture("1755217559312269550");
  await postFrom({ url: "https://x.com/a/status/1755217559312269550", saved: null, publicDir, fetch: cdn(tweet).fetch });

  const again = cdn(tweet);
  await postFrom({ url: "https://x.com/a/status/1755217559312269550", saved: null, publicDir, fetch: again.fetch });
  assert.deepEqual(again.asked.filter((url) => !url.includes("tweet-result")), []);
});

test("a video under the cap is kept with its poster; over it, the poster alone", async (t) => {
  const tweet = await fixture("2081382827548148091");
  const url = "https://x.com/petergyang/status/2081382827548148091";

  const small = await postFrom({ url, saved: null, publicDir: await scratch(t), fetch: cdn(tweet).fetch });
  assert.deepEqual(small?.media, [
    {
      type: "video",
      src: "/posts/2081382827548148091/1.mp4",
      poster: "/posts/2081382827548148091/1-poster.webp",
      w: 1920,
      h: 1080,
    },
  ]);

  const big = cdn(tweet, VIDEO_MAX_BYTES + 1);
  const large = await postFrom({ url, saved: null, publicDir: await scratch(t), fetch: big.fetch });
  assert.equal(large?.media?.[0]?.src, undefined, "poster only");
  assert.equal(big.asked.filter((u) => u.endsWith(".mp4?tag=14")).length, 3, "every size at or under 720p was tried");
});

test("a long post keeps the saved text; X's truncated copy never replaces it", async (t) => {
  const tweet = await fixture("2081234457588056305");
  const saved = { author: "Diadem", handle: "EphraimAkanmu", date: "2026-07-26", text: "A lot of designers " + "x".repeat(400) };

  const post = await postFrom({ url: "https://x.com/a/status/2081234457588056305", saved, publicDir: await scratch(t), fetch: cdn(tweet).fetch });

  assert.equal(post?.text, saved.text);
  assert.equal(post?.quoted?.handle, "EphraimAkanmu", "the quoted post comes along");
  assert.equal(post?.quoted?.avatar, "/posts/2080990588837539852/avatar.webp");
});

test("X's text wins when the saved copy is the same words flattened, for the paragraphs", () => {
  const tweet = readTweet({ id_str: "1", text: "One.\n\nTwo.", created_at: "2026-01-01", user: { name: "A", screen_name: "a" } });
  assert.equal(pickText("One. Two.", tweet), "One.\n\nTwo.");
  assert.equal(pickText("", tweet), "One.\n\nTwo.");
});

test("a long post's saved text gets X's paragraph breaks back over the part X returned", () => {
  const tweet = readTweet({
    id_str: "1",
    text: "Hello there.\n\nSecond para is cu",
    created_at: "2026-01-01",
    user: { name: "A", screen_name: "a" },
    note_tweet: { id: "x" },
  });
  assert.equal(pickText("Hello there. Second para is cut here. Third.", tweet), "Hello there.\n\nSecond para is cut here. Third.");
  assert.equal(pickText("Other words here, longer than X's.", tweet), "Other words here, longer than X's.", "a mismatch keeps the saved text");
});

test("an X Article carries its title and a local cover", async (t) => {
  const post = await postFrom({
    url: "https://x.com/benln/status/2006057848430604705",
    saved: null,
    publicDir: await scratch(t),
    fetch: cdn(await fixture("2006057848430604705")).fetch,
  });
  assert.deepEqual(post?.article, {
    title: "Advice for generalists who want to join startups",
    cover: "/posts/2006057848430604705/cover.webp",
  });
  assert.deepEqual(post?.links, [{ text: "x.com/i/article/2006…", href: "http://x.com/i/article/2006056102031499264" }]);
});

test("a post gone on X keeps its saved copy, marked removed", async (t) => {
  const saved = { author: "A", handle: "a", date: "2026-01-01", text: "Hello." };
  const { fetch } = cdn(null);
  const publicDir = await scratch(t);

  assert.deepEqual(await postFrom({ url: "https://x.com/a/status/123456", saved, publicDir, fetch }), {
    ...saved,
    id: "123456",
    removed: true,
  });
  assert.equal(await postFrom({ url: "https://x.com/a/status/123456", saved: null, publicDir, fetch }), null);
});

test("a profile link is not asked about at all", async (t) => {
  const { asked, fetch } = cdn(null);
  assert.equal(await postFrom({ url: "https://x.com/sarahlevinger", saved: null, publicDir: await scratch(t), fetch }), null);
  assert.deepEqual(asked, []);
});
