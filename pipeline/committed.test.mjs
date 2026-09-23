/**
 * What a run writes is what gets committed. `committedPaths` is derived from
 * `resolvePaths`, so this watches the other two places that can drift: a write
 * site outside `resolvePaths`, and the workflow's own leftover-commit list.
 */

import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import { NESTED, READING_ID, SITES_ID, TOOLS_ID, bookmark, deps, makeRepo, raindropServer, recorder } from "./fixtures.mjs";
import { postFrom } from "./post.mjs";
import { committedPaths, run } from "./publish.mjs";
import { resolvePaths } from "./state.mjs";

/** Every file under `root`, repo-relative, with its mtime. @param {string} root */
async function snapshot(root) {
  const names = await readdir(root, { recursive: true });
  /** @type {Map<string, number>} */
  const files = new Map();
  for (const name of names) {
    const info = await stat(path.join(root, name));
    if (info.isFile()) files.set(name.split(path.sep).join("/"), info.mtimeMs);
  }
  return files;
}

/** @param {string} file @param {readonly string[]} committed */
const covered = (file, committed) => committed.some((entry) => file === entry || file.startsWith(`${entry}/`));

test("every file a run writes, a post's media included, is under a committed path", async (t) => {
  const { root, paths } = await makeRepo(t);
  const server = raindropServer({
    ...NESTED,
    raindrops: {
      [SITES_ID]: [bookmark(1, "https://otherkind.design", { title: "Otherkind" })],
      [TOOLS_ID]: [bookmark(2, "https://linear.app", { title: "Linear", excerpt: "Issue tracker." })],
      [READING_ID]: [bookmark(3, "https://x.com/ecomEddie/status/1755217559312269550")],
    },
  });
  const tweet = JSON.parse(await readFile(new URL("./fixtures/syndication-1755217559312269550.json", import.meta.url), "utf8"));
  const jpeg = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#345" } }).jpeg().toBuffer();
  /** @type {typeof globalThis.fetch} */
  const fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("tweet-result")) return Response.json(tweet);
    if (url.includes("twimg.com")) return new Response(jpeg);
    return server.fetch(input, init);
  };

  const before = await snapshot(root);
  const code = await run([], { ...deps({ paths, server, out: recorder() }), fetch, postFrom });
  assert.equal(code, 0);
  const after = await snapshot(root);

  const written = [...after].filter(([file, mtime]) => before.get(file) !== mtime).map(([file]) => file);
  assert.ok(written.some((file) => file.startsWith("public/posts/")), "the post's media was written");
  const committed = committedPaths(paths);
  assert.deepEqual(written.filter((file) => !covered(file, committed)), [], "written but never committed");
});

test("the workflow's leftover commit stages every committed path", async () => {
  const workflow = await readFile(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");
  const listed = /paths=\(([^)]*)\)/.exec(workflow)?.[1]?.trim().split(/\s+/) ?? [];
  const committed = committedPaths(resolvePaths(path.resolve("repo")));
  assert.deepEqual(committed.filter((entry) => !covered(entry, listed)), []);
});

