/**
 * The shared parser floor, under test.
 *
 * `lib/parse.ts` is the one module every data boundary leans on, and until now
 * the only thing exercising it was `astro build` reading four files that
 * happened to be valid. That proves the happy path and nothing else: the whole
 * value of these readers is what they do to a file that is *wrong*, and the
 * error messages are half of why they exist.
 *
 * `readOptional` is the reason this file appeared. It is the one reader whose
 * correct answer to a missing key is "nothing" rather than "stop", so it is the
 * one reader where a bug is silent — a field quietly folded to null renders as
 * a details page missing a paragraph, which looks exactly like an entry nobody
 * has written up yet. Nothing downstream would notice.
 *
 * Run by `npm test` alongside the pipeline suite. `--experimental-strip-types`
 * is what lets a `.mjs` test import a `.ts` module directly; `lib/parse.ts` is
 * importable from Node because it has no imports of its own and touches no
 * filesystem, unlike `lib/tools.ts` and `lib/sites.ts`, which read JSON and
 * `public/` at module load and only resolve inside a bundler.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { ISO_DATE, SLUG, readers, routeSlug } from "./parse.ts";

const READ = readers("tools.json");

/**
 * Asserts that `run` throws, and that the message says where and what.
 *
 * Fragments rather than a whole string: the point of these messages is that a
 * person can act on them, so what is pinned is the filename, the entry, the key
 * and the way out. Pinning the sentence around them would make every reword a
 * failing test.
 *
 * @param {() => unknown} run
 * @param {...string} fragments
 */
function failsWith(run, ...fragments) {
  assert.throws(run, (error) => {
    assert.ok(error instanceof Error);
    for (const fragment of fragments) {
      assert.ok(
        error.message.includes(fragment),
        `message ${JSON.stringify(error.message)} is missing ${JSON.stringify(fragment)}`,
      );
    }
    return true;
  });
}

/* ---------------------------------------------------------------------------
   readOptional — absent is an answer
   --------------------------------------------------------------------------- */

test("a missing optional field reads as null, not as an error", () => {
  assert.equal(READ.readOptional({}, "like", "entry 0"), null);
});

test("an explicit null reads as null, so blanking a field is the same as deleting it", () => {
  assert.equal(READ.readOptional({ like: null }, "like", "entry 0"), null);
});

test("a present optional field comes back exactly as authored", () => {
  const authored = "  Its X postprocessor is the only reliable way I read tweets.  ";
  assert.equal(
    READ.readOptional({ like: authored }, "like", "entry 0"),
    authored,
    "trimming here would silently rewrite what the page shows",
  );
});

test("an empty optional field stops the build rather than rendering an empty block", () => {
  failsWith(
    () => READ.readOptional({ like: "" }, "like", "entry 0"),
    "src/data/tools.json",
    "entry 0",
    '"like"',
    "Leave the key out to say nothing",
  );
});

test("a whitespace-only optional field is empty too", () => {
  failsWith(
    () => READ.readOptional({ dislike: "   \n  " }, "dislike", "entry 4"),
    "entry 4",
    '"dislike"',
  );
});

test("a non-string optional field names the value it got", () => {
  for (const value of [42, true, [], {}]) {
    failsWith(
      () => READ.readOptional({ why: value }, "why", "entry 2"),
      '"why"',
      JSON.stringify(value),
    );
  }
});

test("each optional field is read independently, so one sentence does not imply four", () => {
  const entry = { like: "Good.", try: "npx -y firecrawl-cli@latest" };

  assert.equal(READ.readOptional(entry, "like", "entry 0"), "Good.");
  assert.equal(READ.readOptional(entry, "dislike", "entry 0"), null);
  assert.equal(READ.readOptional(entry, "why", "entry 0"), null);
  assert.equal(
    READ.readOptional(entry, "try", "entry 0"),
    "npx -y firecrawl-cli@latest",
  );
});

test("every data file names itself in its own optional-field error", () => {
  failsWith(
    () => readers("sites.json").readOptional({ like: "" }, "like", "entry 3"),
    "src/data/sites.json",
  );
});

/* ---------------------------------------------------------------------------
   The floor the optional reader sits next to
   --------------------------------------------------------------------------- */

test("a required string is not optional: absent is an error, not null", () => {
  failsWith(() => READ.readString({}, "note", "entry 0"), "non-empty string", '"note"');
  failsWith(() => READ.readString({ note: "" }, "note", "entry 0"), '"note"');
});

test("a date that matches the shape but is not a day is rejected", () => {
  assert.equal(READ.readDate({ status_date: "2026-08-26" }, "status_date", "entry 0"), "2026-08-26");
  failsWith(
    () => READ.readDate({ status_date: "2026-02-31" }, "status_date", "entry 0"),
    "real YYYY-MM-DD date",
  );
  assert.ok(ISO_DATE.test("2026-02-31"), "the shape alone cannot catch that one");
});

test("routeSlug folds free text down to one route segment", () => {
  assert.equal(routeSlug("designengineer.tools"), "designengineer-tools");
  assert.equal(routeSlug("  Agent Infra  "), "agent-infra");
  assert.equal(routeSlug("!!!"), "", "no URL-safe characters is an answer callers check for");
  assert.ok(SLUG.test(routeSlug("Reference Libraries")));
});

test("isRecord separates an object from the two things that pretend to be one", () => {
  assert.equal(READ.isRecord({}), true);
  assert.equal(READ.isRecord([]), false);
  assert.equal(READ.isRecord(null), false);
});
