/**
 * The list pane's scroll restore, run against a fake pane and storage: a saved
 * position comes back, the current row is pulled into view when it is outside,
 * blocked storage throws nothing, and a hidden pane never saves.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { FILTER, PANE_KEY, PREPAINT, paneStep } from "./library-pane.ts";

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

test("Up, Down, Home and End walk the pane rows and stop at the ends", () => {
  assert.equal(paneStep("ArrowDown", 3, 10), 4);
  assert.equal(paneStep("ArrowDown", 9, 10), 9);
  assert.equal(paneStep("ArrowUp", 0, 10), 0);
  assert.equal(paneStep("Home", 5, 10), 0);
  assert.equal(paneStep("End", 5, 10), 9);
  assert.equal(paneStep("j", 5, 10), null);
});

/**
 * `FILTER` against a fake pane: four rows, the kind links, the tag select, a
 * count, an empty state and the entry's hint row; with `home`, the /library
 * shell's four views and two tagged items in them.
 *
 * @param {{ search?: string, current?: number, home?: string, start?: string, pathname?: string }} options
 */
function filter({ search = "", current = 1, home, start, pathname = "/library/e1" }) {
  /** @param {Record<string, string>} attrs */
  const el = (attrs = {}) => {
    /** @type {Record<string, (event: object) => void>} */
    const on = {};
    return {
      attrs,
      on,
      hidden: false,
      search: "",
      tabIndex: 0,
      href: "",
      textContent: "",
      value: "",
      /** @param {string} name */
      hasAttribute: (name) => name in attrs,
      /** @param {string} name @param {string} value */
      setAttribute: (name, value) => (attrs[name] = value),
      /** @param {string} name */
      removeAttribute: (name) => delete attrs[name],
      /** @param {string} type @param {(event: object) => void} fn */
      addEventListener: (type, fn) => (on[type] = fn),
    };
  };
  const rows = [
    ["article", "agents"],
    ["post", "agents design"],
    ["post", ""],
    ["video", "agents"],
  ].map(([kind, tags], index) => {
    const a = Object.assign(el(index === current ? { "aria-current": "page" } : {}), { href: `/library/e${index}` });
    const li = Object.assign(el(), {
      dataset: { kind, tags },
      firstElementChild: a,
      querySelector: () => ({ textContent: `Entry ${index}` }),
    });
    Object.assign(a, { parentNode: li });
    return li;
  });
  const segs = ["", "article", "post", "video"].map((kind) => Object.assign(el(), { dataset: { kindSet: kind } }));
  const select = Object.assign(el(), { options: [{ value: "" }, { value: "agents" }, { value: "design" }] });
  const count = el();
  const empty = el();
  /** @type {Record<string, ReturnType<typeof el>>} */
  const nav = { prev: el(), next: el(), close: el() };
  const views = ["", "article", "post", "video"].map((view) => Object.assign(el(), { dataset: { view } }));
  const items = ["agents", "design"].map((tags) => Object.assign(el(), { dataset: { tags } }));
  const pane = {
    dataset: { home, start },
    /** @param {string} s */
    querySelectorAll: (s) => (s.includes("data-rows") ? rows : []),
    /** @param {string} s */
    querySelector: (s) =>
      s.startsWith("select") ? select
      : s.includes("count") ? count
      : s.includes("empty") ? empty
      : rows[current]?.firstElementChild ?? null,
  };
  const hints = { querySelector: (/** @type {string} */ s) => nav[s.match(/"(\w+)"/)?.[1] ?? ""] };
  /** @type {string[]} */
  const replaced = [];
  /** @type {string[]} */
  const pushed = [];
  const document = {
    querySelector: (/** @type {string} */ s) => (s.includes("entry-nav") ? hints : pane),
    /** @param {string} s */
    querySelectorAll: (s) =>
      s.includes("kind-set") ? segs
      : s.includes("tag-set") ? [select]
      : s.includes("count") ? [count]
      : s.includes("data-tags") ? items
      : s.includes("data-view") ? views
      : [],
    addEventListener: () => {},
  };
  const location = { search, pathname };
  /** @param {string[]} log */
  const record = (log) => (/** @type {unknown} */ _, /** @type {string} */ __, /** @type {string} */ url) => {
    log.push(url);
    const at = new URL(url, "https://x.test");
    location.pathname = at.pathname;
    location.search = at.search;
  };
  const history = { replaceState: record(replaced), pushState: record(pushed) };
  /** @type {Record<string, () => void>} */
  const on = {};
  const addEventListener = (/** @type {string} */ type, /** @type {() => void} */ fn) => (on[type] = fn);
  new Function("document", "location", "history", "addEventListener", FILTER)(document, location, history, addEventListener);
  return { rows, segs, select, count, empty, nav, replaced, pushed, views, items, location, on };
}

const shown = (/** @type {{ hidden: boolean }[]} */ rows) => rows.map((row) => (row.hidden ? 0 : 1)).join("");

test("the URL filters the pane, marks the segment, counts, and carries the query on every row", () => {
  const pane = filter({ search: "?kind=post&tag=agents" });
  assert.equal(shown(pane.rows), "0100");
  assert.equal(pane.count.textContent, "1 entry");
  assert.equal(pane.empty.hidden, true);
  assert.equal(pane.select.value, "agents");
  assert.deepEqual(pane.segs.map((seg) => seg.attrs["aria-current"] ?? "-"), ["-", "-", "true", "-"]);
  assert.ok(pane.rows.every((row) => row.firstElementChild.search === "?kind=post&tag=agents"));

  const typo = filter({ search: "?kind=podcast&tag=nope" });
  assert.equal(shown(typo.rows), "1111");
  assert.equal(typo.segs[0]?.attrs["aria-current"], "true");
  assert.equal(typo.count.textContent, "4 entries");
});

test("one tab stop, on the current row, or the first shown row when the filter hides it", () => {
  assert.deepEqual(filter({ search: "?kind=post" }).rows.map((row) => row.firstElementChild.tabIndex), [-1, 0, -1, -1]);
  assert.deepEqual(filter({ search: "?kind=video" }).rows.map((row) => row.firstElementChild.tabIndex), [-1, -1, -1, 0]);
});

test("a plain click filters in place and replaces the URL; a modifier click is left alone", () => {
  const pane = filter({ search: "?tag=design" });
  let prevented = false;
  pane.segs[1]?.on.click?.({ button: 0, preventDefault: () => (prevented = true) });
  assert.ok(prevented);
  assert.deepEqual(pane.replaced, ["/library/e1?kind=article&tag=design"]);

  const modified = filter({});
  modified.segs[2]?.on.click?.({ button: 0, metaKey: true, preventDefault: () => assert.fail("took a cmd-click") });
  assert.deepEqual(modified.replaced, []);
});

test("the tag select narrows, and close, prev and next follow the rows it shows", () => {
  const pane = filter({});
  pane.select.value = "agents";
  pane.select.on.change?.({});
  assert.deepEqual(pane.replaced, ["/library/e1?tag=agents"]);
  assert.equal(shown(pane.rows), "1101");
  assert.equal(pane.nav.close?.search, "?tag=agents");
  assert.equal(pane.nav.next?.href, "/library/e3");
  assert.equal(pane.nav.prev?.href, "/library/e0");
  assert.equal(pane.nav.next?.attrs["aria-label"], "Next entry: Entry 3");
});

const view = (/** @type {{ hidden: boolean, dataset: { view: string } }[]} */ views) =>
  views.find((v) => !v.hidden)?.dataset.view;

test("on /library the kind picks the view, pushes ?kind=, and Back replays it", () => {
  const index = filter({ home: "/library", start: "", pathname: "/library", current: -1 });
  assert.equal(view(index.views), "");
  assert.equal(shown(index.rows), "1111");

  index.segs[2]?.on.click?.({ button: 0, preventDefault: () => {} });
  assert.deepEqual(index.pushed, ["/library?kind=post"]);
  assert.equal(view(index.views), "post");
  assert.equal(shown(index.rows), "0110");

  // A tag narrows the rows and the tagged items in the views, and replaces.
  index.select.value = "design";
  index.select.on.change?.({});
  assert.deepEqual(index.replaced, ["/library?kind=post&tag=design"]);
  assert.deepEqual(index.items.map((item) => item.hidden), [true, false]);

  // Back to /library: All again, every item shown.
  Object.assign(index.location, { pathname: "/library", search: "" });
  index.on.popstate?.();
  assert.equal(view(index.views), "");
  assert.deepEqual(index.items.map((item) => item.hidden), [false, false]);
});

test("a kind route starts on its kind and swaps to /library?kind=", () => {
  const route = filter({ home: "/library", start: "video", pathname: "/library/kind/video", current: -1 });
  assert.equal(view(route.views), "video");
  assert.equal(route.rows[0]?.firstElementChild.search, "?kind=video");

  route.segs[0]?.on.click?.({ button: 0, preventDefault: () => {} });
  assert.deepEqual(route.pushed, ["/library"]);
  assert.equal(view(route.views), "");

  // Back lands on the kind route with no query: its own kind again.
  Object.assign(route.location, { pathname: "/library/kind/video", search: "" });
  route.on.popstate?.();
  assert.equal(view(route.views), "video");
});
