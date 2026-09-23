/**
 * The list pane's scroll restore, run against a fake pane and storage: a saved
 * position comes back, the current row is pulled into view when it is outside,
 * blocked storage throws nothing, and a hidden pane never saves.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { PANE_KEY, PREPAINT } from "./library-pane.ts";

/**
 * @param {{ saved?: string | null, rowTop?: number, height?: number, blocked?: boolean }} options
 */
function run({ saved = null, rowTop = 100, height = 800, blocked = false }) {
  /** @type {Record<string, () => void>} */
  const handlers = {};
  const row = { offsetTop: rowTop, offsetHeight: 80 };
  const pane = {
    scrollTop: 0,
    clientHeight: height,
    querySelector: () => row,
    /** @param {string} type @param {() => void} fn */
    addEventListener: (type, fn) => (handlers[`pane:${type}`] = fn),
  };
  /** @type {Record<string, string>} */
  const store = saved === null ? {} : { [PANE_KEY]: saved };
  const sessionStorage = {
    /** @param {string} key */
    getItem: (key) => {
      if (blocked) throw new Error("blocked");
      return store[key] ?? null;
    },
    /** @param {string} key @param {string} value */
    setItem: (key, value) => {
      if (blocked) throw new Error("blocked");
      store[key] = value;
    },
  };
  const document = { querySelector: () => pane };
  /** @param {string} type @param {() => void} fn */
  const addEventListener = (type, fn) => (handlers[type] = fn);

  new Function("document", "sessionStorage", "addEventListener", PREPAINT)(
    document,
    sessionStorage,
    addEventListener,
  );
  return { pane, store, handlers };
}

test("a saved position comes back when the current row is inside it", () => {
  assert.equal(run({ saved: "2000", rowTop: 2300 }).pane.scrollTop, 2000);
});

test("the current row is centred when it is outside the pane", () => {
  assert.equal(run({ saved: "0", rowTop: 5000 }).pane.scrollTop, 5000 - (800 - 80) / 2);
  assert.equal(run({ rowTop: 5000 }).pane.scrollTop, 4640);
});

test("pagehide saves, blocked storage throws nothing, a hidden pane never saves", () => {
  const shown = run({ saved: "1200", rowTop: 1300 });
  shown.pane.scrollTop = 1500;
  shown.handlers.pagehide?.();
  assert.equal(shown.store[PANE_KEY], "1500");

  assert.doesNotThrow(() => run({ blocked: true }).handlers.pagehide?.());

  const hidden = run({ height: 0 });
  hidden.handlers.pagehide?.();
  assert.equal(hidden.store[PANE_KEY], undefined);
});
