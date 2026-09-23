/** `cleanName` against the proposal's hand-verified titles (VET-241 d1-proposal §4). */

import assert from "node:assert/strict";
import test from "node:test";

import { cleanName } from "./names.mjs";

/** @type {[string, string, string | null][]} */
const CASES = [
  ["Voyage AI | Home", "https://voyageai.com", "Voyage AI"],
  ["Pricing | Railcode", "https://railcode.dev", "Railcode"],
  ["Own Your AI: Apps, Models, and Infrastructure | Adapt", "https://adapt.com", "Adapt"],
  ["DialKit — Tune interfaces in real time", "https://dialkit.dev", "DialKit"],
  ["Akai by Deel — The agent platform built for operations", "https://akai.run", "Akai"],
  ["Deals for builders · Build in Public", "https://buildinpublic.com/deals", "Build in Public"],
  ["Built by Designers: No Explanation Needed", "https://builtbydesigners.com", "Built by Designers"],
  ["AI accounting for startups in Stockholm — Bronn", "https://bronnhq.com", "Bronn"],
  ["Arc from The Browser Company", "https://arc.net", "Arc"],
  ["On-device AI models and SDKs", "https://desertant.com", null],
];

for (const [title, url, expected] of CASES) {
  test(`cleanName: ${JSON.stringify(title)} -> ${JSON.stringify(expected)}`, () => {
    assert.equal(cleanName(title, url), expected);
  });
}

test("cleanName: a GitHub page title keeps owner/name, never 'GitHub'", () => {
  assert.equal(cleanName("GitHub - block/buzz: A workspace for agents", "https://github.com/block/buzz"), "block/buzz");
});

test("cleanName: an empty title, or one with a separator it cannot split, is null", () => {
  assert.equal(cleanName("", "https://eve.dev"), null);
  assert.equal(cleanName("Eve|Sandbox", "https://example.com"), null);
});
