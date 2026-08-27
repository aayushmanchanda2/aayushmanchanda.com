/**
 * The URL rules, under test.
 *
 * `lib/links.ts` answers three questions that used to be answered in eight
 * places: is this link ours, what does it read as, and what do we draw beside
 * it. Two of them are now load-bearing in a way they were not:
 *
 *   - **`githubRepo`** decides what may be written into a /tools entry's
 *     `repo`, and — pointed the other way — what may *not* be written into its
 *     `url`. Both are build-stopping rules, so the shape they test for has to
 *     be exact: `github.com/block/buzz` is a repository, and a profile, a
 *     branch, a file, a gist and a release are not.
 *   - **`markFor`** is where the decision *not* to fetch GitHub avatars lives.
 *     It is one branch, and the reason a test guards it is that the branch is
 *     easy to add back without noticing that /privacy would then be wrong. See
 *     the note on that function.
 *
 * The last test in the file is the one that could not live anywhere else: the
 * publish pipeline keeps its own copy of the repository rule, because it runs
 * as plain `.mjs` outside the bundler and cannot import this module. This file
 * can import both, so it holds them to the contract that matters — whatever
 * `repoFrom` writes into a gallery, `githubRepo` accepts unchanged.
 *
 * Importable from Node because `lib/links.ts` imports only `lib/site.ts`, which
 * is two constants and a `new URL`. `lib/tools.ts` reads JSON at module load
 * and is still not testable this way; see the header of `parse.test.mjs`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { repoFrom } from "../../pipeline/entries.mjs";
import {
  absolutize,
  faviconUrl,
  githubRepo,
  isInternal,
  linkLabel,
  markFor,
  repoOwner,
} from "./links.ts";

/* ---------------------------------------------------------------------------
   githubRepo
   --------------------------------------------------------------------------- */

test("a two-segment github.com URL is a repository", () => {
  assert.equal(githubRepo("https://github.com/block/buzz"), "https://github.com/block/buzz");
  assert.equal(
    githubRepo("https://github.com/laude-institute/headlong"),
    "https://github.com/laude-institute/headlong",
  );
});

test("the spellings that mean the same repository are folded to one", () => {
  const canonical = "https://github.com/block/buzz";
  assert.equal(githubRepo("https://github.com/block/buzz/"), canonical, "trailing slash");
  assert.equal(githubRepo("https://github.com/block/buzz.git"), canonical, "clone URL");
  assert.equal(githubRepo("https://www.github.com/block/buzz"), canonical, "www");
  assert.equal(githubRepo("http://github.com/block/buzz"), canonical, "http");
  assert.equal(githubRepo("https://GitHub.com/block/buzz"), canonical, "host case");
});

test("the owner and the name keep their own case", () => {
  // Folding these would break the link: GitHub redirects, but the label under
  // the row would stop matching the repository anyone else sees.
  assert.equal(
    githubRepo("https://github.com/NousResearch/hermes-agent"),
    "https://github.com/NousResearch/hermes-agent",
  );
});

test("a profile is not a repository", () => {
  assert.equal(githubRepo("https://github.com/block"), null);
  assert.equal(githubRepo("https://github.com/"), null);
});

test("a branch, a file, a release and an issue are not repositories", () => {
  // Three or more segments. The parser refuses these outright; the pipeline
  // folds them, which is the one place the two rules differ on purpose.
  assert.equal(githubRepo("https://github.com/block/buzz/tree/main"), null);
  assert.equal(githubRepo("https://github.com/block/buzz/blob/main/README.md"), null);
  assert.equal(githubRepo("https://github.com/block/buzz/releases/tag/v1"), null);
  assert.equal(githubRepo("https://github.com/block/buzz/issues/7"), null);
});

test("another host on the same site is not a repository", () => {
  assert.equal(githubRepo("https://gist.github.com/block/abc123"), null);
  assert.equal(githubRepo("https://block.github.io/buzz"), null);
  assert.equal(githubRepo("https://raw.githubusercontent.com/block/buzz/main/x"), null);
  assert.equal(githubRepo("https://github.company.com/block/buzz"), null, "not a subdomain of ours");
});

test("a query or a fragment is not part of a repository's identity", () => {
  assert.equal(githubRepo("https://github.com/block/buzz?utm_source=x"), null);
  assert.equal(githubRepo("https://github.com/block/buzz#readme"), null);
});

test("nonsense is null rather than a throw", () => {
  // Called on hand-edited JSON, so it has to survive anything a person typed.
  assert.equal(githubRepo("not a url"), null);
  assert.equal(githubRepo(""), null);
  assert.equal(githubRepo("git@github.com:block/buzz.git"), null, "ssh is not http(s)");
  assert.equal(githubRepo("javascript:alert(1)"), null);
});

test("repoOwner is the owner, and empty for anything that is not a repo", () => {
  assert.equal(repoOwner("https://github.com/block/buzz"), "block");
  assert.equal(repoOwner("https://github.com/laude-institute/headlong"), "laude-institute");
  assert.equal(repoOwner("https://eve.dev"), "");
  assert.equal(repoOwner("nonsense"), "");
});

/* ---------------------------------------------------------------------------
   markFor
   --------------------------------------------------------------------------- */

test("a tool with a product site gets that site's logo", () => {
  assert.deepEqual(markFor({ name: "Eve", url: "https://eve.dev" }), {
    kind: "logo",
    src: faviconUrl("https://eve.dev"),
  });
});

test("a tool with no product site gets its own initial, not a GitHub avatar", () => {
  /*
   * The assertion that matters is the second one. A repository-only row could
   * show `github.com/{owner}.png`, and the reason it does not is a privacy
   * decision written down in `markFor` and depended on by /privacy, which
   * claims logo.dev is the only third party the site touches. If somebody adds
   * that branch, this fails and sends them to the page they have to edit.
   */
  const mark = markFor({ name: "Papercuts", url: null });
  assert.deepEqual(mark, { kind: "initial", letter: "P" });
});

test("the initial is the first letter or digit, whatever leads the name", () => {
  /**
   * `.mono` uppercases at render, so the stored letter keeps the name's case.
   *
   * @param {string} name
   */
  const initial = (name) => markFor({ name, url: null });

  assert.deepEqual(initial("cloudflare-os"), { kind: "initial", letter: "c" });
  assert.deepEqual(initial("improve (shadcn skill)"), { kind: "initial", letter: "i" });
  assert.deepEqual(initial("  Buzz"), { kind: "initial", letter: "B" }, "leading space skipped");
  assert.deepEqual(initial("1Password"), { kind: "initial", letter: "1" }, "a digit counts");
  assert.deepEqual(initial("λ-calc"), { kind: "initial", letter: "λ" }, "any script, not Latin only");
});

test("a name with nothing to print asks for an empty square rather than throwing", () => {
  assert.deepEqual(markFor({ name: "!!!", url: null }), { kind: "initial", letter: "" });
});

/* ---------------------------------------------------------------------------
   The pieces the sections already leaned on
   --------------------------------------------------------------------------- */

test("linkLabel drops the protocol noise and keeps the path", () => {
  assert.equal(linkLabel("https://github.com/block/buzz"), "github.com/block/buzz");
  assert.equal(linkLabel("https://www.trysynara.com/"), "trysynara.com", "www and bare slash go");
  assert.equal(linkLabel("https://eve.dev"), "eve.dev");
});

test("faviconUrl asks logo.dev for the host, and only the host", () => {
  const src = faviconUrl("https://www.trysynara.com/pricing?ref=x");
  assert.ok(src.startsWith("https://img.logo.dev/trysynara.com?"), src);
  assert.ok(!src.includes("pricing"), "a path is not part of a logo lookup");
});

test("logo.dev is still the only third-party host a mark can name", () => {
  /*
   * /privacy says so in a section titled "The one outside request". This is the
   * cheapest possible check that the sentence is still true of the code: every
   * mark the site can draw either points at logo.dev or is a letter.
   */
  for (const entry of [
    { name: "Eve", url: "https://eve.dev" },
    { name: "Buzz", url: null },
  ]) {
    const mark = markFor(entry);
    if (mark.kind === "logo") {
      assert.equal(new URL(mark.src).hostname, "img.logo.dev", entry.name);
    }
  }
});

test("isInternal and absolutize still split on the leading slash", () => {
  assert.equal(isInternal("/tools"), true);
  assert.equal(isInternal("https://eve.dev"), false);
  assert.equal(absolutize("/tools"), "https://aayushmanchanda.com/tools");
  assert.equal(absolutize("https://eve.dev"), "https://eve.dev", "already absolute, untouched");
});

/* ---------------------------------------------------------------------------
   The pipeline's copy of the repository rule
   --------------------------------------------------------------------------- */

test("whatever the pipeline files as a repo, the parser accepts unchanged", () => {
  /*
   * The one test holding two implementations together. `pipeline/entries.mjs`
   * cannot import `lib/links.ts` — it runs as plain `.mjs` outside the bundler
   * — so the rule is written twice, and this is what stops the copies drifting.
   * The contract is not "they are the same function"; it is that everything the
   * writing side produces, the reading side accepts without rewriting it.
   */
  const saved = [
    "https://github.com/block/buzz",
    "https://github.com/block/buzz/",
    "https://github.com/block/buzz.git",
    "https://github.com/block/buzz/tree/main",
    "https://github.com/block/buzz/blob/main/README.md",
    "https://www.github.com/NousResearch/hermes-agent",
    "https://github.com/block/buzz?utm_source=newsletter",
  ];

  for (const url of saved) {
    const repo = repoFrom(url);
    if (repo === null) assert.fail(`the pipeline should file ${url} as a repository`);
    assert.equal(
      githubRepo(repo),
      repo,
      `the parser would reject or rewrite what the pipeline wrote for ${url}`,
    );
  }
});

test("the two copies agree about what is not a repository at all", () => {
  for (const url of [
    "https://github.com/block",
    "https://gist.github.com/block/abc123",
    "https://eve.dev",
    "not a url",
  ]) {
    assert.equal(repoFrom(url), null, url);
    assert.equal(githubRepo(url), null, url);
  }
});
