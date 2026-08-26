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
import { FirecrawlError, createClient, firecrawlFrom, parsePost } from "./firecrawl.mjs";

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

test("a full-page shot uses the v2 format object, not the v1 string", async () => {
  // `"screenshot@fullPage"` and a sibling `screenshotOptions` are both v1. Both
  // would be accepted by v2 as a request for something else — a viewport crop —
  // so this assertion is the only thing standing between the gallery and a
  // 900px sliver that looks like a working capture.
  const { calls, client: firecrawl } = client(() =>
    json({ success: true, data: { screenshot: Buffer.from("png-bytes").toString("base64") } }),
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

test("an inline base64 screenshot comes back as bytes", async () => {
  const png = Buffer.from("pretend-png-bytes");
  const { client: firecrawl } = client(() =>
    json({ success: true, data: { screenshot: png.toString("base64") } }),
  );

  assert.deepEqual(await firecrawl.screenshotFullPage("https://a.example"), png);
});

test("a data URI is unwrapped the same way", async () => {
  const png = Buffer.from("pretend-png-bytes");
  const { client: firecrawl } = client(() =>
    json({ success: true, data: { screenshot: `data:image/png;base64,${png.toString("base64")}` } }),
  );

  assert.deepEqual(await firecrawl.screenshotFullPage("https://a.example"), png);
});

test("a hosted screenshot URL is downloaded, so the caller never learns which shape it was", async () => {
  const png = Buffer.from("pretend-png-bytes");
  const { calls, client: firecrawl } = client((url) =>
    url.includes("/v2/scrape")
      ? json({ success: true, data: { screenshot: "https://storage.example/shot-123.png" } })
      : new Response(png, { status: 200 }),
  );

  assert.deepEqual(await firecrawl.screenshotFullPage("https://a.example"), png);
  assert.equal(calls[1].url, "https://storage.example/shot-123.png");
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

test("the handle and the words come out of a post document", () => {
  const post = parsePost(postMarkdown(), POST_URL);

  // The heading's spelling, not the URL's. X paths are lowercased and the
  // heading carries the display casing the person actually chose, so quoting
  // them by the URL would misspell the attribution on every mixed-case handle.
  assert.equal(post?.handle, "EphraimAkanmu");
  assert.equal(post?.text, POST_TEXT);
});

test("a saved thread stops at the end of the post that was saved", () => {
  // The real risk this guards. A thread's own posts and its replies sit under
  // `## Thread` and `## Top Comments` in the same document, and they run to
  // thousands of words — so a parser that ran past `## Post` would fill the
  // note with a stranger's reply and never look wrong doing it.
  const post = parsePost(postMarkdown({ text: "Short one." }), POST_URL);

  assert.equal(post?.text, "Short one.");
});

test("markdown decoration is flattened into one line of prose", () => {
  const markdown = postMarkdown({
    text: "Read this\n\n**properly** and see [the thread](https://x.com/i/1) ![img](https://p.example/a.jpg)",
  });

  assert.equal(parsePost(markdown, POST_URL)?.text, "Read this properly and see the thread");
});

test("the URL is the second source for a handle the heading did not give", () => {
  const markdown = ["## Post", "", "No heading, no author line.", ""].join("\n");

  assert.equal(parsePost(markdown, POST_URL)?.handle, "ephraimakanmu");
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
