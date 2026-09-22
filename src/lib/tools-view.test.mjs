/**
 * The /tools list-or-grid choice, under test.
 *
 * The pre-paint script is a string nothing type-checks, so it is run here
 * against a fake `document` and `localStorage`: a stored view comes back, and
 * garbage, absence and blocked storage all land on the list.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  ATTRIBUTE,
  BUTTON_ATTRIBUTE,
  DEFAULT_VIEW,
  PREPAINT,
  STORAGE_KEY,
  VIEWS,
  isView,
  toView,
} from "./tools-view.ts";

/**
 * Run the pre-paint script with `stored` in storage (or a throwing storage).
 * Returns the attribute it set on `<html>` and each button's `aria-pressed`.
 *
 * @param {string | null | Error} stored
 */
function prepaint(stored) {
  /** @type {Map<string, string>} */
  const html = new Map();
  const buttons = VIEWS.map((view) => new Map([[BUTTON_ATTRIBUTE, view]]));
  /** @param {Map<string, string>} own */
  const element = (own) => ({
    /** @param {string} name */
    getAttribute: (name) => own.get(name) ?? null,
    /** @param {string} name @param {string} value */
    setAttribute: (name, value) => own.set(name, value),
  });
  const document = {
    documentElement: element(html),
    /** @param {string} selector */
    querySelectorAll: (selector) => {
      assert.equal(selector, `[${BUTTON_ATTRIBUTE}]`);
      return buttons.map(element);
    },
  };
  const localStorage = {
    /** @param {string} key */
    getItem(key) {
      assert.equal(key, STORAGE_KEY);
      if (stored instanceof Error) throw stored;
      return stored;
    },
  };
  new Function("document", "localStorage", PREPAINT)(document, localStorage);
  return {
    view: html.get(ATTRIBUTE),
    pressed: Object.fromEntries(buttons.map((b) => [b.get(BUTTON_ATTRIBUTE), b.get("aria-pressed")])),
  };
}

test("the two views, with list as the default", () => {
  assert.deepEqual([...VIEWS], ["list", "grid"]);
  assert.equal(DEFAULT_VIEW, "list");
  for (const view of VIEWS) assert.equal(isView(view), true);
});

test("anything else falls back to the list", () => {
  for (const value of ["", "GRID", "cards", null, undefined, 0, {}]) {
    assert.equal(isView(value), false);
    assert.equal(toView(value), "list");
  }
  assert.equal(toView("grid"), "grid");
});

test("the pre-paint script applies a stored view and presses its button", () => {
  assert.deepEqual(prepaint("grid"), { view: "grid", pressed: { list: "false", grid: "true" } });
  assert.deepEqual(prepaint("list"), { view: "list", pressed: { list: "true", grid: "false" } });
});

test("the pre-paint script lands on the list for garbage, absence and blocked storage", () => {
  for (const stored of [null, "", "GRID", "cards", new Error("SecurityError")]) {
    assert.deepEqual(prepaint(stored), { view: "list", pressed: { list: "true", grid: "false" } });
  }
});
