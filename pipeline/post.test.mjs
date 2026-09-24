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

test("a long post saved with its own paragraph breaks keeps all of them", () => {
  const tweet = readTweet({
    id_str: "1",
    text: "Hello there.\n\nSecond para is cu",
    created_at: "2026-01-01",
    user: { name: "A", screen_name: "a" },
    note_tweet: { id: "x" },
  });
  const saved = "Hello there.\n\nSecond para is cut here.\n\nThird.";
  assert.equal(pickText(saved, tweet), saved);
});

/* --- failure modes (QA A2) ------------------------------------------------ */

const TWEET = { id_str: "1755217559312269550", text: "Hi", created_at: "2026-01-01", user: { name: "A", screen_name: "a" } };

test("a 200 that is not JSON, or JSON with no tweet in it, throws rather than reading as removed", async (t) => {
  const saved = { author: "A", handle: "a", date: "2026-01-01", text: "Hello." };
  const url = "https://x.com/a/status/123456";
  const publicDir = await scratch(t);
  /** @param {Response} answer @returns {typeof globalThis.fetch} */
  const answering = (answer) => async () => answer.clone();

  await assert.rejects(postFrom({ url, saved, publicDir, fetch: answering(new Response("<html>rate limited</html>")) }), /not JSON/);
  await assert.rejects(postFrom({ url, saved, publicDir, fetch: answering(Response.json({})) }), /no tweet/);
  const gone = await postFrom({ url, saved, publicDir, fetch: answering(Response.json({ __typename: "TweetTombstone" })) });
  assert.equal(gone?.removed, true, "only a real tombstone is removed");
});

test("one picture or video that will not fetch costs that item, never the post", async (t) => {
  const tweet = {
    ...TWEET,
    mediaDetails: [
      { type: "photo", media_url_https: "https://pbs.twimg.com/media/ok.jpg", original_info: { width: 10, height: 10 } },
      { type: "photo", media_url_https: "https://pbs.twimg.com/media/down.jpg", original_info: { width: 10, height: 10 } },
      { type: "photo", media_url_https: "https://pbs.twimg.com/media/nosize.jpg" },
      {
        type: "video",
        media_url_https: "https://pbs.twimg.com/media/poster.jpg",
        original_info: { width: 16, height: 9 },
        video_info: { variants: [{ content_type: "video/mp4", url: "https://video.twimg.com/v/640x360/a.mp4" }] },
      },
    ],
  };
  const { fetch: base } = cdn(tweet);
  /** @type {typeof globalThis.fetch} */
  const fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("media/down")) return new Response("", { status: 503 });
    if (url.includes(".mp4")) throw new TypeError("fetch failed");
    return base(input, init);
  };

  const post = await postFrom({ url: "https://x.com/a/status/1755217559312269550", saved: null, publicDir: await scratch(t), fetch });

  assert.deepEqual(post?.media, [
    { type: "photo", src: "/posts/1755217559312269550/1.webp", w: 10, h: 10 },
    { type: "video", poster: "/posts/1755217559312269550/4-poster.webp", w: 16, h: 9 },
  ]);
});

test("a video with no content-length is streamed and stopped at the cap", async (t) => {
  const tweet = await fixture("2081382827548148091");
  /** @type {typeof globalThis.fetch} */
  const fetch = async (input, init) => {
    if (!String(input).includes("video.twimg.com")) return cdn(tweet).fetch(input, init);
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const body = new ReadableStream({
      pull(controller) {
        if (sent++ > 8) controller.close();
        else controller.enqueue(chunk);
      },
    });
    return new Response(body);
  };

  const post = await postFrom({ url: "https://x.com/a/status/2081382827548148091", saved: null, publicDir: await scratch(t), fetch });

  assert.equal(post?.media?.[0]?.src, undefined, "poster only");
});

test("an id that is not X's numeric one: the post throws, a quote is dropped, a quote's quote is never read", () => {
  assert.throws(() => readTweet({ ...TWEET, id_str: "../1" }), /not numeric/);
  assert.equal(readTweet({ ...TWEET, quoted_tweet: { ...TWEET, id_str: "1a" } }).quoted, null);
  const deep = readTweet({ ...TWEET, quoted_tweet: { ...TWEET, id_str: "2", quoted_tweet: { ...TWEET, id_str: "3" } } });
  assert.equal(deep.quoted?.id, "2");
  assert.equal(deep.quoted?.quoted, null);
});

test("a link entity missing a string field is skipped, not written as undefined", () => {
  const tweet = readTweet({
    ...TWEET,
    text: "see https://t.co/a and https://t.co/b",
    entities: {
      urls: [
        { url: "https://t.co/a", display_url: "a.dev", expanded_url: "https://a.dev" },
        { url: "https://t.co/b", display_url: null, expanded_url: "https://b.dev" },
      ],
    },
  });
  assert.deepEqual(tweet.links, [{ text: "a.dev", href: "https://a.dev" }]);
  assert.equal(tweet.text, "see a.dev and https://t.co/b");
});

test("an avatar that fails once is fetched again, and a lost one is logged (VET-284)", async (t) => {
  const tweet = { ...TWEET, user: { ...TWEET.user, profile_image_url_https: "https://pbs.twimg.com/profile_images/1/a_normal.jpg" } };
  const { fetch: base } = cdn(tweet);
  let misses = 1;
  /** @type {typeof globalThis.fetch} */
  const flaky = async (input, init) => (String(input).includes("profile_images") && misses-- > 0 ? new Response("", { status: 503 }) : base(input, init));
  const post = await postFrom({ url: "https://x.com/a/status/1755217559312269550", saved: null, publicDir: await scratch(t), fetch: flaky });
  assert.equal(post?.avatar, "/posts/1755217559312269550/avatar.webp");

  const warn = t.mock.method(console, "warn", () => {});
  /** @type {typeof globalThis.fetch} */
  const down = async (input, init) => (String(input).includes("profile_images") ? new Response("", { status: 503 }) : base(input, init));
  const lost = await postFrom({ url: "https://x.com/a/status/1755217559312269550", saved: null, publicDir: await scratch(t), fetch: down });
  assert.equal(lost?.avatar, undefined);
  assert.match(String(warn.mock.calls[0]?.arguments[0]), /kept no avatar/);
});
