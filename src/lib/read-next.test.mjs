import test from "node:test";
import assert from "node:assert/strict";
import { readNext } from "./read-next.ts";

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
