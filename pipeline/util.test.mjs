import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { backfill, writeAtomic } from "./util.mjs";

test("writeAtomic replaces the file, creates its directory, and leaves no .tmp", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "util-"));
  try {
    const file = path.join(dir, "icons", "x.webp");
    await writeAtomic(file, "old");
    await writeAtomic(file, new Uint8Array([104, 105]));
    assert.equal(await readFile(file, "utf8"), "hi");
    assert.deepEqual(await readdir(path.join(dir, "icons")), ["x.webp"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a failed writeAtomic removes its .tmp and keeps nothing half-written", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "util-"));
  try {
    // A directory where the file should be: the write succeeds, the rename cannot.
    const file = path.join(dir, "state.json");
    await mkdir(file);
    await writeFile(path.join(file, "keep"), "");
    await assert.rejects(writeAtomic(file, "{}"));
    assert.deepEqual((await readdir(dir)).sort(), ["state.json"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("backfill visits every item once, never more than n at a time", async () => {
  const items = Array.from({ length: 10 }, (_, i) => i);
  /** @type {number[]} */
  const seen = [];
  let running = 0;
  let peak = 0;
  await backfill(
    items,
    async (item) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, item % 3));
      seen.push(item);
      running -= 1;
    },
    3,
  );
  assert.deepEqual(seen.sort((a, b) => a - b), items);
  assert.equal(peak, 3);
  await backfill([], async () => assert.fail("no items, no calls"), 3);
});
