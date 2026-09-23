/**
 * The /tools and /sites list-or-grid choice, under test.
 *
 * The pre-paint script is a string nothing type-checks, so it is run here
 * against a fake `document` and `localStorage`: a stored view comes back, and
 * garbage, absence and blocked storage all land on the page's default.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { BUTTON_ATTRIBUTE, SITES_VIEW, TOOLS_VIEW, prepaint as source } from "./view-toggle.ts";

/**
 * Run the pre-paint script with `stored` in storage (or a throwing storage).
 * Returns the attribute it set on `<html>`, each button's `aria-pressed`, and
 * whether the toggle's group is still hidden.
 *
 * @param {string | null | Error} stored
 * @param {import("./view-toggle.ts").ViewConfig} config
 */
function prepaint(stored, config = TOOLS_VIEW) {
  /** @type {Map<string, string>} */
  const html = new Map();
  const buttons = config.views.map((view) => new Map([[BUTTON_ATTRIBUTE, view]]));
  const group = { hidden: true };
  /** @param {Map<string, string>} own */
  const element = (own) => ({
    parentElement: group,
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
      assert.equal(key, config.storageKey);
      if (stored instanceof Error) throw stored;
      return stored;
    },
  };
  new Function("document", "localStorage", source(config))(document, localStorage);
  return {
    view: html.get(config.attribute),
    pressed: Object.fromEntries(buttons.map((b) => [b.get(BUTTON_ATTRIBUTE), b.get("aria-pressed")])),
    hidden: group.hidden,
  };
}

test("the two views: list first on /tools, grid first on /sites", () => {
  assert.deepEqual([...TOOLS_VIEW.views], ["list", "grid"]);
  assert.equal(TOOLS_VIEW.defaultView, "list");
  assert.equal(SITES_VIEW.defaultView, "grid");
  assert.notEqual(TOOLS_VIEW.storageKey, SITES_VIEW.storageKey);
});

test("the pre-paint script applies a stored view and presses its button", () => {
  assert.deepEqual(prepaint("grid"), { view: "grid", pressed: { list: "false", grid: "true" }, hidden: false });
  assert.deepEqual(prepaint("list"), { view: "list", pressed: { list: "true", grid: "false" }, hidden: false });
});

test("the pre-paint script lands on the list for garbage, absence and blocked storage", () => {
  for (const stored of [null, "", "GRID", "cards", new Error("SecurityError")]) {
    assert.deepEqual(prepaint(stored), { view: "list", pressed: { list: "true", grid: "false" }, hidden: false });
  }
});

test("/sites lands on the gallery and keeps its own key", () => {
  assert.deepEqual(prepaint(null, SITES_VIEW), { view: "grid", pressed: { grid: "true", list: "false" }, hidden: false });
  assert.deepEqual(prepaint("list", SITES_VIEW), { view: "list", pressed: { grid: "false", list: "true" }, hidden: false });
});
