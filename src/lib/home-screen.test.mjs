/**
 * The /tools home screen's two decisions (VET-253): which tools sit in the
 * Dock, and which keys start and stop jiggle mode.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { DOCK_CAP, dockTools, jiggleKey } from "./home-screen.ts";

/** @param {string} slug @param {string} verdict @param {string} status_date */
const tool = (slug, verdict, status_date) => ({ slug, verdict, status_date });

test("the Dock holds the using tools, newest verdict first, capped", () => {
  const tools = [
    tool("old", "using", "2026-01-02"),
    tool("skip", "skipped", "2026-09-01"),
    tool("new", "using", "2026-09-10"),
    tool("mid", "using", "2026-05-05"),
  ];
  assert.deepEqual(dockTools(tools).map((t) => t.slug), ["new", "mid", "old"]);
  const many = Array.from({ length: 12 }, (_, i) => tool(`t${i}`, "using", `2026-01-${String(i + 10)}`));
  assert.equal(dockTools(many).length, DOCK_CAP);
  assert.equal(dockTools(many)[0].slug, "t11");
});

/** @param {string} k @param {Partial<Parameters<typeof jiggleKey>[0]>} [extra] */
const key = (k, extra = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  repeat: false,
  target: null,
  ...extra,
});

test("e toggles, Escape only exits, fields and modifiers are left alone", () => {
  assert.equal(jiggleKey(key("e"), false), "toggle");
  assert.equal(jiggleKey(key("E"), true), "toggle");
  assert.equal(jiggleKey(key("Escape"), true), "exit");
  assert.equal(jiggleKey(key("Escape"), false), null);
  assert.equal(jiggleKey(key("e", { metaKey: true }), false), null);
  assert.equal(jiggleKey(key("e", { repeat: true }), false), null);
  const field = /** @type {EventTarget} */ (
    /** @type {unknown} */ ({ closest: (/** @type {string} */ selector) => (selector.includes("select") ? {} : null) })
  );
  assert.equal(jiggleKey(key("e", { target: field }), false), null);
  assert.equal(jiggleKey(key("x"), false), null);
});
