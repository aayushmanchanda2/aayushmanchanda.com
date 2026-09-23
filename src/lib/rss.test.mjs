import test from "node:test";
import assert from "node:assert/strict";
import { absolutize, escapeXml, newestFirst, paragraphs, renderFeed, rfc822 } from "./rss.ts";

const ORIGIN = "https://example.com";

/** @param {string} date @param {string} [title] */
const item = (date, title = date) => ({ title, path: `/notes/${title}`, date, section: "Notes", html: "" });

test("the five XML specials are escaped, and & first so nothing is escaped twice", () => {
  assert.equal(escapeXml(`a & b < c > d "e" 'f'`), "a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;");
  assert.equal(escapeXml("&lt;"), "&amp;lt;");
});

test("control characters XML cannot carry are dropped; tab and newline stay", () => {
  assert.equal(escapeXml("a\u0000b\u000Bc\td\ne"), "abc\td\ne");
});

test("an ISO day becomes an RFC 822 date at midnight GMT, never shifted by a zone", () => {
  assert.equal(rfc822("2026-09-22"), "Tue, 22 Sep 2026 00:00:00 GMT");
  assert.equal(rfc822("2026-01-01"), "Thu, 01 Jan 2026 00:00:00 GMT");
});

test("newest first, same-day entries keep their order, capped", () => {
  const items = [item("2026-01-01", "a"), item("2026-03-01", "b"), item("2026-03-01", "c"), item("2026-02-01", "d")];
  assert.deepEqual(newestFirst(items).map((i) => i.title), ["b", "c", "d", "a"]);
  assert.equal(newestFirst(items, 2).length, 2);
  const many = Array.from({ length: 80 }, (_, i) => item(`2026-01-${String((i % 28) + 1).padStart(2, "0")}`, `n${i}`));
  assert.equal(newestFirst(many).length, 50, "the default cap is 50");
  assert.deepEqual(newestFirst([]), []);
});

test("plain text becomes escaped paragraphs, blanks skipped", () => {
  assert.equal(paragraphs("a < b", null, "", undefined, "c"), "<p>a &lt; b</p><p>c</p>");
  assert.equal(paragraphs(null), "");
});

test("root-relative links and images go absolute; other URLs are left alone", () => {
  assert.equal(
    absolutize(`<a href="/tools">t</a><img src="/notes/x.webp"><a href="//cdn.x/y">c</a><a href="https://z.com/">z</a>`, ORIGIN),
    `<a href="https://example.com/tools">t</a><img src="https://example.com/notes/x.webp"><a href="//cdn.x/y">c</a><a href="https://z.com/">z</a>`,
  );
});

test("a feed is RSS 2.0 with canonical permalinks, and HTML in a description is escaped once more", () => {
  const xml = renderFeed(
    {
      title: "A & B · Notes",
      description: "d",
      path: "/notes",
      self: "/notes/rss.xml",
      items: [{ ...item("2026-09-22", "one"), html: `<p>1 &lt; 2 <a href="/tools">x</a></p>` }],
    },
    ORIGIN,
  );
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<rss version="2.0"/);
  assert.match(xml, /<title>A &amp; B · Notes<\/title>/);
  assert.match(xml, /<atom:link href="https:\/\/example.com\/notes\/rss.xml" rel="self"/);
  assert.match(xml, /<guid isPermaLink="true">https:\/\/example.com\/notes\/one\/<\/guid>/);
  assert.match(xml, /<pubDate>Tue, 22 Sep 2026 00:00:00 GMT<\/pubDate>/);
  assert.match(xml, /<lastBuildDate>Tue, 22 Sep 2026 00:00:00 GMT<\/lastBuildDate>/);
  assert.match(xml, /<description>&lt;p&gt;1 &amp;lt; 2 &lt;a href=&quot;https:\/\/example.com\/tools&quot;&gt;x&lt;\/a&gt;&lt;\/p&gt;<\/description>/);
});

test("an empty feed is still a valid channel, with no build date to invent", () => {
  const xml = renderFeed({ title: "t", description: "d", path: "/", self: "/rss.xml", items: [] }, ORIGIN);
  assert.doesNotMatch(xml, /<item>|lastBuildDate/);
  assert.match(xml, /<\/channel>\n<\/rss>\n$/);
});
