/**
 * The convergence rules, tested straight against fixture directories.
 *
 * `reconcile()` is the only repair path the pipeline has, so its edges matter
 * more than its happy case: it must not touch files it does not own, and it
 * must not throw away a whole state file over one unreadable row.
 */

import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { exists, makeRepo, readJson } from "./fixtures.mjs";
import { loadState, reconcile, saveState } from "./state.mjs";

test("a published row whose entry left the gallery goes back to pending", async (t) => {
  const { paths } = await makeRepo(t, {
    state: {
      42: { kind: "published", slug: "gone", section: "sites", at: "2026-08-01T00:00:00.000Z" },
      43: { kind: "published", slug: "linear", section: "tools", at: "2026-08-01T00:00:00.000Z" },
    },
    tools: [{ slug: "linear", name: "Linear" }],
  });

  const report = await reconcile({ paths });

  assert.deepEqual(report.downgraded, ["42"]);
  assert.equal(report.state["42"].kind, "pending");
  assert.equal(report.state["43"].kind, "published", "an entry that is still there is left alone");

  // And it was persisted, not only fixed in memory.
  assert.equal((await loadState(paths))["42"].kind, "pending");
});

test("reconcile only sweeps files that look like its own shots", async (t) => {
  const { paths } = await makeRepo(t, {
    shots: ["ghost.webp", "og-image.png", "README.md"],
  });

  const report = await reconcile({ paths });

  assert.deepEqual(report.orphans, ["ghost.webp"]);
  assert.ok(await exists(path.join(paths.shotsDir, "og-image.png")));
  assert.ok(await exists(path.join(paths.shotsDir, "README.md")));
});

test("a shot still referenced by its entry survives the sweep", async (t) => {
  const entry = {
    slug: "otherkind",
    url: "https://otherkind.design",
    shot: "/shots/otherkind.webp",
    palette: ["#101010"],
  };
  // `stray.webp` is the control: same directory, same extension, nothing
  // pointing at it. Without it this test could pass on a sweep that never ran.
  const { paths } = await makeRepo(t, {
    sites: [entry],
    shots: ["otherkind.webp", "stray.webp"],
  });

  const report = await reconcile({ paths });

  assert.deepEqual(report.orphans, ["stray.webp"]);
  assert.ok(await exists(path.join(paths.shotsDir, "otherkind.webp")));
});

test("a dry run reports the same repairs and performs none of them", async (t) => {
  const { paths } = await makeRepo(t, {
    state: { 42: { kind: "published", slug: "gone", section: "sites", at: "" } },
    shots: ["ghost.webp"],
  });

  const report = await reconcile({ paths, dryRun: true });

  assert.deepEqual(report.downgraded, ["42"]);
  assert.deepEqual(report.orphans, ["ghost.webp"]);
  assert.ok(await exists(path.join(paths.shotsDir, "ghost.webp")));
  assert.equal((await readJson(paths.statePath))["42"].kind, "published");
});

test("one unreadable row is dropped; the rest of the file survives", async (t) => {
  const { paths } = await makeRepo(t);
  await writeFile(
    paths.statePath,
    JSON.stringify({
      1: { kind: "published", slug: "keep", section: "sites", at: "2026-08-01T00:00:00.000Z" },
      2: { kind: "teleported" },
      3: { kind: "published", slug: "keep", section: "elsewhere" },
    }),
  );

  const state = await loadState(paths);

  assert.deepEqual(Object.keys(state), ["1"]);
});

test("state is written sorted, so its diffs read as changes", async (t) => {
  const { paths } = await makeRepo(t);

  await saveState(paths, {
    30: { kind: "pending", attempts: 1 },
    10: { kind: "pending", attempts: 0 },
    20: { kind: "failed", attempts: 3, lastError: "nope", at: "" },
  });

  assert.deepEqual(Object.keys(await readJson(paths.statePath)), ["10", "20", "30"]);
});
