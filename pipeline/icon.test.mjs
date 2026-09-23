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

import { ICON_SIZE, REJECTED, fetchIcon } from "./icon.mjs";

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

test("the manifest's largest icon is next, then logo.dev with fallback=404", async () => {
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
  const logoDev = asked.find((url) => url.startsWith("https://img.logo.dev/eve.dev?"));
  assert.ok(logoDev?.includes("fallback=404"), "logo.dev is asked last, and asked not to invent a monogram");
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

test("a repo with no homepage is the letter, with nothing fetched but the repo record", async () => {
  const icons = await dir();
  const { fetch, asked } = server({ "https://api.github.com/repos/block/buzz": { homepage: null } });

  assert.equal(await fetchIcon({ slug: "buzz", url: "https://github.com/block/buzz", dir: icons, fetch }), null);
  assert.deepEqual(asked, ["https://api.github.com/repos/block/buzz"]);
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

test("a rejected icon stays rejected, even under --force", async () => {
  const [slug] = REJECTED;
  assert.ok(slug, "the list has an entry to test with");
  const { fetch, asked } = server({});

  assert.equal(await fetchIcon({ slug, url: "https://eve.dev/", dir: await dir(), fetch, force: true }), null);
  assert.deepEqual(asked, []);
});
