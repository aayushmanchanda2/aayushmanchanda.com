/**
 * The post-publish editor, on its own.
 *
 * This is the only writer a published /library entry has, so the interesting
 * cases are all about refusing rather than writing. Three groups of them:
 *
 *   - finding the entry, where the failure that matters is finding the WRONG
 *     one. A link comes back off a phone share sheet with tracking on it, out of
 *     the address bar with a `www.`, or pasted from Raindrop; all three are the
 *     same entry and a raw string compare says two of them do not exist.
 *   - refusing a partial, because everything this writes lands in a file the
 *     build parses strictly. A three-quarter digest written here is a failed
 *     build later, at which point the person who typed it has gone to bed.
 *   - the push, where the expected failure is a race with the publish workflow
 *     and the required outcome is that a rejected push never looks like a
 *     successful edit.
 *
 * `git` is injected everywhere below. Nothing here runs a real one.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { makeRepo, readJson } from "./fixtures.mjs";
import { PatchError, commitAndPush, parseArgs, patchLibrary } from "./patch.mjs";

const URL_A = "https://gumclaw.github.io/how-i-work/";

/** Two entries: one plain, one already carrying most of what a patch can set. */
const SEED = [
  {
    slug: "how-gumclaw-works",
    title: "How Gumclaw Works",
    url: URL_A,
    domain: "gumclaw.github.io",
    saved_date: "2026-07-20",
    kind: "article",
    note: "A whole agent setup written up in public.",
    tags: ["agents"],
  },
  {
    slug: "termius-tailscale-tmux",
    title: "Termius + Tailscale + tmux",
    url: "https://x.com/termiushq/status/2082616764605874207",
    domain: "x.com",
    saved_date: "2026-07-30",
    kind: "post",
  },
];

/** @param {import("node:test").TestContext} t */
async function repo(t) {
  const { paths } = await makeRepo(t, { reading: structuredClone(SEED) });
  /** @type {string[]} */
  const lines = [];
  return { paths, lines, log: (/** @type {string} */ line) => lines.push(line) };
}

/**
 * @param {import("node:test").TestContext} t
 * @param {import("./types.js").Patch} patch
 */
async function apply(t, patch) {
  const { paths, lines, log } = await repo(t);
  const result = await patchLibrary({ patch, paths, log, commit: false });
  const entries = await readJson(paths.libraryJson);
  return { result, entries, lines, paths };
}

/* ---------------------------------------------------------------------------
   Finding the entry
   --------------------------------------------------------------------------- */

test("a link finds its entry however it was spelled on the way back", async (t) => {
  // The same `urlKey` the publish run dedupes with, for the same reason: these
  // are four spellings of one link, and a raw compare says three do not exist.
  for (const url of [
    URL_A,
    "http://gumclaw.github.io/how-i-work",
    "https://www.gumclaw.github.io/how-i-work/",
    `${URL_A}?utm_source=telegram`,
  ]) {
    const { result } = await apply(t, { url, tags: ["agents", "harnesses"] });
    assert.equal(result.slug, "how-gumclaw-works", url);
  }
});

test("a slug is taken literally, because it is the key the pipeline writes", async (t) => {
  const { result } = await apply(t, { slug: "termius-tailscale-tmux", note: "The SSH path back in." });

  assert.equal(result.slug, "termius-tailscale-tmux");
});

test("a patch that names nothing, or nothing that exists, is refused", async (t) => {
  const { paths, log } = await repo(t);
  const run = (/** @type {any} */ patch) => patchLibrary({ patch, paths, log, commit: false });

  await assert.rejects(run({}), PatchError);
  await assert.rejects(run({ note: "x" }), /has to name an entry/);
  await assert.rejects(run({ slug: "nope" }), /no \/library entry has the slug "nope"/);
  await assert.rejects(run({ url: "https://elsewhere.example" }), /no \/library entry points at/);
});

test("a link two entries answer to is refused rather than half-applied", async (t) => {
  // A duplicate in the gallery is a real problem, and picking one of the pair
  // would apply the edit to half of it and hide the duplicate at the same time.
  const { paths } = await makeRepo(t, {
    reading: [SEED[0], { ...SEED[0], slug: "how-gumclaw-works-2" }],
  });

  await assert.rejects(
    patchLibrary({ patch: { url: URL_A, note: "x" }, paths, log: () => {}, commit: false }),
    /2 \/library entries point at .* — patch one by --slug/,
  );
});

/* ---------------------------------------------------------------------------
   What a patch may set
   --------------------------------------------------------------------------- */

test("tags are folded the same way the publish run folds them", async (t) => {
  // So a tag typed here and the same tag typed in Raindrop cannot become two
  // collections with one route between them.
  const { entries } = await apply(t, { url: URL_A, tags: ["Go To Market", "agents", "published"] });

  assert.deepEqual(entries[0].tags, ["agents", "go-to-market"]);
});

test("clearing a field removes the key rather than writing a null", async (t) => {
  // How every other optional field in these files spells "nothing".
  const { entries } = await apply(t, { url: URL_A, tags: null, note: null });

  assert.equal("tags" in entries[0], false);
  assert.equal("note" in entries[0], false);
});

test("every tag removed is the key removed, because an empty array is refused", async (t) => {
  const { entries } = await apply(t, { url: URL_A, tags: ["!!!", "published"] });

  assert.equal("tags" in entries[0], false, "a fold that empties the list clears the field");
});

test("a why lands in its own field, never inside the draft", async (t) => {
  const { entries } = await apply(t, {
    url: URL_A,
    why: "Two rules are worth stealing straight into my stack.",
    draft: { bullets: ["The loop in one line."], drafted: "2026-08-30" },
  });

  assert.equal(entries[0].why, "Two rules are worth stealing straight into my stack.");
  assert.equal(entries[0].draft.why, null);
});

test("a digest is all four fields or it is not written", async (t) => {
  // The strictest refusal here, and the one worth being strict about: a digest
  // is what earns an entry its detail page, so three quarters of one would
  // publish a page built around a verdict nobody wrote.
  const { paths, log } = await repo(t);
  const run = (/** @type {any} */ digest) =>
    patchLibrary({ patch: { url: URL_A, digest }, paths, log, commit: false });

  await assert.rejects(run({ bullets: ["One."], why: "x", digested: "2026-08-30" }), /verdict/);
  await assert.rejects(run({ verdict: "Read it.", why: "x", digested: "2026-08-30" }), /needs bullets/);
  await assert.rejects(run({ bullets: [], verdict: "a", why: "b", digested: "2026-08-30" }), /needs bullets/);
  await assert.rejects(
    run({ bullets: ["One."], verdict: "a", why: "b", digested: "2026-02-31" }),
    /not a day that exists/,
  );
  await assert.rejects(run("a digest"), /has to be an object/);
});

test("a draft with neither bullets nor a why is refused, and so is a bad date", async (t) => {
  const { paths, log } = await repo(t);
  const run = (/** @type {any} */ draft) =>
    patchLibrary({ patch: { url: URL_A, draft }, paths, log, commit: false });

  await assert.rejects(run({ drafted: "2026-08-30" }), /neither bullets nor a why/);
  await assert.rejects(run({ bullets: ["a\nb"], drafted: "2026-08-30" }), /one non-empty line/);
  await assert.rejects(run({ why: "x", drafted: "30 August" }), /YYYY-MM-DD/);
});

test("a blank sentence is a mistake, and clearing is spelled null", async (t) => {
  const { paths, log } = await repo(t);

  await assert.rejects(
    patchLibrary({ patch: { url: URL_A, note: "   " }, paths, log, commit: false }),
    /has to be a sentence, or null to clear it/,
  );
});

/* ---------------------------------------------------------------------------
   Writing
   --------------------------------------------------------------------------- */

test("only the entry named is touched, and the file stays whole", async (t) => {
  const { entries } = await apply(t, { url: URL_A, note: "Rewritten." });

  assert.equal(entries.length, 2);
  assert.equal(entries[0].note, "Rewritten.");
  assert.equal(entries[0].title, "How Gumclaw Works", "everything else is left alone");
  assert.deepEqual(entries[1], SEED[1], "and so is every other entry");
});

test("a patch that changes nothing writes nothing and says so", async (t) => {
  const { result, lines } = await apply(t, { url: URL_A, tags: ["agents"] });

  assert.deepEqual(result.changed, []);
  assert.match(String(lines[0]), /already said that/);
});

test("the log names the entry and every field that moved", async (t) => {
  const { result, lines } = await apply(t, { url: URL_A, note: "Rewritten.", why: "Worth the hour." });

  assert.deepEqual(result.changed, ["note", "why"]);
  assert.match(String(lines[0]), /how-gumclaw-works — note, why/);
});

/* ---------------------------------------------------------------------------
   Getting it onto the remote
   --------------------------------------------------------------------------- */

/**
 * A `git` that records what it was asked and fails the calls named.
 *
 * @param {object} [options]
 * @param {number[]} [options.pushFails] 1-based push attempts that are rejected.
 * @param {boolean} [options.rebaseFails]
 * @param {string} [options.staged] What `diff --cached` reports.
 */
function fakeGit({ pushFails = [], rebaseFails = false, staged = "src/data/library.json" } = {}) {
  /** @type {string[][]} */
  const calls = [];
  let pushes = 0;

  /** @param {string[]} args */
  const git = (args) => {
    calls.push(args);
    if (args[0] === "diff") return `${staged}\n`;
    if (args[0] === "push") {
      pushes += 1;
      if (pushFails.includes(pushes)) {
        throw Object.assign(new Error("Command failed"), {
          stderr: "hint: Updates were rejected because the remote contains work\n",
        });
      }
    }
    if (args[0] === "pull" && rebaseFails) {
      throw Object.assign(new Error("Command failed"), { stderr: "error: could not apply\n" });
    }
    return "";
  };

  return { calls, git, verbs: () => calls.map((args) => args.join(" ")) };
}

test("one file is staged by name, and it is the only one", async (t) => {
  const { paths, lines, log } = await repo(t);
  const { calls, git } = fakeGit();

  await patchLibrary({ patch: { url: URL_A, note: "Rewritten." }, paths, log, git });

  assert.deepEqual(calls[0], ["add", "--", "src/data/library.json"]);
  assert.equal(lines.some((line) => line.includes("not pushed")), false);
});

test("the commit message says which entry and which fields", async (t) => {
  const { paths, log } = await repo(t);
  const { calls, git } = fakeGit();

  await patchLibrary({ patch: { url: URL_A, note: "Rewritten." }, paths, log, git });

  const commit = calls.find((args) => args[0] === "commit");
  assert.deepEqual(commit, ["commit", "-m", "library: how-gumclaw-works — note"]);
});

test("a push race is rebased and retried once, and that is enough", () => {
  // The expected failure, not a surprise: the publish workflow pushes to this
  // branch on a schedule, so a patch made while a run is finishing lands on a
  // ref that moved.
  const { git, verbs } = fakeGit({ pushFails: [1] });
  /** @type {string[]} */
  const lines = [];

  const pushed = commitAndPush({
    root: "/tmp",
    file: "src/data/library.json",
    message: "library: x",
    log: (line) => lines.push(line),
    git,
  });

  assert.equal(pushed, true);
  assert.deepEqual(verbs(), [
    "add -- src/data/library.json",
    "diff --cached --name-only",
    "commit -m library: x",
    "push",
    "pull --rebase",
    "push",
  ]);
  assert.match(String(lines[0]), /the remote moved/);
});

test("a second rejection stops, and the message says the edit is not lost", () => {
  // "Committed, not pushed" is a state a person can finish by hand. A loop that
  // kept retrying would hide a real problem behind noise.
  const { git, verbs } = fakeGit({ pushFails: [1, 2] });
  /** @type {string[]} */
  const lines = [];

  const pushed = commitAndPush({
    root: "/tmp",
    file: "src/data/library.json",
    message: "library: x",
    log: (line) => lines.push(line),
    git,
  });

  assert.equal(pushed, false);
  assert.equal(verbs().filter((verb) => verb === "push").length, 2, "twice, never three times");
  assert.match(String(lines.at(-1)), /committed, not pushed/);
  assert.match(String(lines.at(-1)), /push it by hand/);
  assert.match(String(lines.at(-1)), /Updates were rejected/, "and quotes what git said");
});

test("a rebase that will not apply stops too, without a third push", () => {
  const { git, verbs } = fakeGit({ pushFails: [1], rebaseFails: true });
  /** @type {string[]} */
  const lines = [];

  assert.equal(
    commitAndPush({
      root: "/tmp",
      file: "src/data/library.json",
      message: "library: x",
      log: (line) => lines.push(line),
      git,
    }),
    false,
  );
  assert.equal(verbs().filter((verb) => verb === "push").length, 1);
  assert.match(String(lines.at(-1)), /the rebase failed/);
});

test("a write that staged nothing is not committed", () => {
  const { git, verbs } = fakeGit({ staged: "" });
  /** @type {string[]} */
  const lines = [];

  assert.equal(
    commitAndPush({ root: "/tmp", file: "f", message: "m", log: (line) => lines.push(line), git }),
    false,
  );
  assert.equal(verbs().some((verb) => verb.startsWith("commit")), false);
});

/* ---------------------------------------------------------------------------
   The CLI
   --------------------------------------------------------------------------- */

test("the flags parse into the patch the verb takes", () => {
  assert.deepEqual(
    parseArgs(["--url", URL_A, "--tags", "agents, Go To Market", "--note", "Rewritten."]),
    { patch: { url: URL_A, tags: ["agents", " Go To Market"], note: "Rewritten." }, commit: true },
  );
  assert.deepEqual(parseArgs(["--slug", "s", "--no-commit"]), {
    patch: { slug: "s" },
    commit: false,
  });
});

test("an empty value is how the CLI spells clearing a field", () => {
  assert.deepEqual(parseArgs(["--slug", "s", "--tags", "", "--note", "", "--digest", ""]).patch, {
    slug: "s",
    tags: null,
    note: null,
    digest: null,
  });
});

test("a JSON flag that is not JSON says so before anything is written", () => {
  assert.throws(() => parseArgs(["--slug", "s", "--draft", "{bullets:[]}"]), /--draft is not JSON/);
});

test("an unknown flag prints the usage rather than being ignored", () => {
  assert.throws(() => parseArgs(["--slug", "s", "--verdict", "x"]), (error) => {
    assert.ok(error instanceof PatchError);
    assert.match(error.message, /unknown argument "--verdict"/);
    assert.match(error.message, /usage: node pipeline\/patch\.mjs/);
    return true;
  });
  assert.throws(() => parseArgs(["--slug"]), /--slug needs a value/);
});
