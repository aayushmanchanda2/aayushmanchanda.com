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
 * `FILTER` against a fake pane: a month header, four rows, the kind links, two
 * tag checkboxes, a chip row, a count, an empty state and the entry's hint
 * row; with `home`, two tagged items in the route's view.
 *
 * @param {{ search?: string, current?: number, home?: string, start?: string, pathname?: string }} options
 */
function filter({ search = "", current = 1, home, start, pathname = "/library/e1" }) {
  /** @param {Record<string, string>} attrs */
  const el = (attrs = {}) => {
    /** @type {Record<string, (event: object) => void>} */
    const on = {};
    /** @type {any[]} */
    const children = [];
    return {
      attrs,
      on,
      children,
      hidden: false,
      checked: false,
      search: "",
      tabIndex: 0,
      href: "",
      textContent: "",
      value: "",
      type: "",
      className: "",
      /** @type {any} */
      parentNode: null,
      /** @param {string} name */
      hasAttribute: (name) => name in attrs,
      /** @param {string} name @param {string} value */
      setAttribute: (name, value) => (attrs[name] = value),
      /** @param {string} name */
      removeAttribute: (name) => delete attrs[name],
      /** @param {string} type @param {(event: object) => void} fn */
      addEventListener: (type, fn) => (on[type] = fn),
      replaceChildren: () => children.splice(0),
      /** @param {any} child */
      append: (child) => children.push(child),
      focus: () => {},
    };
  };
  const month = Object.assign(el(), { dataset: {}, monthCount: el() });
  Object.assign(month, { querySelector: () => month.monthCount });
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
  const boxes = ["agents", "design"].map((tag) => {
    const box = Object.assign(el(), { value: tag, dataset: { label: tag }, count: el() });
    box.parentNode = { querySelector: () => box.count };
    return box;
  });
  const summary = el();
  const chips = Object.assign(el(), {
    parentNode: { querySelector: () => summary },
    /** @returns {any} */
    querySelector: () => chips.children[0] ?? null,
  });
  const count = el();
  const empty = el();
  /** @type {Record<string, ReturnType<typeof el>>} */
  const nav = { prev: el(), next: el(), close: el() };
  const items = ["agents", "design"].map((tags) => Object.assign(el(), { dataset: { tags } }));
  const pane = {
    dataset: { home, start },
    /** @param {string} s */
    querySelectorAll: (s) => (s.includes("data-rows") ? [month, ...rows] : []),
    /** @param {string} s */
    querySelector: (s) => (s.includes("empty") ? empty : rows[current]?.firstElementChild ?? null),
  };
  const hints = { querySelector: (/** @type {string} */ s) => nav[s.match(/"(\w+)"/)?.[1] ?? ""] };
  /** @type {string[]} */
  const replaced = [];
  const document = {
    querySelector: (/** @type {string} */ s) => (s.includes("entry-nav") ? hints : pane),
    /** @param {string} s */
    querySelectorAll: (s) =>
      s.includes("kind-set") ? segs
      : s.includes("tag-set") ? boxes
      : s.includes("tag-chips") ? [chips]
      : s.includes("count") ? [count]
      : s.includes("data-tags") ? items
      : [],
    createElement: () => el(),
    addEventListener: () => {},
  };
  /** @type {string[]} */
  const replacedTo = [];
  const location = { search, pathname, replace: (/** @type {string} */ url) => replacedTo.push(url) };
  const history = {
    replaceState: (/** @type {unknown} */ _, /** @type {string} */ __, /** @type {string} */ url) => {
      replaced.push(url);
      const at = new URL(url, "https://x.test");
      location.pathname = at.pathname;
      location.search = at.search;
    },
  };
  new Function("document", "location", "history", FILTER)(document, location, history);
  /** @param {string} tag @param {boolean} on */
  const tick = (tag, on) => {
    const box = boxes.find((b) => b.value === tag);
    if (!box) throw new Error(tag);
    box.checked = on;
    box.on.change?.({});
  };
  return { rows, month, segs, boxes, chips, summary, count, empty, nav, replaced, items, location: { ...location, replaced: replacedTo }, tick };
}

const shown = (/** @type {{ hidden: boolean }[]} */ rows) => rows.map((row) => (row.hidden ? 0 : 1)).join("");

test("the URL filters the pane, marks the segment, counts, and carries the query on every row", () => {
  const pane = filter({ search: "?kind=post&tags=agents" });
  assert.equal(shown(pane.rows), "0100");
  assert.equal(pane.count.textContent, "1 entry");
  assert.equal(pane.empty.hidden, true);
  assert.deepEqual(pane.boxes.map((box) => box.checked), [true, false]);
  assert.deepEqual(pane.segs.map((seg) => seg.attrs["aria-current"] ?? "-"), ["-", "-", "true", "-"]);
  assert.ok(pane.rows.every((row) => row.firstElementChild.search === "?kind=post&tags=agents"));

  const typo = filter({ search: "?kind=podcast&tags=nope" });
  assert.equal(shown(typo.rows), "1111");
  assert.equal(typo.segs[0]?.attrs["aria-current"], "true");
  assert.equal(typo.count.textContent, "4 entries");
});

test("two tags are AND, and the old single ?tag= still reads", () => {
  const both = filter({ search: "?tags=agents,design" });
  assert.equal(shown(both.rows), "0100");
  assert.deepEqual(both.boxes.map((box) => box.checked), [true, true]);
  assert.equal(shown(filter({ search: "?tag=design" }).rows), "0100");
});

test("a month header recounts to what the filter shows, and hides at zero", () => {
  const all = filter({});
  assert.equal(all.month.monthCount.textContent, 4);
  assert.equal(all.month.hidden, false);
  assert.equal(filter({ search: "?kind=video" }).month.monthCount.textContent, 1);
  const none = filter({ search: "?kind=article&tags=design" });
  assert.equal(none.month.hidden, true);
  assert.equal(none.empty.hidden, false);
});

test("each tag counts the shown rows that carry it", () => {
  const pane = filter({ search: "?kind=post" });
  assert.deepEqual(pane.boxes.map((box) => box.count.textContent), [1, 1]);
  assert.deepEqual(filter({}).boxes.map((box) => box.count.textContent), [3, 1]);
});

test("one tab stop, on the current row, or the first shown row when the filter hides it", () => {
  assert.deepEqual(filter({ search: "?kind=post" }).rows.map((row) => row.firstElementChild.tabIndex), [-1, 0, -1, -1]);
  assert.deepEqual(filter({ search: "?kind=video" }).rows.map((row) => row.firstElementChild.tabIndex), [-1, -1, -1, 0]);
});

test("a plain click filters in place and replaces the URL; a modifier click is left alone", () => {
  const pane = filter({ search: "?tags=design" });
  let prevented = false;
  pane.segs[1]?.on.click?.({ button: 0, preventDefault: () => (prevented = true) });
  assert.ok(prevented);
  assert.deepEqual(pane.replaced, ["/library/e1?kind=article&tags=design"]);

  const modified = filter({});
  modified.segs[2]?.on.click?.({ button: 0, metaKey: true, preventDefault: () => assert.fail("took a cmd-click") });
  assert.deepEqual(modified.replaced, []);
});

test("ticking two tags narrows with AND, writes ?tags=a,b, and close, prev and next follow", () => {
  const pane = filter({});
  pane.tick("agents", true);
  assert.deepEqual(pane.replaced, ["/library/e1?tags=agents"]);
  assert.equal(shown(pane.rows), "1101");
  assert.equal(pane.nav.close?.search, "?tags=agents");
  assert.equal(pane.nav.next?.href, "/library/e3");
  assert.equal(pane.nav.prev?.href, "/library/e0");
  assert.equal(pane.nav.next?.attrs["aria-label"], "Next entry: Entry 3");

  pane.tick("design", true);
  assert.equal(pane.replaced.at(-1), "/library/e1?tags=agents,design");
  assert.equal(shown(pane.rows), "0100");
  assert.ok(pane.rows.every((row) => row.firstElementChild.search === "?tags=agents,design"));
});

test("the chips name each tag, remove one, and Clear resets", () => {
  const pane = filter({ search: "?tags=agents,design" });
  assert.equal(pane.chips.hidden, false);
  assert.deepEqual(pane.chips.children.map((chip) => chip.attrs["aria-label"]), ["Remove tag agents", "Remove tag design", "Clear tags"]);

  pane.chips.children[0].on.click?.({});
  assert.equal(pane.replaced.at(-1), "/library/e1?tags=design");
  assert.deepEqual(pane.boxes.map((box) => box.checked), [false, true]);

  pane.chips.children.at(-1).on.click?.({});
  assert.equal(pane.replaced.at(-1), "/library/e1");
  assert.equal(shown(pane.rows), "1111");
  assert.equal(pane.chips.hidden, true);
});

test("on /library and a kind route, a kind press is the segment's own link, carrying the tags", () => {
  const index = filter({ home: "/library", start: "", pathname: "/library", search: "?tags=design", current: -1 });
  assert.equal(shown(index.rows), "0100");
  assert.equal(index.rows[1]?.firstElementChild.search, "?tags=design");
  index.segs[2]?.on.click?.({ button: 0, preventDefault: () => assert.fail("a kind press on /library navigates") });
  assert.equal(index.segs[2]?.search, "?tags=design");
  assert.deepEqual(index.replaced, []);

  // The route's own segment stays put.
  let prevented = false;
  index.segs[0]?.on.click?.({ button: 0, preventDefault: () => (prevented = true) });
  assert.ok(prevented);
});

test("a kind route starts on its kind, and a tag replaces its own path and narrows the view", () => {
  const route = filter({ home: "/library", start: "video", pathname: "/library/kind/video", current: -1 });
  assert.equal(shown(route.rows), "0001");
  assert.equal(route.rows[3]?.firstElementChild.search, "?kind=video");
  assert.equal(route.segs[3]?.attrs["aria-current"], "true");

  route.tick("design", true);
  assert.deepEqual(route.replaced, ["/library/kind/video?tags=design"]);
  assert.deepEqual(route.items.map((item) => item.hidden), [true, false]);
});

test("a /library?kind= from before the split replaces to the kind's route", () => {
  const legacy = filter({ home: "/library", start: "", pathname: "/library", search: "?kind=post&tag=agents", current: -1 });
  assert.deepEqual(legacy.location.replaced, ["/library/kind/post?tags=agents"]);
  const unknown = filter({ home: "/library", start: "", pathname: "/library", search: "?kind=podcast", current: -1 });
  assert.deepEqual(unknown.location.replaced, []);
});
