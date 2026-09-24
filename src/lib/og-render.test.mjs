import assert from "node:assert/strict";
import { test } from "node:test";

import { cardHtml } from "./og-render.ts";

const card = { page: "/tools/x", section: "tools", title: "A <b>&", line: null, label: "Tools", date: "2026-08-26", picture: null, logo: null, letter: null };

test("a card is the section's stamp, with its words escaped and its date struck", () => {
  const html = cardHtml(card, "");
  assert.match(html, /data-section="tools"/);
  assert.match(html, /A &lt;b&gt;&amp;<\/h1>/);
  assert.match(html, />AUG 26<\/text>.*>2026<\/text>/s);
  assert.doesNotMatch(html, /card__pic|card__line/, "no picture and no line: neither is drawn");
  assert.match(cardHtml({ ...card, section: "other" }, ""), /data-section=""/, "/about takes the plain mat");
});
