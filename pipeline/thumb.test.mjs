/**
 * The pictures a /library entry commits, on their own.
 *
 * Two things here are worth pinning down away from a whole run. The first is
 * `videoFrom`, which is a URL parser and therefore a list of the shapes a person
 * actually shares — a watch link off a laptop, a `youtu.be` off a phone share
 * sheet, a `/shorts/` — against the shapes that look like one and are not.
 * Getting it wrong in the permissive direction costs a run: an id nothing serves
 * turns every attempt into a 404 and the entry sits pending until it dead-letters.
 *
 * The second is the fetch, and specifically what it does with the answers that
 * are not the picture. `maxresdefault` legitimately 404s for videos below a
 * resolution threshold, so that one has to fall through rather than fail; a CDN
 * answering 200 with an error page has to fail rather than reach sharp, which
 * would report it as an encoder fault two calls later.
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import { SHOT_FILE } from "./entries.mjs";
import {
  ThumbError,
  captureMedia,
  captureThumb,
  mediaFileName,
  mediaWebPath,
  thumbFileName,
  thumbWebPath,
  videoFrom,
} from "./thumb.mjs";

const ID = "vJEy3nP2_C8";

/* ---------------------------------------------------------------------------
   Reading a video out of its URL
   --------------------------------------------------------------------------- */

test("every shape a person actually shares finds the same video", () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?t=42`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `https://www.youtube.com/watch?v=${ID}&list=PLabc&index=2`,
  ]) {
    assert.deepEqual(videoFrom(url), { provider: "youtube", id: ID }, url);
  }
});

test("a YouTube page that is not one video is null, and the entry still publishes", () => {
  // Null is a supported answer: `deriveKind` has already called this a video
  // from the host alone and it stays one. What it loses is the poster frame.
  assert.equal(videoFrom("https://www.youtube.com/@sequoiacapital"), null);
  assert.equal(videoFrom("https://www.youtube.com/playlist?list=PLabc"), null);
  assert.equal(videoFrom("https://www.youtube.com/results?search_query=agents"), null);
  assert.equal(videoFrom("https://www.youtube.com/"), null);
  assert.equal(videoFrom("https://www.youtube.com/watch"), null);
});

test("an id that is not eleven characters is refused now rather than 404ing later", () => {
  // The looser alternative fails later and worse. An id nothing serves makes
  // every run a fetch that 404s, and the entry sits pending until it
  // dead-letters — where this way it publishes without a video object.
  assert.equal(videoFrom("https://www.youtube.com/watch?v=short"), null);
  assert.equal(videoFrom(`https://www.youtube.com/watch?v=${ID}extra`), null);
  assert.equal(videoFrom("https://www.youtube.com/watch?v=has spaces"), null);
});

test("a host that merely contains youtube is not YouTube", () => {
  assert.equal(videoFrom(`https://notyoutube.com/watch?v=${ID}`), null);
  assert.equal(videoFrom(`https://youtube.com.evil.example/watch?v=${ID}`), null);
  assert.equal(videoFrom("not a url"), null);
});

/* ---------------------------------------------------------------------------
   Where it lands
   --------------------------------------------------------------------------- */

test("the thumb filename is one the orphan sweep will recognise as ours", () => {
  // The load-bearing half of the naming rule. `state.mjs` deletes anything in
  // `public/shots` matching SHOT_FILE that no entry claims — so a name OUTSIDE
  // that shape is never swept and outlives every entry pointing at it.
  assert.equal(thumbFileName("philosopher-ceo-kareem-amin"), "philosopher-ceo-kareem-amin-thumb.webp");
  assert.equal(thumbWebPath("a"), "/shots/a-thumb.webp");
  assert.match(thumbFileName("philosopher-ceo-kareem-amin"), SHOT_FILE);
});

test("a thumb never collides with a screenshot of the same slug", () => {
  assert.notEqual(thumbFileName("otherkind"), "otherkind.webp");
});

/* ---------------------------------------------------------------------------
   Fetching it
   --------------------------------------------------------------------------- */

/** A real JPEG, so the magic-byte check and sharp both get something true. */
const jpeg = await sharp({
  create: { width: 1280, height: 720, channels: 3, background: "#334455" },
})
  .jpeg()
  .toBuffer();

/**
 * A `fetch` that answers per frame name and records what was asked for.
 *
 * @param {Record<string, () => Response>} answers  Keyed by frame name.
 */
function cdn(answers) {
  /** @type {string[]} */
  const asked = [];

  /** @type {typeof globalThis.fetch} */
  const fetch = async (input) => {
    const url = String(input);
    asked.push(url);
    const frame = Object.keys(answers).find((name) => url.includes(name));
    if (frame === undefined) return new Response("nope", { status: 404 });
    return answers[frame]();
  };

  return { asked, fetch };
}

/** @param {import("node:test").TestContext} t */
async function scratch(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "thumb-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("the best frame is asked for first, and it is the one that lands", async (t) => {
  const { asked, fetch } = cdn({ maxresdefault: () => new Response(jpeg, { status: 200 }) });
  const outDir = await scratch(t);

  const { thumb } = await captureThumb({ video: { provider: "youtube", id: ID }, slug: "s", outDir, fetch });

  assert.equal(asked.length, 1, "hqdefault is not fetched when maxres answered");
  assert.equal(asked[0], `https://i.ytimg.com/vi/${ID}/maxresdefault.jpg`);
  assert.equal(path.basename(thumb), "s-thumb.webp");

  const written = await readFile(thumb);
  const { format, width } = await sharp(written).metadata();
  assert.equal(format, "webp", "committed as webp, like every other picture here");
  assert.equal(width, 1280);
});

test("a video with no maxres frame falls through to the one every video has", async (t) => {
  // Not a failure. YouTube only generates `maxresdefault` above a resolution
  // threshold and 404s for the rest, so this is the ordinary answer for an
  // older or smaller video.
  const { asked, fetch } = cdn({
    maxresdefault: () => new Response("not found", { status: 404 }),
    hqdefault: () => new Response(jpeg, { status: 200 }),
  });
  const outDir = await scratch(t);

  await captureThumb({ video: { provider: "youtube", id: ID }, slug: "s", outDir, fetch });

  assert.deepEqual(asked, [
    `https://i.ytimg.com/vi/${ID}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`,
  ]);
});

test("a small frame is stored at the size it arrived, not blown up", async (t) => {
  const small = await sharp({ create: { width: 480, height: 360, channels: 3, background: "#111" } })
    .jpeg()
    .toBuffer();
  const { fetch } = cdn({
    maxresdefault: () => new Response("not found", { status: 404 }),
    hqdefault: () => new Response(small, { status: 200 }),
  });
  const outDir = await scratch(t);

  const { thumb } = await captureThumb({ video: { provider: "youtube", id: ID }, slug: "s", outDir, fetch });

  assert.equal((await sharp(await readFile(thumb)).metadata()).width, 480);
});

test("no frame at all is an error, so the item goes pending rather than dangling", async (t) => {
  const { fetch } = cdn({});
  const outDir = await scratch(t);

  await assert.rejects(
    captureThumb({ video: { provider: "youtube", id: ID }, slug: "s", outDir, fetch }),
    (error) => {
      assert.ok(error instanceof ThumbError);
      assert.match(error.message, /no poster frame/);
      assert.match(error.message, /404/, "and says what it tried");
      return true;
    },
  );
});

test("an error page served as 200 is refused before it reaches the encoder", async (t) => {
  // The reason the JPEG magic is checked. sharp would report this two calls
  // later as a buffer-format fault, and the run log would blame the encoder for
  // something the network said.
  const { fetch } = cdn({ maxresdefault: () => new Response("<html>oops</html>", { status: 200 }) });
  const outDir = await scratch(t);

  await assert.rejects(
    captureThumb({ video: { provider: "youtube", id: ID }, slug: "s", outDir, fetch }),
    /did not answer with an image/,
  );
});

test("a frame too large to commit is refused on the header alone", async (t) => {
  const { fetch } = cdn({
    maxresdefault: () =>
      new Response(jpeg, { status: 200, headers: { "content-length": String(40 * 1024 * 1024) } }),
  });
  const outDir = await scratch(t);

  await assert.rejects(
    captureThumb({ video: { provider: "youtube", id: ID }, slug: "s", outDir, fetch }),
    /too large to commit/,
  );
});

test("a 5xx stops the run rather than being read as a missing frame", async (t) => {
  // Told apart from a 404 on purpose: one means "this video has no maxres" and
  // the next run gets the same answer, the other means the CDN had a bad minute
  // and the next run probably works.
  const { fetch } = cdn({ maxresdefault: () => new Response("down", { status: 503 }) });
  const outDir = await scratch(t);

  await assert.rejects(
    captureThumb({ video: { provider: "youtube", id: ID }, slug: "s", outDir, fetch }),
    /HTTP 503/,
  );
});

test("an unreachable CDN is a ThumbError, not a raw fetch failure", async (t) => {
  /** @type {typeof globalThis.fetch} */
  const fetch = async () => {
    throw new TypeError("fetch failed");
  };
  const outDir = await scratch(t);

  await assert.rejects(
    captureThumb({ video: { provider: "youtube", id: ID }, slug: "s", outDir, fetch }),
    (error) => {
      assert.ok(error instanceof ThumbError);
      assert.match(error.message, /unreachable/);
      return true;
    },
  );
});

/* ---------------------------------------------------------------------------
   A post's photos
   --------------------------------------------------------------------------- */

const PHOTOS = [
  "https://pbs.twimg.com/media/HQxwm3nbMAAeX0W.jpg",
  "https://pbs.twimg.com/media/HQxwnHsbcAA4YrV.jpg",
];

test("photo filenames are numbered from one, in the order the post showed them", () => {
  // The order is the only thing about a set of photos a card has to preserve: a
  // three-photo post reads differently if the second one leads. Named after the
  // position rather than the source, because the source name is a CDN hash.
  assert.equal(mediaFileName("s", 0), "s-media-1.webp");
  assert.equal(mediaWebPath("s", 1), "/shots/s-media-2.webp");
  assert.match(mediaFileName("a-long-slug", 3), SHOT_FILE, "the sweep can see them too");
});

test("every photo is fetched, re-encoded and named in order", async (t) => {
  const { asked, fetch } = cdn({ "pbs.twimg.com": () => new Response(jpeg, { status: 200 }) });
  const outDir = await scratch(t);

  const { files, paths } = await captureMedia({ media: PHOTOS, slug: "s", outDir, fetch });

  assert.deepEqual(asked, PHOTOS, "asked for exactly what the document named");
  assert.deepEqual(paths, ["/shots/s-media-1.webp", "/shots/s-media-2.webp"]);
  assert.deepEqual(
    files.map((file) => path.basename(file)),
    ["s-media-1.webp", "s-media-2.webp"],
  );
  assert.equal((await sharp(await readFile(files[0])).metadata()).format, "webp");
});

test("a post with no photos costs no requests", async (t) => {
  const { asked, fetch } = cdn({});
  const outDir = await scratch(t);

  assert.deepEqual(await captureMedia({ media: [], slug: "s", outDir, fetch }), {
    files: [],
    paths: [],
  });
  assert.deepEqual(asked, []);
});

test("more photos than x.com allows means the parse was wrong, so four is the cap", async (t) => {
  const { asked, fetch } = cdn({ "pbs.twimg.com": () => new Response(jpeg, { status: 200 }) });
  const outDir = await scratch(t);

  const many = Array.from({ length: 7 }, (_, i) => `https://pbs.twimg.com/media/photo-${i}.jpg`);
  const { paths } = await captureMedia({ media: many, slug: "s", outDir, fetch });

  assert.equal(paths.length, 4);
  assert.equal(asked.length, 4, "and the other three are not fetched either");
});

test("a photo that will not come back fails the set rather than shortening it", async (t) => {
  // Three of four photos is a card that quietly says something the post did
  // not, so a partial set is never returned.
  const outDir = await scratch(t);
  const gone = cdn({ "HQxwm3nb": () => new Response(jpeg, { status: 200 }) });

  await assert.rejects(
    captureMedia({ media: PHOTOS, slug: "s", outDir, fetch: gone.fetch }),
    (error) => {
      assert.ok(error instanceof ThumbError);
      assert.match(error.message, /is gone \(HTTP 404\)/);
      return true;
    },
  );
});

test("a PNG photo is as acceptable as a JPEG one", async (t) => {
  const png = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#abc" } })
    .png()
    .toBuffer();
  const { fetch } = cdn({ "pbs.twimg.com": () => new Response(png, { status: 200 }) });
  const outDir = await scratch(t);

  const { paths } = await captureMedia({ media: [PHOTOS[0]], slug: "s", outDir, fetch });

  assert.deepEqual(paths, ["/shots/s-media-1.webp"]);
});

test("an error page where a photo should be is refused before the encoder sees it", async (t) => {
  const { fetch } = cdn({ "pbs.twimg.com": () => new Response("<html>nope</html>", { status: 200 }) });
  const outDir = await scratch(t);

  await assert.rejects(
    captureMedia({ media: [PHOTOS[0]], slug: "s", outDir, fetch }),
    /did not answer with an image/,
  );
});
