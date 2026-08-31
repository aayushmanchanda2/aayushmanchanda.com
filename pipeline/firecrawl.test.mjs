/**
 * The Firecrawl boundary, on its own.
 *
 * Two things are worth pinning down here rather than through a whole run. The
 * first is the request shape: v2 moved screenshot options onto the format
 * object, and the v1 spelling still parses as a perfectly valid request for a
 * viewport-sized crop — so the failure mode of getting it wrong is a wrong
 * picture, not an error, and only an assertion on the body catches that.
 *
 * The second is `parsePost`. It is the one function in the pipeline reading a
 * document nobody here controls, so every way that document could disappoint it
 * has to end in null rather than in a half-filled entry.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { POST_TEXT, postMarkdown } from "./fixtures.mjs";
import {
  FirecrawlError,
  createClient,
  firecrawlFrom,
  isOutOfCredits,
  parsePost,
} from "./firecrawl.mjs";

const POST_URL = "https://x.com/ephraimakanmu/status/2081234457588056305";

/**
 * A `fetch` that answers from a literal, and records what it was asked.
 *
 * @param {(url: string, init: RequestInit) => Response | Promise<Response>} handler
 */
function client(handler) {
  /** @type {{ url: string, body: any, headers: any }[]} */
  const calls = [];

  /** @type {typeof globalThis.fetch} */
  const fetch = async (input, init = {}) => {
    calls.push({
      url: String(input),
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      headers: init.headers,
    });
    return await handler(String(input), init);
  };

  return { calls, client: createClient({ apiKey: "fc-test", fetch }) };
}

/** @param {unknown} payload @param {number} [status] */
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/* ---------------------------------------------------------------------------
   Configuration
   --------------------------------------------------------------------------- */

test("no key means no client, which is what keeps a local run offline", () => {
  assert.equal(firecrawlFrom({}), null);
  assert.equal(firecrawlFrom({ FIRECRAWL_API_KEY: undefined }), null);
  // An unset repo secret arrives as the empty string, not as absent.
  assert.equal(firecrawlFrom({ FIRECRAWL_API_KEY: "" }), null);
  assert.equal(firecrawlFrom({ FIRECRAWL_API_KEY: "   " }), null);
});

test("a key means a client", () => {
  const made = firecrawlFrom({ FIRECRAWL_API_KEY: "fc-abc" });

  assert.notEqual(made, null);
  assert.equal(typeof made?.scrapeMarkdown, "function");
  assert.equal(typeof made?.screenshotFullPage, "function");
});

/* ---------------------------------------------------------------------------
   The request
   --------------------------------------------------------------------------- */

test("markdown is asked for by name, with the key as a bearer token", async () => {
  const { calls, client: firecrawl } = client(() => json({ success: true, data: { markdown: "# hi" } }));

  assert.equal(await firecrawl.scrapeMarkdown("https://example.com"), "# hi");

  assert.equal(calls[0].url, "https://api.firecrawl.dev/v2/scrape");
  assert.deepEqual(calls[0].body, { url: "https://example.com", formats: ["markdown"] });
  assert.equal(calls[0].headers.Authorization, "Bearer fc-test");
});

test("the v2 format object is what a full-page shot asks for, not the v1 string", async () => {
  // `"screenshot@fullPage"` and a sibling `screenshotOptions` are both v1. Both
  // would be accepted by v2 as a request for something else — a viewport crop —
  // so this assertion is the only thing standing between the gallery and a
  // 900px sliver that looks like a working capture.
  const { calls, client: firecrawl } = client(() =>
    json({
      success: true,
      data: {
        screenshot: Buffer.concat([
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          Buffer.from("bytes"),
        ]).toString("base64"),
      },
    }),
  );

  await firecrawl.screenshotFullPage("https://fortress.example");

  assert.deepEqual(calls[0].body, {
    url: "https://fortress.example",
    formats: [{ type: "screenshot", fullPage: true }],
  });
});

/* ---------------------------------------------------------------------------
   Screenshots arrive in two shapes
   --------------------------------------------------------------------------- */

/** A buffer that starts the way every PNG does. */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("pretend-image-data"),
]);

test("an inline base64 screenshot comes back as bytes", async () => {
  const { client: firecrawl } = client(() =>
    json({ success: true, data: { screenshot: PNG.toString("base64") } }),
  );

  assert.deepEqual(await firecrawl.screenshotFullPage("https://a.example"), PNG);
});

test("a data URI is unwrapped the same way", async () => {
  const { client: firecrawl } = client(() =>
    json({ success: true, data: { screenshot: `data:image/png;base64,${PNG.toString("base64")}` } }),
  );

  assert.deepEqual(await firecrawl.screenshotFullPage("https://a.example"), PNG);
});

test("a hosted screenshot URL is downloaded, so the caller never learns which shape it was", async () => {
  const { calls, client: firecrawl } = client((url) =>
    url.includes("/v2/scrape")
      ? json({ success: true, data: { screenshot: "https://storage.example/shot-123.png" } })
      : new Response(PNG, { status: 200 }),
  );

  assert.deepEqual(await firecrawl.screenshotFullPage("https://a.example"), PNG);
  assert.equal(calls[1].url, "https://storage.example/shot-123.png");
  assert.equal(
    calls[1].headers,
    undefined,
    "and the API key does not travel to whoever is hosting the image",
  );
});

test("a sentence where the screenshot should be is refused, not decoded", async () => {
  // The reason the PNG magic bytes are checked at all. `Buffer.from(s,"base64")`
  // decodes ordinary English without complaining, so a field holding a status
  // message would otherwise leave this module as fifteen junk bytes claiming to
  // be an image, and sharp would report it two calls later as an encoder fault.
  const { client: firecrawl } = client(() =>
    json({ success: true, data: { screenshot: "Screenshot unavailable" } }),
  );

  await assert.rejects(firecrawl.screenshotFullPage("https://a.example"), (error) => {
    assert.ok(error instanceof FirecrawlError);
    assert.match(error.message, /is not a PNG/);
    assert.match(error.message, /Screenshot unavailable/, "the message quotes what actually came back");
    return true;
  });
});

test("a downloaded body that is not a PNG is refused too", async () => {
  const { client: firecrawl } = client((url) =>
    url.includes("/v2/scrape")
      ? json({ success: true, data: { screenshot: "https://storage.example/shot.png" } })
      : new Response("<html>404</html>", { status: 200 }),
  );

  await assert.rejects(firecrawl.screenshotFullPage("https://a.example"), /is not a PNG/);
});

test("a data URI that is not base64 is refused rather than mangled", async () => {
  // `data:image/png,%89PNG…` is a legal data URI. Base64-decoding it produces
  // garbage, so it is turned down by name.
  const { client: firecrawl } = client(() =>
    json({ success: true, data: { screenshot: "data:image/png,%89PNG%0D%0A" } }),
  );

  await assert.rejects(firecrawl.screenshotFullPage("https://a.example"), /not base64/);
});

test("a body larger than the ceiling is refused on the header alone", async () => {
  const { client: firecrawl } = client((url) =>
    url.includes("/v2/scrape")
      ? json({ success: true, data: { screenshot: "https://storage.example/huge.png" } })
      : new Response(PNG, { status: 200, headers: { "content-length": String(80 * 1024 * 1024) } }),
  );

  await assert.rejects(firecrawl.screenshotFullPage("https://a.example"), /too large to commit/);
});

test("an expired screenshot link is an error, not an empty file", async () => {
  const { client: firecrawl } = client((url) =>
    url.includes("/v2/scrape")
      ? json({ success: true, data: { screenshot: "https://storage.example/gone.png" } })
      : new Response("expired", { status: 404 }),
  );

  await assert.rejects(firecrawl.screenshotFullPage("https://a.example"), (error) => {
    assert.ok(error instanceof FirecrawlError);
    assert.match(error.message, /expires after 24 hours/);
    return true;
  });
});

/* ---------------------------------------------------------------------------
   Failures
   --------------------------------------------------------------------------- */

test("a rejected key says which secret to go and fix", async () => {
  const { client: firecrawl } = client(() => json({ error: "Unauthorized: Invalid token" }, 401));

  await assert.rejects(firecrawl.scrapeMarkdown(POST_URL), (error) => {
    assert.ok(error instanceof FirecrawlError);
    assert.equal(error.status, 401);
    assert.match(error.message, /FIRECRAWL_API_KEY/);
    return true;
  });
});

test("an exhausted account says so in those words", async () => {
  const { client: firecrawl } = client(() =>
    json({ error: "Payment Required: Insufficient credits" }, 402),
  );

  await assert.rejects(firecrawl.scrapeMarkdown(POST_URL), /out of credits/);
});

test("an exhausted account is the one failure a caller can tell apart", async () => {
  // `apply.mjs` reports a 402 as a standing condition rather than as one more
  // bad minute, and this is the seam it does it through: an empty credit
  // balance is still there on the next run, and a timeout is not.
  const { client: firecrawl } = client(() => json({ error: "Insufficient credits" }, 402));

  await assert.rejects(firecrawl.screenshotFullPage("https://fortress.example"), (error) => {
    assert.equal(isOutOfCredits(error), true);
    return true;
  });

  assert.equal(isOutOfCredits(new FirecrawlError("timed out")), false);
  assert.equal(isOutOfCredits(new FirecrawlError("rejected the key", 401)), false);
  assert.equal(isOutOfCredits(new Error("Payment Required")), false, "the status, not the words");
});

test("a 200 that says it failed is still a failure", async () => {
  // Firecrawl answers 200 with `success: false` for several soft failures, the
  // same way Raindrop answers 200 with `result: false`.
  const { client: firecrawl } = client(() => json({ success: false, error: "no content" }));

  await assert.rejects(firecrawl.scrapeMarkdown(POST_URL), /refused/);
});

test("a body with no markdown in it is an error rather than an empty title", async () => {
  const { client: firecrawl } = client(() => json({ success: true, data: { html: "<p>hi</p>" } }));

  await assert.rejects(firecrawl.scrapeMarkdown(POST_URL), /no markdown/);
});

test("an unreachable Firecrawl is a FirecrawlError, not a raw fetch failure", async () => {
  const { client: firecrawl } = client(() => {
    throw new TypeError("fetch failed");
  });

  await assert.rejects(firecrawl.scrapeMarkdown(POST_URL), (error) => {
    assert.ok(error instanceof FirecrawlError);
    assert.equal(error.status, null);
    return true;
  });
});

/* ---------------------------------------------------------------------------
   Reading the post out of the markdown
   --------------------------------------------------------------------------- */

test("the whole card comes out of a post document", () => {
  const post = parsePost(postMarkdown(), POST_URL);

  // The heading's spelling, not the URL's. X paths are lowercased and the
  // heading carries the display casing the person actually chose, so quoting
  // them by the URL would misspell the attribution on every mixed-case handle.
  assert.equal(post?.handle, "EphraimAkanmu");
  assert.equal(post?.text, POST_TEXT);
  assert.equal(post?.author, "Diadem", "the display name off the Author line");
  assert.equal(post?.date, "2026-07-26", "the day it was POSTED, not the day it was saved");
  assert.deepEqual(post?.media, []);
});

test("a handle with an underscore survives the markdown escaping", () => {
  // The bug this was written for. The document is markdown, so Firecrawl
  // escapes punctuation on the way in and `@brian_lovin` arrives as
  // `@brian\_lovin`. A handle pattern reading that raw matches `brian`, hits a
  // word boundary at the backslash, and comes away attributing the post to a
  // different person — silently, and on every handle with an underscore in it.
  const markdown = [
    "# Post by @brian\\_lovin",
    "",
    "Author: Brian Lovin @brian\\_lovin",
    "Posted: Sat, 22 Aug 2026 17:01:45 GMT",
    "",
    "## Post",
    "",
    "Built a little agent automation.",
    "",
  ].join("\n");

  const post = parsePost(markdown, "https://x.com/brian_lovin/status/2091209219609628826");

  assert.equal(post?.handle, "brian_lovin");
  assert.equal(post?.author, "Brian Lovin");
});

test("both date spellings the post-processor uses come out as one calendar date", () => {
  // Two shapes turn up from the same processor on the same day, so this parses
  // the value rather than matching a shape. Both are UTC-anchored, and the
  // calendar date is read in UTC — otherwise the runner's timezone would decide
  // what day a post was made.
  const iso = parsePost(postMarkdown(), POST_URL);
  assert.equal(iso?.date, "2026-07-26");

  const rfc = parsePost(
    postMarkdown().replace(
      "Posted: 2026\\-07\\-26T04:25:36\\.000Z",
      "Posted: Sat, 22 Aug 2026 17:01:45 GMT",
    ),
    POST_URL,
  );
  assert.equal(rfc?.date, "2026-08-22");
});

test("a post with no readable date is no post at all", () => {
  // Strict on purpose, and the strictest call in this parser. A post card shows
  // when the post was made, and the only other date this repo holds is the day
  // the link was saved — so a card without this one either carries a hole or
  // quietly shows the wrong fact. The fallback is a row with Raindrop's own
  // title, which is a worse row and an honest one.
  const undated = postMarkdown().replace(/^Posted:.*$/m, "");
  assert.equal(parsePost(undated, POST_URL), null);

  const nonsense = postMarkdown().replace(/^Posted:.*$/m, "Posted: sometime last week");
  assert.equal(parsePost(nonsense, POST_URL), null);
});

test("an author line with no display name falls back to the handle", () => {
  // A thread's own posts are labelled `Author: @handle` with no name at all.
  // The handle is the same person spelled the other way, which is what x itself
  // shows when someone leaves their name blank — not an invention.
  const markdown = postMarkdown().replace(
    "Author: Diadem @EphraimAkanmu",
    "Author: @EphraimAkanmu",
  );

  assert.equal(parsePost(markdown, POST_URL)?.author, "EphraimAkanmu");
});

test("a post's photos come through as the URLs the document named, in order", () => {
  // The probe's real answer, and it took widening the sample to find. Photos
  // arrive as ordinary markdown images pointed at pbs.twimg.com, one per photo;
  // the first three posts sampled happened to have video attachments, which
  // carry nothing, and that looked like "the markdown has no media at all".
  const withPhotos = postMarkdown({
    text: [
      "here’s a breakdown of the most profitable landing pages:",
      "",
      "![Image 1](https://pbs.twimg.com/media/HQxwm3nbMAAeX0W.jpg)",
      "",
      "![Image 2](https://pbs.twimg.com/media/HQxwnHsbcAA4YrV.jpg)",
    ].join("\n"),
  });

  const post = parsePost(withPhotos, POST_URL);

  assert.deepEqual(post?.media, [
    "https://pbs.twimg.com/media/HQxwm3nbMAAeX0W.jpg",
    "https://pbs.twimg.com/media/HQxwnHsbcAA4YrV.jpg",
  ]);
  assert.equal(
    post?.text,
    "here’s a breakdown of the most profitable landing pages:",
    "and the images are still out of the text, which is a row and not a card",
  );
});

test("a video attachment leaves media empty, which is an answer and not a gap", () => {
  // The other half of the probe. A post whose attachment is a clip carries a
  // t.co shortlink inside the text and no frame anywhere, so there is nothing
  // to fetch and nothing to be clever about.
  const withVideo = postMarkdown({
    text: "Termius + Tailscale + tmux. Start at your desk, continue on the go. https://t.co/FJoD3DIiFD",
  });

  assert.deepEqual(parsePost(withVideo, POST_URL)?.media, []);
});

test("only x.com's own photo host counts as the post's media", () => {
  // The section is not only the poster's. A quoted post, a link card or an
  // emoji served as an image all arrive as image syntax too, and each is either
  // somebody else's picture or not a picture at all.
  const mixed = postMarkdown({
    text: [
      "Look at this",
      "![emoji](https://abs.twimg.com/emoji/v2/1f9f5.png)",
      "![card](https://example.com/og.png)",
      "![mine](https://pbs.twimg.com/media/HQxwm3nbMAAeX0W.jpg)",
      "![mine again](https://pbs.twimg.com/media/HQxwm3nbMAAeX0W.jpg)",
    ].join("\n\n"),
  });

  assert.deepEqual(parsePost(mixed, POST_URL)?.media, [
    "https://pbs.twimg.com/media/HQxwm3nbMAAeX0W.jpg",
  ]);
});

test("a saved thread stops at the end of the post that was saved", () => {
  // The real risk this guards. A thread's own posts and its replies sit under
  // `## Thread` and `## Top Comments` in the same document, and they run to
  // thousands of words — so a parser that ran past `## Post` would fill the
  // note with a stranger's reply and never look wrong doing it.
  const post = parsePost(postMarkdown({ text: "Short one." }), POST_URL);

  assert.equal(post?.text, "Short one.");
});

test("the entities Firecrawl escapes on the way in are undone on the way out", () => {
  // Read off a real response. `Go & Python` arrives as `Go &amp; Python`, and
  // committed unread that renders as those six literal characters on the card:
  // the post quoting itself wrong, permanently, in a file nobody re-reads.
  const markdown = postMarkdown({
    text: "44,000 stars and contributions merged into Go &amp; Python, with &lt;10 people.",
  });

  assert.equal(
    parsePost(markdown, POST_URL)?.text,
    "44,000 stars and contributions merged into Go & Python, with <10 people.",
  );
});

test("an escaped entity stays escaped, because someone was writing about HTML", () => {
  // Why the entity pass is a list in a fixed order rather than one regex.
  // Undoing `&amp;` first would turn `&amp;lt;` into `<`, which is a different
  // string than the one the person typed.
  assert.equal(parsePost(postMarkdown({ text: "Type &amp;lt; to escape it." }), POST_URL)?.text, "Type &lt; to escape it.");
});

test("markdown decoration is flattened into one line of prose", () => {
  const markdown = postMarkdown({
    text: "Read this\n\n**properly** and see [the thread](https://x.com/i/1) ![img](https://p.example/a.jpg)",
  });

  assert.equal(parsePost(markdown, POST_URL)?.text, "Read this properly and see the thread");
});

test("the URL is the second source for a handle the heading did not give", () => {
  const markdown = ["Posted: 2026-07-26", "", "## Post", "", "No heading, no author line.", ""].join(
    "\n",
  );

  const post = parsePost(markdown, POST_URL);

  assert.equal(post?.handle, "ephraimakanmu");
  assert.equal(post?.author, "ephraimakanmu", "and the author falls back to it too");
});

test("markdown with no post section in it is null, not a guess", () => {
  // The shape Firecrawl returns when x.com hands it a login wall instead of a
  // post. There is no second source for the words, so there is no answer.
  assert.equal(parsePost("# Sign in to X\n\nSomething went wrong.", POST_URL), null);
  assert.equal(parsePost("", POST_URL), null);
  assert.equal(parsePost(undefined, POST_URL), null);
  assert.equal(parsePost({ markdown: "## Post\n\nhi" }, POST_URL), null);
});

test("a post section with nothing under it is null", () => {
  assert.equal(parsePost("# Post by @someone\n\n## Post\n\n\n## Engagement\n\n4 likes", POST_URL), null);
});

test("a handle nothing can supply is null, even with words in hand", () => {
  assert.equal(parsePost("## Post\n\nWords.", "https://x.com/"), null);
});

test("x.com's own routing is not a person", () => {
  // `x.com/i/web/status/123` is a real shape, and attributing the post to "@i"
  // would be worse than not attributing it.
  assert.equal(parsePost("## Post\n\nWords.", "https://x.com/i/web/status/123"), null);
  assert.equal(parsePost("## Post\n\nWords.", "https://x.com/home"), null);
});

test("a body that is only punctuation is not a post", () => {
  // Otherwise this becomes a /library row whose entire link text is "**" or a
  // single ellipsis — strictly worse than the "A post from @someone" it would
  // have replaced.
  assert.equal(parsePost("# Post by @someone\n\n## Post\n\n**\n", POST_URL), null);
  assert.equal(parsePost("# Post by @someone\n\n## Post\n\n... --- ...\n", POST_URL), null);
});

test("a blockquote-heavy document parses in linear time", () => {
  // A quote-tweet arrives as blockquotes, so `flatten`'s marker strip is on the
  // ordinary path. Written with `\s` it rescanned to end-of-document from every
  // line start: 60k lines took six seconds of blocked event loop, on markdown
  // this module does not control.
  const markdown = `# Post by @someone\n\nPosted: 2026-07-26\n\n## Post\n\n${"> quoted line\n".repeat(40_000)}`;

  const started = Date.now();
  assert.equal(parsePost(markdown, POST_URL)?.handle, "someone");
  const elapsed = Date.now() - started;

  assert.ok(elapsed < 2_000, `parsing took ${elapsed}ms, which is the quadratic walk again`);
});
