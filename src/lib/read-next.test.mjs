import test from "node:test";
import assert from "node:assert/strict";
import { readNext, related } from "./read-next.ts";

const notes = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => ({ id }));
/** @param {{ id: string }[]} list */
const ids = (list) => list.map((note) => note.id);

test("read next leaves out the page it is on and stops at five", () => {
  const picks = readNext("c", notes);
  assert.equal(picks.length, 5);
  assert.ok(!ids(picks).includes("c"));
  assert.equal(new Set(ids(picks)).size, 5, "no note twice");
});

test("read next is the same draw on every build, and a different one per page", () => {
  assert.deepEqual(ids(readNext("c", notes)), ids(readNext("c", [...notes].reverse())));
  /** @param {string} slug */
  const shared = (slug) => ids(readNext(slug, notes, 8)).filter((id) => id !== "a" && id !== "b");
  assert.notDeepEqual(shared("a"), shared("b"), "two pages rank the same notes differently");
});

test("a site with one note has nothing to read next", () => {
  assert.deepEqual(readNext("a", [{ id: "a" }]), []);
});

/** @param {string} id @param {string[]} tags @param {string} group @param {string} date */
const e = (id, tags, group, date) => ({ id, tags, group, date });
const facts = (/** @type {ReturnType<typeof e>} */ x) => x;

test("related ranks shared tags, then the same group, then the newest, and stops at three", () => {
  const me = e("me", ["agents", "writing"], "post", "2026-09-01");
  const pool = [
    me,
    e("old-two-tags", ["agents", "writing"], "video", "2026-01-01"),
    e("one-tag", ["agents"], "article", "2026-09-20"),
    e("group-new", [], "post", "2026-09-23"),
    e("group-old", [], "post", "2026-02-01"),
    e("unrelated", ["cooking"], "video", "2026-09-24"),
  ];
  assert.deepEqual(ids(related(me, pool, facts)), ["old-two-tags", "one-tag", "group-new"]);
});

test("related never includes the entry itself or one that shares nothing", () => {
  const me = e("me", ["agents"], "cli", "2026-09-01");
  assert.deepEqual(related(me, [me, e("x", ["other"], "db", "2026-09-02")], facts), []);
});
