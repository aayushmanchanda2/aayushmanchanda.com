/**
 * `icon.mjs` against a `fetch` that answers from a literal: which image wins,
 * that a GitHub avatar never does, and that every failure ends in the letter.
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import { ICON_SIZE, fetchIcon, siteOf } from "./icon.mjs";

/** @param {string} text */
const b64 = (text) => Buffer.from(text).toString("base64");

/** @param {number} edge */
const png = (edge) =>
  sharp({ create: { width: edge, height: edge, channels: 4, background: "#ff5500" } }).png().toBuffer();

/**
 * @param {Record<string, string | Buffer | object>} routes
 * @returns {{ fetch: typeof globalThis.fetch, asked: string[] }}
 */
function server(routes) {
  /** @type {string[]} */
  const asked = [];
  /** @type {typeof globalThis.fetch} */
  const fetch = async (input) => {
    const url = String(input);
    asked.push(url);
    const hit = Object.entries(routes).find(([prefix]) => url.startsWith(prefix))?.[1];
    if (hit === undefined) return new Response("not found", { status: 404 });
    if (Buffer.isBuffer(hit)) return new Response(new Uint8Array(hit));
    return new Response(typeof hit === "string" ? hit : JSON.stringify(hit));
  };
  return { fetch, asked };
}

const dir = () => mkdtemp(path.join(tmpdir(), "icon-"));

test("the declared apple-touch-icon wins, stored as a 256px WebP", async () => {
  const icons = await dir();
  const { fetch } = server({
    "https://eve.dev/touch.png": await png(180),
    "https://eve.dev/": `<head><link rel="apple-touch-icon" sizes="180x180" href="/touch.png"></head>`,
  });

  const file = await fetchIcon({ slug: "eve", url: "https://eve.dev/", dir: icons, fetch });

  assert.equal(file, path.join(icons, "eve.webp"));
  const meta = await sharp(await readFile(String(file))).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ["webp", ICON_SIZE, ICON_SIZE]);
});

test("the manifest's largest icon is next", async () => {
  const icons = await dir();
  const { fetch, asked } = server({
    "https://eve.dev/big.png": await png(512),
    "https://eve.dev/app.webmanifest": {
      icons: [{ src: "/small.png", sizes: "48x48" }, { src: "/big.png", sizes: "512x512" }],
    },
    "https://eve.dev/": `<link rel="manifest" href="/app.webmanifest">`,
  });

  assert.ok(await fetchIcon({ slug: "eve", url: "https://eve.dev/", dir: icons, fetch }));
  assert.ok(asked.includes("https://eve.dev/big.png"));
  assert.ok(!asked.includes("https://eve.dev/small.png"), "the largest is tried first and wins");
});

test("a favicon too small for the 60px mark is passed over, and nothing usable means the letter", async () => {
  const icons = await dir();
  const { fetch, asked } = server({
    "https://eve.dev/apple-touch-icon.png": await png(32),
    "https://eve.dev/": "<html></html>",
  });

  assert.equal(await fetchIcon({ slug: "eve", url: "https://eve.dev/", dir: icons, fetch }), null);
  assert.ok(!asked.some((url) => url.includes("logo.dev")), "logo.dev is never copied: the page asks it live");
});

test("a repo-only tool uses the repo's homepage, and never a GitHub avatar", async () => {
  const icons = await dir();
  const { fetch, asked } = server({
    "https://api.github.com/repos/block/buzz": { homepage: "buzz.dev" },
    "https://buzz.dev/apple-touch-icon.png": await png(180),
    "https://buzz.dev/": `<link rel="apple-touch-icon" href="https://avatars.githubusercontent.com/u/1">`,
  });

  assert.ok(await fetchIcon({ slug: "buzz", url: "https://github.com/block/buzz", dir: icons, fetch }));
  assert.ok(!asked.some((url) => /githubusercontent|github\.com\/block\.png/.test(url)), asked.join("\n"));
});

test("a repo with no homepage and no README site is the letter, with nothing fetched but GitHub's API", async () => {
  const icons = await dir();
  const { fetch, asked } = server({
    "https://api.github.com/repos/block/buzz/readme": { content: b64("# Buzz\n[![ci](https://img.shields.io/x)](https://github.com/block/buzz/actions)") },
    "https://api.github.com/repos/block/buzz": { homepage: null },
  });

  assert.equal(await fetchIcon({ slug: "buzz", url: "https://github.com/block/buzz", dir: icons, fetch }), null);
  assert.deepEqual(asked, ["https://api.github.com/repos/block/buzz", "https://api.github.com/repos/block/buzz/readme"]);
});

test("a repo with no homepage falls back to the site its README names", async () => {
  const readme = "# Buzz\n\n[![npm](https://img.shields.io/npm/v/buzz)](https://npmjs.com/buzz)\n[Docs](https://buzz.dev/docs) · [Blog](https://block.xyz/blog)\n\n## Install\n[Website](https://late.dev)";
  const { fetch } = server({
    "https://api.github.com/repos/block/buzz/readme": { content: b64(readme) },
    "https://api.github.com/repos/block/buzz": { homepage: "" },
  });

  assert.equal(await siteOf("https://github.com/block/buzz", fetch), "https://buzz.dev/docs");
});

test("a white-on-transparent icon that flattens to a blank square is passed over", async () => {
  const white = await sharp({ create: { width: 180, height: 180, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0.5 } } }).png().toBuffer();
  const { fetch } = server({
    "https://eve.dev/apple-touch-icon.png": white,
    "https://eve.dev/": "<html></html>",
  });

  assert.equal(await fetchIcon({ slug: "eve", url: "https://eve.dev/", dir: await dir(), fetch }), null);
});

test("a network that throws everywhere ends in the letter, not an error", async () => {
  const icons = await dir();
  /** @type {typeof globalThis.fetch} */
  const fetch = async () => {
    throw new Error("The operation was aborted due to timeout");
  };

  assert.equal(await fetchIcon({ slug: "eve", url: "https://eve.dev/", dir: icons, fetch }), null);
});

test("an icon on disk is kept without a request, unless forced", async () => {
  const icons = await dir();
  await writeFile(path.join(icons, "eve.webp"), "already here");
  const { fetch, asked } = server({ "https://eve.dev/apple-touch-icon.png": await png(180) });

  assert.ok(await fetchIcon({ slug: "eve", url: "https://eve.dev/", dir: icons, fetch }));
  assert.deepEqual(asked, []);

  await fetchIcon({ slug: "eve", url: "https://eve.dev/", dir: icons, fetch, force: true });
  assert.notEqual(await readFile(path.join(icons, "eve.webp"), "utf8"), "already here");
});
