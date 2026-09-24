import assert from "node:assert/strict";
import { test } from "node:test";

import { cardHtml } from "./og-render.ts";

const card = { page: "/tools/x", section: "tools", title: "A <b>&", line: null, label: "Library · post", picture: null, logo: null, letter: null };

test("a card is the section's stamp, with its words escaped, the domain pill and the section chip", () => {
  const html = cardHtml(card, "");
  assert.match(html, /data-section="tools"/);
  assert.match(html, /A &lt;b&gt;&amp;<\/h1>/);
  assert.match(html, /class="tag tag--domain">aayushmanchanda\.com</);
  assert.match(html, /class="tag tag--section">Library · post</);
  assert.doesNotMatch(html, /card__pic|card__line/, "no picture and no line: neither is drawn");
  assert.match(cardHtml({ ...card, section: "other" }, ""), /data-section=""/, "/about takes the plain mat");
  assert.doesNotMatch(cardHtml({ ...card, label: "" }, ""), /tag--section/, "a section index carries no chip");
});
