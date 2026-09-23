/** `link-previews.mjs`: which hand-written links get a card, and the key they get. */

import assert from "node:assert/strict";
import test from "node:test";

import { linkHash, outboundLinks } from "./link-previews.mjs";

test("outbound links: once each, trailing punctuation off, socials, GitHub and this site skipped", () => {
  const text = `url: "https://orbisassist.co", see https://vetted.tools. and [x](https://vetted.tools)
    https://x.com/amanchanda7 https://github.com/aayushmanchanda2 https://www.aayushmanchanda.com/about`;
  assert.deepEqual(outboundLinks(text), ["https://orbisassist.co", "https://vetted.tools"]);
});

test("the key is the first 12 hex of sha1(url)", () => {
  assert.match(linkHash("https://vetted.tools"), /^[0-9a-f]{12}$/);
  assert.notEqual(linkHash("https://vetted.tools"), linkHash("https://vetted.tools/"));
});
