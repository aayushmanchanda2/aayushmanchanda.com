import assert from "node:assert/strict";
import { test } from "node:test";

import { fitDescription, fitTitle, withNames } from "./meta.ts";

test("a long title drops the section, then the site name, never the name's words", () => {
  assert.equal(fitTitle("Short · Tools · Aayush Manchanda"), "Short · Tools · Aayush Manchanda");
  assert.equal(fitTitle("How we built Interfere's new website · Library · Aayush Manchanda"), "How we built Interfere's new website · Aayush Manchanda");
  assert.equal(fitTitle("Inside OpenAI's forward deployed engineer role and more · Library · Aayush Manchanda"), "Inside OpenAI's forward deployed engineer role and more");
  const long = "x".repeat(70);
  assert.equal(fitTitle(`${long} · Library · Aayush Manchanda`), long);
});

test("a long description is cut at a word, under 160, with an ellipsis", () => {
  const text = "word ".repeat(50).trim();
  const fitted = fitDescription(text);
  assert.ok(fitted.length <= 160 && fitted.endsWith("word…"), fitted);
  assert.equal(fitDescription("Short."), "Short.");
});

test("a filter page's description lists as many names as fit", () => {
  assert.equal(withNames("1 link I saved from x.com.", ["A post"]), "1 link I saved from x.com: A post.");
  assert.equal(withNames("2 links I filed under design.", ["A", "B"]), "2 links I filed under design: A and B.");
  const many = withNames("40 tools I filed under design.", Array.from({ length: 40 }, (_, i) => `Tool number ${i}`));
  assert.ok(many.length <= 160 && / and \d+ more\.$/.test(many), many);
});
