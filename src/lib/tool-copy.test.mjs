/**
 * The /tools copy caps, under test: the rules on literals, then every entry in
 * `src/data/tools.json`, so an over-long description fails `npm test` and not
 * only `astro build`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { descriptionProblem, noteProblem } from "./tool-copy.ts";

test("a description is a fragment of 7 words or fewer", () => {
  assert.equal(descriptionProblem("Browser automation CLI for agents"), null);
  assert.equal(descriptionProblem("Self-hosted control plane for agent teams"), null);
  assert.match(descriptionProblem("One two three four five six seven eight") ?? "", /over 7 words/);
  assert.match(descriptionProblem("Browser automation CLI.") ?? "", /period/);
  assert.match(descriptionProblem("A browser automation CLI") ?? "", /"A" or "An"/);
  assert.match(descriptionProblem("An agent runtime") ?? "", /"A" or "An"/);
  assert.match(descriptionProblem("Agent runtime — with a gateway") ?? "", /em dash/);
  // "Agent" opens with "A" but not with the article.
  assert.equal(descriptionProblem("Agent workspace for teams"), null);
});

test("a note is 20 words or fewer with no em dash", () => {
  assert.equal(noteProblem("My daily driver. Talks to me over Telegram."), null);
  assert.match(noteProblem(Array(21).fill("word").join(" ")) ?? "", /over 20 words/);
  assert.match(noteProblem("Boots clean — telemetry off.") ?? "", /em dash/);
});

test("every tool in tools.json has a description and passes both caps", () => {
  const tools = JSON.parse(readFileSync(new URL("../data/tools.json", import.meta.url), "utf8"));
  const problems = tools.flatMap((/** @type {{slug: string, description?: string, note: string}} */ tool) => {
    const problem =
      (tool.description === undefined ? "has no description" : descriptionProblem(tool.description)) ??
      noteProblem(tool.note);
    return problem === null ? [] : [`${tool.slug} ${problem}`];
  });
  assert.deepEqual(problems, []);
});
